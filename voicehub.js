'use strict';

const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const webpush = require('web-push');

const voice = require('./voice');
const rules = require('./voicerules');
const subscribers = require('./subscribers');
const { BASE_DOMAIN } = require('./tenant');
const { throttled } = require('./throttle');

/**
 * Ringing: the WebSocket both sides of a call hold, and what happens between
 * a guest pressing Call and someone picking up.
 *
 * The audio never comes here. It goes browser to browser over WebRTC; this
 * only carries the ring, the answer and the few messages the two browsers
 * need to find each other.
 *
 *   caller ── call ──▶ hub ── ring ──▶ every free agent on the line (and a push
 *                                       to a phone whose page is closed)
 *   agent  ── answer ─▶ hub: the first one wins, the rest hear "taken"
 *   caller ◀─ signal ─▶ hub ◀─ signal ─▶ winner, until their browsers connect
 *
 * State is in memory, so this needs exactly one review app process. A restart
 * drops calls in progress; agents' pages reconnect on their own, and duty is
 * kept in the database so nobody goes off duty by it.
 */

const SOCKET_PATH = '/api/voice/ws';


const PING_MS = 25_000;
const STATUS_CACHE_MS = 10_000;
const MAX_CALLERS = 300;
const MAX_CALL_MS = 3 * 60 * 60 * 1000;

const VOICE_URL = (
  process.env.VOICE_URL ||
  (BASE_DOMAIN === 'localhost' || BASE_DOMAIN.endsWith('.localhost')
    ? `http://localhost:${Number(process.env.PORT) || 3000}`
    : `https://api.${BASE_DOMAIN}`)
).replace(/\/$/, '');

const EXTRA_ORIGINS = String(process.env.VOICE_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/* ------------------------------------------------------------------- push */

const PUSH = {
  publicKey: String(process.env.VAPID_PUBLIC_KEY || '').trim(),
  privateKey: String(process.env.VAPID_PRIVATE_KEY || '').trim(),
};
const pushReady = Boolean(PUSH.publicKey && PUSH.privateKey);
if (pushReady) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:info@reviewslip.com',
      PUSH.publicKey,
      PUSH.privateKey
    );
  } catch (err) {
    console.error('Softphone push is off: the VAPID keys were rejected.', err.message);
  }
}

async function push(agentIds, payload, ttl = 60) {
  if (!pushReady || !agentIds.length) return;
  const subs = await voice.pushFor(agentIds);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: ttl, urgency: 'high' }
        );
      } catch (err) {
        // Gone: the phone unsubscribed or the browser was reinstalled.
        if (err.statusCode === 404 || err.statusCode === 410) await voice.removePush(s.endpoint);
        else console.error('Softphone push failed:', err.statusCode || err.message);
      }
    })
  );
}

function pushLater(agentIds, payload, ttl) {
  push(agentIds, payload, ttl).catch((err) => console.error('Softphone push failed:', err.message));
}

/* -------------------------------------------------------------------- ICE */

/**
 * STUN always. TURN when configured — coturn with a shared secret, so the
 * page only ever sees a credential that expires in an hour. Without TURN, two
 * phones behind strict mobile networks may fail to connect; most calls don't
 * need it.
 */
function iceServers() {
  const stun = String(process.env.VOICE_STUN || 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const servers = stun.length ? [{ urls: stun }] : [];
  const turn = String(process.env.TURN_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const secret = String(process.env.TURN_SECRET || '');
  if (turn.length && secret) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:reviewslip`;
    const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
    servers.push({ urls: turn, username, credential });
  }
  return servers;
}

/* ------------------------------------------------------------------ state */

/** agent id → their open phone pages */
const agents = new Map();
/** agent id → when their last page closed, for the duty grace */
const dropped = new Map();
/** call id → the call, while it rings or is talking */
const calls = new Map();
let callerCount = 0;

function send(ws, msg) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // A dead socket is cleaned up by its own close handler.
    }
  }
}

function toAgent(agentId, msg, except = null) {
  for (const conn of agents.get(agentId) || []) if (conn !== except) send(conn.ws, msg);
}

function busyIds() {
  const ids = new Set();
  for (const call of calls.values()) if (call.winner) ids.add(call.winner.agentId);
  return ids;
}

/** An agent as voicerules.reachable takes them, from what is stored and what is live. */
function liveState(a, busy = busyIds()) {
  const open = agents.get(a.id);
  return {
    ...a,
    connected: Boolean(open && open.size),
    droppedAt: dropped.get(a.id) ?? null,
    busy: busy.has(a.id),
  };
}

/** A line from what a call button sends: a venue's address, or "reviewslip". */
async function resolveLine(name, team) {
  const t = rules.team(team);
  const slug = String(name || '').trim().toLowerCase();
  if (slug === 'reviewslip') return { subscriberId: null, team: t, venueName: null };
  const row = await subscribers.get(slug);
  if (!row || row.status !== 'active') return null;
  return { subscriberId: row.id, team: t, venueName: row.name };
}

/* ----------------------------------------------------------------- status */

const statusCache = new Map();

/** open | voicemail | off, for a call button. Cached briefly: every open page polls it. */
async function status(name, team) {
  const key = `${name}|${rules.team(team)}`;
  const hit = statusCache.get(key);
  if (hit && Date.now() - hit.at < STATUS_CACHE_MS) return hit.value;
  const line = await resolveLine(name, team);
  let value = 'off';
  if (line) {
    const busy = busyIds();
    value = rules.lineStatus((await voice.agentsOn(line)).map((a) => liveState(a, busy)));
  }
  statusCache.set(key, { at: Date.now(), value });
  if (statusCache.size > 2000) statusCache.clear();
  return value;
}

/** Someone's duty, lines or hours changed: buttons should know now, not in ten seconds. */
function changed() {
  statusCache.clear();
}

/* ------------------------------------------------------------------ calls */

function ringMessage(call) {
  return {
    t: 'ring',
    call: {
      id: call.id,
      title: call.title,
      team: call.team,
      venue: Boolean(call.line.subscriberId),
      caller: call.callerName,
      page: call.page,
      startedAt: call.startedAt,
    },
  };
}

async function startCall(ws, msg) {
  if (ws.call) return;
  if (throttled(`voice-call:${ws.ip}`, { max: 6 })) {
    return send(ws, { t: 'error', code: 'busy' });
  }
  const line = await resolveLine(msg.line, msg.team);
  if (!line) return send(ws, { t: 'error', code: 'no-line' });

  const busy = busyIds();
  const onLine = await voice.agentsOn(line);
  const free = onLine.filter((a) => rules.reachable(liveState(a, busy)));

  const call = {
    id: crypto.randomUUID(),
    line,
    team: line.team,
    title: rules.callTitle({ venueName: line.venueName, team: line.team }),
    callerName: rules.clean(msg.name, 60),
    page: rules.pageOf(msg.page),
    caller: ws,
    wanted: new Set(free.map((a) => a.id)),
    declined: new Set(),
    pushed: new Set(),
    winner: null,
    settled: false,
    timer: null,
    startedAt: Date.now(),
  };
  if (ws.readyState !== 1) return; // hung up while we looked
  await voice.startCall({
    id: call.id,
    subscriberId: line.subscriberId,
    team: line.team,
    callerName: call.callerName,
    page: call.page,
  });
  if (ws.readyState !== 1) {
    await voice.endCall(call.id, 'abandoned');
    return;
  }
  ws.call = call;

  if (!free.length) {
    call.settled = true;
    send(ws, { t: 'noanswer', callId: call.id, why: onLine.length ? 'away' : 'nobody' });
    await voice.endCall(call.id, 'missed');
    return;
  }

  calls.set(call.id, call);
  const ring = ringMessage(call);
  for (const a of free) {
    const open = [...(agents.get(a.id) || [])];
    open.forEach((conn) => send(conn.ws, ring));
    // A phone freezes a page in the background, so a ring sent down its
    // socket may sit unread: those get the push as well.
    if (a.hasPush && (!open.length || open.every((c) => c.hidden))) call.pushed.add(a.id);
  }
  if (call.pushed.size) {
    pushLater(
      [...call.pushed],
      {
        t: 'ring',
        callId: call.id,
        title: call.title,
        caller: call.callerName,
        // The phone the line belongs to: a venue's, or Reviewslip's own.
        url: `${VOICE_URL}${line.subscriberId ? '/phone/' : '/phone/reviewslip/'}?call=${call.id}`,
      },
      rules.RING_SECONDS + rules.PUSH_EXTRA_SECONDS
    );
  }
  const seconds = rules.RING_SECONDS + (call.pushed.size ? rules.PUSH_EXTRA_SECONDS : 0);
  call.timer = setTimeout(() => giveUp(call, 'timeout'), seconds * 1000);
  send(ws, { t: 'ringing', callId: call.id, seconds });
}

/** Stops ringing everyone but `keep`. */
function stopRinging(call, msg, keep = null) {
  for (const id of call.wanted) toAgent(id, msg, keep);
  if (call.pushed.size) pushLater([...call.pushed], { t: 'settled', callId: call.id }, 30);
}

function giveUp(call, why) {
  if (call.settled) return;
  call.settled = true;
  clearTimeout(call.timer);
  calls.delete(call.id);
  stopRinging(call, { t: 'cancelled', callId: call.id });
  if (why === 'abandoned') {
    voice.endCall(call.id, 'abandoned').catch(logError);
  } else {
    send(call.caller, { t: 'noanswer', callId: call.id, why });
    voice.endCall(call.id, 'missed').catch(logError);
  }
}

async function answer(conn, callId) {
  const call = calls.get(callId);
  // Settled synchronously: one process, so whoever gets here first wins, and
  // the database records it.
  if (!call || call.settled || !call.wanted.has(conn.agentId) || busyIds().has(conn.agentId)) {
    return send(conn.ws, { t: 'gone', callId });
  }
  call.settled = true;
  call.winner = conn;
  clearTimeout(call.timer);
  call.timer = setTimeout(() => endCall(call, 'limit'), MAX_CALL_MS);
  stopRinging(call, { t: 'taken', callId, by: conn.name }, conn);
  const ice = iceServers();
  send(conn.ws, { t: 'won', callId, ice });
  send(call.caller, { t: 'answered', name: conn.name, ice });
  changed();
  if (!(await voice.claimCall(callId, { id: conn.agentId, name: conn.name }))) {
    console.error(`Softphone: call ${callId} was answered here but not in the database.`);
  }
}

function decline(conn, callId) {
  const call = calls.get(callId);
  if (!call || call.settled || !call.wanted.has(conn.agentId)) return;
  call.declined.add(conn.agentId);
  // Their other pages stop ringing too.
  toAgent(conn.agentId, { t: 'cancelled', callId });
  if ([...call.wanted].every((id) => call.declined.has(id))) giveUp(call, 'declined');
}

function endCall(call, by) {
  if (!calls.has(call.id)) return;
  calls.delete(call.id);
  clearTimeout(call.timer);
  if (call.winner) send(call.winner.ws, { t: 'ended', callId: call.id, by });
  send(call.caller, { t: 'ended', by });
  voice.endCall(call.id, 'answered').catch(logError);
  changed();
}

function logError(err) {
  console.error('Softphone:', err.message);
}

/* ---------------------------------------------------------------- sockets */

function onCaller(ws) {
  callerCount += 1;
  // A socket that never asks to call is someone else's.
  const idle = setTimeout(() => !ws.call && ws.close(4000, 'idle'), 15_000);
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const call = ws.call;
    if (msg.t === 'call') {
      startCall(ws, msg).catch((err) => {
        logError(err);
        send(ws, { t: 'error', code: 'server' });
      });
    } else if (msg.t === 'signal' && call?.winner && calls.has(call.id)) {
      send(call.winner.ws, { t: 'signal', callId: call.id, data: msg.data });
    } else if (msg.t === 'hangup' && call) {
      if (call.winner) endCall(call, 'caller');
      else giveUp(call, 'abandoned');
    }
  });
  ws.on('close', () => {
    callerCount -= 1;
    clearTimeout(idle);
    const call = ws.call;
    if (!call) return;
    if (call.winner) endCall(call, 'caller');
    else giveUp(call, 'abandoned');
  });
}

function onAgent(ws, agent) {
  const conn = { ws, agentId: agent.id, name: agent.name, hidden: false };
  if (!agents.has(agent.id)) agents.set(agent.id, new Set());
  agents.get(agent.id).add(conn);
  dropped.delete(agent.id);
  changed();

  send(ws, { t: 'hello', ice: iceServers() });
  // A page that opens mid-ring — a refresh, a tap on the push — joins the call.
  for (const call of calls.values()) {
    if (!call.settled && call.wanted.has(agent.id) && !call.declined.has(agent.id)) {
      send(ws, ringMessage(call));
    }
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const call = msg.callId ? calls.get(String(msg.callId)) : null;
    if (msg.t === 'answer') answer(conn, String(msg.callId)).catch(logError);
    else if (msg.t === 'decline') decline(conn, String(msg.callId));
    else if (msg.t === 'signal' && call?.winner === conn) send(call.caller, { t: 'signal', data: msg.data });
    else if (msg.t === 'hangup' && call?.winner === conn) endCall(call, 'agent');
    else if (msg.t === 'visibility') conn.hidden = Boolean(msg.hidden);
  });

  ws.on('close', () => {
    const open = agents.get(agent.id);
    open?.delete(conn);
    if (open && !open.size) {
      agents.delete(agent.id);
      dropped.set(agent.id, Date.now());
    }
    for (const call of calls.values()) if (call.winner === conn) endCall(call, 'agent');
    changed();
  });
}

/** The cookie the phone page signs in with. */
function cookieOf(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

/** Behind nginx the socket is loopback; the guest's address is in the headers. */
function ipOf(req) {
  const remote = req.socket.remoteAddress || '';
  const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  if (loopback) {
    const forwarded = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    if (forwarded) return forwarded;
  }
  return remote;
}

function refuse(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/**
 * Takes the WebSocket upgrades on the review app's HTTP server.
 *
 * Callers come from Reviewslip's pages (voicerules.originAllowed). Agents
 * are signed in with the dashboard's own session cookie, and only from
 * Reviewslip's pages — a cookie alone would let any site open a socket as them.
 */
function attach(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', async (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://local');
    } catch {
      return refuse(socket, 400, 'Bad Request');
    }
    if (url.pathname !== SOCKET_PATH) return refuse(socket, 404, 'Not Found');
    const origin = String(req.headers.origin || '');
    const as = url.searchParams.get('as');

    try {
      if (as === 'agent') {
        if (!rules.originAllowed(origin, { baseDomain: BASE_DOMAIN, extra: EXTRA_ORIGINS })) {
          return refuse(socket, 403, 'Forbidden');
        }
        const phone = voice.scopeOf(url.searchParams.get('phone'));
        const agent = await voice.agentForSession(cookieOf(req, voice.SESSION_COOKIE), phone);
        if (!agent) return refuse(socket, 401, 'Unauthorized');
        wss.handleUpgrade(req, socket, head, (ws) => {
          ws.isAlive = true;
          ws.on('pong', () => (ws.isAlive = true));
          onAgent(ws, agent);
        });
      } else if (as === 'caller') {
        if (!rules.originAllowed(origin, { baseDomain: BASE_DOMAIN, extra: EXTRA_ORIGINS })) {
          return refuse(socket, 403, 'Forbidden');
        }
        if (callerCount >= MAX_CALLERS) return refuse(socket, 503, 'Service Unavailable');
        wss.handleUpgrade(req, socket, head, (ws) => {
          ws.ip = ipOf(req);
          ws.isAlive = true;
          ws.on('pong', () => (ws.isAlive = true));
          onCaller(ws);
        });
      } else {
        refuse(socket, 400, 'Bad Request');
      }
    } catch (err) {
      logError(err);
      refuse(socket, 500, 'Internal Server Error');
    }
  });

  // nginx closes a quiet socket after a minute; a ping keeps it open, and a
  // socket that misses two is a phone that went away without saying so.
  const ping = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        // terminated on the next round
      }
    }
  }, PING_MS);
  ping.unref();

  const daily = setInterval(() => voice.prune().catch(logError), 24 * 60 * 60 * 1000);
  daily.unref();
  voice.prune().catch(logError);

  return wss;
}

/**
 * Everyone on each of these lines and where they stand right now (see
 * voicerules.personState), for the phone's Who's on. Names only.
 */
async function whosOn(lines, selfId) {
  const busy = busyIds();
  const now = Date.now();
  const out = [];
  for (const line of lines) {
    const people = await voice.agentsOn(line);
    out.push({
      key: line.key,
      name: line.name,
      people: people
        .map((a) => ({ name: a.name, you: a.id === selfId, state: rules.personState(liveState(a, busy), now) }))
        .sort((x, y) => Number(y.you) - Number(x.you) || x.name.localeCompare(y.name)),
    });
  }
  return out;
}

/** Who on a list is on the phone right now, for the dashboard. */
function presence(agentIds) {
  const busy = busyIds();
  const out = {};
  for (const id of agentIds) {
    out[id] = busy.has(id) ? 'call' : agents.has(id) ? 'online' : 'offline';
  }
  return out;
}

module.exports = {
  VOICE_URL,
  PUSH_PUBLIC_KEY: pushReady ? PUSH.publicKey : '',
  attach,
  status,
  changed,
  presence,
  whosOn,
  iceServers,
  resolveLine,
};
