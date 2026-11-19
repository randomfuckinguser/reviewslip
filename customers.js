'use strict';

/*
 * Customers: the people behind the bookings, remembered.
 *
 * A booking carries a name, an email and a phone as they were typed for that
 * stay. A customer is the person across stays: found again by their email or
 * their phone when they come back, so the desk sees "third stay, last in
 * March" and does not type the same details in a fourth time.
 *
 * Matched only on something that identifies a person. Two guests called John
 * Smith are two people until somebody says otherwise: a name alone never
 * joins a booking to an existing customer by itself — the desk does that by
 * choosing them from the suggestions.
 */

const { one, all } = require('./db');
const tariff = require('./tariff');

const NAME_MAX = 120;
const NOTE_MAX = 2000;

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

/** An address to match on: trimmed, lower-cased, and only if it looks like one. */
function emailKey(email) {
  const e = String(email ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/**
 * A number to match on: the last nine digits. "+66 81 234 5678", "081-234-5678"
 * and "0812345678" are one phone, and the country code is what differs most in
 * how people write it. Too short to be a phone is no key at all.
 */
function phoneKey(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(-9) : null;
}

function toCustomer(row) {
  const spent = row.spent_minor === null || row.spent_minor === undefined ? null : Number(row.spent_minor);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    stays: row.stays === undefined ? undefined : Number(row.stays),
    lastArrival: row.last_arrival ?? null,
    spentMinor: spent,
    spent: spent === null ? null : tariff.formatAmount(spent),
    createdAt: row.created_at,
  };
}

/**
 * The customer a booking belongs to, found or made — on the booking's own
 * transaction, so a booking is never written without one.
 *
 * In order: the customer the desk chose; whoever has this email; whoever has
 * this phone; the customer the booking already had (`fallbackId`, when the
 * guest's details on an existing booking are being corrected); a new one.
 * Whatever is found only ever gains details it was missing — an address typed
 * on one stay does not overwrite the one on file.
 */
async function attach(client, { subscriberId, customerId = null, fallbackId = null, name, email, phone }) {
  const em = emailKey(email);
  const ph = phoneKey(phone);
  const cleanEmail = em ? String(email).trim().slice(0, 200) : null;
  const cleanPhone = phone ? String(phone).trim().slice(0, 40) || null : null;
  const q = async (sql, params) => (await client.query(sql, params)).rows[0] ?? null;

  let row = null;
  if (customerId) {
    row = await q('SELECT * FROM customers WHERE id = $1 AND subscriber_id = $2', [customerId, subscriberId]);
    if (!row) throw fail(404, 'No such customer.');
  }
  if (!row && em) {
    row = await q('SELECT * FROM customers WHERE subscriber_id = $1 AND lower(email) = $2', [subscriberId, em]);
  }
  if (!row && ph) {
    row = await q(
      'SELECT * FROM customers WHERE subscriber_id = $1 AND phone_key = $2 ORDER BY id LIMIT 1',
      [subscriberId, ph]
    );
  }
  if (!row && fallbackId) {
    row = await q('SELECT * FROM customers WHERE id = $1 AND subscriber_id = $2', [fallbackId, subscriberId]);
  }

  if (row) {
    const addEmail = !row.email && cleanEmail;
    const addPhone = !row.phone && cleanPhone;
    if (addEmail || addPhone) {
      // An address another customer already has is left off rather than
      // failing the booking: the two are worth merging, not refusing over.
      const taken = addEmail
        ? await q('SELECT id FROM customers WHERE subscriber_id = $1 AND lower(email) = $2 AND id <> $3', [
            subscriberId,
            em,
            row.id,
          ])
        : null;
      await client.query(
        `UPDATE customers
            SET email = COALESCE(email, $2), phone = COALESCE(phone, $3),
                phone_key = COALESCE(phone_key, $4), updated_at = now()
          WHERE id = $1`,
        [row.id, addEmail && !taken ? cleanEmail : null, addPhone ? cleanPhone : null, addPhone ? ph : null]
      );
    }
    return row.id;
  }

  // Nobody to find: a new customer. ON CONFLICT covers two bookings for a
  // new address landing at the same moment — the second joins the first.
  const made = await q(
    `INSERT INTO customers (subscriber_id, name, email, phone, phone_key)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (subscriber_id, lower(email)) WHERE email IS NOT NULL DO NOTHING
     RETURNING id`,
    [subscriberId, String(name ?? '').trim().slice(0, NAME_MAX) || 'Guest', cleanEmail, cleanPhone, ph]
  );
  if (made) return made.id;
  const raced = await q('SELECT id FROM customers WHERE subscriber_id = $1 AND lower(email) = $2', [subscriberId, em]);
  return raced.id;
}

/** The figures each customer is listed with: stays, the last one, what they spent. */
const WITH_STAYS = `
  SELECT c.*,
         count(b.id) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show')) AS stays,
         max(b.arrival) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show')) AS last_arrival,
         sum(b.total_minor) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show')) AS spent_minor
    FROM customers c
    LEFT JOIN bookings b ON b.customer_id = c.id`;

/**
 * Customers, most recent stay first, optionally matching a search: part of a
 * name or an address, or three or more digits of a phone.
 */
async function list({ subscriberId, q = '', limit = 100 }) {
  const text = String(q ?? '').trim().toLowerCase().slice(0, 80);
  const digits = text.replace(/\D/g, '');
  const like = `%${text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const rows = await all(
    `${WITH_STAYS}
      WHERE c.subscriber_id = $1
        AND ($2 = '' OR lower(c.name) LIKE $3 OR lower(c.email) LIKE $3
             OR ($4 <> '' AND c.phone_key LIKE '%' || $4 || '%'))
      GROUP BY c.id
      ORDER BY max(b.arrival) DESC NULLS LAST, c.id DESC
      LIMIT $5`,
    [subscriberId, text, like, digits.length >= 3 ? digits : '', Math.min(Math.max(Number(limit) || 100, 1), 200)]
  );
  return rows.map(toCustomer);
}

/** One customer, with every stay of theirs, newest first. */
async function get({ subscriberId, id }) {
  const row = await one(`${WITH_STAYS} WHERE c.id = $1 AND c.subscriber_id = $2 GROUP BY c.id`, [id, subscriberId]);
  if (!row) throw fail(404, 'No such customer.');
  const stays = await all(
    `SELECT b.id, b.arrival, b.departure, b.status, b.total_minor, b.payment_status,
            g.name AS group_name, r.name AS room_name
       FROM bookings b
       JOIN room_groups g ON g.id = b.group_id
       LEFT JOIN rooms r ON r.id = b.room_id
      WHERE b.customer_id = $1 AND b.subscriber_id = $2
      ORDER BY b.arrival DESC, b.id DESC`,
    [id, subscriberId]
  );
  return {
    customer: toCustomer(row),
    stays: stays.map((s) => ({
      id: s.id,
      arrival: s.arrival,
      departure: s.departure,
      status: s.status,
      groupName: s.group_name,
      roomName: s.room_name,
      total: s.total_minor === null ? null : tariff.formatAmount(s.total_minor),
      paymentStatus: payment(s.payment_status),
    })),
  };
}

/** Correct a customer's details or notes. Only what was sent is changed. */
async function update({ subscriberId, id, ...input }) {
  const current = await one('SELECT * FROM customers WHERE id = $1 AND subscriber_id = $2', [id, subscriberId]);
  if (!current) throw fail(404, 'No such customer.');

  const has = (k) => input[k] !== undefined;
  const name = has('name') ? String(input.name ?? '').trim() : current.name;
  if (!name) throw fail(400, 'A customer needs a name.');
  if (name.length > NAME_MAX) throw fail(400, 'That name is too long.');

  let email = current.email;
  if (has('email')) {
    const raw = String(input.email ?? '').trim();
    if (raw && !emailKey(raw)) throw fail(400, 'That email address does not look right.');
    email = raw || null;
    if (email) {
      const other = await one('SELECT id FROM customers WHERE subscriber_id = $1 AND lower(email) = $2 AND id <> $3', [
        subscriberId,
        emailKey(email),
        id,
      ]);
      if (other) throw fail(409, 'Another customer already has that email address.');
    }
  }
  const phone = has('phone') ? String(input.phone ?? '').trim().slice(0, 40) || null : current.phone;
  const notes = has('notes') ? String(input.notes ?? '').trim().slice(0, NOTE_MAX) || null : current.notes;

  await one(
    `UPDATE customers SET name = $3, email = $4, phone = $5, phone_key = $6, notes = $7, updated_at = now()
      WHERE id = $1 AND subscriber_id = $2 RETURNING id`,
    [id, subscriberId, name, email, phone, phoneKey(phone), notes]
  );
  return (await get({ subscriberId, id })).customer;
}

/**
 * Whether a stay is paid, as the desk says it. A marketplace booking is
 * stored as "not_connected" until there is online payment — to the desk that
 * is simply not paid yet.
 */
const PAYMENT = ['unpaid', 'deposit', 'paid', 'refunded'];
function payment(stored) {
  return PAYMENT.includes(stored) ? stored : 'unpaid';
}

module.exports = { attach, list, get, update, payment, PAYMENT, emailKey, phoneKey };
