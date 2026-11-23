'use strict';

const { one, all, query } = require('./db');
const rules = require('./chatrules');
const voicerules = require('./voicerules');
const voice = require('./voice');
const mailer = require('./mailer');
const emails = require('./emails');
const { BASE_DOMAIN } = require('./tenant');

// The website: the dashboard, the phone beside it, and the fallback link
// back to a conversation whose page cannot be used.
const SITE_URL = String(process.env.SITE_URL || 'https://reviewslip.com').replace(/\/$/, '');

/**
 * Messages to a line, in place of voicemail.
 *
 * A guest presses a call button nobody can answer and writes instead. That
 * opens a conversation on the line, a ticket: the venue's people (or, on
 * Reviewslip's line, its team) read and answer it on the dashboard and on the
 * phone, and the guest reads the answers in the same panel, or from the link
 * in the email each answer sends them.
 *
 * The guest has no account. The token handed back when they write is their
 * only key, kept in their browser and in the emailed link; only its hash is
 * stored.
 */

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

/** Which lines a reader may see, as SQL on line_chats. */
function lineFilter(lines, alias = 'c') {
  const venueIds = lines.filter((l) => l.subscriberId).map((l) => Number(l.subscriberId));
  const teams = lines.filter((l) => !l.subscriberId).map((l) => l.team);
  return {
    sql: `(${alias}.subscriber_id = ANY($1::int[]) OR (${alias}.subscriber_id IS NULL AND ${alias}.team = ANY($2::text[])))`,
    params: [venueIds, teams],
  };
}

function lineTitle(row) {
  return voicerules.callTitle({ venueName: row.venue_name, team: row.team });
}

function toMessage(row) {
  return {
    id: row.id,
    fromGuest: row.from_guest,
    name: row.author_name || '',
    body: row.body,
    at: row.created_at,
  };
}

function toSummary(row) {
  return {
    id: row.id,
    line: lineTitle(row),
    slug: row.slug || null,
    team: row.team,
    name: row.guest_name,
    email: row.guest_email,
    page: row.page,
    status: row.status,
    preview: row.last_body ? String(row.last_body).slice(0, 140) : '',
    lastFromGuest: row.last_from_guest !== false,
    messages: Number(row.messages) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SUMMARY = `
  SELECT c.*, s.name AS venue_name, s.slug,
         (SELECT count(*) FROM line_chat_messages m WHERE m.chat_id = c.id) AS messages,
         last.body AS last_body, last.from_guest AS last_from_guest
    FROM line_chats c
    LEFT JOIN subscribers s ON s.id = c.subscriber_id
    LEFT JOIN LATERAL (
      SELECT body, from_guest FROM line_chat_messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1
    ) last ON true`;

async function messagesOf(chatId) {
  const rows = await all('SELECT * FROM line_chat_messages WHERE chat_id = $1 ORDER BY id', [chatId]);
  return rows.map(toMessage);
}

/* ------------------------------------------------------------------ guest */

/**
 * A guest writes to a line. The line has been checked by the caller (it
 * exists and has people on it).
 *
 * @param {{subscriberId: number|null, team: string}} line
 * @returns {Promise<{token: string, chat: object}>}
 */
async function open(line, input, page) {
  const checked = rules.checkOpen(input);
  if (!checked.ok) throw fail(400, checked.error);
  const nonce = rules.newNonce();
  const token = rules.tokenFor(nonce);
  const row = await one(
    `INSERT INTO line_chats (subscriber_id, team, token_nonce, token_hash, guest_name, guest_email, page, guest_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
    [
      line.subscriberId || null,
      line.subscriberId ? 'sales' : line.team,
      nonce,
      rules.hashToken(token),
      checked.value.name,
      checked.value.email,
      String(page || '').slice(0, 500),
    ]
  );
  await query(
    'INSERT INTO line_chat_messages (chat_id, from_guest, author_name, body) VALUES ($1, true, $2, $3)',
    [row.id, checked.value.name, checked.value.body]
  );
  return { token, chat: await forGuest(token) };
}

async function byToken(token) {
  const clean = rules.cleanToken(token);
  if (!clean) return null;
  return one(
    `SELECT c.*, s.name AS venue_name, s.slug FROM line_chats c
       LEFT JOIN subscribers s ON s.id = c.subscriber_id
      WHERE c.token_hash = $1`,
    [rules.hashToken(clean)]
  );
}

/**
 * The conversation as the guest sees it. Reading it is looking at it, which
 * is what holds back the email of the next answer.
 */
async function forGuest(token) {
  const row = await byToken(token);
  if (!row) throw fail(404, 'This conversation is no longer here.');
  await query('UPDATE line_chats SET guest_seen_at = now() WHERE id = $1', [row.id]);
  return {
    line: lineTitle(row),
    // The call button's own key for the line, so the widget can keep the
    // conversation under it: the venue's address or "reviewslip", and team.
    key: `${row.slug || 'reviewslip'}|${row.subscriber_id ? 'sales' : row.team}`,
    name: row.guest_name,
    status: row.status,
    messages: await messagesOf(row.id),
  };
}

/** The guest writes again: back to the line, open, closed or not. */
async function guestReply(token, body) {
  const checked = rules.checkBody(body);
  if (!checked.ok) throw fail(400, checked.error);
  const row = await byToken(token);
  if (!row) throw fail(404, 'This conversation is no longer here.');
  await add(row.id, { fromGuest: true, name: row.guest_name, body: checked.value });
  return {
    chat: await forGuest(token),
    // The line hears about a conversation coming back to it, not about every
    // line of one that is already waiting on them.
    reopened: row.status !== rules.OPEN,
    line: { subscriberId: row.subscriber_id, team: row.team, title: lineTitle(row) },
    name: row.guest_name,
    id: row.id,
  };
}

async function add(chatId, { fromGuest, authorId = null, name, body }) {
  const count = await one('SELECT count(*)::int AS n FROM line_chat_messages WHERE chat_id = $1', [chatId]);
  if (count.n >= rules.MAX_MESSAGES) throw fail(409, 'This conversation is full. Start a new one.');
  await query(
    'INSERT INTO line_chat_messages (chat_id, from_guest, author_id, author_name, body) VALUES ($1, $2, $3, $4, $5)',
    [chatId, fromGuest, authorId, name || '', body]
  );
  await query('UPDATE line_chats SET status = $2, updated_at = now() WHERE id = $1', [
    chatId,
    rules.nextStatus(fromGuest),
  ]);
}

/* ------------------------------------------------------------------- line */

/** Conversations on these lines: waiting on the line first, then the rest, newest first. */
async function listFor(lines, limit = 200) {
  if (!lines.length) return [];
  const f = lineFilter(lines);
  const rows = await all(
    `${SUMMARY}
      WHERE ${f.sql}
      ORDER BY (c.status = 'open') DESC, (c.status = 'closed'), c.updated_at DESC
      LIMIT $3`,
    [...f.params, limit]
  );
  return rows.map(toSummary);
}

/** One conversation with its messages, when it is on one of these lines. */
async function get(id, lines) {
  if (!lines.length) throw fail(404, 'No such conversation.');
  const f = lineFilter(lines);
  const row = await one(`${SUMMARY} WHERE c.id = $3 AND ${f.sql}`, [...f.params, Number(id)]);
  if (!row) throw fail(404, 'No such conversation.');
  return { chat: toSummary(row), messages: await messagesOf(row.id), guestSeenAt: row.guest_seen_at };
}

/**
 * Someone on the line answers. Returns the conversation, and what the email
 * to the guest needs when one should go.
 *
 * @param {{id: number|null, name: string}} author
 */
async function reply(id, lines, author, body) {
  const checked = rules.checkBody(body);
  if (!checked.ok) throw fail(400, checked.error);
  const before = await get(id, lines);
  await add(before.chat.id, { fromGuest: false, authorId: author.id, name: author.name, body: checked.value });
  const after = await get(id, lines);
  return {
    ...after,
    emailGuest: rules.emailGuest({ email: before.chat.email, seenAt: before.guestSeenAt }),
  };
}

/** Closed (sorted) or open again. Writing in it reopens it anyway. */
async function setStatus(id, lines, status) {
  if (![rules.CLOSED, rules.OPEN].includes(status)) throw fail(400, 'Close it, or open it again.');
  const { chat } = await get(id, lines);
  await query('UPDATE line_chats SET status = $2, updated_at = now() WHERE id = $1', [chat.id, status]);
  return get(id, lines);
}

/** The guest's key, for the link in an email. */
async function tokenOf(id) {
  const row = await one('SELECT token_nonce FROM line_chats WHERE id = $1', [id]);
  return row ? rules.tokenFor(row.token_nonce) : null;
}

/** How many conversations wait on each of these lines, for a count beside them. */
async function waiting(lines) {
  if (!lines.length) return 0;
  const f = lineFilter(lines);
  const row = await one(`SELECT count(*)::int AS n FROM line_chats c WHERE c.status = 'open' AND ${f.sql}`, f.params);
  return row.n;
}

/* ----------------------------------------------------------------- emails */

/**
 * The link that opens a conversation again: the page the guest wrote from,
 * when it is one of ours, with the key after the #, which never reaches a
 * server log. The call button script on that page opens it.
 */
function linkFor(page, token) {
  let origin = '';
  try {
    origin = new URL(String(page)).origin;
  } catch {
    origin = '';
  }
  const base = origin && voicerules.originAllowed(origin, { baseDomain: BASE_DOMAIN }) ? String(page).split('#')[0] : SITE_URL;
  return `${base}#rs-chat=${token}`;
}

/** The answer, emailed to a guest who left an address and is not looking. */
async function tellGuest(thread) {
  if (!mailer.configured || !thread.emailGuest) return;
  const token = await tokenOf(thread.chat.id);
  const last = thread.messages[thread.messages.length - 1];
  await mailer.send({
    to: thread.chat.email,
    ...emails.chatReplyEmail({
      line: thread.chat.line,
      name: thread.chat.name,
      body: last ? last.body : '',
      url: linkFor(thread.chat.page, token),
    }),
  });
}

/**
 * A new conversation, or one coming back, to everyone on the line: the
 * venue's owner, the people it is shared with and its phone staff; on
 * Reviewslip's line, the support address.
 */
async function tellLine({ line, title, name, body, slug }) {
  if (!mailer.configured) return;
  const to = line.subscriberId ? await voice.emailsFor(line) : [mailer.SUPPORT].filter(Boolean);
  const url = slug ? `${SITE_URL}/dashboard/${slug}/messages` : `${SITE_URL}/phone/reviewslip/`;
  const email = emails.chatEmail({ line: title, name, body, url });
  for (const address of [...new Set(to)]) await mailer.send({ to: address, ...email });
}

/** Closed conversations go after six months, like the call log. */
async function prune() {
  await query(`DELETE FROM line_chats WHERE status = 'closed' AND updated_at < now() - interval '180 days'`);
}

module.exports = {
  open,
  forGuest,
  guestReply,
  listFor,
  get,
  reply,
  setStatus,
  tokenOf,
  linkFor,
  tellGuest,
  tellLine,
  waiting,
  prune,
};
