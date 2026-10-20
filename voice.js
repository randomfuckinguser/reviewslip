'use strict';

const crypto = require('crypto');

const { query, one, all } = require('./db');
const accounts = require('./accounts');
const rules = require('./voicerules');

/**
 * The softphone's storage: who answers which line, their sessions on the phone
 * page, hours, push subscriptions, and the calls and voicemails themselves.
 *
 * Rules live in voicerules.js and ringing in voicehub.js; this only reads and
 * writes. See db.js migrations 35 and 36 for why the tables are shaped as
 * they are.
 *
 * There are two phones, and an agent row is one person on one of them:
 *
 *   venues      a venue's phone: the owner (every venue on the account) and
 *               the staff they invite (the venues ticked for them)
 *   reviewslip  Reviewslip's phone: admins, answering Sales and Support
 *
 * Everyone signs in the one way, with their Reviewslip account: the phone is
 * part of the dashboard. Invited staff get an account of their own when they
 * accept, which opens the phone and nothing else (accounts.phone_only).
 */

const SCOPES = ['venues', 'reviewslip'];

/**
 * The dashboard's session cookie, set by the website (lib/customer.ts) and
 * read here too: on reviewslip.com the phone is served beside the dashboard,
 * so the browser sends it, and the phone needs no sign-in of its own.
 */
const SESSION_COOKIE = 'rs_session';

function scopeOf(value) {
  return value === 'reviewslip' ? 'reviewslip' : 'venues';
}


function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/* ----------------------------------------------------------------- agents */

function agentOut(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    onDuty: row.on_duty,
    timezone: row.timezone,
    scope: row.scope,
    accountId: row.account_id,
    ownerAccountId: row.owner_account_id,
    invited: !row.account_id,
  };
}

async function byId(id) {
  const row = await one('SELECT * FROM voice_agents WHERE id = $1', [id]);
  return row ? agentOut(row) : null;
}

/** An account's own agent on one phone, if they have opened it. */
async function byAccount(accountId, scope = 'venues') {
  const row = await one('SELECT * FROM voice_agents WHERE account_id = $1 AND scope = $2', [
    accountId,
    scopeOf(scope),
  ]);
  return row ? agentOut(row) : null;
}

/**
 * The agent for a signed-in account on one phone: a venue's own login on the
 * venue phone, an admin on Reviewslip's. Made the first time they open it,
 * named as their account is. Reviewslip's phone is for admins only.
 */
async function forAccount(account, scope = 'venues') {
  const phone = scopeOf(scope);
  if (phone === 'reviewslip' && !account.is_admin) throw fail(404, 'Not found.');
  const found = await one('SELECT * FROM voice_agents WHERE account_id = $1 AND scope = $2', [account.id, phone]);
  if (found) return agentOut(found);
  const row = await one(
    `INSERT INTO voice_agents (account_id, scope, email, name) VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id, scope) WHERE account_id IS NOT NULL DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [account.id, phone, account.email, account.username || account.email.split('@')[0]]
  );
  return agentOut(row);
}

/**
 * Every line an agent may answer, and whether they are taking it right now.
 *
 * Worked out each time rather than stored: an account that adds a venue
 * answers it from then on. On Reviewslip's phone an admin answers Sales and
 * Support, and nothing else; on a venue phone, venues and nothing else.
 *
 * @returns {Promise<{key: string, subscriberId: number|null, team: string|null,
 *   name: string, slug: string|null, taking: boolean}[]>}
 */
async function linesFor(agentId) {
  const agent = await one(
    `SELECT a.id, a.account_id, a.scope, coalesce(acc.is_admin, false) AS is_admin
       FROM voice_agents a LEFT JOIN accounts acc ON acc.id = a.account_id
      WHERE a.id = $1`,
    [agentId]
  );
  if (!agent) return [];
  const off = new Set(
    (await all('SELECT line FROM voice_lines_off WHERE agent_id = $1', [agentId])).map((r) => r.line)
  );
  const mark = (l) => {
    const key = rules.lineKey(l);
    return { key, ...l, taking: !off.has(key) };
  };
  if (agent.scope === 'reviewslip') {
    if (!agent.is_admin) return [];
    return [
      { subscriberId: null, team: 'sales', name: 'Reviewslip Sales', slug: null },
      { subscriberId: null, team: 'support', name: 'Reviewslip Support', slug: null },
    ].map(mark);
  }
  // The venues the account owns, and the ones it was invited to answer.
  const venues = await all(
    `SELECT id, slug, name FROM subscribers WHERE account_id = $1 AND status = 'active'
     UNION
     SELECT s.id, s.slug, s.name FROM voice_agent_venues v JOIN subscribers s ON s.id = v.subscriber_id
      WHERE v.agent_id = $2 AND s.status = 'active'
     ORDER BY name`,
    [agent.account_id, agentId]
  );
  return venues.map((v) => mark({ subscriberId: v.id, team: null, name: v.name, slug: v.slug }));
}

/** Which of their lines an agent is not taking. Unknown keys are dropped. */
async function setLinesOff(agentId, offKeys) {
  const allowed = new Set((await linesFor(agentId)).map((l) => l.key));
  const off = [...new Set(offKeys)].filter((k) => allowed.has(k));
  if (allowed.size && off.length === allowed.size) {
    throw fail(400, 'Keep at least one line on, or go off duty instead.');
  }
  await query('DELETE FROM voice_lines_off WHERE agent_id = $1', [agentId]);
  for (const line of off) {
    await query('INSERT INTO voice_lines_off (agent_id, line) VALUES ($1, $2)', [agentId, line]);
  }
}

async function setDuty(agentId, on) {
  await query('UPDATE voice_agents SET on_duty = $2 WHERE id = $1', [agentId, Boolean(on)]);
}

async function hoursFor(agentId) {
  const rows = await all(
    'SELECT weekday, start_min, end_min FROM voice_hours WHERE agent_id = $1',
    [agentId]
  );
  return rows.map((r) => ({ weekday: r.weekday, startMin: r.start_min, endMin: r.end_min }));
}

async function setHours(agentId, rows, timezone) {
  await query('DELETE FROM voice_hours WHERE agent_id = $1', [agentId]);
  for (const r of rows) {
    await query(
      'INSERT INTO voice_hours (agent_id, weekday, start_min, end_min) VALUES ($1, $2, $3, $4)',
      [agentId, r.weekday, r.startMin, r.endMin]
    );
  }
  if (timezone) await query('UPDATE voice_agents SET timezone = $2 WHERE id = $1', [agentId, timezone]);
}

/**
 * Everyone on a line who is taking it, with what voicehub needs to decide who
 * rings: duty, zone, hours and whether a push can reach them.
 *
 * @param {{subscriberId: number|null, team: string}} line
 */
async function agentsOn(line) {
  const key = rules.lineKey(line);
  const rows = line.subscriberId
    ? await all(
        `SELECT a.* FROM voice_agents a
           JOIN subscribers s ON s.id = $1 AND s.account_id = a.account_id
          WHERE a.scope = 'venues'
         UNION
         SELECT a.* FROM voice_agents a
           JOIN voice_agent_venues v ON v.agent_id = a.id AND v.subscriber_id = $1
          WHERE a.scope = 'venues'`,
        [line.subscriberId]
      )
    : await all(
        `SELECT a.* FROM voice_agents a JOIN accounts acc ON acc.id = a.account_id AND acc.is_admin
          WHERE a.scope = 'reviewslip'`
      );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const off = new Set(
    (await all('SELECT agent_id FROM voice_lines_off WHERE line = $1 AND agent_id = ANY($2)', [key, ids])).map(
      (r) => r.agent_id
    )
  );
  const hours = await all(
    'SELECT agent_id, weekday, start_min, end_min FROM voice_hours WHERE agent_id = ANY($1)',
    [ids]
  );
  const pushed = new Set(
    (await all('SELECT DISTINCT agent_id FROM voice_push WHERE agent_id = ANY($1)', [ids])).map((r) => r.agent_id)
  );
  return rows
    .filter((r) => !off.has(r.id))
    // Invited staff who have not accepted yet have no account to answer with.
    .filter((r) => r.account_id)
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      onDuty: r.on_duty,
      timezone: r.timezone,
      hasPush: pushed.has(r.id),
      hours: hours
        .filter((h) => h.agent_id === r.id)
        .map((h) => ({ weekday: h.weekday, startMin: h.start_min, endMin: h.end_min })),
    }));
}

/**
 * The person behind a dashboard session, on one phone. An account answers on
 * the venue phone from the first time it opens it; Reviewslip's is for admins.
 * Null when signed out, or not allowed on that phone.
 */
async function agentForSession(token, scope = 'venues') {
  const account = await accounts.fromSession(token);
  if (!account) return null;
  if (scopeOf(scope) === 'reviewslip' && !account.is_admin) return null;
  return forAccount(account, scope);
}

/* ---------------------------------------------------------------- invites */

/**
 * Adds someone to answer one of the owner's venues, or adds the venue to
 * someone the owner already invited. Returns a fresh invite token while they
 * have yet to accept, so the caller can email it.
 *
 * @returns {Promise<{agent: object, token: string|null}>}
 */
async function invite(ownerAccountId, subscriberId, input) {
  const checked = rules.checkInvite(input);
  if (!checked.ok) throw fail(400, checked.error);
  const { name, email } = checked.value;

  const owner = await one('SELECT email FROM accounts WHERE id = $1', [ownerAccountId]);
  if (owner && owner.email.toLowerCase() === email) {
    throw fail(400, 'You answer your own venues already: open the Phone from the sidebar.');
  }

  let row = await one(
    `SELECT * FROM voice_agents WHERE owner_account_id IS NOT NULL AND scope = 'venues' AND lower(email) = $1`,
    [email]
  );
  if (row && row.owner_account_id !== ownerAccountId) {
    throw fail(409, 'That person already answers calls for another business on Reviewslip.');
  }
  if (!row) {
    row = await one(
      'INSERT INTO voice_agents (owner_account_id, email, name) VALUES ($1, $2, $3) RETURNING *',
      [ownerAccountId, email, name]
    );
  }
  await query(
    'INSERT INTO voice_agent_venues (agent_id, subscriber_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [row.id, subscriberId]
  );
  const token = row.account_id ? null : await newInvite(row.id);
  return { agent: agentOut(row), token };
}

async function newInvite(agentId) {
  const token = newToken();
  await query(
    `UPDATE voice_agents SET invite_hash = $2, invite_expires = now() + make_interval(days => $3) WHERE id = $1`,
    [agentId, hashToken(token), rules.INVITE_DAYS]
  );
  return token;
}

/** A new invite link for staff who have not accepted yet. */
async function reinvite(ownerAccountId, agentId) {
  const row = await one(
    'SELECT * FROM voice_agents WHERE id = $1 AND owner_account_id = $2',
    [agentId, ownerAccountId]
  );
  if (!row) throw fail(404, 'No one by that id.');
  if (row.account_id) throw fail(409, 'They have signed in already.');
  return { agent: agentOut(row), token: await newInvite(row.id) };
}

/** Who an invite is for, and whether that address already has an account. */
async function inviteFor(token) {
  const row = await one(
    `SELECT a.name, a.email, string_agg(s.name, ', ' ORDER BY s.name) AS venues
       FROM voice_agents a
       LEFT JOIN voice_agent_venues v ON v.agent_id = a.id
       LEFT JOIN subscribers s ON s.id = v.subscriber_id
      WHERE a.invite_hash = $1 AND a.invite_expires > now()
      GROUP BY a.id`,
    [hashToken(token)]
  );
  if (!row) throw fail(404, 'That invite has expired or was used. Ask for a new one.');
  const existing = await one('SELECT id FROM accounts WHERE lower(email) = lower($1)', [row.email]);
  return { name: row.name, email: row.email, venues: row.venues || '', hasAccount: Boolean(existing) };
}

/**
 * Accepting an invite. The token was emailed to the address, so holding it is
 * holding the address:
 *
 *   a new address    becomes a Reviewslip account that opens only the phone,
 *                    with the password chosen here, and is signed in
 *   an account       the invite joins it, and they sign in as they always do
 *
 * @returns {Promise<{session: {token: string, expiresAt: string}|null}>}
 */
async function acceptInvite(token, password) {
  const row = await one(
    'SELECT * FROM voice_agents WHERE invite_hash = $1 AND invite_expires > now()',
    [hashToken(token)]
  );
  if (!row) throw fail(404, 'That invite has expired or was used. Ask for a new one.');

  const existing = await one('SELECT id FROM accounts WHERE lower(email) = lower($1)', [row.email]);
  if (existing) {
    const taken = await one(`SELECT id FROM voice_agents WHERE account_id = $1 AND scope = 'venues'`, [existing.id]);
    if (taken) {
      throw fail(409, 'This email already answers calls on Reviewslip. Ask for the invite to go to a different address.');
    }
    await query(
      'UPDATE voice_agents SET account_id = $2, invite_hash = NULL, invite_expires = NULL WHERE id = $1',
      [row.id, existing.id]
    );
    return { session: null };
  }

  const account = await accounts.create({ email: row.email, password });
  await query('UPDATE accounts SET phone_only = true WHERE id = $1', [account.id]);
  await query(
    'UPDATE voice_agents SET account_id = $2, password_hash = NULL, invite_hash = NULL, invite_expires = NULL WHERE id = $1',
    [row.id, account.id]
  );
  return { session: await accounts.startSession(account.id) };
}

/** The people an owner invited to answer this venue. */
async function staffFor(ownerAccountId, subscriberId) {
  const rows = await all(
    `SELECT a.* FROM voice_agents a JOIN voice_agent_venues v ON v.agent_id = a.id
      WHERE a.owner_account_id = $1 AND v.subscriber_id = $2 ORDER BY lower(a.name)`,
    [ownerAccountId, subscriberId]
  );
  return rows.map(agentOut);
}

/**
 * Takes someone off a venue. With no venue left they stop answering, and an
 * account that only ever existed for this phone goes too; anyone's own
 * account stays theirs.
 */
async function removeStaff(ownerAccountId, subscriberId, agentId) {
  const row = await one(
    'SELECT id, account_id FROM voice_agents WHERE id = $1 AND owner_account_id = $2',
    [agentId, ownerAccountId]
  );
  if (!row) throw fail(404, 'No one by that id.');
  await query('DELETE FROM voice_agent_venues WHERE agent_id = $1 AND subscriber_id = $2', [agentId, subscriberId]);
  const left = await one('SELECT count(*)::int AS n FROM voice_agent_venues WHERE agent_id = $1', [agentId]);
  if (left.n) return;
  await query('DELETE FROM voice_agents WHERE id = $1', [agentId]);
  if (row.account_id) await query('DELETE FROM accounts WHERE id = $1 AND phone_only', [row.account_id]);
}

/* ------------------------------------------------------------------- push */

async function addPush(agentId, sub) {
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) {
    throw fail(400, 'That is not a push subscription.');
  }
  await query(
    `INSERT INTO voice_push (endpoint, agent_id, p256dh, auth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET agent_id = EXCLUDED.agent_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [endpoint, agentId, p256dh, auth]
  );
}

async function removePush(endpoint, agentId = null) {
  if (agentId) {
    await query('DELETE FROM voice_push WHERE endpoint = $1 AND agent_id = $2', [endpoint, agentId]);
  } else {
    await query('DELETE FROM voice_push WHERE endpoint = $1', [endpoint]);
  }
}

async function pushFor(agentIds) {
  if (!agentIds.length) return [];
  return all('SELECT endpoint, agent_id, p256dh, auth FROM voice_push WHERE agent_id = ANY($1)', [agentIds]);
}

/* ------------------------------------------------------------------ calls */

async function startCall({ id, subscriberId, team, callerName, page }) {
  await query(
    `INSERT INTO voice_calls (id, subscriber_id, team, caller_name, page) VALUES ($1, $2, $3, $4, $5)`,
    [id, subscriberId, team, callerName || null, page || null]
  );
}

/**
 * The first agent to answer wins; Postgres decides, not the race between
 * their browsers. False when someone else got there first or the call ended.
 */
async function claimCall(callId, agent) {
  const row = await one(
    `UPDATE voice_calls SET answered_at = now(), answered_by = $2, answered_name = $3, outcome = 'answered'
      WHERE id = $1 AND answered_by IS NULL AND ended_at IS NULL
      RETURNING id`,
    [callId, agent.id, agent.name]
  );
  return Boolean(row);
}

async function endCall(callId, outcome) {
  await query(
    `UPDATE voice_calls SET ended_at = now(), outcome = coalesce(outcome, $2)
      WHERE id = $1 AND ended_at IS NULL`,
    [callId, outcome]
  );
}

/** Lines as SQL filters: a venue by id, Reviewslip's by team. */
function lineFilter(lines, alias = 'c') {
  const venueIds = lines.filter((l) => l.subscriberId).map((l) => l.subscriberId);
  const teams = lines.filter((l) => !l.subscriberId).map((l) => l.team);
  return {
    sql: `(${alias}.subscriber_id = ANY($1::int[]) OR (${alias}.subscriber_id IS NULL AND ${alias}.team = ANY($2::text[])))`,
    params: [venueIds, teams],
  };
}

async function recentCalls(lines, limit = 50) {
  if (!lines.length) return [];
  const f = lineFilter(lines);
  const rows = await all(
    `SELECT c.*, s.name AS venue_name, (vm.id IS NOT NULL) AS has_voicemail
       FROM voice_calls c
       LEFT JOIN subscribers s ON s.id = c.subscriber_id
       LEFT JOIN voice_voicemails vm ON vm.call_id = c.id
      WHERE ${f.sql}
      ORDER BY c.started_at DESC LIMIT $3`,
    [...f.params, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    line: rules.callTitle({ venueName: r.venue_name, team: r.team }),
    team: r.team,
    venue: Boolean(r.subscriber_id),
    caller: r.caller_name || '',
    page: r.page || '',
    startedAt: r.started_at,
    answeredBy: r.answered_name || '',
    seconds: r.answered_at && r.ended_at ? Math.round((r.ended_at - r.answered_at) / 1000) : null,
    outcome: r.outcome || (r.ended_at ? 'missed' : 'live'),
    voicemail: r.has_voicemail,
  }));
}

/* -------------------------------------------------------------- voicemail */

/**
 * Keeps a voicemail for a call nobody answered. The call id is the caller's
 * only key, so it has to name a recent unanswered call with no message yet.
 *
 * @returns {Promise<{id: number, subscriberId: number|null, team: string, title: string}>}
 */
async function saveVoicemail(callId, vm) {
  const call = await one(
    `SELECT c.id, c.subscriber_id, c.team, s.name AS venue_name
       FROM voice_calls c LEFT JOIN subscribers s ON s.id = c.subscriber_id
      WHERE c.id = $1 AND c.answered_by IS NULL
        AND c.started_at > now() - make_interval(mins => $2)`,
    [String(callId || ''), rules.VOICEMAIL_WINDOW_MINUTES]
  );
  if (!call) throw fail(404, 'That call has ended. Call again to leave a message.');
  const row = await one(
    `INSERT INTO voice_voicemails (call_id, audio, mime, seconds, caller_name, caller_contact)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (call_id) DO NOTHING RETURNING id`,
    [call.id, vm.audio, vm.mime, vm.seconds, vm.name || null, vm.contact || null]
  );
  if (!row) throw fail(409, 'A message was left on this call already.');
  await query(`UPDATE voice_calls SET outcome = 'voicemail' WHERE id = $1`, [call.id]);
  if (vm.name) {
    await query('UPDATE voice_calls SET caller_name = coalesce(caller_name, $2) WHERE id = $1', [call.id, vm.name]);
  }
  return {
    id: row.id,
    subscriberId: call.subscriber_id,
    team: call.team,
    title: rules.callTitle({ venueName: call.venue_name, team: call.team }),
  };
}

async function voicemailsFor(lines, limit = 100) {
  if (!lines.length) return [];
  const f = lineFilter(lines);
  const rows = await all(
    `SELECT vm.id, vm.mime, vm.seconds, vm.caller_name, vm.caller_contact, vm.created_at,
            vm.heard_at, vm.heard_name, c.subscriber_id, c.team, c.page, s.name AS venue_name
       FROM voice_voicemails vm
       JOIN voice_calls c ON c.id = vm.call_id
       LEFT JOIN subscribers s ON s.id = c.subscriber_id
      WHERE ${f.sql}
      ORDER BY vm.created_at DESC LIMIT $3`,
    [...f.params, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    line: rules.callTitle({ venueName: r.venue_name, team: r.team }),
    team: r.team,
    venue: Boolean(r.subscriber_id),
    caller: r.caller_name || '',
    contact: r.caller_contact || '',
    page: r.page || '',
    seconds: r.seconds,
    at: r.created_at,
    heard: Boolean(r.heard_at),
    heardAt: r.heard_at,
    heardBy: r.heard_name || '',
  }));
}

/** The recording, when it is on one of these lines. */
async function voicemailAudio(id, lines) {
  if (!lines.length) return null;
  const f = lineFilter(lines);
  return one(
    `SELECT vm.audio, vm.mime FROM voice_voicemails vm JOIN voice_calls c ON c.id = vm.call_id
      WHERE vm.id = $3 AND ${f.sql}`,
    [...f.params, Number(id)]
  );
}

/**
 * First listener wins: that name is what stops two people ringing the same
 * guest back. Playing it again never rewrites it; Mark unheard clears it.
 */
async function markHeard(id, lines, agent, heard = true) {
  const f = lineFilter(lines, 'c');
  const sql = heard
    ? `UPDATE voice_voicemails vm SET heard_at = now(), heard_by = $4, heard_name = $5
         FROM voice_calls c WHERE c.id = vm.call_id AND vm.id = $3 AND vm.heard_at IS NULL AND ${f.sql}`
    : `UPDATE voice_voicemails vm SET heard_at = NULL, heard_by = NULL, heard_name = NULL
         FROM voice_calls c WHERE c.id = vm.call_id AND vm.id = $3 AND ${f.sql}`;
  await query(sql, heard ? [...f.params, Number(id), agent.id, agent.name] : [...f.params, Number(id)]);
}

/** Who to email about a voicemail: everyone on the line, taking it or not. */
async function emailsFor(line) {
  if (!line.subscriberId) return [];
  const rows = await all(
    `SELECT acc.email FROM subscribers s JOIN accounts acc ON acc.id = s.account_id WHERE s.id = $1
     UNION
     SELECT a.email FROM voice_agent_venues v JOIN voice_agents a ON a.id = v.agent_id
      WHERE v.subscriber_id = $1 AND a.account_id IS NOT NULL`,
    [line.subscriberId]
  );
  return rows.map((r) => r.email);
}

/**
 * Old calls and messages go. Voicemail is a to-do list, not an archive: six
 * months is long after anyone rang back.
 */
async function prune() {
  await query(`DELETE FROM voice_sessions WHERE expires_at < now()`);
  await query(`DELETE FROM voice_calls WHERE started_at < now() - interval '180 days'`);
  // A page closed mid-call leaves a row with no end; a day later it is over.
  await query(
    `UPDATE voice_calls SET ended_at = now(), outcome = coalesce(outcome, 'missed')
      WHERE ended_at IS NULL AND started_at < now() - interval '1 day'`
  );
}

module.exports = {
  SCOPES,
  SESSION_COOKIE,
  agentForSession,
  scopeOf,
  byId,
  byAccount,
  forAccount,
  linesFor,
  setLinesOff,
  setDuty,
  hoursFor,
  setHours,
  agentsOn,
  invite,
  reinvite,
  inviteFor,
  acceptInvite,
  staffFor,
  removeStaff,
  addPush,
  removePush,
  pushFor,
  startCall,
  claimCall,
  endCall,
  recentCalls,
  saveVoicemail,
  voicemailsFor,
  voicemailAudio,
  markHeard,
  emailsFor,
  prune,
};
