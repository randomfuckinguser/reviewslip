'use strict';

const { one, all, query } = require('./db');
const rules = require('./sharerules');

/**
 * Sharing a venue with other people.
 *
 * The owner types an email and picks a level of access (sharerules.js). An
 * account with that address has the venue on its dashboard straight away;
 * an address with no account yet gets it the first time it signs in, which
 * it does with a code sent to that address — so the access goes to whoever
 * holds the mailbox the owner named.
 */

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

function toMember(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    roleLabel: rules.LABELS[row.role],
    joined: Boolean(row.account_id),
    addedAt: row.created_at,
    joinedAt: row.joined_at,
  };
}

/**
 * The caller's level of access to a venue: owner, a shared level, or null.
 *
 * @param {{id: number, account_id: number|null}} venue
 */
async function roleFor(venue, accountId) {
  if (!venue || !accountId) return null;
  if (venue.account_id === accountId) return 'owner';
  const row = await one('SELECT role FROM venue_members WHERE subscriber_id = $1 AND account_id = $2', [
    venue.id,
    accountId,
  ]);
  return row ? row.role : null;
}

/**
 * Gives an account what was shared with its address before it existed, or
 * before it signed in. A phone-only account someone shares a venue with gets
 * the dashboard as well.
 */
async function claim(account) {
  const rows = await all(
    `UPDATE venue_members SET account_id = $1, joined_at = now()
      WHERE account_id IS NULL AND lower(email) = lower($2)
      RETURNING id`,
    [account.id, account.email]
  );
  if (rows.length) await query('UPDATE accounts SET phone_only = false WHERE id = $1 AND phone_only', [account.id]);
  return rows.length;
}

/** Whether a venue is waiting for this address, so a sign-in code is worth sending. */
async function pendingFor(email) {
  return Boolean(
    await one('SELECT 1 FROM venue_members WHERE account_id IS NULL AND lower(email) = lower($1) LIMIT 1', [
      String(email || '').trim(),
    ])
  );
}

/** The venues shared with an account, with its level of access to each. */
async function sharedWith(accountId) {
  return all(
    `SELECT s.*, m.role AS member_role FROM venue_members m
       JOIN subscribers s ON s.id = m.subscriber_id
      WHERE m.account_id = $1
      ORDER BY s.slug`,
    [accountId]
  );
}

/** Who a venue is shared with, and its owner. */
async function listFor(venue) {
  const [owner, rows] = await Promise.all([
    venue.account_id ? one('SELECT email FROM accounts WHERE id = $1', [venue.account_id]) : null,
    all('SELECT * FROM venue_members WHERE subscriber_id = $1 ORDER BY created_at', [venue.id]),
  ]);
  return { owner: owner ? owner.email : null, members: rows.map(toMember), roles: rules.LABELS };
}

/**
 * Shares the venue. Returns the new member, and whether that address already
 * has an account (and so has the venue now).
 */
async function add(venue, byAccountId, input) {
  const checked = rules.checkShare(input);
  if (!checked.ok) throw fail(400, checked.error);
  const { email, role } = checked.value;

  const owner = venue.account_id ? await one('SELECT email FROM accounts WHERE id = $1', [venue.account_id]) : null;
  if (owner && owner.email.toLowerCase() === email) throw fail(400, 'That is the owner’s own address.');

  const count = await one('SELECT count(*)::int AS n FROM venue_members WHERE subscriber_id = $1', [venue.id]);
  if (count.n >= rules.MAX_MEMBERS) throw fail(400, `A business can be shared with ${rules.MAX_MEMBERS} people.`);

  const account = await one('SELECT id FROM accounts WHERE lower(email) = $1', [email]);
  try {
    const row = await one(
      `INSERT INTO venue_members (subscriber_id, email, role, added_by, account_id, joined_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $5::int IS NULL THEN NULL ELSE now() END)
       RETURNING *`,
      [venue.id, email, role, byAccountId, account ? account.id : null]
    );
    if (account) await query('UPDATE accounts SET phone_only = false WHERE id = $1 AND phone_only', [account.id]);
    return { member: toMember(row), hasAccount: Boolean(account) };
  } catch (err) {
    if (err?.code === '23505') throw fail(409, 'It is shared with that address already.');
    throw err;
  }
}

async function setRole(venue, memberId, role) {
  const checked = rules.checkRole(role);
  if (!checked.ok) throw fail(400, checked.error);
  const row = await one('UPDATE venue_members SET role = $3 WHERE id = $1 AND subscriber_id = $2 RETURNING *', [
    Number(memberId),
    venue.id,
    checked.value,
  ]);
  if (!row) throw fail(404, 'They no longer have access.');
  return toMember(row);
}

async function remove(venue, memberId) {
  const row = await one('DELETE FROM venue_members WHERE id = $1 AND subscriber_id = $2 RETURNING id', [
    Number(memberId),
    venue.id,
  ]);
  if (!row) throw fail(404, 'They no longer have access.');
}

/** Someone a venue was shared with gives it up. */
async function leave(venue, accountId) {
  await query('DELETE FROM venue_members WHERE subscriber_id = $1 AND account_id = $2', [venue.id, accountId]);
}

module.exports = { roleFor, claim, pendingFor, sharedWith, listFor, add, setRole, remove, leave };
