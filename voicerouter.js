'use strict';

const express = require('express');

const voice = require('./voice');
const hub = require('./voicehub');
const rules = require('./voicerules');
const emails = require('./emails');
const mailer = require('./mailer');
const { throttled } = require('./throttle');
const { BASE_DOMAIN } = require('./tenant');

/**
 * The softphone's HTTP side, at /api/voice. The ringing itself is a WebSocket
 * (voicehub.js); this is everything around it.
 *
 * Two kinds of caller, two doors:
 *
 *   Call buttons, on any Reviewslip page   /status, /voicemail — open to any
 *     origin and uncredentialed: they say only whether a line can be called,
 *     and take a message for a call that just went unanswered.
 *
 *   The phone pages   everything else — the dashboard's own session cookie,
 *     from Reviewslip's pages only. On reviewslip.com nginx serves /phone/ and
 *     /api/voice/ from this app beside the dashboard, so the browser sends the
 *     cookie it signed in with and there is no second sign-in. Two phones:
 *     /phone/ for venues and /phone/reviewslip/ for Sales and Support; each
 *     request says which with ?phone=.
 *
 * Mounted before the tenant resolver: the phone answers for every venue.
 */

const router = express.Router();

const secureCookies = hub.VOICE_URL.startsWith('https:');

function phoneOf(req) {
  return voice.scopeOf(req.query.phone);
}

function cookieOf(req, name = voice.SESSION_COOKIE) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

/**
 * Signs a newly made account in, exactly as the website's own sign-in does
 * (lib/customer.ts setSessionCookie): the session, and the readable "someone
 * is signed in" flag the site's nav reads.
 */
function signIn(res, session) {
  const maxAge = Math.max(0, new Date(session.expiresAt).getTime() - Date.now());
  const base = { secure: secureCookies, sameSite: 'lax', path: '/', maxAge };
  res.cookie(voice.SESSION_COOKIE, session.token, { ...base, httpOnly: true });
  res.cookie('rs_signed_in', '1', { ...base, httpOnly: false });
}

function sendError(res, err) {
  if (err.expose) return res.status(err.status || 400).json({ error: err.message });
  console.error('Softphone:', err);
  return res.status(500).json({ error: 'Something went wrong. Try again.' });
}

/* ---------------------------------------------------- call buttons (open) */

function openCors(req, res, next) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

/** open | voicemail | off for a line — "reviewslip" or a venue's address. */
router.all('/status', openCors, async (req, res) => {
  try {
    const value = await hub.status(req.query.line, req.query.team);
    res.set('Cache-Control', 'no-store');
    res.json({ status: value });
  } catch (err) {
    sendError(res, err);
  }
});

/** A message for a call nobody answered. The call id is the permission. */
router.all('/voicemail', openCors, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (throttled(`voicemail:${req.ip}`, { max: 4 })) {
    return res.status(429).json({ error: 'Too many messages. Try again in a minute.' });
  }
  const checked = rules.checkVoicemail(req.body || {});
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  try {
    const saved = await voice.saveVoicemail(req.body.callId, checked.value);
    res.status(201).json({ ok: true });
    tellVoicemail(saved, checked.value).catch((err) => console.error('Voicemail email failed:', err.message));
  } catch (err) {
    sendError(res, err);
  }
});

async function tellVoicemail(saved, vm) {
  if (!mailer.configured) return;
  const to = saved.subscriberId ? await voice.emailsFor(saved) : [mailer.SUPPORT].filter(Boolean);
  if (!to.length) return;
  const email = emails.voicemailEmail({
    line: saved.title,
    caller: vm.name,
    contact: vm.contact,
    seconds: vm.seconds,
    url: `${hub.VOICE_URL}/phone/`,
  });
  for (const address of to) await mailer.send({ to: address, ...email });
}

/* ------------------------------------------------------- the phone page */

// The website, for the phone's "Open the dashboard" link.
const SITE = String(
  process.env.SITE_URL || (hub.VOICE_URL.startsWith('http://localhost') ? 'http://localhost:3001' : 'https://reviewslip.com')
).replace(/\/$/, '');

/**
 * Where the phone page finds things. ws is the call socket: blank means the
 * page's own address (reviewslip.com, through nginx); locally the website and
 * this app are two ports, and the socket goes straight here — the browser
 * sends the same cookie, which knows no ports.
 */
router.get('/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const local = hub.VOICE_URL.startsWith('http://localhost');
  res.json({ siteUrl: SITE, ws: process.env.VOICE_PHONE_WS || (local ? hub.VOICE_URL.replace(/^http/, 'ws') : '') });
});

/**
 * Reviewslip's own pages only. The session cookie is SameSite=Lax, which
 * already keeps other sites' POSTs from carrying it; this holds for a browser
 * that gets SameSite wrong.
 */
function ourPages(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('origin');
  if (origin && !rules.originAllowed(origin, { baseDomain: BASE_DOMAIN })) {
    return res.status(403).json({ error: 'Not from here.' });
  }
  next();
}

router.use(ourPages);

async function requireAgent(req, res, next) {
  try {
    const agent = await voice.agentForSession(cookieOf(req), phoneOf(req));
    if (!agent) return res.status(401).json({ error: 'Sign in first.' });
    req.agent = agent;
    next();
  } catch (err) {
    next(err);
  }
}

router.get('/invite', async (req, res) => {
  try {
    res.json(await voice.inviteFor(String(req.query.token || '')));
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/invite', async (req, res) => {
  if (throttled(`voice-login:${req.ip}`, { max: 8 })) {
    return res.status(429).json({ error: 'Too many tries. Wait a minute.' });
  }
  try {
    const { session } = await voice.acceptInvite(String(req.body?.token || ''), req.body?.password);
    // A new account is signed in here; an existing one signs in as it always does.
    if (session) signIn(res, session);
    hub.changed();
    res.json({ ok: true, signedIn: Boolean(session) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/me', requireAgent, async (req, res) => {
  try {
    const [lines, hours] = await Promise.all([voice.linesFor(req.agent.id), voice.hoursFor(req.agent.id)]);
    res.set('Cache-Control', 'no-store');
    res.json({
      phone: req.agent.scope,
      agent: { id: req.agent.id, name: req.agent.name, email: req.agent.email, onDuty: req.agent.onDuty },
      lines,
      timezone: req.agent.timezone,
      hours: rules.hoursOut(hours),
      // On duty but outside these hours reads as off duty on the page, and
      // comes back on by itself when they start.
      inHours: rules.inHours(hours, req.agent.timezone),
      pushKey: hub.PUSH_PUBLIC_KEY,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/duty', requireAgent, async (req, res) => {
  try {
    await voice.setDuty(req.agent.id, req.body?.on === true);
    hub.changed();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/lines', requireAgent, async (req, res) => {
  try {
    const off = Array.isArray(req.body?.off) ? req.body.off.map(String) : [];
    await voice.setLinesOff(req.agent.id, off);
    hub.changed();
    res.json({ lines: await voice.linesFor(req.agent.id) });
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/hours', requireAgent, async (req, res) => {
  const checked = rules.checkHours(req.body?.hours);
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  const tz = req.body?.timezone;
  if (tz && !rules.validZone(tz)) return res.status(400).json({ error: 'That time zone is not one we know.' });
  try {
    await voice.setHours(req.agent.id, checked.rows, tz || null);
    hub.changed();
    res.json({ hours: rules.hoursOut(checked.rows) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/push', requireAgent, async (req, res) => {
  try {
    await voice.addPush(req.agent.id, req.body?.subscription);
    hub.changed();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/push', requireAgent, async (req, res) => {
  try {
    await voice.removePush(String(req.body?.endpoint || ''), req.agent.id);
    hub.changed();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/voicemails', requireAgent, async (req, res) => {
  try {
    const lines = await voice.linesFor(req.agent.id);
    res.set('Cache-Control', 'no-store');
    res.json({ voicemails: await voice.voicemailsFor(lines) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/voicemails/:id/audio', requireAgent, async (req, res) => {
  try {
    const lines = await voice.linesFor(req.agent.id);
    const row = await voice.voicemailAudio(req.params.id, lines);
    if (!row) return res.status(404).end();
    res.set('Content-Type', row.mime);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(row.audio);
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/voicemails/:id/heard', requireAgent, async (req, res) => {
  try {
    const lines = await voice.linesFor(req.agent.id);
    await voice.markHeard(req.params.id, lines, req.agent, req.body?.heard !== false);
    res.json({ voicemails: await voice.voicemailsFor(lines) });
  } catch (err) {
    sendError(res, err);
  }
});

/** Everyone on the lines this person answers, and whether a call would reach them now. */
router.get('/colleagues', requireAgent, async (req, res) => {
  try {
    const lines = await voice.linesFor(req.agent.id);
    res.set('Cache-Control', 'no-store');
    res.json({ lines: await hub.whosOn(lines, req.agent.id) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/calls', requireAgent, async (req, res) => {
  try {
    const lines = await voice.linesFor(req.agent.id);
    res.set('Cache-Control', 'no-store');
    res.json({ calls: await voice.recentCalls(lines) });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
