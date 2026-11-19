'use strict';

const roomstatus = require('./roomstatus');

const { one, all, tx } = require('./db');
const nights = require('./nights');
const tariff = require('./tariff');
const tm30 = require('./tm30');
const bookingfilter = require('./bookingfilter');
const customers = require('./customers');
const mailer = require('./mailer');
const emails = require('./emails');

/**
 * Stays, and the nights they hold.
 *
 * A booking and its room nights are one fact written in two tables, so every
 * write here goes through a transaction. Half of it landing is either a stay
 * holding no inventory — a room sold twice — or inventory held by no stay,
 * which is a room nobody can sell and nothing to explain why.
 *
 * The room nights are the inventory. A booking with no room holds none: it is
 * counted against its group, and shows on the calendar as unassigned. Assigning
 * it is what writes the nights, and that write is the moment a clash can
 * happen — refused by the unique index on (room_id, night) rather than by a
 * check in front of it, because two requests arriving together both pass any
 * check and only one can win the index.
 */

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

/** Postgres unique-violation. The only one this module can provoke is a clash. */
const CONFLICT = '23505';

const NAME_MAX = 120;
const NOTE_MAX = 2000;

/** Stays that hold a room. A cancellation gives its nights back immediately. */
const HOLDS_INVENTORY = ['confirmed', 'in_house', 'checked_out'];

/**
 * Postgres returns count() as a string, every time.
 *
 * Coerced in one place because '12' + 1 is '121', and a total that renders
 * correctly and adds up wrongly is the kind of bug that survives a review.
 */
function count(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/* ------------------------------------------------------------------- shape */

function toRecord(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name ?? null,
    roomId: row.room_id,
    roomName: row.room_name ?? null,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    adults: row.adults,
    children: row.children,
    // Already strings: db.js turns off the driver's date parsing, so these
    // arrive as 'YYYY-MM-DD' and go to the browser unchanged.
    arrival: row.arrival,
    departure: row.departure,
    nights: nights.nightCount(row.arrival, row.departure),
    status: row.status,
    source: row.source,
    notes: row.notes,
    ratePlanId: row.rate_plan_id ?? null,
    // Null when the stay was taken before there were rates, or on a plan
    // nobody had priced. Not zero: a booking we cannot price is not free, and
    // the two have to read differently on an arrivals list.
    totalMinor: row.total_minor ?? null,
    customerId: row.customer_id ?? null,
    // How many stays the customer has had here, this one included. Only where
    // it was asked for (get), so the lists do not pay for a count per row.
    customerStays: row.customer_stays === undefined ? undefined : Number(row.customer_stays),
    paymentStatus: customers.payment(row.payment_status),
    total:
      row.total_minor === null || row.total_minor === undefined
        ? null
        : tariff.formatAmount(row.total_minor),
    createdAt: row.created_at,
  };
}

/**
 * What a stay costs on a plan, inside a transaction that already holds it.
 *
 * A copy of the resolution in rates.quote rather than a call to it, because
 * this has to run on the transaction's own client — quoting through the pool
 * mid-transaction would read rates the transaction cannot see and could take a
 * second connection while holding a row lock.
 *
 * Returns null when any night has no price. The caller stores that null; it
 * means "unpriced", and the alternative is a stay silently recorded as free.
 */
async function quoteOn(client, { planId, arrival, departure }) {
  if (!planId) return null;

  const plan = await client.query(
    'SELECT base_minor FROM rate_plans WHERE id = $1',
    [planId]
  );
  if (!plan.rows[0]) return null;

  const list = nights.nightsBetween(arrival, departure);
  const rows = await client.query(
    `SELECT night, amount_minor FROM rate_nights
      WHERE plan_id = $1 AND night = ANY($2::date[])`,
    [planId, list]
  );

  const byNight = new Map(rows.rows.map((r) => [r.night, r.amount_minor]));
  const priced = list.map((night) => byNight.get(night) ?? plan.rows[0].base_minor);

  const sum = tariff.total(priced);
  return sum ? sum.total : null;
}

/* ---------------------------------------------------------------- creating */

/**
 * Take a booking.
 *
 * The room is optional. An unassigned stay is a real, valid booking — it is
 * what arrives from every OTA, which sells a type and never picks the room —
 * and refusing to store one until somebody has chosen would mean either
 * inventing an assignment or dropping the reservation.
 *
 * @param {{subscriberId: number, groupId: number, roomId?: number|null,
 *          guestName: string, arrival: string, departure: string}} input
 */
async function create(input) {
  const {
    subscriberId,
    groupId,
    roomId = null,
    guestName,
    guestEmail = null,
    guestPhone = null,
    adults = 1,
    children = 0,
    arrival,
    departure,
    source = 'direct',
    notes = null,
    ratePlanId = null,
    customerId = null,
  } = input;

  const name = String(guestName ?? '').trim();
  if (!name) throw fail(400, 'Whose booking is it? A name is enough.');
  if (name.length > NAME_MAX) throw fail(400, 'That name is too long.');

  const stay = nights.checkStay({ arrival, departure });
  if (!stay.ok) throw fail(400, stay.error);

  const heads = Number(adults);
  const kids = Number(children);
  if (!Number.isSafeInteger(heads) || heads < 1 || heads > 20) {
    throw fail(400, 'Adults is a number from 1 to 20.');
  }
  if (!Number.isSafeInteger(kids) || kids < 0 || kids > 20) {
    throw fail(400, 'Children is a number from 0 to 20.');
  }

  const group = await one(
    'SELECT id FROM room_groups WHERE id = $1 AND subscriber_id = $2',
    [groupId, subscriberId]
  );
  if (!group) throw fail(404, 'No such room type.');

  if (roomId !== null && roomId !== undefined) {
    const room = await one(
      'SELECT id, status FROM rooms WHERE id = $1 AND subscriber_id = $2 AND group_id = $3',
      [roomId, subscriberId, groupId]
    );
    if (!room) throw fail(404, 'No such room in that room type.');

    /*
     * The same question update() asks, and it has to be asked here too.
     *
     * Moving a booking into a room being renovated was refused and creating
     * one straight into it was not, which is the worse of the two: a stay
     * booked into a building site is a guest arriving to a locked door, and
     * nothing between here and the front desk would have said so.
     */
    if (!roomstatus.takes(room.status)) {
      throw fail(
        400,
        `${roomstatus.of(room.status).label}: nobody can be put in that room.`
      );
    }
  }

  // The plan has to belong to this venue and to the type being booked. A plan
  // from another room type would price a Garden Bungalow at Family Suite money.
  if (ratePlanId) {
    const plan = await one(
      'SELECT id FROM rate_plans WHERE id = $1 AND subscriber_id = $2 AND group_id = $3',
      [ratePlanId, subscriberId, groupId]
    );
    if (!plan) throw fail(404, 'No such rate for that room type.');
  }

  return tx(async (client) => {
    const totalMinor = await quoteOn(client, {
      planId: ratePlanId,
      arrival,
      departure,
    });

    // The returning guest, found by their email or phone, or the one the desk
    // picked from the suggestions; a new customer otherwise.
    const customer = await customers.attach(client, {
      subscriberId,
      customerId,
      name,
      email: guestEmail,
      phone: guestPhone,
    });

    const { rows } = await client.query(
      `INSERT INTO bookings
         (subscriber_id, group_id, room_id, guest_name, guest_email, guest_phone,
          adults, children, arrival, departure, source, notes,
          rate_plan_id, total_minor, customer_id, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'unpaid')
       RETURNING *`,
      [
        subscriberId,
        groupId,
        roomId ?? null,
        name,
        guestEmail || null,
        guestPhone || null,
        heads,
        kids,
        arrival,
        departure,
        String(source).slice(0, 40),
        notes ? String(notes).slice(0, NOTE_MAX) : null,
        ratePlanId ?? null,
        totalMinor,
        customer,
      ]
    );

    const booking = rows[0];
    if (roomId) await holdNights(client, booking);
    return toRecord(booking);
  });
}

/**
 * Write the nights a stay occupies.
 *
 * One statement rather than a loop, so a clash on any night rolls the whole
 * stay back — a booking holding four of its five nights is worse than one
 * refused, because it looks booked and the fifth night is quietly resold.
 *
 * The count is checked against nightCount before the write. nightsBetween caps
 * itself against absurd input, and a capped set here would be a stay silently
 * holding less than it should. This is the assertion that makes that
 * impossible rather than merely unlikely.
 */
async function holdNights(client, booking) {
  const list = nights.nightsBetween(booking.arrival, booking.departure);
  const expected = nights.nightCount(booking.arrival, booking.departure);

  if (list.length !== expected || expected === 0) {
    throw fail(400, 'Those dates do not describe a stay.');
  }

  try {
    await client.query(
      `INSERT INTO room_nights (subscriber_id, room_id, night, booking_id)
       SELECT $1, $2, night::date, $3 FROM unnest($4::text[]) AS night`,
      [booking.subscriber_id, booking.room_id, booking.id, list]
    );
  } catch (err) {
    if (err?.code === CONFLICT) {
      throw fail(409, 'That room is already taken for one of those nights.');
    }
    throw err;
  }
}

/* ---------------------------------------------------------------- editing */

/**
 * Correct a booking.
 *
 * Dates, guest, headcount, and the room type. Every one of those can move the
 * nights it holds, so all of it goes through the same delete-then-re-hold as
 * assign, inside one transaction — a stay whose dates were changed but whose
 * nights were not is a room held on the wrong days and free on the right ones,
 * and nothing on the calendar would say so.
 *
 * Moving to a different room type unassigns the room, because a room belongs to
 * exactly one type: keeping it would mean a Family Suite booking sitting in a
 * Garden Bungalow. The stay lands on the unassigned strip, which is visible and
 * fixable, rather than in a room that contradicts its own type.
 *
 * Absent fields are left alone. This is a correction, not a replacement, and
 * the caller sends what changed.
 *
 * @param {{subscriberId: number, id: number}} input
 */
async function update(input) {
  const { subscriberId, id } = input;

  return tx(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND subscriber_id = $2 FOR UPDATE',
      [id, subscriberId]
    );
    const current = rows[0];
    if (!current) throw fail(404, 'No such booking.');

    const pick = (key, fallback) =>
      input[key] === undefined ? fallback : input[key];

    const arrival = String(pick('arrival', current.arrival));
    const departure = String(pick('departure', current.departure));

    const stay = nights.checkStay({ arrival, departure });
    if (!stay.ok) throw fail(400, stay.error);

    const guestName = String(pick('guestName', current.guest_name)).trim();
    if (!guestName) throw fail(400, 'Whose booking is it? A name is enough.');
    if (guestName.length > NAME_MAX) throw fail(400, 'That name is too long.');

    const adults = Number(pick('adults', current.adults));
    const children = Number(pick('children', current.children));
    if (!Number.isSafeInteger(adults) || adults < 1 || adults > 20) {
      throw fail(400, 'Adults is a number from 1 to 20.');
    }
    if (!Number.isSafeInteger(children) || children < 0 || children > 20) {
      throw fail(400, 'Children is a number from 0 to 20.');
    }

    let groupId = Number(pick('groupId', current.group_id));
    let roomId = current.room_id;

    /*
     * A room sent here comes from a drag, and a drag moves both axes at once.
     *
     * Doing it in this transaction is the whole point: the room and the nights
     * are one change. Split across two calls — assign, then patch the dates —
     * there is a moment where the stay is in the new room on the old nights,
     * and if the second call fails it stays there. That is a booking holding a
     * room it was never meant to, on a calendar that looks correct.
     *
     * The room decides the type, not the other way round. A stay dragged from
     * a bungalow row to a suite row has plainly been moved to a suite; making
     * the caller send the group as well would be asking it to restate
     * something it already said.
     */
    if (input.roomId !== undefined) {
      const wanted = input.roomId === null ? null : Number(input.roomId);
      if (wanted === null) {
        roomId = null;
      } else {
        /*
         * Any status that takes a booking, not only 'active'.
         *
         * A room held back from sale still has people in it — staff, the
         * owner's family, a long stay somebody agreed by telephone — and the
         * desk still has to be able to record that. What must be refused is a
         * room that is being renovated, because nobody can be put in it.
         */
        const room = await client.query(
          `SELECT id, group_id, status FROM rooms
            WHERE id = $1 AND subscriber_id = $2`,
          [wanted, subscriberId]
        );
        if (!room.rows[0]) throw fail(404, 'No such room.');
        if (!roomstatus.takes(room.rows[0].status)) {
          throw fail(
            400,
            `${roomstatus.of(room.rows[0].status).label}: nobody can be put in that room.`
          );
        }
        roomId = room.rows[0].id;
        groupId = room.rows[0].group_id;
      }
    }

    if (groupId !== current.group_id) {
      const group = await client.query(
        'SELECT id FROM room_groups WHERE id = $1 AND subscriber_id = $2',
        [groupId, subscriberId]
      );
      if (!group.rows[0]) throw fail(404, 'No such room type.');

      // The room cannot follow the booking into another type — unless the
      // room is what moved it there, which the block above has already
      // checked and which is how a drag across types arrives.
      const stillFits = roomId
        ? await client.query(
            'SELECT id FROM rooms WHERE id = $1 AND group_id = $2',
            [roomId, groupId]
          )
        : { rows: [] };
      if (!stillFits.rows[0]) roomId = null;
    }

    await client.query('DELETE FROM room_nights WHERE booking_id = $1', [id]);

    /*
     * Re-quoted only when the stay itself moved.
     *
     * Different dates are a different stay, so a new price is the honest
     * answer. A rate edited afterwards is not: the quote is what was agreed at
     * the time, and recomputing it on every save would make every past booking
     * a moving number that changes whenever somebody adjusts next season.
     *
     * A plan moved onto another room type is dropped rather than carried, for
     * the same reason the room is: it would price this stay at another type's
     * money.
     */
    let ratePlanId = current.rate_plan_id;
    if (groupId !== current.group_id) {
      const stillFits = ratePlanId
        ? await client.query(
            'SELECT id FROM rate_plans WHERE id = $1 AND group_id = $2',
            [ratePlanId, groupId]
          )
        : { rows: [] };
      if (!stillFits.rows[0]) ratePlanId = null;
    }

    const moved =
      arrival !== current.arrival ||
      departure !== current.departure ||
      ratePlanId !== current.rate_plan_id;

    const totalMinor = moved
      ? await quoteOn(client, { planId: ratePlanId, arrival, departure })
      : current.total_minor;

    const updated = await client.query(
      `UPDATE bookings
          SET group_id = $2, room_id = $3, guest_name = $4, guest_email = $5,
              guest_phone = $6, adults = $7, children = $8,
              arrival = $9, departure = $10, notes = $11,
              rate_plan_id = $12, total_minor = $13, updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [
        id,
        groupId,
        roomId,
        guestName,
        pick('guestEmail', current.guest_email) || null,
        pick('guestPhone', current.guest_phone) || null,
        adults,
        children,
        arrival,
        departure,
        (() => {
          const note = pick('notes', current.notes);
          return note ? String(note).slice(0, NOTE_MAX) : null;
        })(),
        ratePlanId,
        totalMinor,
      ]
    );

    let next = updated.rows[0];
    if (next.room_id && HOLDS_INVENTORY.includes(next.status)) {
      await holdNights(client, next);
    }

    // Whose stay it is follows the guest's details: a corrected email that
    // belongs to a returning guest joins this stay to them; otherwise the
    // booking's own customer gains what was added. Or the desk picked one.
    const contactMoved =
      (next.guest_email || '') !== (current.guest_email || '') ||
      (next.guest_phone || '') !== (current.guest_phone || '');
    if (input.customerId || contactMoved || !next.customer_id) {
      const customer = await customers.attach(client, {
        subscriberId,
        customerId: input.customerId || null,
        fallbackId: next.customer_id,
        name: next.guest_name,
        email: next.guest_email,
        phone: next.guest_phone,
      });
      if (customer !== next.customer_id) {
        const was = next.customer_id;
        next = (
          await client.query('UPDATE bookings SET customer_id = $2 WHERE id = $1 RETURNING *', [id, customer])
        ).rows[0];
        // The customer this stay left, when it was their only one and nobody
        // wrote anything about them: an empty name in the list helps no one.
        if (was) {
          await client.query(
            `DELETE FROM customers
              WHERE id = $1 AND notes IS NULL
                AND NOT EXISTS (SELECT 1 FROM bookings WHERE customer_id = $1)`,
            [was]
          );
        }
      }
    }

    return toRecord(next);
  });
}

/* --------------------------------------------------------------- assigning */

/**
 * Put a booking in a room, move it between rooms, or take it out of one.
 *
 * This is what the calendar's drag and drop will call. Delete then insert
 * inside one transaction: moving a stay one room along would otherwise clash
 * with itself on every night, since its old nights are still held while the
 * new ones go in.
 *
 * @param {{subscriberId: number, id: number, roomId: number|null}} input
 */
async function assign({ subscriberId, id, roomId }) {
  return tx(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND subscriber_id = $2 FOR UPDATE',
      [id, subscriberId]
    );
    const booking = rows[0];
    if (!booking) throw fail(404, 'No such booking.');

    if (roomId !== null) {
      const check = await client.query(
        'SELECT id FROM rooms WHERE id = $1 AND subscriber_id = $2 AND group_id = $3 AND status = $4',
        [roomId, subscriberId, booking.group_id, 'active']
      );
      if (!check.rows[0]) {
        throw fail(404, 'No room like that is available in this room type.');
      }
    }

    await client.query('DELETE FROM room_nights WHERE booking_id = $1', [id]);

    const updated = await client.query(
      'UPDATE bookings SET room_id = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [id, roomId]
    );

    const next = updated.rows[0];
    if (roomId && HOLDS_INVENTORY.includes(next.status)) {
      await holdNights(client, next);
    }

    return toRecord(next);
  });
}

/**
 * Change a stay's status.
 *
 * Cancelling and no-show give the nights back at once; the booking row keeps
 * the status as the record of what happened. Anything else re-takes them, so a
 * cancellation reversed on the same day gets the room back only if nobody else
 * has taken it — which is the truth, and better told now than at check-in.
 */
async function setStatus({ subscriberId, id, status }) {
  const allowed = ['confirmed', 'in_house', 'checked_out', 'cancelled', 'no_show'];
  if (!allowed.includes(status)) throw fail(400, 'Not a status.');

  const result = await tx(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND subscriber_id = $2 FOR UPDATE',
      [id, subscriberId]
    );
    if (!rows[0]) throw fail(404, 'No such booking.');

    // Nobody can be checked into a room they have not got. An in-house stay
    // with no room is a guest the property cannot find, cannot clean up after,
    // and cannot stop somebody else being sold — the one state that has to be
    // impossible rather than merely discouraged.
    if (status === 'in_house' && !rows[0].room_id) {
      throw fail(409, 'Give them a room first — you cannot check in to nowhere.');
    }

    // Who cancelled and when, kept only while it stays cancelled: a desk that
    // reinstates a stay has un-cancelled it.
    const updated = await client.query(
      `UPDATE bookings SET status = $2, updated_at = now(),
              cancelled_at = CASE WHEN $2 = 'cancelled' THEN coalesce(cancelled_at, now()) END,
              cancelled_by = CASE WHEN $2 = 'cancelled' THEN coalesce(cancelled_by, 'venue') END
        WHERE id = $1 RETURNING *`,
      [id, status]
    );
    const next = updated.rows[0];

    await client.query('DELETE FROM room_nights WHERE booking_id = $1', [id]);
    if (next.room_id && HOLDS_INVENTORY.includes(next.status)) {
      await holdNights(client, next);
    }

    /*
     * Checking out dirties the room, in the same transaction.
     *
     * The entire value of tracking housekeeping is that it keeps itself. A
     * state somebody has to remember to set is a state that is wrong by
     * lunchtime, and a room wrongly marked clean is how a guest is walked into
     * somebody else's towels.
     *
     * Only on the way out. Cancelling and no-show do not dirty a room nobody
     * slept in, and re-marking a stay that was already checked out does not
     * dirty a room that has since been cleaned — hence the check against what
     * the status was before this call.
     */
    if (
      next.room_id &&
      next.status === 'checked_out' &&
      rows[0].status !== 'checked_out'
    ) {
      await client.query(
        "UPDATE rooms SET housekeeping = 'dirty', updated_at = now() WHERE id = $1",
        [next.room_id]
      );
    }

    /*
     * What the guest gets told, gathered here and sent after the commit.
     *
     * Only on the way in, and only once: the check against the previous status
     * is what stops a desk re-marking an in-house stay and mailing the guest
     * their own welcome a second time.
     */
    const welcome =
      next.status === 'in_house' && rows[0].status !== 'in_house'
        ? {
            to: next.guest_email,
            guestName: next.guest_name,
            arrival: next.arrival,
            departure: next.departure,
            roomId: next.room_id,
          }
        : null;

    // A marketplace guest is told when the venue cancels their booking.
    const cancelledRef =
      next.status === 'cancelled' && rows[0].status !== 'cancelled' && next.reference ? next.reference : null;

    return { record: toRecord(next), welcome, cancelledRef };
  });

  if (result.cancelledRef) {
    // Required here rather than at the top: marketplace.js reads rates.js and
    // tariff.js, and keeping this module's own imports free of it keeps the
    // dependency one way.
    void require('./marketplace').tellGuestCancelled(result.cancelledRef);
  }

  // Fired, not awaited. A check-in happens with somebody standing at a desk,
  // and it must not wait on a mail server — nor fail because of one. The
  // function below swallows every error it can have.
  if (result.welcome) {
    void sendWelcome({ subscriberId, welcome: result.welcome });
  }

  return result.record;
}

/**
 * The note a guest gets on being checked in.
 *
 * Outside the transaction, and outside the caller's path entirely: a check-in
 * is a thing that happened at a desk with somebody standing at it, and it must
 * not fail because a mail server did. Every failure here is logged and
 * swallowed.
 *
 * Nothing is sent without an address. An OTA booking often has none, or has a
 * forwarding alias that bounces, and neither is a reason to stop the desk.
 */
async function sendWelcome({ subscriberId, welcome }) {
  if (!welcome?.to || !mailer.configured()) return false;

  try {
    const venue = await one(
      'SELECT name FROM subscribers WHERE id = $1',
      [subscriberId]
    );
    const room = welcome.roomId
      ? await one('SELECT name FROM rooms WHERE id = $1', [welcome.roomId])
      : null;

    const note = emails.welcomeEmail({
      venue: venue?.name ?? '',
      guestName: welcome.guestName,
      roomName: room?.name ?? null,
      arrival: welcome.arrival,
      departure: welcome.departure,
      nights: nights.nightCount(welcome.arrival, welcome.departure),
    });

    await mailer.send({ to: welcome.to, ...note });
    return true;
  } catch (err) {
    console.error('Could not send the welcome email:', err.message);
    return false;
  }
}

/* ----------------------------------------------------------------- reading */

/**
 * Everything the calendar needs for a window of nights, in three queries.
 *
 * The rooms, the nights that are taken, and the stays that have no room yet.
 * Joined in the browser rather than in SQL because the calendar draws a grid of
 * rooms against nights, and a flat join would send the booking's details once
 * per night it occupies — a fortnight's view of a fifty-room property being
 * about seven hundred copies of the same guest name.
 */
async function calendar({ subscriberId, start, days }) {
  const window = nights.window(start, days);
  if (!window.length) throw fail(400, 'That is not a date to start from.');

  const from = window[0];
  const to = window[window.length - 1];

  const taken = await all(
    `SELECT n.room_id, n.night, n.booking_id,
            b.guest_name, b.status, b.arrival, b.departure, b.source
       FROM room_nights n
       JOIN bookings b ON b.id = n.booking_id
      WHERE n.subscriber_id = $1 AND n.night BETWEEN $2 AND $3
      ORDER BY n.room_id, n.night`,
    [subscriberId, from, to]
  );

  // Unassigned stays that touch the window. Departure is exclusive, so a stay
  // leaving on the first night of the window does not overlap it.
  const unassigned = await all(
    `SELECT b.*, g.name AS group_name
       FROM bookings b
       JOIN room_groups g ON g.id = b.group_id
      WHERE b.subscriber_id = $1
        AND b.room_id IS NULL
        AND b.status = ANY($4)
        AND b.arrival <= $3
        AND b.departure > $2
      ORDER BY b.arrival, b.id`,
    [subscriberId, from, to, HOLDS_INVENTORY]
  );

  return {
    start: from,
    nights: window,
    taken: taken.map((row) => ({
      roomId: row.room_id,
      night: row.night,
      bookingId: row.booking_id,
      guestName: row.guest_name,
      status: row.status,
      arrival: row.arrival,
      departure: row.departure,
      source: row.source,
    })),
    unassigned: unassigned.map(toRecord),
  };
}

/**
 * The venue page's bookings widget, in one query.
 *
 * A summary, not a screen. It answers "is anything on fire" — who is due in,
 * who is due out, how full tonight is, and whether anything is blocking either.
 * Everything it shows has a page behind it; nothing here is the only place to
 * find a number.
 *
 * One statement rather than five, because this renders on a page that is mostly
 * about something else. The venue page already makes several calls before it
 * paints, and five more for a widget in the corner would be the slowest thing
 * on it.
 *
 * `today` is passed in rather than computed here: the caller knows the
 * property's timezone, and a date derived from UTC would be yesterday's summary
 * until seven in the morning.
 */
async function summary({ subscriberId, today }) {
  const day = nights.parse(today);
  if (!day) throw fail(400, 'That is not a date.');

  const row = await one(
    `SELECT
       (SELECT count(*) FROM rooms
         WHERE subscriber_id = $1 AND status = 'active') AS rooms,
       (SELECT count(*) FROM rooms
         WHERE subscriber_id = $1 AND housekeeping = 'dirty') AS dirty,
       (SELECT count(*) FROM bookings
         WHERE subscriber_id = $1 AND status <> 'cancelled'
           AND arrival = $2::date) AS arrivals,
       (SELECT count(*) FROM bookings
         WHERE subscriber_id = $1 AND status = 'confirmed'
           AND arrival = $2::date) AS to_check_in,
       (SELECT count(*) FROM bookings
         WHERE subscriber_id = $1 AND status <> 'cancelled'
           AND departure = $2::date) AS departures,
       (SELECT count(*) FROM bookings
         WHERE subscriber_id = $1 AND status = 'in_house'
           AND departure = $2::date) AS to_check_out,
       (SELECT count(*) FROM bookings
         WHERE subscriber_id = $1 AND status = ANY($3)
           AND arrival <= $2::date AND departure > $2::date) AS staying,
       (SELECT count(*) FROM bookings
         WHERE subscriber_id = $1 AND status = ANY($3)
           AND room_id IS NULL
           AND arrival <= $2::date AND departure > $2::date) AS unassigned,
       (SELECT count(*) FROM booking_guests g
          JOIN bookings b ON b.id = g.booking_id
         WHERE g.subscriber_id = $1
           AND g.notified_at IS NULL
           AND b.status <> 'cancelled'
           -- A week back: the duty is 24 hours, so a window of today alone
           -- would hide exactly the arrivals already overdue.
           AND b.arrival BETWEEN $2::date - 7 AND $2::date
           -- Only the guests the TM30 page would actually list. This count
           -- used to include Thai nationals, so the widget said three needed
           -- notifying over a page showing two — and a number nobody can
           -- reconcile is a number people stop reading. The shape of the rule
           -- is repeated here rather than the list of nationalities; see
           -- tm30.reportable, which this has to agree with.
           AND coalesce(
                 g.tm30_required,
                 upper(btrim(coalesce(g.nationality, ''))) <> ALL($4::text[])
               )) AS tm30_pending`,
    [subscriberId, day, HOLDS_INVENTORY, tm30.NOT_REPORTABLE]
  );

  const rooms = count(row?.rooms);
  const staying = count(row?.staying);

  return {
    date: day,
    rooms,
    // Rooms sold tonight over rooms that exist. Zero rather than a division by
    // zero for a property that has not set its rooms up yet.
    occupancy: rooms > 0 ? Math.round((staying / rooms) * 100) : 0,
    staying,
    arrivals: count(row?.arrivals),
    toCheckIn: count(row?.to_check_in),
    departures: count(row?.departures),
    toCheckOut: count(row?.to_check_out),
    // The three things that need somebody: a stay with no room, a room that
    // needs cleaning, a guest not yet notified to Immigration.
    unassigned: count(row?.unassigned),
    dirty: count(row?.dirty),
    tm30Pending: count(row?.tm30_pending),
  };
}

/**
 * Bookings, filtered, newest arrival first.
 *
 * The screen behind this is a list somebody scans rather than a grid they read,
 * so it answers the questions a calendar cannot: who is cancelled, who has no
 * room yet, what did that guest book in March.
 *
 * Three things are worth knowing about how it is built.
 *
 * The WHERE is assembled rather than written out with `($n IS NULL OR ...)` for
 * every filter. Six optional filters against three date modes is eighteen
 * shapes, and the one that goes wrong is always the combination nobody thought
 * to try.
 *
 * Paging is keyset, not OFFSET. This list is read while bookings are being
 * taken underneath it, and an offset shifts by one every time a row lands above
 * the window — which shows the reader the same stay twice and skips another. A
 * booking that appears to have vanished is the one failure a reservations list
 * cannot have.
 *
 * And one row past the limit is fetched rather than counted, so "is there
 * another page" costs nothing. The total is a separate statement because people
 * do want it, and it runs alongside rather than after.
 */
async function list(input) {
  const { subscriberId } = input;
  const {
    statuses = null,
    groupId = null,
    roomId = null,
    from = null,
    to = null,
    on = 'stay',
    q = '',
    limit = bookingfilter.DEFAULT_LIMIT,
    cursor = null,
  } = input;

  const params = [subscriberId];
  const where = ['b.subscriber_id = $1'];
  const add = (value) => `$${params.push(value)}`;

  if (statuses) where.push(`b.status = ANY(${add(statuses)}::text[])`);
  if (groupId) where.push(`b.group_id = ${add(groupId)}`);

  if (roomId === bookingfilter.NO_ROOM) {
    where.push('b.room_id IS NULL');
  } else if (roomId) {
    where.push(`b.room_id = ${add(roomId)}`);
  }

  if (from || to) {
    const start = from ?? '0001-01-01';
    const end = to ?? '9999-12-31';
    if (on === 'arrival') {
      where.push(`b.arrival BETWEEN ${add(start)}::date AND ${add(end)}::date`);
    } else if (on === 'departure') {
      where.push(`b.departure BETWEEN ${add(start)}::date AND ${add(end)}::date`);
    } else {
      // Overlap, the half-open way: a stay departing on the first day of the
      // window was gone that morning and did not occupy it.
      where.push(
        `b.arrival <= ${add(end)}::date AND b.departure > ${add(start)}::date`
      );
    }
  }

  if (q) {
    // % and _ are harmless inside a %...% wrap — the worst a guest called
    // "A_B" can do is match more than they meant, which is a search box
    // behaving oddly rather than a way into the query.
    const like = `%${q}%`;
    where.push(
      `(b.guest_name ILIKE ${add(like)} OR b.guest_email ILIKE ${add(like)})`
    );
  }

  const filtered = where.join('\n       AND ');

  const paged = [...params];
  const addPaged = (value) => `$${paged.push(value)}`;
  let keyset = '';
  if (cursor) {
    // Row comparison, not two hand-written halves. `(arrival, id) < (x, y)` is
    // one expression that matches the ORDER BY exactly; the version spelled out
    // with OR is where duplicated and skipped rows come from on a day that has
    // more arrivals than a page.
    keyset = `\n       AND (b.arrival, b.id) < (${addPaged(cursor.arrival)}::date, ${addPaged(cursor.id)}::int)`;
  }
  const limitParam = addPaged(limit + 1);

  const [rows, totals] = await Promise.all([
    all(
      `SELECT b.*, g.name AS group_name, r.name AS room_name
         FROM bookings b
         JOIN room_groups g ON g.id = b.group_id
         LEFT JOIN rooms r ON r.id = b.room_id
        WHERE ${filtered}${keyset}
        ORDER BY b.arrival DESC, b.id DESC
        LIMIT ${limitParam}`,
      paged
    ),
    one(`SELECT count(*) AS total FROM bookings b WHERE ${filtered}`, params),
  ]);

  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  const lastRow = page[page.length - 1];

  return {
    bookings: page.map(toRecord),
    // Postgres returns count() as a string. Every one of these in this codebase
    // is coerced for the same reason: '12' + 1 is '121'.
    total: count(totals?.total),
    nextCursor: more && lastRow ? bookingfilter.formatCursor(lastRow) : null,
    filters: { statuses, groupId, roomId, from, to, on, q, limit },
  };
}

/** One booking, scoped to its venue. */
async function get({ subscriberId, id }) {
  const row = await one(
    `SELECT b.*, g.name AS group_name, r.name AS room_name,
            (SELECT count(*) FROM bookings x
              WHERE x.customer_id = b.customer_id
                AND x.status NOT IN ('cancelled', 'no_show')) AS customer_stays
       FROM bookings b
       JOIN room_groups g ON g.id = b.group_id
       LEFT JOIN rooms r ON r.id = b.room_id
      WHERE b.id = $1 AND b.subscriber_id = $2`,
    [id, subscriberId]
  );
  if (!row) throw fail(404, 'No such booking.');
  return toRecord(row);
}

/** Arrivals, departures and who is in house, for a single day. */
async function onDate({ subscriberId, date }) {
  const day = nights.parse(date);
  if (!day) throw fail(400, 'That is not a date.');

  const rows = await all(
    `SELECT b.*, g.name AS group_name, r.name AS room_name
       FROM bookings b
       JOIN room_groups g ON g.id = b.group_id
       LEFT JOIN rooms r ON r.id = b.room_id
      WHERE b.subscriber_id = $1
        AND b.status <> 'cancelled'
        AND b.arrival <= $2 AND b.departure >= $2
      ORDER BY b.arrival, lower(b.guest_name)`,
    [subscriberId, day]
  );

  const list = rows.map(toRecord);

  // Every room, with what state it is in. The desk needs this beside the
  // arrivals rather than on another screen: "can I put them in yet" is the
  // question being asked, and the answer is a property of the room.
  const roomRows = await all(
    `SELECT r.id, r.name, r.status, r.housekeeping, r.group_id, g.name AS group_name
       FROM rooms r
       JOIN room_groups g ON g.id = r.group_id
      WHERE r.subscriber_id = $1
      ORDER BY g.sort, lower(g.name), r.sort, lower(r.name)`,
    [subscriberId]
  );

  const arrivals = list.filter((b) => b.arrival === day);
  const departures = list.filter((b) => b.departure === day);
  const inHouse = list.filter((b) => b.arrival <= day && b.departure > day);

  return {
    date: day,
    arrivals,
    departures,
    // Here for the night of `day`: arrived on or before it, leaving after it.
    inHouse,
    rooms: roomRows.map((row) => ({
      id: row.id,
      name: row.name,
      // The type, by id as well as by name: the housekeeping checklist is
      // per type, and matching on a name is a bug waiting for two types to
      // be called the same thing.
      groupId: row.group_id,
      groupName: row.group_name,
      status: row.status,
      housekeeping: row.housekeeping,
    })),
    counts: {
      arrivals: arrivals.length,
      departures: departures.length,
      inHouse: inHouse.length,
      // The two numbers somebody actually chases during a morning.
      toCheckIn: arrivals.filter((b) => b.status === 'confirmed').length,
      toCheckOut: departures.filter((b) => b.status === 'in_house').length,
      dirty: roomRows.filter((r) => r.housekeeping === 'dirty').length,
      // An arrival with no room is the thing that blocks a check-in, so it is
      // counted rather than left to be noticed.
      unassignedArrivals: arrivals.filter((b) => !b.roomId).length,
    },
  };
}

/**
 * Whether the stay is paid: not paid, a deposit, paid, or refunded. Said by
 * the desk — there is no card payment behind it yet — and kept apart from the
 * stay's own status, because a guest can be checked out and still owe.
 */
async function setPayment({ subscriberId, id, status }) {
  if (!customers.PAYMENT.includes(status)) throw fail(400, 'Not a payment status.');
  const row = await one(
    `UPDATE bookings SET payment_status = $3, updated_at = now()
      WHERE id = $1 AND subscriber_id = $2 RETURNING id`,
    [id, subscriberId, status]
  );
  if (!row) throw fail(404, 'No such booking.');
  return get({ subscriberId, id });
}

module.exports = {
  HOLDS_INVENTORY,
  setPayment,
  list,
  summary,
  create,
  update,
  assign,
  setStatus,
  calendar,
  get,
  onDate,
};
