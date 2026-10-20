'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const { query, one } = require('./db');
const plans = require('./plans');
const referrals = require('./referrals');

/**
 * Customer accounts and their sessions.
 *
 * An account owns venues. Signing in gets a session token, which the website
 * keeps in an httpOnly cookie and presents on every call — so the website never
 * asserts who someone is, it forwards a token this file checks.
 */

const scrypt = promisify(crypto.scrypt);

/* -------------------------------------------------------------- credentials */

// 3–20 characters, and at least one of each: lowercase, uppercase, digit,
// symbol. A username is public-ish, so this is really a "pick something
// deliberate" rule rather than a security control.
const USERNAME_LENGTH = { min: 3, max: 20 };
const USERNAME_CLASSES = [
  [/[a-z]/, 'a lowercase letter'],
  [/[A-Z]/, 'an uppercase letter'],
  [/\d/, 'a number'],
  [/[^A-Za-z0-9]/, 'a symbol'],
];

// Passwords are checked by length alone, on purpose. Composition rules push
// people towards P@ssw0rd1; length is what actually costs an attacker.
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;

// Deliberately loose. The only email check that means anything is sending one.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @returns {{ok: boolean, error?: string}} */
function checkUsername(value) {
  const username = String(value ?? '').trim();

  if (username.length < USERNAME_LENGTH.min || username.length > USERNAME_LENGTH.max) {
    return {
      ok: false,
      error: `A username is ${USERNAME_LENGTH.min}–${USERNAME_LENGTH.max} characters.`,
    };
  }
  if (/\s/.test(username)) {
    return { ok: false, error: 'A username cannot contain spaces.' };
  }

  const missing = USERNAME_CLASSES.filter(([re]) => !re.test(username)).map(
    ([, label]) => label
  );
  if (missing.length) {
    return { ok: false, error: `A username needs ${listOf(missing)}.` };
  }
  return { ok: true };
}

/** @returns {{ok: boolean, error?: string}} */
function checkPassword(value) {
  const password = String(value ?? '');
  if (password.length < PASSWORD_MIN) {
    return {
      ok: false,
      error: `A password is at least ${PASSWORD_MIN} characters.`,
    };
  }
  if (password.length > PASSWORD_MAX) {
    return { ok: false, error: 'That password is too long.' };
  }
  return { ok: true };
}

/** @returns {{ok: boolean, error?: string}} */
function checkEmail(value) {
  const email = String(value ?? '').trim();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, error: 'That does not look like an email address.' };
  }
  return { ok: true };
}

/**
 * A username for someone who was never asked for one.
 *
 * The local part of the email, stripped to letters and digits, plus four hex
 * characters — so two people at the same domain do not collide, and neither do
 * two accounts from the same address at different times. Deliberately does not
 * satisfy `checkUsername`: that rule is for a name a person picked, and holding
 * a generated one to it would only produce uglier generated names.
 */
function deriveUsername(email) {
  const base =
    String(email)
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 12) || 'user';

  return `${base}${crypto.randomBytes(2).toString('hex')}`;
}

function listOf(items) {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/* ---------------------------------------------------------------- passwords */

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

/**
 * scrypt rather than a bcrypt dependency: it is in node's standard library,
 * memory-hard, and the async form keeps the event loop free while it runs.
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/** Constant-time, and false rather than throwing on a malformed stored value. */
async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(
    String(password ?? ''),
    Buffer.from(saltHex, 'hex'),
    expected.length
  );
  return crypto.timingSafeEqual(expected, actual);
}

/* ----------------------------------------------------------------- sessions */

const SESSION_PREFIX = 'rvs_';

/**
 * How long a signed-in session lasts.
 *
 * A day, not the month it was. A dashboard session can read and change every
 * business on the account — the review links a QR code sends people to, and the
 * OpenRouter key that is billed — so a token left behind on a shared or lost
 * device is worth something for as long as it lives. A month of that is a long
 * time to be wrong about who has the laptop.
 *
 * The cost is signing in again each day, which is the ordinary price of this
 * being an admin surface rather than a reader.
 *
 * The browser cookie is set to match in the website repo. Both have to move
 * together: a cookie outliving its row means a token sent on every request that
 * the server has already forgotten, and a row outliving its cookie means a
 * session nobody can reach still sitting in the table.
 */
const SESSION_HOURS = 24;

function newSessionToken() {
  return SESSION_PREFIX + crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/* ------------------------------------------------------------------ errors */

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

/* ------------------------------------------------------------------- shape */

/** What the website may see. Never the hash. */
function toRecord(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    plan: row.plan,
    status: row.status,
    // The column has existed since its migration and has never been returned,
    // so every consumer has seen `isAdmin` as undefined — including the
    // website's own Account type, which declares it. Anything gating on staff
    // access needs this to actually arrive.
    isAdmin: row.is_admin === true,
    // Staff a venue invited to answer its calls: the phone, and nothing else.
    phoneOnly: row.phone_only === true,
    createdAt: row.created_at,
  };
}

function now() {
  return new Date().toISOString();
}

/* -------------------------------------------------------------------- read */

async function byId(id) {
  return one('SELECT * FROM accounts WHERE id = $1', [id]);
}

/** Either identifier signs you in — people remember one or the other. */
async function byLogin(identifier) {
  const value = String(identifier || '').trim().toLowerCase();
  if (!value) return null;
  return one(
    'SELECT * FROM accounts WHERE lower(email) = $1 OR lower(username) = $1',
    [value]
  );
}

/* ------------------------------------------------------------------ create */

/**
 * @param {object} input - email, username, password, and optionally plan
 * @returns {Promise<object>} the account record
 */
async function create(input = {}) {
  const email = String(input.email || '').trim();
  const username =
    String(input.username || '').trim() || deriveUsername(email);

  for (const check of [checkEmail(email), checkPassword(input.password)]) {
    if (!check.ok) throw fail(400, check.error);
  }

  // The composition rule applies to a username someone chose. Sign-up does not
  // ask for one — a name nobody will ever type is friction with nothing behind
  // it — so one is derived from the email and can be changed later.
  const chosen = Boolean(String(input.username || '').trim());
  if (chosen) {
    const check = checkUsername(username);
    if (!check.ok) throw fail(400, check.error);
  }

  const plan = plans.isPlan(input.plan) ? input.plan : plans.DEFAULT_PLAN;
  const stamp = now();

  let row;
  try {
    row = await one(
      `INSERT INTO accounts (email, username, password_hash, plan, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING *`,
      [email, username, await hashPassword(input.password), plan, stamp]
    );
  } catch (err) {
    if (err?.code === '23505') {
      // Two unique indexes, and which one it was changes what the person has to
      // fix — so say, rather than a generic "already taken".
      throw fail(
        409,
        String(err.constraint).includes('username')
          ? 'That username is taken.'
          : 'There is already an account with that email.'
      );
    }
    throw err;
  }

  // After the account exists, and never able to prevent it existing. A bad or
  // spent code costs the referrer a referral; it must not cost us the customer.
  // See referrals.claim() for why this swallows rather than reports.
  if (input.referralCode) {
    try {
      await referrals.claim({ code: input.referralCode, accountId: row.id });
    } catch (err) {
      console.error('Referral claim failed for account %d:', row.id, err);
    }
  }

  return toRecord(row);
}

/* ------------------------------------------------------------------- login */

/**
 * @returns {Promise<{account: object, token: string, expiresAt: string}>}
 * @throws 401 for both a missing account and a wrong password, deliberately —
 *   distinguishing them tells an attacker which emails are registered.
 */
async function login(identifier, password) {
  const row = await byLogin(identifier);

  // Hash anyway when the account does not exist, so the failure takes about as
  // long either way and cannot be timed to enumerate accounts.
  const ok = row
    ? await verifyPassword(password, row.password_hash)
    : await verifyPassword(password, `scrypt$${'00'.repeat(SALT_BYTES)}$${'00'.repeat(SCRYPT_KEYLEN)}`);

  if (!row || !ok) throw fail(401, 'Wrong email, username, or password.');
  if (row.status !== 'active') throw fail(403, 'This account is not active.');

  // A referral comes good the first time its account signs in. Signing up signs
  // you straight in, so for almost everyone this lands seconds after the claim
  // — but it is the sign-in that is being counted, and this is where sign-ins
  // are. Never allowed to fail one: a referral is not worth a locked-out
  // customer.
  try {
    await referrals.qualify(row.id);
  } catch (err) {
    console.error('Referral qualify failed for account %d:', row.id, err);
  }

  return { account: toRecord(row), ...(await startSession(row.id)) };
}

async function startSession(accountId) {
  const token = newSessionToken();
  const expiresAt = new Date(
    Date.now() + SESSION_HOURS * 60 * 60 * 1000
  ).toISOString();

  await query(
    'INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), accountId, expiresAt]
  );

  return { token, expiresAt };
}

/** @returns {Promise<object|null>} the account behind a session token */
async function fromSession(token) {
  if (typeof token !== 'string' || !token) return null;

  const row = await one(
    `SELECT a.*
       FROM sessions s
       JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)]
  );

  return row && row.status === 'active' ? row : null;
}

async function endSession(token) {
  if (typeof token !== 'string' || !token) return;
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

/** Housekeeping. Expired rows are harmless but they accumulate. */
async function pruneSessions() {
  const result = await query('DELETE FROM sessions WHERE expires_at <= now()');
  return result.rowCount;
}

/* ------------------------------------------------------------------ update */

async function setPassword(accountId, password) {
  const check = checkPassword(password);
  if (!check.ok) throw fail(400, check.error);

  await query(
    'UPDATE accounts SET password_hash = $1, updated_at = $2 WHERE id = $3',
    [await hashPassword(password), now(), accountId]
  );
  // Every other browser is signed out. Changing a password is usually a
  // response to losing control of it, so leaving the old sessions alive would
  // defeat the point.
  await query('DELETE FROM sessions WHERE account_id = $1', [accountId]);
}

async function setPlan(accountId, planId) {
  if (!plans.isPlan(planId)) throw fail(400, 'No such plan.');

  const row = await one(
    'UPDATE accounts SET plan = $1, updated_at = $2 WHERE id = $3 RETURNING *',
    [planId, now(), accountId]
  );
  if (!row) throw fail(404, 'No such account.');
  return toRecord(row);
}

module.exports = {
  USERNAME_LENGTH,
  PASSWORD_MIN,
  checkUsername,
  checkPassword,
  checkEmail,
  hashPassword,
  verifyPassword,
  toRecord,
  byId,
  byLogin,
  create,
  login,
  startSession,
  fromSession,
  endSession,
  pruneSessions,
  setPassword,
  setPlan,
};
