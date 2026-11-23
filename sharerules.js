'use strict';

/**
 * Sharing a venue: the levels of access, and what each may do. Apart from
 * sharing.js, which needs a database, so it can be tested on its own.
 *
 *   owner      the account that made the venue: everything
 *   manager    Full Access: everything but deleting the venue and sharing it
 *   frontdesk  Front Desk: sees everything; changes bookings, guests,
 *              customers, TM30, guest messages and room status — not prices,
 *              rooms, settings or the guest pages
 */

const ROLES = ['manager', 'frontdesk'];

const LABELS = { owner: 'Owner', manager: 'Full Access', frontdesk: 'Front Desk' };

/** How many people one venue can be shared with. */
const MAX_MEMBERS = 20;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The day-to-day work of the desk: what Front Desk may change. */
const DESK_WRITES = [
  /^\/bookings(\/|$)/,
  /^\/guests(\/|$)/,
  /^\/customers(\/|$)/,
  /^\/tm30(\/|\.csv$|$)/,
  /^\/chats(\/|$)/,
  /^\/rooms\/\d+\/(status|housekeeping)$/,
];

/**
 * Whether this level of access may make this request, by its method and the
 * path after /businesses/:slug ('' for the venue itself).
 */
function allowed(role, method, rest) {
  if (role === 'owner') return true;
  const path = String(rest || '').split('?')[0].replace(/\/+$/, '');
  const write = !['GET', 'HEAD'].includes(String(method).toUpperCase());
  if (/^\/sharing(\/|$)/.test(path)) return !write;
  if (role === 'manager') return !(write && path === '' && String(method).toUpperCase() === 'DELETE');
  if (role === 'frontdesk') return !write || DESK_WRITES.some((re) => re.test(path));
  return false;
}

/** @returns {{ok: true, value: {email: string, role: string}} | {ok: false, error: string}} */
function checkShare(input = {}) {
  const email = String(input.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 160) return { ok: false, error: 'Enter their email address.' };
  const role = checkRole(input.role);
  if (!role.ok) return role;
  return { ok: true, value: { email, role: role.value } };
}

function checkRole(value) {
  const role = String(value ?? '');
  if (!ROLES.includes(role)) return { ok: false, error: 'Choose Full Access or Front Desk.' };
  return { ok: true, value: role };
}

module.exports = { ROLES, LABELS, MAX_MEMBERS, allowed, checkShare, checkRole };
