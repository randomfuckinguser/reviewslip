'use strict';

const crypto = require('crypto');

/**
 * What a message to a line may say, and how a conversation moves. Apart from
 * chats.js, which needs a database, so it can be tested on its own.
 *
 * A conversation is a ticket: it is waiting on the line (open) until someone
 * there answers, then waiting on the guest (answered), until either side
 * closes it. A guest writing again opens it again.
 */

const OPEN = 'open';
const ANSWERED = 'answered';
const CLOSED = 'closed';
const STATUSES = [OPEN, ANSWERED, CLOSED];

const NAME_MAX = 80;
const EMAIL_MAX = 160;
const BODY_MAX = 2000;

/** How many messages a conversation can hold: a chat, not a mailing list. */
const MAX_MESSAGES = 200;

/**
 * A guest is emailed a reply only when they have not looked at the
 * conversation for this long: someone with it open sees the reply there.
 */
const EMAIL_AFTER_MINUTES = 2;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

/** @returns {{ok: true, value: string} | {ok: false, error: string}} */
function checkBody(value) {
  const body = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!body) return { ok: false, error: 'Write a message first.' };
  if (body.length > BODY_MAX) return { ok: false, error: `A message is at most ${BODY_MAX.toLocaleString('en')} characters.` };
  return { ok: true, value: body };
}

/**
 * The first message, with who is writing. The email is optional: without it
 * the reply is only in this browser, and the form says so.
 *
 * @returns {{ok: true, value: {name: string, email: string, body: string}} | {ok: false, error: string}}
 */
function checkOpen(input = {}) {
  const name = clean(input.name, NAME_MAX);
  if (!name) return { ok: false, error: 'Add your name.' };
  const email = clean(input.email, EMAIL_MAX).toLowerCase();
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'That email does not look right.' };
  const body = checkBody(input.body);
  if (!body.ok) return body;
  return { ok: true, value: { name, email, body: body.value } };
}

/** Where a conversation goes when someone writes in it. */
function nextStatus(fromGuest) {
  return fromGuest ? OPEN : ANSWERED;
}

function pepper() {
  const raw = String(process.env.SECRET_KEY || '').trim();
  return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : null;
}

/** What is stored for a conversation's key: random, and useless on its own. */
function newNonce() {
  return crypto.randomBytes(18).toString('base64url');
}

/**
 * The guest's key to their conversation, made from its nonce with the
 * server's key, so the link in an email can be made again without keeping
 * the key itself.
 */
function tokenFor(nonce) {
  const key = pepper();
  const mac = key
    ? crypto.createHmac('sha256', key).update(`chat:${nonce}`)
    : crypto.createHash('sha256').update(`chat:${nonce}`);
  return mac.digest('base64url');
}

/** How a token is looked up. */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

/** A token as it arrives: the right shape, or nothing to look up. */
function cleanToken(token) {
  const value = String(token || '');
  return /^[A-Za-z0-9_-]{20,64}$/.test(value) ? value : '';
}

/**
 * Whether the guest should get the reply by email: they gave an address and
 * have not had the conversation open just now.
 */
function emailGuest({ email, seenAt }, now = Date.now()) {
  if (!email) return false;
  if (!seenAt) return true;
  return now - new Date(seenAt).getTime() > EMAIL_AFTER_MINUTES * 60 * 1000;
}

module.exports = {
  OPEN,
  ANSWERED,
  CLOSED,
  STATUSES,
  NAME_MAX,
  BODY_MAX,
  MAX_MESSAGES,
  EMAIL_AFTER_MINUTES,
  checkBody,
  checkOpen,
  nextStatus,
  newNonce,
  tokenFor,
  hashToken,
  cleanToken,
  emailGuest,
};
