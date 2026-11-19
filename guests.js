'use strict';

const { one, all, query } = require('./db');
const nights = require('./nights');
const secrets = require('./secrets');
const tm30 = require('./tm30');

/**
 * The people on a booking, and the notification Thailand requires about them.
 *
 * The passport number never leaves this module in the clear except through
 * `forExport`, which exists to build the file somebody uploads to Immigration.
 * Every other read returns the last four characters, which is enough for a
 * person at a desk to confirm they have the right document and enough for
 * nobody else to do anything with.
 */

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

const NAME_MAX = 80;

/** What a caller sees: everything except the number itself. */
function toRecord(row) {
  const guest = {
    id: row.id,
    bookingId: row.booking_id,
    familyName: row.family_name,
    firstName: row.first_name,
    middleName: row.middle_name,
    nationality: row.nationality,
    dateOfBirth: row.date_of_birth,
    phone: row.phone,
    arrivedInThailand: row.arrived_in_thailand,
    // Never row.passport_enc. The tail is the whole of what a list needs.
    passportTail: row.passport_tail,
    hasPassport: Boolean(row.passport_enc),
    notifiedAt: row.notified_at,
    // Null means "decide from nationality". Set here, above the reportable()
    // call below, so listFor and pending get the override for free.
    tm30Required: row.tm30_required ?? null,
  };

  // Said here rather than by every page that lists guests, so one answer to
  // "is this ready to report" exists in one place.
  const check = tm30.checkGuest({
    ...guest,
    passportNumber: row.passport_enc ? 'held' : '',
  });

  return {
    ...guest,
    reportable: tm30.reportable(guest),
    ready: check.ok,
    missing: check.missing,
  };
}

/* ------------------------------------------------------------------ writes */

/**
 * Add somebody to a booking.
 *
 * Refuses to store a passport number at all when there is no encryption key
 * configured. Not a warning and not a plaintext fallback: the whole reason this
 * table is acceptable is that the number is unreadable in a backup, and a
 * fallback that quietly drops that guarantee is worse than the feature being
 * unavailable — because nobody would know.
 */
async function add({ subscriberId, bookingId, ...input }) {
  const booking = await one(
    'SELECT id FROM bookings WHERE id = $1 AND subscriber_id = $2',
    [bookingId, subscriberId]
  );
  if (!booking) throw fail(404, 'No such booking.');

  const familyName = String(input.familyName ?? '').trim().slice(0, NAME_MAX);
  const firstName = String(input.firstName ?? '').trim().slice(0, NAME_MAX);
  if (!familyName || !firstName) {
    throw fail(400, 'A guest needs a family name and a first name.');
  }

  for (const [key, label] of [
    ['dateOfBirth', 'date of birth'],
    ['arrivedInThailand', 'arrival date'],
  ]) {
    if (input[key] && !nights.parse(input[key])) {
      throw fail(400, `That ${label} is not a date.`);
    }
  }

  const passport = tm30.normalisePassport(input.passportNumber);
  if (passport && !secrets.configured) {
    throw fail(
      503,
      'Passport numbers cannot be stored until SECRET_KEY is set on the server. Everything else about the guest will save.'
    );
  }

  const row = await one(
    `INSERT INTO booking_guests
       (subscriber_id, booking_id, family_name, first_name, middle_name,
        nationality, date_of_birth, phone, arrived_in_thailand,
        passport_enc, passport_tail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      subscriberId,
      bookingId,
      familyName,
      firstName,
      String(input.middleName ?? '').trim().slice(0, NAME_MAX) || null,
      String(input.nationality ?? '').trim().slice(0, 40) || null,
      input.dateOfBirth || null,
      String(input.phone ?? '').trim().slice(0, 40) || null,
      input.arrivedInThailand || null,
      passport ? secrets.encrypt(passport) : null,
      passport ? secrets.tail(passport) : null,
    ]
  );

  return toRecord(row);
}

/**
 * Correct a guest record.
 *
 * Only the fields actually sent are written, so ticking the TM30 override does
 * not blank a passport somebody typed in yesterday. That matters more here than
 * in most places: without an update, the only way to fix a mistyped passport was
 * to delete the guest and add them again, which throws away `notified_at` — and
 * a guest who really was reported to Immigration coming back as outstanding is
 * how somebody ends up reporting them twice, or deciding the count is wrong and
 * ignoring it.
 *
 * `tm30Required` takes true, false or null and nothing else. Not a coercion:
 * Boolean('false') is true, and that one would silently mark an exempt guest
 * reportable — a wrong answer to a legal question, arrived at by a helpful cast.
 */
async function update({ subscriberId, id, ...input }) {
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  const current = await one(
    'SELECT * FROM booking_guests WHERE id = $1 AND subscriber_id = $2',
    [id, subscriberId]
  );
  if (!current) throw fail(404, 'No such guest.');

  const text = (key, column, max = NAME_MAX) => {
    if (!has(key)) return [column, current[column]];
    const value = String(input[key] ?? '').trim().slice(0, max);
    return [column, value || null];
  };

  const [, familyName] = text('familyName', 'family_name');
  const [, firstName] = text('firstName', 'first_name');
  if (!familyName || !firstName) {
    throw fail(400, 'A guest needs a family name and a first name.');
  }

  for (const [key, label] of [
    ['dateOfBirth', 'date of birth'],
    ['arrivedInThailand', 'arrival date'],
  ]) {
    if (has(key) && input[key] && !nights.parse(input[key])) {
      throw fail(400, `That ${label} is not a date.`);
    }
  }

  let required = current.tm30_required;
  if (has('tm30Required')) {
    const wanted = input.tm30Required;
    if (wanted !== true && wanted !== false && wanted !== null) {
      throw fail(400, 'Whether TM30 applies is yes, no, or left to the rule.');
    }
    required = wanted;
  }

  // The same refusal as `add`, for the same reason: a passport stored in the
  // clear is worse than one not stored at all, because nobody would know.
  let passportEnc = current.passport_enc;
  let passportTail = current.passport_tail;
  if (has('passportNumber')) {
    const passport = tm30.normalisePassport(input.passportNumber);
    if (passport && !secrets.configured) {
      throw fail(
        503,
        'Passport numbers cannot be stored until SECRET_KEY is set on the server. Everything else about the guest will save.'
      );
    }
    passportEnc = passport ? secrets.encrypt(passport) : null;
    passportTail = passport ? secrets.tail(passport) : null;
  }

  const row = await one(
    `UPDATE booking_guests SET
       family_name = $3,
       first_name = $4,
       middle_name = $5,
       nationality = $6,
       date_of_birth = $7,
       phone = $8,
       arrived_in_thailand = $9,
       passport_enc = $10,
       passport_tail = $11,
       tm30_required = $12,
       updated_at = now()
     WHERE id = $1 AND subscriber_id = $2
     RETURNING *`,
    [
      id,
      subscriberId,
      familyName,
      firstName,
      text('middleName', 'middle_name')[1],
      text('nationality', 'nationality', 40)[1],
      has('dateOfBirth') ? input.dateOfBirth || null : current.date_of_birth,
      text('phone', 'phone', 40)[1],
      has('arrivedInThailand')
        ? input.arrivedInThailand || null
        : current.arrived_in_thailand,
      passportEnc,
      passportTail,
      required,
    ]
  );

  return toRecord(row);
}

async function remove({ subscriberId, id }) {
  const row = await one(
    'DELETE FROM booking_guests WHERE id = $1 AND subscriber_id = $2 RETURNING id',
    [id, subscriberId]
  );
  if (!row) throw fail(404, 'No such guest.');
  return true;
}

/* ------------------------------------------------------------------- reads */

async function listFor({ subscriberId, bookingId }) {
  const rows = await all(
    `SELECT * FROM booking_guests
      WHERE subscriber_id = $1 AND booking_id = $2
      ORDER BY id`,
    [subscriberId, bookingId]
  );
  return rows.map(toRecord);
}

/**
 * Who still needs notifying, for a window of arrivals.
 *
 * Counted rather than listed when all somebody wants is the badge on a page.
 * Cancelled stays are excluded: nobody arrived, so there is nothing to report.
 */
async function pending({ subscriberId, from, to }) {
  const start = nights.parse(from);
  const end = nights.parse(to);
  if (!start || !end) throw fail(400, 'Those are not dates.');

  const rows = await all(
    `SELECT g.*, b.arrival, b.departure, r.name AS room_name
       FROM booking_guests g
       JOIN bookings b ON b.id = g.booking_id
       LEFT JOIN rooms r ON r.id = b.room_id
      WHERE g.subscriber_id = $1
        AND g.notified_at IS NULL
        AND b.status <> 'cancelled'
        AND b.arrival BETWEEN $2 AND $3
      ORDER BY b.arrival, g.family_name`,
    [subscriberId, start, end]
  );

  return rows
    .map((row) => ({
      ...toRecord(row),
      arrival: row.arrival,
      departure: row.departure,
      roomName: row.room_name,
    }))
    .filter((g) => g.reportable);
}

/**
 * The export, with the numbers decrypted.
 *
 * The only path in the product that returns a passport number, and the only
 * reason it exists is that Immigration asks for it. Kept as its own function so
 * that fact is greppable: anything that calls this is handling passports.
 */
async function forExport({ subscriberId, from, to }) {
  const start = nights.parse(from);
  const end = nights.parse(to);
  if (!start || !end) throw fail(400, 'Those are not dates.');

  const rows = await all(
    `SELECT g.*, b.arrival, b.departure, r.name AS room_name
       FROM booking_guests g
       JOIN bookings b ON b.id = g.booking_id
       LEFT JOIN rooms r ON r.id = b.room_id
      WHERE g.subscriber_id = $1
        AND b.status <> 'cancelled'
        AND b.arrival BETWEEN $2 AND $3
      ORDER BY b.arrival, g.family_name`,
    [subscriberId, start, end]
  );

  const entries = rows
    // The raw row, so the override has to be named explicitly — `row` is
    // snake_case and `reportable` reads camelCase, which is exactly the kind of
    // mismatch that compiles, passes, and quietly drops a guest somebody was
    // told to report.
    .filter((row) =>
      tm30.reportable({
        nationality: row.nationality,
        tm30Required: row.tm30_required,
      })
    )
    // Only complete records go in the file.
    //
    // A row with no passport number is one Immigration cannot act on, and a
    // file containing it risks the whole upload being refused. Leaving those
    // out is safe *because* they stay in `pending` — visibly outstanding, and
    // markNotified never touches them, so nobody can tick off a guest who was
    // never actually reported. Putting them in the file is what would hide
    // them: the upload looks done and one arrival was never notified.
    .filter((row) =>
      tm30.checkGuest({
        familyName: row.family_name,
        firstName: row.first_name,
        nationality: row.nationality,
        passportNumber: row.passport_enc ? 'held' : '',
        dateOfBirth: row.date_of_birth,
        arrivedInThailand: row.arrived_in_thailand,
      }).ok
    )
    .map((row) => ({
      id: row.id,
      guest: {
        familyName: row.family_name,
        firstName: row.first_name,
        middleName: row.middle_name,
        nationality: row.nationality,
        // Decrypted here and nowhere else. Null when the key has changed or
        // gone — which shows as a blank column rather than a wrong number.
        passportNumber: secrets.decrypt(row.passport_enc) ?? '',
        dateOfBirth: row.date_of_birth,
        phone: row.phone,
        arrivedInThailand: row.arrived_in_thailand,
      },
      stay: {
        arrival: row.arrival,
        departure: row.departure,
        roomName: row.room_name,
      },
    }));

  return { entries, csv: tm30.toCsv(entries) };
}

/**
 * Mark people as notified.
 *
 * Set by the property after they have uploaded the file, not by the export
 * itself. Downloading is not notifying — somebody can download a file and never
 * upload it, and a system that marked them done at download would hide exactly
 * the stays that were missed.
 */
async function markNotified({ subscriberId, ids }) {
  const list = (Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && n > 0);

  if (!list.length) throw fail(400, 'Nothing to mark.');

  const result = await query(
    `UPDATE booking_guests SET notified_at = now(), updated_at = now()
      WHERE subscriber_id = $1 AND id = ANY($2::int[]) AND notified_at IS NULL`,
    [subscriberId, list]
  );

  return { marked: result.rowCount ?? 0 };
}

/**
 * Forget passport numbers for stays that ended more than `days` ago.
 *
 * The record of who stayed is kept — the name, the nationality, the dates. The
 * document number is dropped, because there is no reason to hold somebody's
 * passport number two years after they left, and every reason not to.
 *
 * `days` is the caller's decision, not a legal opinion: Thailand's own
 * record-keeping requirement is a question for a Thai lawyer, and this is the
 * mechanism rather than the policy.
 */
async function forgetPassports({ subscriberId, days = 365 }) {
  const window = Number(days);
  if (!Number.isSafeInteger(window) || window < 1) {
    throw fail(400, 'That is not a number of days.');
  }

  const result = await query(
    `UPDATE booking_guests g
        SET passport_enc = NULL, updated_at = now()
       FROM bookings b
      WHERE b.id = g.booking_id
        AND g.subscriber_id = $1
        AND g.passport_enc IS NOT NULL
        AND b.departure < (now() AT TIME ZONE 'UTC')::date - $2::int`,
    [subscriberId, window]
  );

  return { forgotten: result.rowCount ?? 0 };
}

/**
 * A returning guest's party, carried from their last stay into this one.
 *
 * The same people coming back with the same passports: copied rather than
 * typed again, encrypted number and all. What belongs to the old trip stays
 * behind — when they entered Thailand, and whether Immigration was told — so
 * the copy is a new arrival to report, which it is.
 *
 * From the customer's most recent other stay that has anybody on it. Returns
 * how many were copied; nothing to copy is not an error.
 */
async function copyFromLastStay({ subscriberId, bookingId }) {
  const booking = await one(
    'SELECT id, customer_id FROM bookings WHERE id = $1 AND subscriber_id = $2',
    [bookingId, subscriberId]
  );
  if (!booking) throw fail(404, 'No such booking.');
  if (!booking.customer_id) return { copied: 0, from: null };

  const source = await one(
    `SELECT b.id, b.arrival
       FROM bookings b
      WHERE b.customer_id = $1 AND b.subscriber_id = $2 AND b.id <> $3
        AND EXISTS (SELECT 1 FROM booking_guests g WHERE g.booking_id = b.id)
      ORDER BY b.arrival DESC, b.id DESC
      LIMIT 1`,
    [booking.customer_id, subscriberId, bookingId]
  );
  if (!source) return { copied: 0, from: null };

  const rows = await all(
    `INSERT INTO booking_guests
       (subscriber_id, booking_id, family_name, first_name, middle_name,
        nationality, date_of_birth, phone, passport_enc, passport_tail)
     SELECT subscriber_id, $3, family_name, first_name, middle_name,
            nationality, date_of_birth, phone, passport_enc, passport_tail
       FROM booking_guests g
      WHERE g.booking_id = $1 AND g.subscriber_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM booking_guests here
           WHERE here.booking_id = $3
             AND lower(here.family_name) = lower(g.family_name)
             AND lower(here.first_name) = lower(g.first_name))
      ORDER BY g.id
     RETURNING id`,
    [source.id, subscriberId, bookingId]
  );
  return { copied: rows.length, from: source.arrival };
}

module.exports = {
  copyFromLastStay,
  add,
  update,
  remove,
  listFor,
  pending,
  forExport,
  markNotified,
  forgetPassports,
};
