'use strict';

const { all, one, query } = require('./db');

/**
 * Sign-in codes: six digits, emailed, typed back.
 *
 * Instead of a password. Nobody has to make one up, write it down or reset it,
 * and the email that receives the code is the thing being proven anyway — a
 * password reset already worked by sending a link to it. Signing up, signing
 * in and accepting an invitation to answer a venue's calls all end the same
 * way: the code from the email, then signed in and kept signed in.
 *
 * Six digits is a million guesses, so the guessing is what is limited:
 *
 *   - a code lasts CODE_MINUTES, or INVITE_DAYS when it came in an invitation
 *   - each code takes MAX_ATTEMPTS wrong tries and is then gone
 *   - an address gets at most MAX_PER_HOUR codes an hour
 *
 * which is a few dozen guesses an hour at one address. Counted in the
 * database, per address, rather than per IP: the website asks on everybody's
 * behalf, so the IP this app sees is the website's own.
 *
 * Only a keyed hash of the code is stored. With SECRET_KEY set it is an HMAC,
 * so a copy of the table cannot be brute-forced; without, a salted hash, which
 * still keeps the codes out of a casual look at the table.
 */

const {
  CODE_MINUTES,
  MAX_ATTEMPTS,
  MAX_PER_HOUR,
  emailKey,
  newCode,
  cleanCode,
  hashCode,
  matches,
} = require('./signincode');

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

/**
 * A new code for an address.
 *
 * @param {object} input
 * @param {string} input.email
 * @param {number} [input.days] - how long it lasts, for an invitation; minutes otherwise
 * @returns {Promise<{code: string, expiresAt: string}>} the code itself, to email
 * @throws 429 when the address has had too many this hour
 */
async function issue({ email, days = null }) {
  const key = emailKey(email);
  if (!key) throw fail(400, 'Enter your email.');

  // Old rows go on the way in, the way the housekeepers' photographs do: the
  // table only grows when somebody asks for a code.
  await query(
    `DELETE FROM sign_in_codes WHERE expires_at <= now() AND created_at < now() - interval '1 day'`
  );

  const recent = await one(
    `SELECT count(*)::int AS n FROM sign_in_codes
      WHERE email = $1 AND created_at > now() - interval '1 hour'`,
    [key]
  );
  if ((recent?.n ?? 0) >= MAX_PER_HOUR) {
    throw fail(429, 'That is a lot of codes for one email. Use the newest one, or wait an hour.');
  }

  const code = newCode();
  const row = await one(
    `INSERT INTO sign_in_codes (email, code_hash, expires_at)
     VALUES ($1, $2, now() + ${days ? 'make_interval(days => $3)' : 'make_interval(mins => $3)'})
     RETURNING expires_at`,
    [key, hashCode(key, code), days ?? CODE_MINUTES]
  );
  return { code, expiresAt: row.expires_at };
}

/**
 * Whether this is a live code for this address. A right one is used up — it
 * and every other code for the address go, so the one in an older email
 * cannot be used afterwards. A wrong one counts against every live code the
 * address has, and a code that has run out of tries is deleted.
 *
 * @throws 400 for something that is not six digits, 401 for a wrong code
 */
async function redeem({ email, code }) {
  const key = emailKey(email);
  const digits = cleanCode(code);
  if (!digits) throw fail(400, 'Enter the 6 digits from the email.');

  const live = await all(
    'SELECT id, code_hash FROM sign_in_codes WHERE email = $1 AND expires_at > now() ORDER BY id DESC',
    [key]
  );

  if (live.some((row) => matches(row.code_hash, key, digits))) {
    await query('DELETE FROM sign_in_codes WHERE email = $1', [key]);
    return true;
  }

  if (live.length) {
    await query(
      'UPDATE sign_in_codes SET attempts = attempts + 1 WHERE email = $1 AND expires_at > now()',
      [key]
    );
    await query('DELETE FROM sign_in_codes WHERE email = $1 AND attempts >= $2', [key, MAX_ATTEMPTS]);
  }
  throw fail(
    401,
    live.length
      ? 'That code is not right. Check the email and try again.'
      : 'That code has run out. Ask for a new one.'
  );
}

/** Housekeeping: spent and expired codes. */
async function prune() {
  const result = await query(
    `DELETE FROM sign_in_codes WHERE expires_at <= now() OR created_at < now() - interval '30 days'`
  );
  return result.rowCount;
}

module.exports = {
  CODE_MINUTES,
  issue,
  redeem,
  prune,
};
