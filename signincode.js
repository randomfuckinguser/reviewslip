'use strict';

const crypto = require('crypto');

/**
 * The rules for a sign-in code, without the database: what one looks like,
 * how it is read back from what somebody typed, and how it is stored. Pure, so
 * it can be tested on its own; codes.js keeps and checks them.
 */

const DIGITS = 6;
const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const MAX_PER_HOUR = 6;

/** Lower case and trimmed: the key codes are kept under. */
function emailKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** Six digits, leading zeros kept, from the system's random source. */
function newCode() {
  return String(crypto.randomInt(0, 10 ** DIGITS)).padStart(DIGITS, '0');
}

/** Whatever was typed, as the six digits it should be — spaces and dashes out. */
function cleanCode(value) {
  const digits = String(value ?? '').replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

function pepper() {
  const raw = String(process.env.SECRET_KEY || '').trim();
  return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : null;
}

/** salt$hash, the salt per code; the key, when there is one, on top. */
function hashCode(email, code, salt = crypto.randomBytes(12).toString('hex')) {
  const key = pepper();
  const text = `${salt}:${emailKey(email)}:${code}`;
  const hash = key
    ? crypto.createHmac('sha256', key).update(text).digest('hex')
    : crypto.createHash('sha256').update(text).digest('hex');
  return `${salt}$${hash}`;
}

function matches(stored, email, code) {
  const [salt, hash] = String(stored || '').split('$');
  if (!salt || !hash) return false;
  const again = hashCode(email, code, salt).split('$')[1];
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(again, 'hex'));
}

module.exports = {
  DIGITS,
  CODE_MINUTES,
  MAX_ATTEMPTS,
  MAX_PER_HOUR,
  emailKey,
  newCode,
  cleanCode,
  hashCode,
  matches,
};
