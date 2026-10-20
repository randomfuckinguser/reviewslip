'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  LENGTH_CHOICES,
  languageFor,
  lengthFor,
  buildMessages,
} = require('./config');
const {
  buildTopicMessages,
  parseTopics,
} = require('./seed');
const settingsRules = require('./settings');
const strings = require('./strings');
const translate = require('./translate');
const { createQuota, MAX_REGENERATIONS } = require('./quota');
const { reviewId } = require('./ids');
const theme = require('./theme');
const { ready } = require('./db');
const subscribers = require('./subscribers');
const events = require('./events');
const openrouter = require('./openrouter');
const { readWebsite, openrouterHeaders } = require('./reader');
const { PLATFORMS } = require('./platforms');
const setup = require('./setup');
const assets = require('./assets');
const bookings = require('./bookings');
const rooms = require('./rooms');
const accounts = require('./accounts');
const nights = require('./nights');
const housekeeping = require('./housekeeping');
const note = require('./note');
const checklists = require('./checklists');
const shift = require('./shift');
const welcome = require('./welcome');
const signups = require('./signups');
const { throttled } = require('./throttle');
const health = require('./health');
const marketRouter = require('./marketrouter');
const voiceRouter = require('./voicerouter');
const voicehub = require('./voicehub');
const adminRouter = require('./admin');
const customerRouter = require('./customer');
const { requireSubscriber, ADMIN_TOKEN } = require('./auth');

// One counter for the process, keyed by business and address inside.
const quota = createQuota();
const {
  resolveTenant,
  requireTenant,
  publicUrl,
  BASE_DOMAIN,
  DEFAULT_SLUG,
} = require('./tenant');

const PORT = Number(process.env.PORT) || 3000;

/** What a single-tenant install's imported settings.json becomes, once. */
const LEGACY_NAME = 'Imported venue';

const app = express();

// Behind a reverse proxy, the name the guest actually typed arrives as
// X-Forwarded-Host and their address as X-Forwarded-For. Both matter here:
// one picks the subscriber, the other keys the throttle. Off unless asked for,
// since trusting those headers from an untrusted client is a way to spoof both.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', trustProxySetting(process.env.TRUST_PROXY));
}

/*
 * Two body limits, because two very different things post here.
 *
 * A guest asking for a review sends a few hundred bytes, and 16kB is a
 * generous ceiling that keeps an open endpoint from being used as a pipe.
 *
 * A settings save is a different animal entirely. It carries the venue's
 * logo, its background photograph and up to two font files, each as base64 —
 * and the caps on those live in assets.js, so the ceiling is worked out from
 * them rather than picked. Picking a number is how this went wrong in the
 * first place: 16kB was right for the only thing that posted here when it was
 * written, and a theme with a photograph in it is nearly two megabytes.
 */
const ASSET_BYTES =
  assets.MAX_BYTES + assets.MAX_BACKGROUND_BYTES + 2 * assets.MAX_FONT_BYTES;
// base64 is four bytes for every three, and the rest of the settings — topics,
// links, an About paragraph — are small beside that. A fifth on top covers
// them and the JSON around it all.
const DASHBOARD_LIMIT = `${Math.ceil((ASSET_BYTES * 4) / 3 / 1024 / 1024 * 1.2)}mb`;

// First, so every response is counted, including the ones that fail early.
app.use(health.countFailures);

/**
 * Whether this app can do its job: up, and the database answering.
 *
 * On every host and before everything else, so the monitor and any outside
 * uptime checker can reach it at any venue's address or none. 503 when the
 * database is not answering — a 200 from a process that cannot read anything
 * is the wrong answer to "is it up?".
 */
app.get('/healthz', async (_req, res) => {
  const result = await health.check();
  res.set('Cache-Control', 'no-store');
  res.status(result.status === 'ok' ? 200 : 503).json(result);
});

app.use('/api/customer', express.json({ limit: DASHBOARD_LIMIT }));
app.use('/api/admin', express.json({ limit: DASHBOARD_LIMIT }));
// A voicemail is up to two minutes of audio as base64 (voicerules.js).
app.use('/api/voice/voicemail', express.json({ limit: '2mb' }));
app.use(express.json({ limit: '16kb' }));
// No max-age: the files are small and served off the same box, and a stale
// index.html on a guest's phone is far more annoying than a revalidation.
/**
 * Every guest-facing string, in every language, as one script.
 *
 * Before express.static and outside tenant resolution: it is the same table for
 * every business, and the page needs it to render its own furniture — including
 * the error it shows when the address belongs to no business at all.
 *
 * Cached hard. The body is built once at boot and cannot change without a
 * deploy, and the URL is versioned by that build, so a long max-age costs a
 * guest nothing and saves the second page load a round trip.
 */
app.get('/i18n.js', (req, res) => {
  res.type('application/javascript; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(strings.SCRIPT);
});

/**
 * The guest page, or a plain page saying there is nothing here.
 *
 * Before express.static, which would otherwise serve index.html to every
 * hostname on the wildcard and leave the page to discover for itself, one
 * request later, that no business exists — a spinner, then an error notice, on
 * what is usually a mistyped address off a printed QR code.
 *
 * Only the document is treated this way. The stylesheet, the script and the
 * fonts are the same files whichever host asked for them, and 404.html needs
 * them to render at all.
 */
app.get('/', resolveTenant, (req, res, next) => {
  const usable = req.subscriber && req.subscriber.status === 'active';
  if (usable) return next();

  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
    if (err) next(err);
  });
});

/**
 * The housekeeping board.
 *
 * On the venue's own address rather than the dashboard's, because it is opened
 * on a phone by somebody who is not a dashboard user and never will be. Before
 * express.static for the same reason `/` is: the file must not be reachable at
 * a venue that has not switched the board on.
 */
app.get('/housekeeping', resolveTenant, (req, res, next) => {
  const usable = req.subscriber && req.subscriber.status === 'active';
  if (usable) {
    return res.sendFile(path.join(__dirname, 'public', 'housekeeping.html'), next);
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
    if (err) next(err);
  });
});

/**
 * The welcome page, opened from a QR code in the room or on the table.
 *
 * On the venue's own address, beside the review page, and in the venue's own
 * colours — it is the venue's page, not ours. Before express.static for the
 * same reason as the two above.
 */
app.get('/welcome', resolveTenant, (req, res, next) => {
  const usable = req.subscriber && req.subscriber.status === 'active';
  if (usable) {
    return res.sendFile(path.join(__dirname, 'public', 'welcome.html'), next);
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
    if (err) next(err);
  });
});

/**
 * What a phone needs to keep the welcome page as an app: the venue's name, its
 * colours and its mark, opening straight onto /welcome.
 *
 * Per venue, so private and short-lived like theme.css.
 */
app.get('/welcome.webmanifest', resolveTenant, (req, res) => {
  if (!req.subscriber) return res.status(404).end();

  const resolved = subscribers.settingsFor(req.subscriber);
  let ground = '#0c1f19';
  try {
    ground = theme.derive(resolved.theme)['--shade'] || ground;
  } catch {
    // The shipped colour: a manifest with a wrong colour still installs, and
    // one that failed to build does not.
  }

  res.type('application/manifest+json');
  res.set('Cache-Control', 'private, max-age=300');
  res.json({
    id: '/welcome',
    name: req.subscriber.name,
    short_name: req.subscriber.name.slice(0, 12),
    start_url: '/welcome',
    scope: '/welcome',
    display: 'standalone',
    background_color: ground,
    theme_color: ground,
    icons: resolved.theme?.logo
      ? [{ src: '/logo', sizes: 'any', purpose: 'any' }]
      : [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  });
});

// Reviewslip's own Sales and Support phone is the phone page at its own
// address, so it installs and takes pushes apart from a venue's. Its manifest
// and service worker are files beside it; the page is the shared one.
app.get(['/phone/reviewslip', '/phone/reviewslip/'], (req, res) => {
  if (!req.path.endsWith('/')) return res.redirect(301, '/phone/reviewslip/');
  res.sendFile(path.join(__dirname, 'public', 'phone', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { etag: true }));

// Admin first, and outside tenant resolution: creating the first subscriber
// cannot require already being on a subscriber's hostname.
app.use('/api/admin', adminRouter);

// Customers sign in on the marketing site's hostname, not on a venue's, so
// this sits outside tenant resolution too.
app.use('/api/customer', customerRouter);
// The marketplace answers for every listed venue at once, so it sits before
// the tenant resolver: it is reached on the API's own host, not a venue's.
app.use('/api/market', express.json({ limit: '32kb' }), marketRouter);
// The softphone answers for every venue and for Reviewslip itself, so it sits
// here too. The phone page is public/phone/, served as a static file.
app.use('/api/voice', voiceRouter);

/**
 * The venue's palette, as a stylesheet.
 *
 * Served rather than applied from JavaScript after /api/config lands: the guest
 * would otherwise watch the shipped colours for as long as that request takes,
 * outdoors, on a phone. A <link> blocks the first paint instead, which is the
 * one thing that should block it.
 *
 * Outside the /api tenant middleware because it is not an API route, so it
 * resolves the tenant itself. A venue with no theme gets an empty file — the
 * stylesheet's own defaults then stand, untouched and byte-identical to what
 * shipped, rather than being reconstructed by arithmetic that would land close
 * but not exact.
 */
app.get('/theme.css', resolveTenant, (req, res) => {
  res.type('css');
  // Private: this is per-hostname, and a shared cache keyed on the path alone
  // would hand one venue's colours to another. Short, so a save shows up on a
  // refresh rather than at some unpredictable later point.
  res.set('Cache-Control', 'private, max-age=60');

  if (!req.subscriber) return res.send('');

  const resolved = subscribers.settingsFor(req.subscriber);
  res.send(
    theme.css(
      resolved.theme,
      { display: resolved.fontDisplay, ui: resolved.fontUi },
      { background: Boolean(resolved.background) }
    )
  );
});

/**
 * The venue's typefaces.
 *
 * A redirect rather than a stylesheet of our own. The page needs one <link> in
 * static HTML that resolves to a different Google Fonts URL per venue, and a
 * 302 with no body is the cheapest way to do that — a CSS file containing an
 * @import would serialise an extra download in front of the font files
 * themselves. The preconnects in index.html mean the connection to Google is
 * already warm by the time this answers.
 *
 * The URL is built only from the `spec` strings in theme.js. Nothing that
 * arrived over the wire reaches it — a font is chosen by id from a fixed list,
 * precisely so that this cannot become a redirect to somewhere else.
 */
app.get('/fonts.css', resolveTenant, (req, res) => {
  const resolved = req.subscriber
    ? subscribers.settingsFor(req.subscriber)
    : {};

  const answer = theme.fontsCss(resolved.theme, {
    display: resolved.fontDisplay,
    ui: resolved.fontUi,
  });

  res.set('Cache-Control', 'private, max-age=300');
  if (answer.redirect) return res.redirect(302, answer.redirect);

  res.type('css');
  res.send(answer.css);
});

/**
 * One of the two typefaces taken off the business's own site.
 *
 * Served from here rather than inlined into /fonts.css as a data URI: a woff2 is
 * a couple of hundred kilobytes, and as base64 inside a stylesheet it would be
 * re-downloaded with every change to a colour. As its own URL the browser caches
 * the file and re-fetches only the rules.
 */
app.get('/font/:slot', resolveTenant, (req, res) => {
  const slot = req.params.slot === 'display' ? 'fontDisplay' : req.params.slot === 'ui' ? 'fontUi' : null;
  if (!slot || !req.subscriber) return res.status(404).end();

  const font = subscribers.settingsFor(req.subscriber)[slot];
  if (!font) return res.status(404).end();

  const TYPES = {
    woff2: 'font/woff2',
    woff: 'font/woff',
    truetype: 'font/ttf',
    opentype: 'font/otf',
    'embedded-opentype': 'application/vnd.ms-fontobject',
  };

  res.type(TYPES[font.format] || 'application/octet-stream');
  res.set('Cache-Control', 'private, max-age=3600');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(font.data, 'base64'));
});

/**
 * The venue's logo.
 *
 * Its own route rather than a field on /api/config: a logo is up to 120kB, and
 * as base64 inside a JSON body it would be re-sent on every generation and
 * cached by nothing. Here it is bytes with an ETag, fetched once by the phone
 * and then not again.
 */
app.get('/logo', resolveTenant, (req, res) => {
  const stored = req.subscriber
    ? subscribers.settingsFor(req.subscriber).theme?.logo
    : null;

  if (!stored) return res.status(404).end();

  const [, type, base64] = /^data:([^;]+);base64,(.+)$/.exec(stored) || [];
  if (!type || !base64) return res.status(404).end();

  const body = Buffer.from(base64, 'base64');

  res.type(type);
  // Immutable it is not — a venue can change its logo — but a minute is enough
  // to stop a reload re-fetching it, and short enough that a change shows up
  // while someone is still looking at the page they changed it on.
  res.set('Cache-Control', 'private, max-age=60');
  // Belt and braces around the SVG case: served as an image, never as a
  // document, and with nothing else allowed to load from inside it.
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(body);
});

/**
 * The venue's hero photograph, taken off its own site.
 *
 * Its own route for the same reason the logo and the fonts have one: half a
 * megabyte inlined into a stylesheet would be re-downloaded every time a colour
 * changed. Cached for an hour, since a photo changes far less often than a
 * palette being adjusted in the dashboard.
 */
app.get('/background', resolveTenant, (req, res) => {
  const stored = req.subscriber
    ? subscribers.settingsFor(req.subscriber).background
    : null;

  if (!stored) return res.status(404).end();

  const [, type, base64] = /^data:([^;]+);base64,(.+)$/.exec(stored.dataUri) || [];
  if (!type || !base64) return res.status(404).end();

  res.type(type);
  res.set('Cache-Control', 'private, max-age=3600');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(base64, 'base64'));
});

// Everything below knows which venue it is serving.
app.use('/api', resolveTenant);


/* ------------------------------------------------------------ welcome page */

/**
 * The guest has to be told who this is before they are asked for anything, so
 * this answers without a sign-up. The links do not: they come back with the
 * sign-up, or with a pass from an earlier one.
 */
app.get('/api/welcome', requireTenant, (req, res) => {
  const resolved = subscribers.settingsFor(req.subscriber);
  res.json({
    venue: req.subscriber.name,
    hasLogo: Boolean(resolved.theme?.logo),
    showName: theme.showsName(resolved.theme),
    // The venue's line on the softphone. The call tile shows only once the
    // line answers its status check, so a venue nobody answers for keeps its
    // phone number tile alone.
    voiceLine: req.subscriber.slug,
    // Where the call tile rings through: the API's host, which is the one
    // nginx passes WebSockets for — not every venue's.
    voiceApi: voicehub.VOICE_URL,
  });
});

/** Name and email in, the links and a pass out. */
app.post('/api/welcome', requireTenant, async (req, res, next) => {
  try {
    // The guest throttle: an open form is a way to fill a venue's list with
    // junk, and this keeps that to a trickle per address.
    if (throttled(`welcome:${req.subscriber.slug}:${req.ip}`)) {
      return res.status(429).json({ error: 'welcomeSlowDown' });
    }

    const checked = welcome.validateSignup(req.body);
    if (!checked.ok) return res.status(400).json({ error: checked.error });

    const signup = await signups.upsert({
      subscriberId: req.subscriber.id,
      name: checked.name,
      email: checked.email,
      consent: checked.consent,
    });

    res.json({
      name: signup.name,
      links: welcome.forGuest(welcome.parseLinks(req.subscriber.welcome_links)),
      // Null when SECRET_KEY is not usable. The guest still gets the links
      // now; they are asked again on their next visit, which is the whole of
      // the cost.
      pass: welcome.issuePass({ subscriberId: req.subscriber.id, signupId: signup.id }),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * The links again, for a guest who signed up before.
 *
 * Fetched rather than remembered on the phone so a link the venue changes is
 * the link the guest sees. A pass whose sign-up has been deleted fails, and the
 * guest is shown the form.
 */
app.get('/api/welcome/links', requireTenant, async (req, res, next) => {
  try {
    const opened = welcome.openPass(req.get('x-welcome-pass'), {
      subscriberId: req.subscriber.id,
    });
    const signup =
      opened.ok &&
      (await signups.find({ subscriberId: req.subscriber.id, id: opened.signupId }));
    if (!signup) return res.status(401).json({ error: 'signedOut' });

    res.json({
      name: signup.name,
      links: welcome.forGuest(welcome.parseLinks(req.subscriber.welcome_links)),
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------ housekeeping board */

/*
 * A PIN is four digits, so the only thing standing between it and a guess is
 * how fast somebody can try. The guest throttle above allows thirty a minute,
 * which would walk a four-digit PIN in under six hours; this one is separate
 * and far tighter, keyed per venue and address so one venue cannot lock out
 * another.
 *
 * In memory, and a restart forgives everyone — the same trade quota.js makes,
 * and for the same reason: the alternative is a table, and an hour of lockout
 * is worth less than the thing it would cost to get wrong.
 */
const PIN_TRIES = 8;
const PIN_WINDOW_MS = 10 * 60_000;
const pinHits = new Map();

function pinThrottled(key) {
  const now = Date.now();
  const entry = pinHits.get(key);

  if (!entry || now > entry.resetAt) {
    pinHits.set(key, { count: 1, resetAt: now + PIN_WINDOW_MS });
    if (pinHits.size > 5000) pinHits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > PIN_TRIES;
}

/** The shift's token, from the header the board sends it on. */
function shiftOf(req) {
  const header = String(req.get('authorization') || '');
  return header.startsWith('Shift ') ? header.slice(6).trim() : '';
}

/**
 * Whoever is on today, if their token is still good.
 *
 * Every failure is the same shape as a signed-out one from outside: the board
 * shows a PIN box again, which is the only thing anybody can do about any of
 * them.
 */
function requireShift(req, res, next) {
  if (!req.subscriber || req.subscriber.status !== 'active') {
    return res.status(404).json({ error: 'No such venue.' });
  }

  const pinHash = req.subscriber.housekeeping_pin;
  if (!pinHash) {
    return res.status(403).json({ error: 'The housekeeping board is switched off.' });
  }

  const opened = shift.open(shiftOf(req), {
    pinHash,
    subscriberId: req.subscriber.id,
  });
  if (!opened.ok) {
    return res.status(401).json({ error: opened.error, signedOut: true });
  }

  next();
}

/** The PIN in, a shift out. */
app.post('/api/housekeeping/shift', requireTenant, async (req, res, next) => {
  try {
    const pinHash = req.subscriber.housekeeping_pin;
    if (!pinHash) {
      return res.status(403).json({ error: 'The housekeeping board is switched off.' });
    }

    if (pinThrottled(`hk:${req.subscriber.slug}:${req.ip}`)) {
      return res.status(429).json({
        error: 'Too many tries. Wait ten minutes, or ask for the PIN again.',
      });
    }

    const pin = String(req.body?.pin ?? '').trim();
    const ok = pin ? await accounts.verifyPassword(pin, pinHash) : false;
    if (!ok) return res.status(401).json({ error: 'That PIN is not right.' });

    const token = shift.issue({ subscriberId: req.subscriber.id, pinHash });
    if (!token) {
      console.error('SECRET_KEY is not usable, so no shift can be signed.');
      return res.status(500).json({ error: 'The board is not set up. Tell the owner.' });
    }

    res.json({ token, venue: req.subscriber.name, hours: shift.HOURS });
  } catch (err) {
    next(err);
  }
});

/** What needs doing, for one day. */
app.get(
  '/api/housekeeping/board',
  requireTenant,
  requireShift,
  async (req, res, next) => {
    try {
      const date =
        nights.parse(String(req.query.date || '')) ||
        nights.todayAt(req.subscriber.timezone || 'Asia/Bangkok');

      const day = await bookings.onDate({ subscriberId: req.subscriber.id, date });

      // How far through its list each room is. Counts only — the lines
      // themselves arrive when somebody taps a room open.
      const progress = await checklists.progress({
        subscriberId: req.subscriber.id,
        day: date,
        rooms: day.rooms,
      });

      res.json({
        venue: req.subscriber.name,
        ...housekeeping.board({
          date,
          progress,
          rooms: day.rooms,
          // onDate returns whole bookings; the board takes only what it needs
          // and never sees a name, an email or a phone number.
          bookings: day.arrivals
            .concat(day.departures, day.inHouse)
            .map((b) => ({
              roomId: b.roomId,
              status: b.status,
              arrival: b.arrival,
              departure: b.departure,
              adults: b.adults,
              children: b.children,
            })),
        }),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * What has to be done in one room, and what has been.
 *
 * Fetched when a room is tapped rather than sent with the board: twenty rooms
 * times a dozen lines is most of a payload for a list nobody has opened.
 */
app.get(
  '/api/housekeeping/rooms/:id/checklist',
  requireTenant,
  requireShift,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such room.' });
      }

      const room = await rooms.byId({ subscriberId: req.subscriber.id, id });
      if (!room) return res.status(404).json({ error: 'No such room.' });

      const date =
        nights.parse(String(req.query.date || '')) ||
        nights.todayAt(req.subscriber.timezone || 'Asia/Bangkok');

      res.json({
        roomId: id,
        room: room.name,
        ...(await checklists.forRoom({
          subscriberId: req.subscriber.id,
          roomId: id,
          groupId: room.groupId,
          day: date,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * The photograph for one line, behind the same shift the board is behind.
 *
 * Not part of the checklist payload: a standard runs to two dozen lines and
 * each picture is up to 250kB, so inlining them would make opening a room a
 * six megabyte download on a corridor signal. As its own route each one is
 * fetched once and cached.
 *
 * Scoped to the tenant, like every other route here. An item id is a small
 * integer, and guessing one belonging to another venue has to return nothing
 * rather than a photograph of their linen cupboard.
 */
app.get(
  '/api/housekeeping/checklist/:itemId/photo',
  requireTenant,
  requireShift,
  async (req, res, next) => {
    try {
      const itemId = Number(req.params.itemId);
      if (!Number.isSafeInteger(itemId) || itemId <= 0) {
        return res.status(404).json({ error: 'No such item.' });
      }

      const stored = await checklists.photo({
        subscriberId: req.subscriber.id,
        id: itemId,
      });
      const image = stored && assets.decodeStoredImage(stored);
      if (!image) return res.status(404).json({ error: 'No photo on that item.' });

      res.set(assets.photoHeaders(image)).end(image.buffer);
    } catch (err) {
      next(err);
    }
  }
);

/** Tick one line, or untick it. */
app.post(
  '/api/housekeeping/rooms/:id/checklist/:itemId',
  requireTenant,
  requireShift,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      if (!Number.isSafeInteger(id) || !Number.isSafeInteger(itemId)) {
        return res.status(404).json({ error: 'No such item.' });
      }

      const date =
        nights.parse(String(req.body?.date || '')) ||
        nights.todayAt(req.subscriber.timezone || 'Asia/Bangkok');

      const saved = await checklists.setChecked({
        subscriberId: req.subscriber.id,
        roomId: id,
        itemId,
        day: date,
        // Anything but an explicit false is a tick. The board sends a boolean;
        // being lenient here costs nothing and a missing field should not
        // silently untick something somebody just did.
        done: req.body?.done !== false,
      });

      res.json(saved);
    } catch (err) {
      next(err);
    }
  }
);

/** Mark one room clean, or put it back. */
app.post(
  '/api/housekeeping/rooms/:id',
  requireTenant,
  requireShift,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const state = housekeeping.usableState(req.body?.state);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such room.' });
      }
      if (!state) return res.status(400).json({ error: 'Clean or dirty.' });

      const room = await rooms.setHousekeeping({
        subscriberId: req.subscriber.id,
        id,
        state,
      });

      /*
       * Putting a room back to dirty starts its list again.
       *
       * The ticks described a room that no longer exists in that state —
       * somebody has been in it since, or the first pass was wrong. Leaving
       * them would tell whoever picks the room up next that the work was
       * already done.
       */
      if (state === 'dirty') {
        const date =
          nights.parse(String(req.body?.date || '')) ||
          nights.todayAt(req.subscriber.timezone || 'Asia/Bangkok');
        await checklists.clearRoom({
          subscriberId: req.subscriber.id,
          roomId: id,
          day: date,
        });
      }

      res.json({ room: { id: room.id, name: room.name, housekeeping: room.housekeeping } });
    } catch (err) {
      next(err);
    }
  }
);

/* ------------------------------------------------------------ guest routes */

app.get('/api/config', requireTenant, (req, res) => {
  const resolved = subscribers.settingsFor(req.subscriber);
  const { googleUrl, tripadvisorUrl, categories, place } = resolved;

  // Only the links that are set, in platform order, each carrying its own mark.
  // Sending the marks here rather than serving platforms.js keeps one copy of
  // them, and an unset platform costs nothing — a Xiaohongshu path is 3.5kB.
  const destinations = PLATFORMS.map((p) => ({
    ...p,
    url: resolved[`${p.id}Url`] || '',
  })).filter((p) => p.url);

  /*
   * Whether this page can actually do its job.
   *
   * Sent so the page can say so plainly instead of drawing a working-looking
   * form over nothing. With no listing set, a guest could write a review, press
   * nothing, and leave — and the owner's list stayed empty while the dashboard
   * looked fine. Neither end knew.
   *
   * The same function the dashboard checklist uses, so the two cannot drift.
   */
  const ready = setup.progress({ settings: resolved, off: resolved.platformsOff });

  res.json({
    venue: req.subscriber.name,
    place,
    // Whether to draw the mark, not the mark itself — it is served from /logo,
    // where it can be cached instead of riding along with every config load.
    hasLogo: Boolean(resolved.theme?.logo),
    /*
     * Whether to print the name under the mark.
     *
     * Most logos are a wordmark, and setting the name under one says it twice.
     * theme.js owns the rule so the guest page, the printed card and the
     * dashboard preview cannot answer it three different ways.
     */
    showName: theme.showsName(resolved.theme),
    // Every topic, not the ten the guest first sees. The page samples ten and
    // keeps the rest behind its browse button, so sampling server-side would
    // cost a second request to show what is already in hand — and the sample
    // has to be redrawn on the page anyway when the guest browses.
    //
    // `focus` is prompt input, not guest-facing — the buttons only need a label.
    categories: categories.map(({ id, label }) => ({ id, label })),
    googleUrl,
    tripadvisorUrl,
    destinations,
    // Sent rather than hardcoded in the page, so neither list can drift from the
    // one the prompt knows about.
    languages: LANGUAGES.map(({ code, label }) => ({ code, label })),
    lengths: LENGTH_CHOICES,
    // Which account is being served. The panel shows it so staff can tell at a
    // glance that they are editing the right venue.
    subscriber: { slug: req.subscriber.slug, name: req.subscriber.name },
    setup: {
      ready: ready.canTakeReviews,
      // Said to the guest, so it names no setting: they did not misconfigure
      // anything and cannot fix it.
      message: setup.guestMessage(ready),
      // Where the person who *can* fix it should go. Empty off a real host,
      // where a link would go nowhere — and a dead link under an error message
      // is worse than no link, because it reads as a second thing broken.
      fix: dashboardUrl(req.subscriber.slug),
    },
  });
});

/**
 * This venue's page on the dashboard, for the owner to follow from the notice.
 *
 * Built from BASE_DOMAIN, the only thing this app is told about where it lives.
 */
function dashboardUrl(slug) {
  const domain = String(process.env.BASE_DOMAIN || '').trim();
  if (!domain || domain === 'localhost' || domain.endsWith('.localhost')) {
    return '';
  }
  return `https://${domain}/dashboard/${encodeURIComponent(slug)}`;
}

/* --------------------------------------------------- translated topic names */

// One translation in flight per business and language, however many guests ask
// at once. Ten people picking Thai in the same minute is one model call, not
// ten — and the nine who arrived second wait on the same promise rather than
// each starting their own.
const translating = new Map();

/**
 * The topic names, in the language the guest picked.
 *
 * Its own route rather than a parameter on /api/config, because the page needs
 * it at a different moment: config is fetched once on load, and this is asked
 * for again every time the selector moves.
 *
 * Never fails in a way the page has to handle. A model that is unreachable, a
 * language nobody has words for, a business with no key — all of them answer
 * with the topics as they were written. Untranslated buttons are a poor
 * outcome; no buttons is a broken page.
 */
app.get('/api/topics', requireTenant, async (req, res) => {
  const resolved = subscribers.settingsFor(req.subscriber);
  const topics = resolved.categories.map(({ id, label }) => ({ id, label }));

  const language = languageFor(String(req.query.lang || '')).code;
  const plain = () => res.json({ language, categories: topics });

  // English is what these were written in often enough that it is worth not
  // asking, and a business with no topics has nothing to translate.
  if (language === DEFAULT_LANGUAGE || !topics.length) return plain();

  const stored = subscribers.topicLabels(req.subscriber);
  const table = stored[language] || {};
  const gaps = translate.missing(table, topics);

  if (!gaps.length) {
    return res.json({ language, categories: translate.apply(table, topics) });
  }

  const { apiKey, model } = resolved;
  if (!apiKey) return plain();

  const key = `${req.subscriber.slug}:${language}`;
  let job = translating.get(key);

  if (!job) {
    job = (async () => {
      const upstream = await fetch(openrouter.CHAT, {
        method: 'POST',
        headers: openrouterHeaders(apiKey, req.subscriber),
        body: JSON.stringify({
          model,
          messages: translate.buildLabelMessages({ language, topics: gaps }),
          reasoning: openrouter.REASONING.write,
          // Short answers by construction: fifty ids and fifty short names.
          max_tokens: 2000,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!upstream.ok) {
        throw new Error(`OpenRouter ${upstream.status}`);
      }

      const data = await upstream.json();
      const fresh = translate.parseLabels(data?.choices?.[0]?.message?.content);
      const merged = translate.merge(table, fresh, topics);

      await subscribers.saveTopicLabels(req.subscriber.slug, language, merged);
      return merged;
    })().finally(() => translating.delete(key));

    translating.set(key, job);
  }

  try {
    const merged = await job;
    res.json({ language, categories: translate.apply(merged, topics) });
  } catch (err) {
    console.error(`Topic translation failed for ${key}:`, err.message);
    plain();
  }
});

app.post('/api/review', requireTenant, async (req, res) => {
  const resolved = subscribers.settingsFor(req.subscriber);
  const { apiKey, model, categories } = resolved;

  // Which language to fail in. The page sends what the guest picked; the header
  // covers a request that arrives before it has picked anything. Read up here
  // rather than beside the first error, because every error below wants it and
  // one of them fires before the body is otherwise touched.
  const lang = languageFor(
    req.body?.language || strings.fromHeader(req.get('accept-language'))
  ).code;

  /*
   * The guest's note, before the key, the throttle and the quota.
   *
   * Before the quota above all. This check reads a string and costs nothing —
   * no tokens, no upstream call — and it sat after the counter, so a guest
   * who typed a telephone number lost one of their ten tries to a refusal
   * that cost the business nothing. Ten tries is not many when three of them
   * went on learning what the box will not take.
   *
   * What it cannot judge is whether the note is about this visit, which needs
   * reading it. The model is asked that directly, further down, and that one
   * does cost a completion.
   */
  const guestNote = note.check(req.body?.note);
  if (!guestNote.ok) {
    return res.status(422).json({ error: guestNote.reason, noteRejected: true });
  }

  if (!apiKey) {
    return res.status(500).json({ error: strings.t(lang, 'noKey') });
  }

  if (throttled(`${req.subscriber.slug}:${req.ip}`)) {
    return res.status(429).json({ error: strings.t(lang, 'tooFast') });
  }

  // Counted before the model is called, not after: a cap enforced on the way
  // out has already spent the tokens it exists to protect.
  const spend = quota.count(`${req.subscriber.slug}:${req.ip}`);
  if (!spend.allowed) {
    return res.status(429).json({
      error: strings.t(lang, 'outOfTries'),
      left: 0,
      max: MAX_REGENERATIONS,
    });
  }

  const body = req.body || {};
  // A set now, and possibly empty — a business may have no categories, and
  // `categories[0].id` on an empty list threw. Unknown ids are dropped rather
  // than rejected, so a guest whose page predates a category edit still works.
  const asked = Array.isArray(body.categoryIds)
    ? body.categoryIds
    : [body.categoryId];
  const categoryIds = categories
    .filter((c) => asked.includes(c.id))
    .map((c) => c.id);

  // One string for the meter, so the breakdown still groups: a multi-topic
  // review is its own combination rather than a vote for each part.
  const categoryId = categoryIds.join('+') || null;
  const recent = Array.isArray(body.recent)
    ? body.recent
        .filter((r) => typeof r === 'string')
        .slice(-3)
        .map((r) => r.slice(0, 400))
    : [];

  // What this business has actually published lately — not just what this tab
  // generated. Two guests an hour apart otherwise get near-identical reviews
  // from the same six details and the same prompt, and a wall of near-duplicates
  // is exactly the pattern review platforms filter.
  //
  // Sampled across the last hundred rather than taking the newest twelve: the
  // newest twelve are the ones already most alike, and steering around only
  // those leaves the model free to drift back onto last week's review.
  const published = await events
    .spread(req.subscriber.id, 12, 100)
    .catch(() => []);

  // Both thumbs. The likes say what this business wants; the dislikes say what it
  // does not, which the likes cannot express. Caught rather than awaited into the
  // happy path only: a review must still be written if either lookup fails.
  const [examples, rejected] = await Promise.all([
    events.topRated(req.subscriber.id, 5).catch(() => []),
    events.poorlyRated(req.subscriber.id, 3).catch(() => []),
  ]);

  // The one sample is split rather than drawn twice, because the two halves are
  // asked contradictory-looking things — match how these read, and be clearly
  // different from these — and the same review appearing in both would be an
  // instruction to differ from itself. A slice of one random sample is disjoint
  // by construction; two random samples would overlap.
  //
  // The realism half exists because a listing's own reviews are the only honest
  // answer to "what does a real review of this place look like". It is skipped
  // once the owner has approved anything: an approved review is a better example
  // than an unrated one, and `examples` below already carries those.
  const realism = examples.length ? [] : published.slice(0, 4);
  const avoid = examples.length ? published : published.slice(4);

  // An unknown code falls back to English rather than refusing: a guest with a
  // stale page should still get a review.
  const language = languageFor(body.language).code;
  const length = lengthFor(body.length);

  const messages = buildMessages({
    categoryIds,
    // This tab's last, then the business's recent ones. Ordered so the guest's
    // own are nearest the instruction that matters most.
    recent: [...avoid, ...recent],
    categories,
    language,
    length,
    venue: subscribers.venueFor(req.subscriber),
    examples,
    realism,
    rejected,
    guestNote: guestNote.note,
    // Which listing the review is bound for, when the business has only one and
    // so there is no doubt. A Google review and a Xiaohongshu post are different
    // genres; see context.js.
    platformIds: PLATFORMS.map((p) => p.id).filter((id) => resolved[`${id}Url`]),
  });

  try {
    const upstream = await fetch(openrouter.CHAT, {
      method: 'POST',
      headers: openrouterHeaders(apiKey, req.subscriber),
      body: JSON.stringify({
        model,
        messages,
        temperature: 1,
        top_p: 0.95,
        reasoning: openrouter.REASONING.write,
        /*
         * A ceiling, not the length. How long a review runs is set in the
         * prompt (the guest's Short / Detailed); this only has to be high
         * enough that a full review always fits. It was 200, which a model
         * that thinks even briefly first can use up before the review is
         * finished — and a review cut off mid-sentence is worse than one a
         * few words long. Nothing is billed for headroom that goes unused.
         */
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error(
        `OpenRouter ${upstream.status} for ${req.subscriber.slug}: ${detail.slice(0, 500)}`
      );
      return res.status(502).json({ error: strings.t(lang, 'writerDown') });
    }

    const data = await upstream.json();
    const review = clean(data?.choices?.[0]?.message?.content);

    if (!review) {
      console.error('Empty completion:', JSON.stringify(data).slice(0, 500));
      return res.status(502).json({ error: strings.t(lang, 'writerEmpty') });
    }

    /*
     * The second layer: the model read the note and says it is not about this
     * visit.
     *
     * Not recorded as a review, and deliberately not charged against the
     * guest's remaining tries either — the tokens are spent, but taking a go
     * away from somebody whose note was misjudged turns one refusal into a
     * page they cannot use. The count on the button comes from the quota,
     * which was incremented on the way in; this leaves it alone rather than
     * pretending it did not happen.
     */
    if (note.wasRejected(review)) {
      return res.status(422).json({
        error: strings.t(lang, 'noteOffTopic'),
        noteRejected: true,
        left: spend.left,
        max: MAX_REGENERATIONS,
      });
    }

    // Awaited now, unlike before, because the guest needs the row id to rate
    // the review. record() swallows its own failures and returns null, so a
    // meter problem costs the thumbs and not the review — and the write is a
    // single insert over loopback.
    const reviewId = await events.record({
      subscriberId: req.subscriber.id,
      categoryId,
      model,
      usage: data?.usage,
      reviewText: review,
      // Kept so the dashboard can say what the writer was working from when it
      // produced this one, which is most of what makes a rating actionable.
      language,
      length,
    });

    // `left` alone cannot be shown as a fraction, and "3 left" reads as a
    // warning where "7/10" reads as information.
    res.json({
      review,
      categoryId,
      reviewId,
      left: spend.left,
      max: MAX_REGENERATIONS,
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    console.error('Review request failed:', err);
    res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? 'The writer took too long. Try again.'
        : 'Could not reach the writer. Check the connection and try again.',
    });
  }
});

/**
 * The guest is taking this review to a listing.
 *
 * The moment a draft becomes a review. A row is written for every generation,
 * because that is what meters the tokens — but a guest regenerates until they
 * like one, and the nine they passed over were never reviews. Only the one they
 * carried away is, and only that one belongs in the dashboard's list or in the
 * samples fed back into the prompt.
 *
 * Best effort, deliberately. It is sent as the listing opens in another tab, so
 * failing it must not cost the guest the trip they were making — a review that
 * goes unrecorded is a gap in a list, while a blocked navigation is a customer
 * who does not post at all.
 *
 * Open, like the rest of the guest path. The row has to belong to this
 * business, so the worst anyone can do by guessing ids is mark reviews on a page
 * they could already open.
 */
app.post('/api/proceeded', requireTenant, async (req, res) => {
  const { platform } = req.body || {};

  // Coerced rather than type-checked. This used to demand a number and reject
  // anything else, which is how a bigint id — a string, as far as the driver
  // and then JSON are concerned — turned into a silent 400 nobody saw.
  const id = reviewId(req.body?.reviewId);
  if (!id) {
    return res.status(400).json({ error: 'Bad request.' });
  }

  // Checked against the list rather than stored as sent. This is an open route
  // on a public page, and the value is shown back to the owner — an unchecked
  // string from a guest is one they would be reading in their dashboard.
  const to = PLATFORMS.some((p) => p.id === platform) ? platform : null;

  try {
    await events.markProceeded({
      subscriberId: req.subscriber.id,
      id,
      platform: to,
    });
    // 204 either way. Marking one that was already marked is what a guest who
    // taps Google and then Facebook does, and it is not an error.
    res.status(204).end();
  } catch (err) {
    console.error('Could not mark the review as proceeded:', err);
    res.status(500).json({ error: 'Could not save that.' });
  }
});

/**
 * A guest's thumb on the review they were just handed.
 *
 * Open, like the rest of the guest path — a guest has no token to present. The
 * row has to belong to this business, so the worst anyone can do by guessing
 * ids is rate reviews on a page they could already open: noise, not damage. The
 * throttle above covers volume.
 */
app.post('/api/feedback', requireTenant, async (req, res) => {
  const { rating } = req.body || {};
  const stars = rating === null ? null : Number(rating);

  // Same coercion as above, and for the same reason: this route had the
  // identical guard and would have failed the identical way.
  const id = reviewId(req.body?.reviewId);

  if (
    !id ||
    (stars !== null && !(Number.isInteger(stars) && stars >= 1 && stars <= 5))
  ) {
    return res.status(400).json({ error: 'Bad request.' });
  }

  if (throttled(`${req.subscriber.slug}:${req.ip}`)) {
    return res
      .status(429)
      .json({ error: 'That is a lot of ratings. Wait a moment.' });
  }

  try {
    const saved = await events.setFeedback({
      subscriberId: req.subscriber.id,
      id,
      rating: stars,
    });
    if (!saved) return res.status(404).json({ error: 'No such review.' });
    res.status(204).end();
  } catch (err) {
    console.error('Could not save the rating:', err);
    res.status(500).json({ error: 'Could not save that.' });
  }
});

/* ------------------------------------------------------- subscriber routes */

/* The settings panel. It edits one subscriber's own row, so it needs that
   subscriber's token — the admin token works too. The key is never sent back
   to the browser, only whether one is set and a masked hint. */

app.get('/api/settings', requireTenant, requireSubscriber, (req, res) => {
  res.json(subscribers.describe(req.subscriber));
});

app.post('/api/settings', requireTenant, requireSubscriber, async (req, res) => {
  const patch = req.body || {};

  const verdict = await openrouter.vet(patch);
  if (verdict.error) return res.status(400).json({ error: verdict.error });

  let record;
  try {
    // Only the settings fields — the panel has no business renaming the
    // account or changing its status.
    record = await subscribers.update(req.subscriber.slug, {
      apiKey: patch.apiKey,
      model: patch.model,
      googleUrl: patch.googleUrl,
      tripadvisorUrl: patch.tripadvisorUrl,
      websiteUrl: patch.websiteUrl,
      categories: patch.categories,
    });
  } catch (err) {
    if (err?.expose && err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Could not save settings:', err);
    return res.status(500).json({ error: 'Could not save the settings.' });
  }

  res.json({ settings: record.settings, warning: verdict.warning });
});

/** Model slugs for the picker, so staff do not have to type one from memory. */
app.get('/api/models', requireTenant, requireSubscriber, async (req, res) => {
  const models = await openrouter.catalogue();
  res.json({ models: models.map(({ id, name }) => ({ id, name })) });
});

/**
 * The topic set, drafted from the venue's website. Same contract as seeding:
 * this proposes, the caller fills its editor with it, and a human decides.
 * Nothing is saved here.
 *
 * The path still says `categories` because that is what the field and the column
 * are called; the dashboard and the guest page say topics, which is the word a
 * customer uses for them.
 */
app.post(
  '/api/categories/suggest',
  requireTenant,
  requireSubscriber,
  async (req, res) => {
    const resolved = websiteSettings(req, res);
    if (!resolved) return;

    const answer = await readWebsite(req.subscriber, resolved, {
      messages: buildTopicMessages({
        url: resolved.websiteUrl,
        max: settingsRules.MAX_TOPICS,
      }),
      // Fifty topics with a focus line each is a long answer; 3000 truncated
      // it and the JSON came back unparseable.
      maxTokens: 6000,
    });
    if (!answer.ok) {
      return res.status(answer.status).json({ error: answer.error });
    }

    const categories = parseTopics(answer.content, {
      max: settingsRules.MAX_TOPICS,
    });

    if (!categories) {
      console.error(
        'Topic drafting produced nothing usable:',
        String(answer.content).slice(0, 500)
      );
      return res.status(502).json({
        error:
          'No usable topics came back from that page. Try a different page on the site — one that says what the business offers works best.',
      });
    }

    res.json({ categories, url: resolved.websiteUrl });
  }
);

/* ------------------------------------------------------------------ helpers */

/**
 * Both website readers need the same two things in place first.
 *
 * @returns {object|null} the resolved settings, or null once it has answered
 */
function websiteSettings(req, res) {
  const resolved = subscribers.settingsFor(req.subscriber);

  if (!resolved.apiKey) {
    res.status(500).json({ error: 'No OpenRouter key yet. Add one above.' });
    return null;
  }
  if (!resolved.websiteUrl) {
    res
      .status(400)
      .json({ error: 'Add the venue website address first, then save.' });
    return null;
  }
  return resolved;
}



/** Accepts `true`, a hop count, or an address list — see express's docs. */
function trustProxySetting(raw) {
  const value = String(raw).trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/** A DNS-legal address derived from a venue name, for the legacy import. */
function slugify(name) {
  return (
    String(name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
      .replace(/-+$/, '') || 'venue'
  );
}

const QUOTE_PAIRS = [
  ['"', '"'],
  ['“', '”'],
  ["'", "'"],
  ['‘', '’'],
];

/**
 * Models sometimes wrap the review in quotes, label it, or do both in either
 * order — so unwrap and unlabel repeatedly until nothing more comes off.
 */
function clean(raw) {
  let t = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();

  for (let pass = 0; pass < 4; pass++) {
    const before = t;

    for (const [open, close] of QUOTE_PAIRS) {
      if (t.length > 2 && t.startsWith(open) && t.endsWith(close)) {
        t = t.slice(1, -1).trim();
        break;
      }
    }
    t = t
      .replace(/^(?:review|here'?s (?:a|the|your) review)\s*[:–-]\s*/i, '')
      .trim();

    if (t === before) break;
  }
  return t;
}

/* ------------------------------------------------------------------ errors */

// Reached by anything a route did not answer itself — in practice the store
// being unreachable, since tenant resolution now touches it on every request.
// Without this, express 4 would answer an HTML error page to an API client.
app.use((err, req, res, _next) => {
  /*
   * Before the expose branch, deliberately.
   *
   * body-parser marks its own refusals expose:true with the message "request
   * entity too large", so that branch passed those words straight to the
   * screen — which is what a customer saw on the settings page when their
   * theme grew a background photograph. It is a true sentence about HTTP and
   * tells nobody what to do about it.
   */
  if (err?.type === 'entity.too.large') {
    console.error('Payload too large:', req.originalUrl, err.length ?? '?', 'bytes');
    return res.status(413).json({
      error: String(req.originalUrl || '').startsWith('/api/customer')
        ? 'That is too much to save at once — usually a background photo or a font file. Remove one of them and save again.'
        : 'That request was too large.',
    });
  }

  if (err?.expose && err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('Request failed:', err);
  res.status(500).json({ error: 'Something went wrong.' });
});

/* ------------------------------------------------------------------- start */

/**
 * Carries a single-tenant install forward: if settings.json is still sitting
 * there and the store is empty, it becomes the first subscriber. The token is
 * printed once, because there is no other way to get it afterwards.
 */
async function importLegacy() {
  try {
    // The name used to come from the built-in venue in config.js, which was the
    // first customer. That is now a blank shape rather than a place, so there is
    // nothing there to name a subscriber after — and settings.json never carried
    // a name either. An operator renames it in the dashboard; the slug is what
    // has to be stable, and this only ever runs once.
    return await subscribers.importLegacyFile(slugify(LEGACY_NAME), LEGACY_NAME);
  } catch (err) {
    console.error('  ! Could not import settings.json:', err.message);
    return null;
  }
}

async function start() {
  // Nothing may query before the schema exists, and the first request can
  // arrive the moment we listen.
  await ready;

  const server = app.listen(PORT, async () => {
    const imported = await importLegacy();
    const count = await subscribers.count();

    console.log(
      `\n  Review helper — ${count} subscriber${count === 1 ? '' : 's'}`
    );
    console.log(`  http://localhost:${PORT}  (base domain: ${BASE_DOMAIN})`);

    if (imported) {
      console.log(`\n  Imported settings.json as "${imported.record.slug}".`);
      console.log(`  Settings token (shown once): ${imported.token}`);
      console.log(`  Guest page: ${publicUrl(imported.record.slug)}`);
    }

    if (!count) {
      console.warn('\n  ! No subscribers yet. Create one:');
      console.warn(
        `      curl -X POST http://localhost:${PORT}/api/admin/subscribers \\\n` +
          '        -H "Authorization: Bearer $ADMIN_TOKEN" \\\n' +
          '        -H "Content-Type: application/json" \\\n' +
          '        -d \'{"slug":"my-venue","name":"My Venue"}\''
      );
    } else if (DEFAULT_SLUG) {
      console.log(`  Unmatched hosts fall back to "${DEFAULT_SLUG}".`);
    }

    if (!ADMIN_TOKEN) {
      console.warn('\n  ! ADMIN_TOKEN is not set, so the admin API is off.');
    }

    // One live check, so a stale model slug warns on boot instead of failing
    // in front of a guest.
    for (const record of await subscribers.list()) {
      const row = await subscribers.get(record.slug);
      const { model } = subscribers.settingsFor(row);
      if (await openrouter.modelMissing(model)) {
        console.warn(
          `  ! ${record.slug}: "${model}" is not in OpenRouter's catalogue.`
        );
      }
    }
  });

  // Call buttons and the phone page ring through a WebSocket on this server.
  voicehub.attach(server);
}

// A store that will not answer is not something to serve around: without it
// every request would 500 anyway, and failing here makes systemd retry.
start().catch((err) => {
  console.error('\n  ! Could not start:', err.message);
  process.exit(1);
});
