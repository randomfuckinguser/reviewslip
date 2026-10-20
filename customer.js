'use strict';

const express = require('express');

const accounts = require('./accounts');
const subscribers = require('./subscribers');
const events = require('./events');
const referrals = require('./referrals');
const mailer = require('./mailer');
const staff = require('./staff');
const tickets = require('./tickets');
const rooms = require('./rooms');
const bookings = require('./bookings');
const bookingfilter = require('./bookingfilter');
const setup = require('./setup');
const listings = require('./listings');
const connectors = require('./connectors');
const rates = require('./rates');
const guests = require('./guests');
const secrets = require('./secrets');
const emails = require('./emails');
const plans = require('./plans');
const openrouter = require('./openrouter');
const { publicUrl } = require('./tenant');
const { readWebsite } = require('./reader');
const {
  buildTopicMessages,
  buildDescribeMessages,
  parseDescription,
  parseTopics,
  buildThemeMessages,
  buildAdjustMessages,
  parseTheme,
} = require('./seed');
const theme = require('./theme');
const context = require('./context');
const { buildSystemPrompt } = require('./config');
const assets = require('./assets');
const settingsRules = require('./settings');
const shift = require('./shift');
const welcome = require('./welcome');
const market = require('./market');
const marketplace = require('./marketplace');
const signups = require('./signups');
const checklists = require('./checklists');
const roomstatus = require('./roomstatus');
const sitefacts = require('./sitefacts');
const themenote = require('./themenote');
const { PLATFORMS } = require('./platforms');
const voice = require('./voice');
const voicehub = require('./voicehub');

// The website: the phone lives beside its dashboard, at /phone/.
const SITE_URL = String(process.env.SITE_URL || 'https://reviewslip.com').replace(/\/$/, '');

/**
 * The customer API: sign up, sign in, and manage your own businesses.
 *
 * Mounted outside tenant resolution, like the admin API — a customer signs in
 * on the marketing site's hostname, not on any one venue's subdomain.
 *
 * The website calls this server-to-server over loopback and forwards the
 * session token it holds in the browser's cookie. It never tells us who the
 * caller is; the token does, and `requireAccount` checks it here.
 */

const router = express.Router();

/* -------------------------------------------------------------- middleware */

function bearer(req) {
  const header = String(req.get('authorization') || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

async function requireAccount(req, res, next) {
  try {
    const row = await accounts.fromSession(bearer(req));
    if (!row) {
      res.set('WWW-Authenticate', 'Bearer');
      return res.status(401).json({ error: 'Sign in first.' });
    }
    req.account = row;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Loads the venue named in the path *and* checks it belongs to the caller.
 *
 * A venue that exists but belongs to someone else answers 404, not 403 — a 403
 * would confirm the slug is taken, which is not this customer's business.
 */
async function requireOwnVenue(req, res, next) {
  try {
    const row = await subscribers.get(req.params.slug);
    if (!row || row.account_id !== req.account.id) {
      return res.status(404).json({ error: 'No business at that address.' });
    }
    req.venue = row;
    next();
  } catch (err) {
    next(err);
  }
}

/* ------------------------------------------------------------------ shapes */

/** A venue as the venue list wants it: identity, address, and this month. */
function venueSummary(row, usage, plan) {
  return {
    slug: row.slug,
    name: row.name,
    status: row.status,
    url: publicUrl(row.slug),
    createdAt: row.created_at,
    usage: {
      reviews: usage?.reviews ?? 0,
      tokens: usage?.tokens ?? 0,
      tokenLimit: plans.TOKENS_PER_MONTH_PER_VENUE,
    },
    ready: Boolean(row.google_url) || Boolean(process.env.GOOGLE_REVIEW_URL),
    plan,
  };
}

/* ------------------------------------------------------------------- auth */

router.post('/signup', async (req, res, next) => {
  try {
    const body = req.body || {};
    const account = await accounts.create(body);

    // Straight in. Making someone sign in again immediately after proving they
    // know the password is friction with nothing behind it.
    const session = await accounts.login(account.email, body.password);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { identifier, email, username, password } = req.body || {};
    const session = await accounts.login(
      identifier || email || username,
      password
    );
    res.json(session);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    await accounts.endSession(bearer(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- the account */

/** Everything the dashboard's landing page needs, in one call. */
router.get('/me', requireAccount, async (req, res, next) => {
  try {
    const rows = await subscribers.listForAccount(req.account.id);
    const usage = await events.usageThisMonthFor(rows.map((r) => r.id));
    const plan = plans.planFor(req.account.plan);

    const reviewsThisMonth = rows.reduce(
      (total, row) => total + (usage.get(row.id)?.reviews ?? 0),
      0
    );

    const list = rows.map((row) =>
      venueSummary(row, usage.get(row.id), req.account.plan)
    );

    res.json({
      account: accounts.toRecord(req.account),
      plan: {
        id: req.account.plan,
        name: plan.name,
        businesses: plan.venues,
        // The advertised total, for the header, and the limit each business is
        // actually held to. They are different numbers and the dashboard needs
        // both.
        reviewAllowance: plans.advertisedReviews(req.account.plan),
        reviewsPerBusiness: plans.REVIEWS_PER_BUSINESS,
        tokensPerMonthPerBusiness: plans.TOKENS_PER_MONTH_PER_VENUE,
      },
      usage: { reviewsThisMonth, businesses: rows.length },
      canAddBusiness: plans.canAddVenue(req.account.plan, rows.length),
      businesses: list,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/password', requireAccount, async (req, res, next) => {
  try {
    const { currentPassword, password } = req.body || {};

    const ok = await accounts.verifyPassword(
      currentPassword,
      req.account.password_hash
    );
    if (!ok) return res.status(403).json({ error: 'That is not your current password.' });

    await accounts.setPassword(req.account.id, password);
    // setPassword drops every session, this one included, so the caller has to
    // sign in again — which is the point.
    res.json({ ok: true, signedOut: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Choosing a plan. There is no payment step yet, so this is exactly what it
 * looks like: the account says which tier it is on and the limits follow.
 * Stripe slots in ahead of this call, not inside it.
 */
router.post('/plan', requireAccount, async (req, res, next) => {
  try {
    const account = await accounts.setPlan(req.account.id, req.body?.plan);
    res.json({ account });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ staff */

/**
 * The staff view, behind the same session as everything else.
 *
 * requireAccount first, so staff.js can read req.account; its own requireStaff
 * then answers 404 to anyone without is_admin — including a signed-in customer,
 * who must not be able to tell this path apart from one that does not exist.
 */
router.use('/admin', requireAccount, staff.router);

/* -------------------------------------------------------------- referrals */

/**
 * The sign-up page on the marketing site.
 *
 * Built from BASE_DOMAIN, which is the only thing this app is told about where
 * it lives. Empty on localhost, where BASE_DOMAIN is not a real host and a link
 * to it would be a link to nowhere — and an invitation carrying a dead link is
 * worse than one that was never emailed, so invite() sends nothing at all
 * rather than send that.
 */
/** The dashboard's support page, for a link in an email. Empty off a real host. */
function supportUrl() {
  const domain = String(process.env.BASE_DOMAIN || '').trim();
  if (!domain || domain === 'localhost' || domain.endsWith('.localhost')) {
    return '';
  }
  return `https://${domain}/dashboard/support`;
}

function signupUrl() {
  const domain = String(process.env.BASE_DOMAIN || '').trim();
  if (!domain || domain === 'localhost' || domain.endsWith('.localhost')) {
    return '';
  }
  return `https://${domain}/signup`;
}

/**
 * The account's invitations, and how close they are to the discount.
 *
 * `mail.enabled` is here so the page can describe what pressing the button will
 * actually do. Whether this deployment can send is a fact only this side knows,
 * and a page that says "we will email them" on a box with no SES configured is
 * lying to a customer about something they cannot check.
 */
router.get('/referrals', requireAccount, async (req, res, next) => {
  try {
    const data = await referrals.listFor(req.account.id);
    res.json({ ...data, mail: { enabled: mailer.configured && Boolean(signupUrl()) } });
  } catch (err) {
    next(err);
  }
});

/**
 * Invite an address.
 *
 * Sends the invitation when mail is configured, and says in the response
 * whether it went. Unconfigured, this is what it has always been: an invitation
 * and a link for the referrer to pass on by hand. Both are real outcomes and
 * the page shows a different thing for each, because "created" and "delivered"
 * are not the same promise.
 *
 * The recipient is told the business's name, never the account's email. They
 * are a stranger to us — somebody else typed their address in — and handing
 * them a customer's address because of that is not ours to do. An account with
 * no business yet is introduced anonymously instead.
 */
router.post('/referrals', requireAccount, async (req, res, next) => {
  try {
    const owned = await subscribers.listForAccount(req.account.id);

    const referral = await referrals.invite({
      referrerId: req.account.id,
      referrerEmail: req.account.email,
      email: req.body?.email,
      referrer: owned[0]?.name,
      signupUrl: signupUrl(),
    });

    res.status(201).json({ referral, sent: referral.sent });
  } catch (err) {
    next(err);
  }
});

/** Withdraw an invitation nobody has taken up. */
router.delete('/referrals/:id', requireAccount, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Bad request.' });
    }

    await referrals.revoke({ referrerId: req.account.id, id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------- support */

/** This account's tickets, and whether they may start another. */
router.get('/tickets', requireAccount, async (req, res, next) => {
  try {
    res.json(await tickets.listFor(req.account.id));
  } catch (err) {
    next(err);
  }
});

/** One ticket with its thread. Scoped, so another account's is simply absent. */
router.get('/tickets/:id', requireAccount, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(404).json({ error: 'No such ticket.' });
    }
    const { ticket, messages } = await tickets.get({
      id,
      accountId: req.account.id,
    });
    res.json({ ticket, messages });
  } catch (err) {
    next(err);
  }
});

/**
 * Open a ticket.
 *
 * The venue, if named, is resolved against this account's own — so a slug
 * belonging to somebody else attaches nothing rather than leaking that it
 * exists.
 */
router.post('/tickets', requireAccount, async (req, res, next) => {
  try {
    const { title, body, slug } = req.body || {};

    let venueId = null;
    if (slug) {
      const venue = await subscribers.get(String(slug));
      if (venue && venue.account_id === req.account.id) venueId = venue.id;
    }

    const ticket = await tickets.open({
      accountId: req.account.id,
      title,
      body,
      venueId,
    });

    await alertStaff({ opened: true, req, ticket, body });
    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
});

router.post('/tickets/:id/reply', requireAccount, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(404).json({ error: 'No such ticket.' });
    }

    const ticket = await tickets.reply({
      id,
      accountId: req.account.id,
      fromStaff: false,
      body: req.body?.body,
    });

    await alertStaff({ opened: false, req, ticket, body: req.body?.body });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

router.post('/tickets/:id/close', requireAccount, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(404).json({ error: 'No such ticket.' });
    }
    res.json({ ticket: await tickets.close({ id, accountId: req.account.id }) });
  } catch (err) {
    next(err);
  }
});

/**
 * Tell us a ticket moved.
 *
 * Never allowed to fail the request that caused it. Somebody who has just
 * written out a problem must not be told it did not save because our own
 * notification bounced — the ticket is in the table either way, and the queue
 * is the thing we actually work from.
 */
async function alertStaff({ opened, req, ticket, body }) {
  try {
    await mailer.send({
      to: mailer.SUPPORT,
      ...emails.ticketAlertEmail({
        opened,
        from: req.account.email,
        venue: ticket.venue?.name,
        title: ticket.title,
        body,
        url: staffTicketUrl(ticket.id),
      }),
    });
  } catch (err) {
    console.error('Ticket alert failed for ticket %d:', ticket.id, err);
  }
}

/** The staff host's view of one ticket. Empty off a real host. */
function staffTicketUrl(id) {
  const domain = String(process.env.BASE_DOMAIN || '').trim();
  if (!domain || domain === 'localhost' || domain.endsWith('.localhost')) {
    return '';
  }
  return `https://admin.${domain}/tickets/${id}`;
}

/* ----------------------------------------------------------- reservations */

/*
 * Everything below hangs off a venue the caller owns.
 *
 * requireOwnVenue answers 404 for a slug belonging to somebody else, so a
 * competitor cannot learn which addresses are taken by watching which of them
 * refuse differently — and every handler here can then treat req.venue as
 * already proven.
 */

/** The room types and rooms a venue has. */
router.get(
  '/businesses/:slug/rooms',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const [groups, list] = await Promise.all([
        rooms.listGroups(req.venue.id),
        rooms.listRooms(req.venue.id),
      ]);
      res.json({ groups, rooms: list });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/businesses/:slug/room-groups',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const group = await rooms.createGroup({
        subscriberId: req.venue.id,
        name: req.body?.name,
        capacity: req.body?.capacity ?? 2,
      });
      res.status(201).json({ group });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/businesses/:slug/room-groups/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such room type.' });
      }
      await rooms.deleteGroup({ subscriberId: req.venue.id, id });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/businesses/:slug/rooms',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const room = await rooms.createRoom({
        subscriberId: req.venue.id,
        groupId: Number(req.body?.groupId),
        name: req.body?.name,
      });
      res.status(201).json({ room });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mark a room clean or dirty.
 *
 * The only manual direction anybody uses is dirty -> clean, after somebody has
 * serviced it. The other way happens by itself when a guest checks out; both
 * are allowed here because a room marked clean by mistake needs putting back.
 */
router.post(
  '/businesses/:slug/rooms/:id/housekeeping',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such room.' });
      }
      const room = await rooms.setHousekeeping({
        subscriberId: req.venue.id,
        id,
        state: String(req.body?.state || ''),
      });
      res.json({ room });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Open, not selling, or renovating.
 *
 * Per room rather than per type, because the reasons are per room: one
 * bungalow is being retiled while the other four are selling.
 */
router.post(
  '/businesses/:slug/rooms/:id/status',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such room.' });
      }
      const room = await rooms.setStatus({
        subscriberId: req.venue.id,
        id,
        status: req.body?.status,
      });
      res.json({ room, states: roomstatus.list() });
    } catch (err) {
      next(err);
    }
  }
);

/* ------------------------------------------------------- the cleaning standard */


/** Every line, and the states a room can be in, for the screen that sets both. */
router.get(
  '/businesses/:slug/checklist',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      res.json({
        items: await checklists.items(req.venue.id),
        states: roomstatus.list(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Add a line. No room type means every room. */
router.post(
  '/businesses/:slug/checklist',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const item = await checklists.add({
        subscriberId: req.venue.id,
        groupId: req.body?.groupId ?? null,
        label: req.body?.label,
      });
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * The photograph for one line, served as a file.
 *
 * Not inlined into the listing, because a standard runs to two dozen lines
 * and each picture is up to 250kB. As its own route the browser fetches each
 * one once and caches it, which is what makes a roomful of them usable on a
 * phone. The housekeeping board has the same route behind its own sign-in.
 */
router.get(
  '/businesses/:slug/checklist/:id/photo',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id)) {
        return res.status(404).json({ error: 'No such item.' });
      }

      const stored = await checklists.photo({ subscriberId: req.venue.id, id });
      const image = stored && assets.decodeStoredImage(stored);
      if (!image) return res.status(404).json({ error: 'No photo on that item.' });

      res.set(assets.photoHeaders(image)).end(image.buffer);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Attach a photograph to a line, or take it off with null.
 *
 * "Bathroom clean" is not an instruction. It is a word that every person
 * reading it fills in differently, and the people reading it are often
 * working in their second or third language at seven in the morning. A
 * picture of the shelf as the owner wants it left settles in one glance what
 * the sentence cannot settle at all.
 */
router.put(
  '/businesses/:slug/checklist/:id/photo',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id)) {
        return res.status(404).json({ error: 'No such item.' });
      }

      const value = req.body?.photo ?? null;

      // Raster only, and capped. The dashboard scales the picture down before
      // sending it, so reaching this limit means something went wrong there
      // rather than somebody choosing a large file.
      if (value !== null && !assets.isStoredPhoto(value)) {
        return res.status(400).json({
          error: `That photo could not be used. It must be a PNG, JPEG or WebP under ${assets.MAX_REFERENCE_BYTES / 1024}kB.`,
        });
      }

      res.json(await checklists.setPhoto({ subscriberId: req.venue.id, id, photo: value }));
    } catch (err) {
      next(err);
    }
  }
);

/** Take a line out. Its ticks go with it. */
router.delete(
  '/businesses/:slug/checklist/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id)) {
        return res.status(404).json({ error: 'No such item.' });
      }
      await checklists.remove({ subscriberId: req.venue.id, id });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Switch the housekeeping board on, change its PIN, or switch it off.
 *
 * The PIN is never sent back, only whether one is set and when it was last
 * changed. A venue that has forgotten it sets a new one — which is also the
 * only revocation there is, and ends every shift opened with the old one.
 */
/* ------------------------------------------------------------ welcome page */

/** The welcome page as the dashboard edits it: its address, links and sign-ups. */
router.get(
  '/businesses/:slug/welcome',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      res.json({
        url: `${publicUrl(req.venue.slug)}/welcome`,
        links: welcome.parseLinks(req.venue.welcome_links),
        limits: { links: welcome.MAX_LINKS, label: welcome.MAX_LABEL },
        signups: await signups.list(req.venue.id),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/businesses/:slug/welcome/links',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const checked = welcome.validateLinks(req.body?.links);
      if (!checked.ok) return res.status(400).json({ error: checked.error });

      await subscribers.saveWelcomeLinks(req.venue.slug, checked.links);
      res.json({ links: checked.links });
    } catch (err) {
      next(err);
    }
  }
);

/** A guest's details, gone — what a guest may ask a venue for. */
router.delete(
  '/businesses/:slug/welcome/signups/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: 'That is not a sign-up.' });
      }

      const gone = await signups.remove({ subscriberId: req.venue.id, id });
      if (!gone) return res.status(404).json({ error: 'No such sign-up.' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

/** The mailing list: only the guests who agreed to be emailed. */
router.get(
  '/businesses/:slug/welcome/mailing-list.csv',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const csv = welcome.mailingList(await signups.list(req.venue.id), {
        timeZone: req.venue.timezone || 'Asia/Bangkok',
      });

      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      res.set(
        'Content-Disposition',
        `attachment; filename="mailing-list-${req.venue.slug}.csv"`
      );
      res.send(csv);
    } catch (err) {
      next(err);
    }
  }
);

/* ------------------------------------------------------------- marketplace */

/** What the Online Booking screen edits: listing, profile, rooms, rates, photos. */
router.get(
  '/businesses/:slug/market',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      res.json(await marketplace.settings(req.venue));
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/businesses/:slug/market',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const checked = market.validateProfile(req.body?.profile);
      if (!checked.ok) return res.status(400).json({ error: checked.error });
      await marketplace.saveSettings({
        subscriberId: req.venue.id,
        listed: req.body?.listed === true,
        place: req.body?.place,
        profile: checked.profile,
      });
      res.json(await marketplace.settings(await subscribers.get(req.venue.slug)));
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/businesses/:slug/market/rooms/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const checked = market.validateRoomProfile(req.body);
      if (!checked.ok) return res.status(400).json({ error: checked.error });
      await marketplace.saveRoom({ subscriberId: req.venue.id, groupId: Number(req.params.id), room: checked.room });
      res.json({ room: checked.room });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/businesses/:slug/market/plans/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const checked = market.validatePlanTerms(req.body);
      if (!checked.ok) return res.status(400).json({ error: checked.error });
      await marketplace.savePlanTerms({ subscriberId: req.venue.id, planId: Number(req.params.id), terms: checked.terms });
      res.json({ terms: checked.terms });
    } catch (err) {
      next(err);
    }
  }
);

/** A photo of the venue (no groupId) or of a room type. */
router.post(
  '/businesses/:slug/market/photos',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const groupId = req.body?.groupId === null || req.body?.groupId === undefined ? null : Number(req.body.groupId);
      res.status(201).json(await marketplace.addPhoto({ subscriberId: req.venue.id, groupId, data: req.body?.data }));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/businesses/:slug/market/photos/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const image = await marketplace.ownPhoto({ subscriberId: req.venue.id, id: Number(req.params.id) });
      if (!image) return res.status(404).json({ error: 'No such photo.' });
      res.set(assets.photoHeaders(image)).end(image.buffer);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/businesses/:slug/market/photos/:id/cover',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const done = await marketplace.coverPhoto({ subscriberId: req.venue.id, id: Number(req.params.id) });
      if (!done) return res.status(404).json({ error: 'No such photo.' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/businesses/:slug/market/photos/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const gone = await marketplace.removePhoto({ subscriberId: req.venue.id, id: Number(req.params.id) });
      if (!gone) return res.status(404).json({ error: 'No such photo.' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/businesses/:slug/housekeeping/pin',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const raw = req.body?.pin;

      // Null switches the board off, which is a different thing from a bad
      // PIN and has to be sayable.
      if (raw === null || raw === '') {
        await subscribers.setHousekeepingPin({ id: req.venue.id, hash: null });
        return res.json({ on: false, changedAt: null });
      }

      const wrong = shift.checkPin(raw);
      if (wrong) return res.status(400).json({ error: wrong });

      const hash = await accounts.hashPassword(String(raw).trim());

      /*
       * Can a shift actually be signed with this?
       *
       * Asked here, before saying "Saved", because the answer depends on
       * SECRET_KEY being present on the box and the owner is the only person
       * who can do anything about that. Without this the PIN stored happily,
       * the dashboard said On, and the first housekeeper to try the link got
       * "the board is not set up" — told to go and tell the owner, who had
       * just set it up and been told it worked.
       */
      const signable = shift.issue({ subscriberId: req.venue.id, pinHash: hash });
      if (!signable) {
        console.error(
          'SECRET_KEY is missing or not 64 hex characters, so no housekeeping shift can be signed.'
        );
        return res.status(503).json({
          error:
            'The PIN was not saved. This server has no SECRET_KEY set, and a housekeeping shift cannot be signed without one. Set SECRET_KEY in the review app environment, restart it, and try again.',
        });
      }

      const saved = await subscribers.setHousekeepingPin({ id: req.venue.id, hash });
      res.json({ on: true, changedAt: saved.changedAt });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/businesses/:slug/rooms/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such room.' });
      }
      await rooms.deleteRoom({ subscriberId: req.venue.id, id });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

/* ----------------------------------------------------------------- guests */

/*
 * The people on a booking, and Thailand's TM30 notification about them.
 *
 * A passport number goes in here and comes back out only through the export,
 * which is the file somebody uploads to Immigration. Every other response
 * carries the last four characters and nothing more.
 */

router.get(
  '/businesses/:slug/bookings/:id/guests',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such booking.' });
      }
      res.json({
        guests: await guests.listFor({ subscriberId: req.venue.id, bookingId: id }),
        // So the form can say why the passport field is disabled rather than
        // letting somebody type one and lose it on save.
        canStorePassports: secrets.configured,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/businesses/:slug/bookings/:id/guests',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such booking.' });
      }
      const guest = await guests.add({
        subscriberId: req.venue.id,
        bookingId: id,
        ...(req.body || {}),
      });
      res.status(201).json({ guest });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Correct a guest record.
 *
 * Scoped by guest id rather than by booking, like the delete below it: a guest
 * belongs to exactly one booking, and making the caller carry both means two
 * ways to be wrong about which.
 *
 * Only the keys actually sent are forwarded. `tm30Required` is passed through
 * untouched — including null, which is a real value here meaning "go back to
 * deciding from nationality" — and guests.update is the one place that decides
 * whether it is acceptable.
 */
router.patch(
  '/businesses/:slug/guests/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such guest.' });
      }

      const body = req.body || {};
      const patch = { subscriberId: req.venue.id, id };
      for (const key of [
        'familyName',
        'firstName',
        'middleName',
        'nationality',
        'dateOfBirth',
        'phone',
        'arrivedInThailand',
        'passportNumber',
        'tm30Required',
      ]) {
        if (body[key] !== undefined) patch[key] = body[key];
      }

      res.json({ guest: await guests.update(patch) });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/businesses/:slug/guests/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such guest.' });
      }
      await guests.remove({ subscriberId: req.venue.id, id });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

/* ------------------------------------------------------------------- TM30 */

/** Who still needs notifying, for a window of arrivals. */
router.get(
  '/businesses/:slug/tm30',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const list = await guests.pending({
        subscriberId: req.venue.id,
        from: String(req.query.from || ''),
        to: String(req.query.to || ''),
      });
      res.json({
        pending: list,
        ready: list.filter((g) => g.ready).length,
        incomplete: list.filter((g) => !g.ready).length,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * The file itself.
 *
 * Text, not JSON, and sent as a download. This is the only response in the
 * product that contains passport numbers, so it is deliberately the one route
 * that is obvious about what it is — a person asked for it, it arrives as a
 * file, and nothing renders it in a page where it could sit in a browser cache
 * behind somebody's back.
 */
router.get(
  '/businesses/:slug/tm30.csv',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const { csv } = await guests.forExport({
        subscriberId: req.venue.id,
        from: String(req.query.from || ''),
        to: String(req.query.to || ''),
      });

      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      res.set(
        'Content-Disposition',
        `attachment; filename="tm30-${req.venue.slug}-${req.query.from}.csv"`
      );
      res.send(csv);
    } catch (err) {
      next(err);
    }
  }
);

/** Mark people notified, after the upload — not at download. */
router.post(
  '/businesses/:slug/tm30/notified',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      res.json(
        await guests.markNotified({
          subscriberId: req.venue.id,
          ids: req.body?.ids,
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

/** Drop passport numbers for stays that ended long enough ago. */
router.post(
  '/businesses/:slug/tm30/forget',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      res.json(
        await guests.forgetPassports({
          subscriberId: req.venue.id,
          days: req.body?.days ?? 365,
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

/* ------------------------------------------------------------------ rates */

/** Every rate plan at a venue. */
router.get(
  '/businesses/:slug/rates',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      res.json({ plans: await rates.listPlans(req.venue.id) });
    } catch (err) {
      next(err);
    }
  }
);

/** A window of what each plan charges per night, with the base folded in. */
router.get(
  '/businesses/:slug/rate-calendar',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      res.json(
        await rates.forWindow({
          subscriberId: req.venue.id,
          start: String(req.query.start || ''),
          days: Number(req.query.days) || 14,
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/businesses/:slug/rates',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const plan = await rates.createPlan({
        subscriberId: req.venue.id,
        groupId: Number(req.body?.groupId),
        name: req.body?.name,
        base: req.body?.base,
      });
      res.status(201).json({ plan });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/businesses/:slug/rates/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such rate.' });
      }
      const plan = await rates.setPlanBase({
        subscriberId: req.venue.id,
        id,
        base: req.body?.base,
      });
      res.json({ plan });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/businesses/:slug/rates/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such rate.' });
      }
      await rates.deletePlan({ subscriberId: req.venue.id, id });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Price or restrict a run of nights.
 *
 * Only the fields actually sent are written, so raising a price does not clear
 * a minimum-stay rule set last week. `to` is the last night, inclusive —
 * unlike a departure date, because somebody setting a high season means the
 * 31st included.
 */
router.post(
  '/businesses/:slug/rates/:id/nights',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such rate.' });
      }

      const body = req.body || {};
      const patch = {
        subscriberId: req.venue.id,
        planId: id,
        from: body.from,
        to: body.to,
      };
      for (const key of ['amount', 'minNights', 'closed', 'closedToArrival']) {
        if (body[key] !== undefined) patch[key] = body[key];
      }

      res.json(await rates.setRange(patch));
    } catch (err) {
      next(err);
    }
  }
);

/** What a stay would cost, and whether it may be sold at all. */
router.get(
  '/businesses/:slug/quote',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      res.json(
        await rates.quote({
          subscriberId: req.venue.id,
          planId: Number(req.query.planId),
          arrival: String(req.query.arrival || ''),
          departure: String(req.query.departure || ''),
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

/** How many rooms of each type are free for a whole stay. */
router.get(
  '/businesses/:slug/availability',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      res.json(
        await rates.availability({
          subscriberId: req.venue.id,
          arrival: String(req.query.arrival || ''),
          departure: String(req.query.departure || ''),
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

/* ------------------------------------------------------------- the diary */

/**
 * The calendar: rooms, the nights that are taken, and stays with no room yet.
 *
 * `start` and `days` come off the query string and are handed to nights.window,
 * which caps and refuses rather than trusting them — a hand-edited URL asking
 * for a hundred thousand nights gets a screenful.
 */
router.get(
  '/businesses/:slug/calendar',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const start = String(req.query.start || '');
      const days = Number(req.query.days) || 14;

      const [grid, list] = await Promise.all([
        bookings.calendar({ subscriberId: req.venue.id, start, days }),
        rooms.listRooms(req.venue.id),
      ]);

      res.json({ ...grid, rooms: list });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * The bookings widget on the venue page.
 *
 * `today` comes from the caller, which knows the property's timezone — a date
 * worked out from UTC here would be yesterday's summary until 07:00 in Bangkok.
 */
router.get(
  '/businesses/:slug/summary',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      res.json(
        await bookings.summary({
          subscriberId: req.venue.id,
          today: String(req.query.today || ''),
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

/**
 * The bookings list.
 *
 * No status filter unless one is asked for. A list that silently hides rows is
 * the bug this is most likely to grow, so the default here is everything and
 * the screen's own default link is the one that narrows it.
 *
 * All the validation lives in bookingfilter, which is pure and tested; this
 * hands it the query string and passes the result along.
 */
router.get(
  '/businesses/:slug/bookings',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      res.json(
        await bookings.list({
          subscriberId: req.venue.id,
          ...bookingfilter.parse(req.query),
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

/** Arrivals, departures and who is in house on one day. */
router.get(
  '/businesses/:slug/day',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const day = await bookings.onDate({
        subscriberId: req.venue.id,
        date: String(req.query.date || ''),
      });
      res.json(day);
    } catch (err) {
      next(err);
    }
  }
);

/* ------------------------------------------------------------- bookings */

router.post(
  '/businesses/:slug/bookings',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const booking = await bookings.create({
        subscriberId: req.venue.id,
        groupId: Number(body.groupId),
        roomId: body.roomId ? Number(body.roomId) : null,
        guestName: body.guestName,
        guestEmail: body.guestEmail,
        guestPhone: body.guestPhone,
        adults: body.adults ?? 1,
        children: body.children ?? 0,
        arrival: body.arrival,
        departure: body.departure,
        notes: body.notes,
        ratePlanId: body.ratePlanId ? Number(body.ratePlanId) : null,
      });
      res.status(201).json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/businesses/:slug/bookings/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such booking.' });
      }
      res.json({ booking: await bookings.get({ subscriberId: req.venue.id, id }) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Assign, move, or unassign. What the calendar's drag and drop calls.
 *
 * `roomId: null` is a deliberate value, not a missing one — it means take this
 * stay out of its room and put it back on the unassigned row.
 */
/** Correct a booking: dates, guest, headcount, room type. */
router.patch(
  '/businesses/:slug/bookings/:id',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such booking.' });
      }

      const body = req.body || {};
      // Only what was sent. update() leaves anything absent alone, so
      // forwarding undefined for a field the form did not include is the
      // difference between a correction and a blanking.
      const patch = { subscriberId: req.venue.id, id };
      for (const key of [
        'guestName', 'guestEmail', 'guestPhone',
        'adults', 'children', 'arrival', 'departure', 'notes',
      ]) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      if (body.groupId !== undefined) patch.groupId = Number(body.groupId);
      // A dragged stay sends its room with its dates, so the two land in one
      // transaction. Null unassigns; the room decides the type.
      if (body.roomId !== undefined) {
        patch.roomId = body.roomId === null ? null : Number(body.roomId);
      }

      res.json({ booking: await bookings.update(patch) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/businesses/:slug/bookings/:id/assign',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such booking.' });
      }

      const raw = req.body?.roomId;
      const roomId = raw === null || raw === undefined || raw === '' ? null : Number(raw);
      if (roomId !== null && (!Number.isSafeInteger(roomId) || roomId <= 0)) {
        return res.status(400).json({ error: 'Bad request.' });
      }

      const booking = await bookings.assign({
        subscriberId: req.venue.id,
        id,
        roomId,
      });
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/businesses/:slug/bookings/:id/status',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(404).json({ error: 'No such booking.' });
      }
      const booking = await bookings.setStatus({
        subscriberId: req.venue.id,
        id,
        status: String(req.body?.status || ''),
      });
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/* ------------------------------------------------------------- businesses */

/**
 * Is this address free?
 *
 * Behind sign-in on purpose. Availability is exactly the kind of thing a
 * scraper would walk to enumerate every venue on the platform, and a customer
 * choosing an address is the only person who needs to ask.
 */
router.get('/slug/:slug', requireAccount, async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();

    const check = subscribers.checkSlug(slug);
    if (!check.ok) {
      return res.json({
        slug,
        valid: false,
        available: false,
        reason: check.error,
      });
    }

    const taken = await subscribers.get(slug);

    res.json({
      slug,
      valid: true,
      available: !taken,
      url: publicUrl(slug),
      reason: taken ? 'That address is already taken.' : undefined,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/businesses', requireAccount, async (req, res, next) => {
  try {
    const owned = await subscribers.countForAccount(req.account.id);
    if (!plans.canAddVenue(req.account.plan, owned)) {
      const plan = plans.planFor(req.account.plan);
      return res.status(403).json({
        error: `${plan.name} covers ${plan.venues} business${plan.venues === 1 ? '' : 'es'}. Change plan to add another.`,
      });
    }

    const verdict = await openrouter.vet(req.body || {});
    if (verdict.error) return res.status(400).json({ error: verdict.error });

    const { record } = await subscribers.create({
      ...(req.body || {}),
      accountId: req.account.id,
    });

    res.status(201).json({
      business: { ...record, url: publicUrl(record.slug) },
      warning: verdict.warning,
    });
  } catch (err) {
    next(err);
  }
});

/** One business: its settings, and the numbers behind the dashboard. */
router.get(
  '/businesses/:slug',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const [month, all, daily, byCategory] = await Promise.all([
        events.usageThisMonth(req.venue.id),
        events.lifetime(req.venue.id),
        events.daily(req.venue.id, 30),
        events.byCategory(req.venue.id),
      ]);

      const identity = {
        slug: req.venue.slug,
        name: req.venue.name,
        status: req.venue.status,
        url: publicUrl(req.venue.slug),
        createdAt: req.venue.created_at,
      };

      // The same answer the guest page refuses on, from the same module, so
      // the two screens cannot tell different stories about whether this venue
      // works. A dashboard that looks finished over a guest page that can send
      // nobody anywhere is the failure this exists to prevent.
      const resolved = subscribers.settingsFor(req.venue);

      res.json({
        business: identity,
        setup: setup.progress({
          settings: resolved,
          off: resolved.platformsOff,
        }),
        settings: subscribers.describe(req.venue),
        // Whether the board is switched on, never the PIN itself. A dashboard
        // that could show it would be a dashboard that had it in a response
        // somebody could log.
        housekeeping: {
          on: Boolean(req.venue.housekeeping_pin),
          changedAt: req.venue.housekeeping_pin_at ?? null,
        },
        stats: {
          month: {
            reviews: month.reviews,
            tokens: month.tokens,
            tokenLimit: plans.TOKENS_PER_MONTH_PER_VENUE,
          },
          lifetime: {
            reviews: all.reviews,
            tokens: all.tokens,
            lastAt: all.last_at,
          },
          daily,
          byCategory,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Venue settings. The same fields the gear icon used to edit, minus the parts
 * that were never the venue's to change — its address and its plan.
 */
router.patch(
  '/businesses/:slug',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const patch = req.body || {};

      const verdict = await openrouter.vet(patch);
      if (verdict.error) return res.status(400).json({ error: verdict.error });

      // apiKey and model are deliberately not here. The platform key and the
      // fixed model are ours; a customer changing either is not a setting, it
      // is a support ticket. Sending them is ignored rather than rejected —
      // there is nothing for the customer to correct.
      const record = await subscribers.update(req.venue.slug, {
        name: patch.name,
        status: patch.status,
        googleUrl: patch.googleUrl,
        tripadvisorUrl: patch.tripadvisorUrl,
        facebookUrl: patch.facebookUrl,
        wongnaiUrl: patch.wongnaiUrl,
        websiteUrl: patch.websiteUrl,
        categories: patch.categories,
        // Which review sites this venue has decided it is not on. Validated in
        // settings.js against the known platforms, like every other list here.
        platformsOff: patch.platformsOff,
        kind: patch.kind,
        place: patch.place,
        theme: patch.theme,
        fontDisplay: patch.fontDisplay,
        fontUi: patch.fontUi,
        background: patch.background,
      });

      res.json({ business: record, warning: verdict.warning });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Deleting a venue.
 *
 * review_events cascades with the row, so this destroys that venue's entire
 * history along with it — and the address becomes free for someone else to
 * claim, which means any QR code already printed for it could later point at a
 * different business. The website asks for the slug to be typed before calling
 * this; nothing here can undo it.
 */
router.delete(
  '/businesses/:slug',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      await subscribers.remove(req.venue.slug);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * The latest reviews, for the list beside the stats.
 *
 * Fifty rather than the twenty it was. Twenty is about a fortnight for a busy
 * venue, and the list is where an owner works through what has been written and
 * rates it — a cap that quietly hides half of what they have is a cap that
 * makes the page look broken rather than paginated, because nothing on it says
 * there is more.
 *
 * `events.recent` holds its own ceiling of a hundred, so this cannot be talked
 * into fetching the whole table by a query string.
 */
const LATEST_REVIEWS = 50;

router.get(
  '/businesses/:slug/reviews',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      // Together, because they answer one question between them: what is on
      // the listing, and what was written and went nowhere.
      const [reviews, notTaken] = await Promise.all([
        events.recent(req.venue.id, LATEST_REVIEWS),
        events.notTaken(req.venue.id),
      ]);

      res.json({ reviews, notTaken });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Rating one.
 *
 * This is the owner's judgement rather than a guest's, and it is what decides
 * which reviews come back as approved samples in the prompt. Re-rating
 * overwrites, and the row has to belong to this business.
 */
router.post(
  '/businesses/:slug/reviews/:id/feedback',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const { rating } = req.body || {};
      const id = Number(req.params.id);

      // null clears it — the way someone undoes a misclick. Everything else has
      // to be a whole number of stars; a check constraint says the same thing in
      // the database, because this is the value the prompt reads back.
      const stars = rating === null ? null : Number(rating);
      const usable =
        stars === null || (Number.isInteger(stars) && stars >= 1 && stars <= 5);

      if (!usable || !Number.isInteger(id)) {
        return res.status(400).json({ error: 'A rating is one to five stars.' });
      }

      const saved = await events.setFeedback({
        subscriberId: req.venue.id,
        id,
        rating: stars,
      });
      if (!saved) return res.status(404).json({ error: 'No such review.' });

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Reviews already on the venue's listings — the other direction entirely.
 *
 * Everything above is about reviews this product helped write. These are the
 * ones already out there, fetched back so an owner can see what is being said
 * and whether anybody answered it. They live in their own table and never mix
 * with review_events: one is what we did, the other is what the world did, and
 * a screen that added them together would be lying about both.
 */
const MAX_IMPORT = 500;

/** Platform ids to the names people call them. */
const LABELS = new Map(PLATFORMS.map((p) => [p.id, p.label]));

/** A window a person could plausibly have meant. */
function windowDays(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 365) : undefined;
}

router.get(
  '/businesses/:slug/listing-reviews',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const resolved = subscribers.settingsFor(req.venue);
      const found = await listings.recent({
        subscriberId: req.venue.id,
        days: windowDays(req.query.days),
      });

      // The connectors go with the list rather than on a settings page,
      // because the question they answer is the one an owner asks *here*:
      // "why is Tripadvisor not in this?" An empty list with no explanation
      // beside it reads as a product that does not work.
      res.json({ ...found, connectors: connectors.list(resolved) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Go and look now.
 *
 * Returns the list afterwards rather than a count, so the screen shows the
 * result of the fetch instead of asking for it again and rendering whatever
 * arrives second.
 */
router.post(
  '/businesses/:slug/listing-reviews/fetch',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const resolved = subscribers.settingsFor(req.venue);
      const days = windowDays(req.body?.days);

      const run = await connectors.fetchAll({
        venue: req.venue,
        settings: resolved,
        days,
      });

      /*
       * One line per listing rather than per connector, because that is the
       * unit somebody reads: "Google 14, 2 new; Tripadvisor could not be
       * read" is four facts they can act on, and a single "fetched" is none.
       */
      const ran = [];
      for (const result of run.results) {
        const listing = result.platform ?? result.id;

        if (!result.ran) {
          ran.push({
            id: result.id,
            platform: result.platform ?? null,
            label: LABELS.get(listing) ?? listing,
            stored: 0,
            added: 0,
            reason: result.reason,
          });
          continue;
        }

        const saved = await listings.store({
          subscriberId: req.venue.id,
          platform: result.platform,
          rows: result.rows,
          // A listing page returns its whole first page regardless of what was
          // asked for, so the window is applied here rather than hoped for.
          from: run.from,
        });
        ran.push({
          id: result.id,
          platform: result.platform,
          label: LABELS.get(listing) ?? listing,
          ...saved,
          // Which page it was read off, when that is not the listing it is on:
          // a Tripadvisor review found on the Google page came from Google.
          via: result.from && result.from !== result.platform ? result.from : null,
        });
      }

      const found = await listings.recent({ subscriberId: req.venue.id, days });
      res.json({ ...found, ran, connectors: connectors.list(resolved) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Reviews handed over by somebody who has them.
 *
 * The path that works today, and the reason the rest of this was worth
 * building before any API access exists: an export pasted in gets the same
 * de-duplication, the same window and the same reply tracking a connector
 * would give it, because all of that lives on this side of the fetch.
 */
router.post(
  '/businesses/:slug/listing-reviews/import',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const { platform, rows } = req.body || {};

      if (!PLATFORMS.some((p) => p.id === platform)) {
        return res.status(400).json({ error: 'Pick a listing these came from.' });
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'There were no reviews in that.' });
      }
      if (rows.length > MAX_IMPORT) {
        return res
          .status(400)
          .json({ error: `That is more than ${MAX_IMPORT} reviews at once.` });
      }

      const saved = await listings.store({
        subscriberId: req.venue.id,
        platform,
        rows,
      });

      // Unusable rows are counted rather than refused: an export with three
      // blank lines in it is not a failed import, and telling somebody their
      // paste was rejected when 97 of its 100 rows were fine is wrong.
      //
      // The same shape as the GET, connectors and all. The screen replaces
      // everything it holds with whatever a write hands back, so a response
      // that is *nearly* the list is worse than one that is not: it renders
      // once and then breaks on the field that was left out.
      const found = await listings.recent({ subscriberId: req.venue.id });
      res.json({
        ...found,
        connectors: connectors.list(subscribers.settingsFor(req.venue)),
        imported: { ...saved, read: rows.length },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Whether this one has been answered.
 *
 * By hand, for a reply left somewhere this cannot see — which is every reply
 * today. A fetch that later brings the real one back overwrites the text but
 * cannot un-answer it; listings.js says why.
 */
router.post(
  '/businesses/:slug/listing-reviews/:id/replied',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: 'No such review.' });
      }

      const saved = await listings.setReplied({
        subscriberId: req.venue.id,
        id,
        replied: req.body?.replied !== false,
        body: req.body?.body,
      });

      res.json({ review: saved });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Reading a business's own website and proposing what a review may draw on.
 *
 * These two moved here from the guest page's settings panel, which no longer
 * exists. Both return a draft and write nothing: the whole no-fabrication
 * guarantee rests on a human reading the details before they reach a prompt.
 */
/**
 * Where the drafting reads from, in order of how much it will get.
 *
 * A great many small businesses have no website at all — they have a Facebook
 * page, and that is their entire public presence. Requiring a website meant the
 * whole dashboard did nothing for them: no description, no topics, no details,
 * no colours, no logo. Falling back to whichever listing they *have* set costs
 * one line and is the difference between the product working for them and not.
 *
 * A real website first, because it is far and away the richest source and the
 * only one guaranteed to be readable. Then Facebook, which is the usual answer
 * to "no website". Then anything else set, in platform order.
 *
 * A social page will often read poorly or not at all — see `sourceHint` — so
 * this returns which one it picked, and the callers say so when nothing usable
 * comes back.
 */
const SOURCE_ORDER = ['websiteUrl', 'facebookUrl', ...PLATFORMS.map((p) => `${p.id}Url`)];

const SOURCE_LABELS = {
  websiteUrl: 'website',
  facebookUrl: 'Facebook page',
  googleUrl: 'Google listing',
  tripadvisorUrl: 'Tripadvisor listing',
  wongnaiUrl: 'Wongnai listing',
};

/**
 * What to tell someone whose read came back empty.
 *
 * Only worth saying for a social page. Facebook serves a login wall to anything
 * that is not a browser with a session, and a fetcher gets that wall rather than
 * the page — so "nothing usable came back" is the expected outcome there, not a
 * surprise, and the customer should hear which of the two it was.
 */
function sourceHint(field) {
  if (field === 'websiteUrl') {
    return 'Try a different page on the site — an About page usually works best.';
  }
  return `That is your ${SOURCE_LABELS[field] ?? 'listing'}, and those often refuse to be read by anything that is not a signed-in browser — Facebook most of all, which shows a sign-in wall rather than the page. If it keeps coming back empty, the topics and their descriptions can be written by hand below, which is the only route that always works.`;
}

function readable(venue, res, { requireSource = true } = {}) {
  const resolved = subscribers.settingsFor(venue);

  if (!resolved.apiKey) {
    res.status(500).json({ error: 'No OpenRouter key is configured.' });
    return null;
  }

  // First address that is set, in the order above. A website is richer than a
  // listing and a listing is better than nothing — but every one of them is a
  // URL handed to the same fetch, so there is no second code path here and no
  // special case for Facebook. A page that answers with a sign-in wall is a
  // page that came back with nothing on it, and the prompt is what handles
  // that.
  const field = SOURCE_ORDER.find((name) => resolved[name]);
  if (!field) {
    // Most readers have nothing to do without a page and say so. The one that
    // writes a single description does have something to do — the ordinary
    // parts of a visit need no website behind them — so it opts out of this.
    if (requireSource) {
      res.status(400).json({
        error:
          'Nothing to read yet. Add a website address — or your Facebook page as the Facebook link — then save.',
      });
      return null;
    }
    return { ...resolved, sourceUrl: '', sourceField: '' };
  }

  // `sourceUrl` is what the readers actually fetch. `websiteUrl` stays what it
  // always was, so nothing else in the app changes meaning.
  return { ...resolved, sourceUrl: resolved[field], sourceField: field };
}

/**
 * One topic's description, written to order.
 *
 * The bulk generator is the right shape for setting a business up and the wrong
 * one for changing your mind about a single button: it replaces all fifty. This
 * writes one, and the dashboard drops it into that row alone.
 *
 * Unlike every other reader here, this one works without a page. A description
 * for "The Welcome" needs no website — the prompt is told to describe what that
 * part of a visit is and claim nothing specific — so refusing for want of an
 * address would block the one case that needs no address at all.
 */
router.post(
  '/businesses/:slug/topics/describe',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const resolved = readable(req.venue, res, { requireSource: false });
      if (!resolved) return;

      const label = String(req.body?.label ?? '').trim().slice(0, 40);
      if (!label) {
        return res.status(400).json({ error: 'Name the topic first.' });
      }

      // Whatever is already in the box. Capped at the stored limit because it
      // is going into a prompt, not because anything stores it.
      const hint = String(req.body?.hint ?? '')
        .trim()
        .slice(0, settingsRules.MAX_DESCRIPTION);

      const answer = await readWebsite(req.venue, resolved, {
        messages: buildDescribeMessages({
          url: resolved.sourceUrl,
          label,
          hint,
        }),
        maxTokens: 800,
      });
      if (!answer.ok) {
        return res.status(answer.status).json({ error: answer.error });
      }

      const description = parseDescription(answer.content, {
        maxChars: settingsRules.MAX_DESCRIPTION,
      });
      if (!description) {
        console.error(
          'Topic description produced nothing usable:',
          String(answer.content).slice(0, 500)
        );
        return res.status(502).json({
          error: `Nothing usable came back for "${label}". Try again, or put a word or two in the box first to steer it.`,
        });
      }

      res.json({ description });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * The topic set, drafted from the website.
 *
 * A draft, like the others: it fills the editor and Save stores it. Thirty
 * {label, focus} pairs need considerably more room than the five this replaced,
 * hence the token ceiling.
 */
router.post(
  '/businesses/:slug/topics/suggest',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const resolved = readable(req.venue, res);
      if (!resolved) return;

      // Every listing this business has set, whichever one was chosen as the
      // page to read. What its own site says it offers and what its customers
      // actually talk about are different lists, and the second is the one the
      // buttons want to be.
      const listings = PLATFORMS.map((p) => resolved[`${p.id}Url`]).filter(Boolean);

      const answer = await readWebsite(req.venue, resolved, {
        messages: buildTopicMessages({
          url: resolved.sourceUrl,
          listings,
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
        maxChars: settingsRules.MAX_DESCRIPTION,
      });
      if (!categories) {
        console.error(
          'Topic drafting produced nothing usable:',
          String(answer.content).slice(0, 500)
        );
        return res.status(502).json({
          error: `No usable topics came back from that page. ${sourceHint(resolved.sourceField)}`,
        });
      }

      // Sorted before it reaches the editor, so the list the customer is
      // about to save already reads in the order it will be shown in. The cap
      // is applied first, by parseTopics: the model's own ordering decides
      // which fifty survive, and alphabetical decides only how they are shown.
      res.json({
        categories: [...categories].sort(settingsRules.byLabel),
        url: resolved.sourceUrl,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * The cheap half of the theme draft: change what is there, read nothing.
 *
 * Returns the same shape the full draft does minus everything that needs the
 * network — no logo, no photograph, no font files. The dashboard keeps what
 * it already had for those, which is right: they were downloaded and approved
 * once, and "less blue" is not a reason to fetch them again.
 */
async function adjustTheme(req, res, { own, note, resolved }) {
  const current = own.theme;
  const answer = await readWebsite(req.venue, resolved, {
    messages: buildAdjustMessages({
      current,
      note,
      displayFonts: theme.DISPLAY_FONTS,
      uiFonts: theme.UI_FONTS,
    }),
    maxTokens: 700,
    // The whole point. Without this the web_fetch tool is attached and the
    // model goes and reads the site anyway.
    fetchPage: false,
  });

  if (!answer.ok) return res.status(answer.status).json({ error: answer.error });

  const parsed = parseTheme(answer.content);
  if (!parsed) {
    console.error(
      'Theme adjustment produced nothing usable:',
      String(answer.content).slice(0, 500)
    );
    return res.status(502).json({
      error: 'Nothing usable came back. Try saying it a different way.',
    });
  }

  /*
   * The mark carried through, because this reply replaces the palette.
   *
   * The dashboard takes what comes back wholesale — that is right for a fresh
   * read, which returns everything — so a reply with no logo in it would take
   * the venue's logo off on the next Save. It was never the model's to change
   * here and it is not being re-fetched; it is only being kept.
   */
  const verdict = theme.validate({
    ...parsed.theme,
    logo: current.logo ?? '',
    showName: current.showName === true,
  });
  if (!verdict.ok) {
    return res.status(502).json({
      error: `The colours that came back are not usable: ${verdict.error}`,
    });
  }

  /*
   * Derived against what this venue actually has.
   *
   * The scrim only exists when there is a photograph behind the page, and the
   * grabbed typefaces change what the preview renders in — so deriving with
   * empty ones here would show a preview that is not the page. They are not
   * being changed, only accounted for.
   */
  const fonts = {};
  if (own.fontDisplay) fonts.display = own.fontDisplay;
  if (own.fontUi) fonts.ui = own.fontUi;

  const derived = theme.derive(verdict.theme, fonts, {
    background: Boolean(own.background),
  });

  res.json({
    theme: verdict.theme,
    sources: parsed.sources,
    derived: derived.vars,
    adjusted: derived.adjusted,
    /*
     * Said plainly, because the two paths look identical from the dashboard
     * and behave differently: this one did not touch the mark, the photograph
     * or the typefaces, and somebody who pressed it expecting a fresh read
     * should be able to tell which they got.
     */
    adjustedOnly: true,
  });
}

/**
 * The theme, drafted from the business's own website.
 *
 * A draft like the rest: it fills the swatches and Save stores it. What comes
 * back is the four colours the model read, what they derive to once the contrast
 * checks have run, and which of them the checks had to move — so the customer is
 * looking at the palette the guest will actually see rather than the one their
 * brand guide specifies.
 *
 * `note` is what the owner asked for in their own words, and it is optional.
 * Reading a site measures what it is painted with, which is not the same as
 * what the business wants to be seen in — see themenote.js.
 *
 * `adjust` asks for the cheap path instead: change the colours that are
 * already there and read nothing. See adjustTheme above for why that is the
 * better answer and not only the faster one.
 */
router.post(
  '/businesses/:slug/theme/draft',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const resolved = readable(req.venue, res);
      if (!resolved) return;

      /*
       * Before anything is fetched or paid for.
       *
       * The reasons this refuses are all things somebody can fix in the box
       * they just typed into, and every one of them is cheaper to say now than
       * after twenty seconds of reading a website.
       */
      const asked = themenote.check(req.body?.note);
      if (!asked.ok) return res.status(400).json({ error: asked.reason });

      /*
       * Adjusting what is already there, rather than reading the site again.
       *
       * Reading it is several requests to the customer's own server followed
       * by a model call with a page attached, and takes the better part of a
       * minute. That is the right price for a first draft and an absurd one
       * for "warmer" — which is what most presses of that button mean once a
       * palette exists.
       *
       * It is the better answer as well as the faster one. A fresh read makes
       * the model decide the whole palette again, so a small change comes
       * back with colours that moved for no reason anybody asked for. This
       * way it is handed the four it has and moves the one that was named.
       *
       * Asked for, not inferred. The dashboard has two buttons and the person
       * pressing one of them knows which they meant; deciding here from the
       * presence of a note would mean somebody who wanted the site read again
       * silently got an adjustment instead, with no way to say otherwise.
       *
       * Still refused without an instruction and an existing palette: there
       * would be nothing to adjust, and nothing to adjust it towards.
       */
      const own = subscribers.settingsFor(req.venue);
      if (req.body?.adjust === true && asked.note && own.theme) {
        return void (await adjustTheme(req, res, { own, note: asked.note, resolved }));
      }

      /*
       * Read the site ourselves first.
       *
       * Never fatal: a host that is slow or unreachable leaves the model doing
       * what it did before, which is worse but not nothing. Somebody should
       * not be unable to theme their page because their web host had a bad
       * afternoon.
       */
      const facts = await sitefacts.gather(resolved.sourceUrl).catch((err) => {
        console.error('Could not read the site for theme evidence:', err.message);
        return { brief: '', colours: [], logos: [], backgrounds: [], note: '' };
      });

      const answer = await readWebsite(req.venue, resolved, {
        messages: buildThemeMessages({
          url: resolved.sourceUrl,
          displayFonts: theme.DISPLAY_FONTS,
          uiFonts: theme.UI_FONTS,
          brief: facts.brief,
          note: asked.note,
        }),
        maxTokens: 1200,
      });
      if (!answer.ok) {
        return res.status(answer.status).json({ error: answer.error });
      }

      const parsed = parseTheme(answer.content);
      if (!parsed) {
        console.error(
          'Theme drafting produced nothing usable:',
          String(answer.content).slice(0, 500)
        );
        return res.status(502).json({
          error: `No usable colours came back from that page. ${sourceHint(resolved.sourceField)}`,
        });
      }

      // The logo is downloaded here rather than at Save, so that what is put in
      // front of the customer is the image itself and not a promise of one. A
      // failure is reported and the rest of the draft still stands: a palette
      // and a pair of typefaces are worth having without a mark.
      /*
       * What we found, when the model named nothing.
       *
       * It is reading a page for a mark it has to recognise as one; we have a
       * shortlist from the markup — the apple touch icon, an image the page
       * itself calls a logo. Neither is reliable alone and they fail
       * differently, so the model's answer is tried first and ours is what
       * stands behind it rather than an argument with it.
       */
      if (!parsed.logoUrl && facts.logos?.length) {
        parsed.logoUrl = facts.logos[0].url;
        parsed.sources.logo = facts.logos[0].why;
      }
      if (!parsed.backgroundUrl && facts.backgrounds?.length) {
        parsed.backgroundUrl = facts.backgrounds[0].url;
        parsed.sources.background = facts.backgrounds[0].why;
      }

      /*
       * Each candidate in turn until one downloads.
       *
       * The first choice fails for ordinary reasons — a file that is 4MB, an
       * address that 404s, a type we will not serve — and a second candidate
       * costs one request. Giving up after one was leaving people with "no
       * logo" while a perfectly good one sat second on the list.
       */
      const logoTries = [parsed.logoUrl, ...(facts.logos ?? []).map((l) => l.url)]
        .filter(Boolean)
        .filter((url, i, all) => all.indexOf(url) === i)
        .slice(0, 3);

      let logoNote = logoTries.length ? '' : 'No logo found on that page.';
      for (const url of logoTries) {
        const image = await assets.fetchImage(url);
        if (image.ok) {
          parsed.theme.logo = image.dataUri;
          logoNote = `Found a logo (${assets.size(image.bytes)} ${image.type.replace('image/', '')}).`;
          break;
        }
        logoNote = `No logo: ${image.error}`;
      }

      // The hero photograph, same treatment: downloaded here so that what the
      // customer approves is the image itself, with its own outcome so a failure
      // costs the photo rather than the whole draft.
      let background = null;
      let backgroundNote = 'No background photo found on that page.';

      const photoTries = [parsed.backgroundUrl, ...(facts.backgrounds ?? []).map((b) => b.url)]
        .filter(Boolean)
        .filter((url, i, all) => all.indexOf(url) === i)
        .slice(0, 3);

      for (const url of photoTries) {
        const photo = await assets.fetchImage(url, {
          maxBytes: assets.MAX_BACKGROUND_BYTES,
        });
        if (photo.ok) {
          background = {
            type: photo.type,
            dataUri: photo.dataUri,
            source: url.slice(0, 300),
          };
          backgroundNote = `Took a background photo (${assets.size(photo.bytes)} ${photo.type.replace('image/', '')}).`;
          break;
        }
        backgroundNote = `No background: ${photo.error}`;
      }

      // Checked here rather than left to Save. A palette that cannot be stored
      // should not be put in front of someone as though it can.
      const verdict = theme.validate(parsed.theme);
      if (!verdict.ok) {
        return res.status(502).json({
          error: `The colours that came back are not usable: ${verdict.error}`,
        });
      }

      // The real typefaces, downloaded the same way and reported the same way.
      // Each slot stands alone: a site whose headings are self-hosted and whose
      // body text comes from a foundry CDN should keep the one it may keep.
      const fonts = {};
      const fontNotes = [];

      for (const slot of ['display', 'ui']) {
        const found = parsed.files?.[slot];
        if (!found) {
          fontNotes.push(`No ${slot} font file found — using the closest match.`);
          continue;
        }

        const file = await assets.fetchFont(found.url);
        if (file.ok) {
          fonts[slot] = {
            family: theme.cssName(found.family),
            format: file.format,
            source: found.url.slice(0, 300),
            data: file.data,
          };
          fontNotes.push(`Took ${found.family} (${assets.size(file.bytes)}) for the ${slot}.`);
        } else {
          fontNotes.push(`${found.family} could not be used: ${file.error}`);
        }
      }

      const derived = theme.derive(verdict.theme, fonts, {
        background: Boolean(background),
      });

      res.json({
        theme: verdict.theme,
        sources: parsed.sources,
        derived: derived.vars,
        adjusted: derived.adjusted,
        logoNote,
        background,
        backgroundNote,
        // The addresses the reader settled on, whether or not the download
        // worked. A note saying "no logo: that file is 4MB" is a dead end on
        // its own; with the address beside it somebody can look at what was
        // found, correct it, and try again — which is the difference between
        // a failure they can act on and one they can only accept.
        found: {
          logoUrl: parsed.logoUrl ?? null,
          backgroundUrl: parsed.backgroundUrl ?? null,
        },
        // What was read off the site rather than decided by the model, so the
        // screen can say which colours were measured.
        measured: (facts.named ?? []).map((c) => ({ hex: c.hex, roles: c.roles })),
        readNote: facts.note || null,
        // The scrim only exists when there is a photo behind it, so the preview
        // has to be derived with the same flag the served stylesheet will use.
        // Otherwise the dashboard would show the page without its wash.
        // Sent whole, because Save has to send them back — they are stored
        // fields, not something the dashboard can re-derive.
        fonts: {
          display: fonts.display ?? null,
          ui: fonts.ui ?? null,
        },
        fontNotes,
        url: resolved.sourceUrl,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * A logo or a background the customer points at themselves.
 *
 * The reader finds these on the page when they are findable, and often they
 * are not: a logo that is a background-image in a stylesheet, a hero behind a
 * slideshow, a site that will not be read at all. Until now that was the end
 * of it — the draft said "no logo found" and there was nothing to do about it
 * except accept a page without one.
 *
 * So: the same download, from an address somebody typed. It is worth saying
 * what that does *not* open up, because the answer is nothing. assets.js
 * refuses anything that is not https, resolves the host first and refuses
 * private addresses, caps the bytes and checks the type — and it did all of
 * that already, because the address the model returns is no more trustworthy
 * than the one a customer types. A model that reads a page and repeats a URL
 * off it is not a safer source of URLs than the person who owns the page.
 *
 * Fetched here and handed back as a data URI rather than stored, so what gets
 * approved is the image itself. Saving is still Save.
 */
router.post(
  '/businesses/:slug/theme/image',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const kind = req.body?.kind === 'background' ? 'background' : 'logo';
      const raw = String(req.body?.url ?? '').trim();

      if (!raw) {
        return res.status(400).json({ error: 'Paste the address of an image.' });
      }

      const image = await assets.fetchImage(raw, {
        maxBytes: kind === 'background' ? assets.MAX_BACKGROUND_BYTES : assets.MAX_BYTES,
      });

      // The reason, not a generic refusal. Every one of these is something the
      // customer can do something about — a different file, a smaller one, a
      // real address — and none of them are worth a support message.
      if (!image.ok) return res.status(422).json({ error: image.error });

      res.json({
        kind,
        type: image.type,
        bytes: image.bytes,
        dataUri: image.dataUri,
        source: raw.slice(0, 300),
        note: `Took a ${kind} (${assets.size(image.bytes)} ${image.type.replace('image/', '')}).`,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * What a set of colours would actually look like, without storing them.
 *
 * The dashboard needs this because the four colours a customer types are not the
 * palette they get — the contrast checks may move some of them. Deriving in the
 * browser to draw the preview would mean a second copy of theme.js in TypeScript,
 * and two implementations of a rule about readability is how a page ends up
 * promising one thing and serving another. No model call, so it is cheap enough
 * to ask on every change.
 */
router.post(
  '/businesses/:slug/theme/preview',
  requireAccount,
  requireOwnVenue,
  (req, res) => {
    const verdict = theme.validate(req.body?.theme);
    if (!verdict.ok) return res.status(400).json({ error: verdict.error });

    // A cleared theme previews as the shipped palette, which is what clearing it
    // gets you.
    const palette = verdict.theme || theme.DEFAULT_THEME;
    // The dashboard says whether a photograph is in play, because the scrim only
    // exists when one is — and a preview without it would be a preview of a page
    // nobody gets. It sends the flag rather than the image: this route derives,
    // it does not store, and the bytes are already on the other side.
    const derived = theme.derive(palette, {}, {
      background: Boolean(req.body?.background),
    });

    res.json({ theme: palette, derived: derived.vars, adjusted: derived.adjusted });
  }
);

/**
 * The rulebook: everything the writer is told about this business, as markdown.
 *
 * Temporary, and says so in its own first paragraph. It answers a question the
 * dashboard otherwise cannot — is a bad review the prompt's fault or this
 * business's settings? — and answers it with the real prompt rather than a
 * description of one.
 *
 * The five-star and low-rated samples are read live, because those are what is
 * genuinely in the prompt right now. The realism and avoid samples are not: they
 * are drawn at random per generation, so there is no value to print.
 */
router.get(
  '/businesses/:slug/rulebook',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const resolved = subscribers.settingsFor(req.venue);

      // Caught, not awaited into the happy path: a rulebook without its examples
      // is still worth reading, and this is a debugging view.
      const [examples, rejected] = await Promise.all([
        events.topRated(req.venue.id, 5).catch(() => []),
        events.poorlyRated(req.venue.id, 3).catch(() => []),
      ]);

      const markdown = context.rulebook({
        name: req.venue.name,
        systemPrompt: buildSystemPrompt(subscribers.venueFor(req.venue), {
          platformIds: PLATFORMS.map((p) => p.id).filter(
            (id) => resolved[`${id}Url`]
          ),
        }),
        topics: resolved.categories,
        examples,
        rejected,
        generatedAt: new Date().toISOString().slice(0, 10),
      });

      res.type('text/markdown').send(markdown);
    } catch (err) {
      next(err);
    }
  }
);

/* --------------------------------------------------- website drafting tools */

router.get(
  '/businesses/:slug/models',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const models = await openrouter.catalogue();
      res.json({ models: models.map(({ id, name }) => ({ id, name })) });
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------------- softphone */

/** Who answers this venue's calls: the account itself and the staff it invited. */
async function voiceTeam(req) {
  const [own, staff, status] = await Promise.all([
    voice.byAccount(req.account.id, 'venues'),
    voice.staffFor(req.account.id, req.venue.id),
    voicehub.status(req.venue.slug, 'sales'),
  ]);
  const people = [own, ...staff].filter(Boolean);
  const presence = voicehub.presence(people.map((p) => p.id));
  const row = (p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    you: p.accountId === req.account.id,
    invited: p.invited,
    onDuty: p.onDuty,
    presence: presence[p.id],
  });
  return {
    status,
    phoneUrl: `${SITE_URL}/phone/`,
    canEmail: mailer.configured,
    opened: Boolean(own),
    people: people.map(row),
  };
}

router.get('/businesses/:slug/voice', requireAccount, requireOwnVenue, async (req, res, next) => {
  try {
    res.json(await voiceTeam(req));
  } catch (err) {
    next(err);
  }
});

/**
 * Emails the invite. Without mail configured the link comes back instead, so
 * the owner can send it themselves.
 */
async function sendVoiceInvite(req, agent, token) {
  const url = `${SITE_URL}/phone/#invite=${token}`;
  if (!mailer.configured) return url;
  await mailer.send({
    to: agent.email,
    ...emails.voiceInviteEmail({ name: agent.name, venue: req.venue.name, by: req.account.email, url }),
  });
  return null;
}

router.post('/businesses/:slug/voice/staff', requireAccount, requireOwnVenue, async (req, res, next) => {
  try {
    const { agent, token } = await voice.invite(req.account.id, req.venue.id, req.body || {});
    const link = token ? await sendVoiceInvite(req, agent, token) : null;
    res.status(201).json({ ...(await voiceTeam(req)), link });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/businesses/:slug/voice/staff/:id/invite',
  requireAccount,
  requireOwnVenue,
  async (req, res, next) => {
    try {
      const { agent, token } = await voice.reinvite(req.account.id, Number(req.params.id));
      const link = await sendVoiceInvite(req, agent, token);
      res.json({ ...(await voiceTeam(req)), link });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/businesses/:slug/voice/staff/:id', requireAccount, requireOwnVenue, async (req, res, next) => {
  try {
    await voice.removeStaff(req.account.id, req.venue.id, Number(req.params.id));
    voicehub.changed();
    res.json(await voiceTeam(req));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ errors */

router.use((err, req, res, _next) => {
  if (err?.expose && err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error('Customer API error:', err);
  res.status(500).json({ error: 'Something went wrong.' });
});

module.exports = router;
