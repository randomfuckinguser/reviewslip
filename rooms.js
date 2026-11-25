'use strict';

const roomstatus = require('./roomstatus');

const { one, all } = require('./db');

/**
 * Room types and the physical rooms in them.
 *
 * A guest books a Deluxe Double — a group. Which of the Deluxe Doubles they
 * sleep in is decided later, by somebody looking at the calendar. That split is
 * the whole reason both tables exist: an OTA sells the type, the front desk
 * assigns the room, and a booking is valid in between with no room at all.
 *
 * Everything here is scoped by subscriber_id. A venue that asks for a room by
 * an id belonging to somebody else gets the same "no such room" as one asking
 * for an id that does not exist, which is the only answer that does not confirm
 * the other venue's data.
 */

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

const NAME_MAX = 60;

/** Rooms and groups both need a name somebody will recognise on a calendar. */
function checkName(value, what) {
  const name = String(value ?? '').trim();
  if (!name) return { ok: false, error: `Give the ${what} a name.` };
  if (name.length > NAME_MAX) {
    return { ok: false, error: `A name is at most ${NAME_MAX} characters.` };
  }
  return { ok: true, name };
}

/** Postgres counts are bigints and arrive as strings. */
function count(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/* ------------------------------------------------------------------ shapes */

function toGroup(row) {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    sort: row.sort,
    rooms: count(row.rooms),
  };
}

function toRoom(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    name: row.name,
    status: row.status,
    // Undefined on the rows that predate the column being selected, which the
    // dashboard reads as clean — the same default the column carries.
    housekeeping: row.housekeeping ?? 'clean',
    sort: row.sort,
  };
}

/* ------------------------------------------------------------------ groups */

/** Every room type at a venue, with how many rooms each holds. */
async function listGroups(subscriberId) {
  const rows = await all(
    `SELECT g.*, count(r.id) AS rooms
       FROM room_groups g
       LEFT JOIN rooms r ON r.group_id = g.id
      WHERE g.subscriber_id = $1
      GROUP BY g.id
      ORDER BY g.sort, lower(g.name)`,
    [subscriberId]
  );
  return rows.map(toGroup);
}

async function createGroup({ subscriberId, name, capacity }) {
  const checked = checkName(name, 'room type');
  if (!checked.ok) throw fail(400, checked.error);

  const beds = Number(capacity);
  if (!Number.isSafeInteger(beds) || beds < 1 || beds > 20) {
    throw fail(400, 'Capacity is a number of guests, from 1 to 20.');
  }

  try {
    const row = await one(
      `INSERT INTO room_groups (subscriber_id, name, capacity)
       VALUES ($1, $2, $3)
       RETURNING *, 0 AS rooms`,
      [subscriberId, checked.name, beds]
    );
    return toGroup(row);
  } catch (err) {
    if (err?.code === '23505') {
      throw fail(409, 'There is already a room type with that name.');
    }
    throw err;
  }
}

/**
 * Delete a room type.
 *
 * Refused while it holds bookings — the foreign key is RESTRICT, which would
 * refuse it anyway, but as a constraint violation rather than a sentence. This
 * turns it into one, because "you have stays booked into this type" is
 * something the person can act on.
 *
 * Its rooms go with it, by cascade. Those cannot hold bookings that this check
 * has not already found: a booking always names a group, whether or not it
 * names a room.
 */
async function deleteGroup({ subscriberId, id }) {
  const booked = await one(
    `SELECT count(*) AS n FROM bookings
      WHERE group_id = $1 AND subscriber_id = $2 AND status <> 'cancelled'`,
    [id, subscriberId]
  );

  if (count(booked?.n) > 0) {
    throw fail(
      409,
      'That room type has bookings against it. Cancel or move them first.'
    );
  }

  const row = await one(
    'DELETE FROM room_groups WHERE id = $1 AND subscriber_id = $2 RETURNING id',
    [id, subscriberId]
  );
  if (!row) throw fail(404, 'No such room type.');
  return true;
}

/* ------------------------------------------------------------------- rooms */

/** Every room at a venue, in the order a calendar should draw them. */
async function listRooms(subscriberId) {
  const rows = await all(
    `SELECT r.*, g.name AS group_name, g.sort AS group_sort
       FROM rooms r
       JOIN room_groups g ON g.id = r.group_id
      WHERE r.subscriber_id = $1
      ORDER BY g.sort, lower(g.name), r.sort, lower(r.name)`,
    [subscriberId]
  );
  return rows.map(toRoom);
}

async function createRoom({ subscriberId, groupId, name }) {
  const checked = checkName(name, 'room');
  if (!checked.ok) throw fail(400, checked.error);

  // Checked here rather than relying on the composite key, so naming another
  // venue's group answers "no such room type" instead of a 500 — and without
  // saying whether that id exists somewhere else.
  const group = await one(
    'SELECT id FROM room_groups WHERE id = $1 AND subscriber_id = $2',
    [groupId, subscriberId]
  );
  if (!group) throw fail(404, 'No such room type.');

  try {
    const row = await one(
      `INSERT INTO rooms (subscriber_id, group_id, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [subscriberId, groupId, checked.name]
    );
    return toRoom({ ...row, group_name: null });
  } catch (err) {
    if (err?.code === '23505') {
      throw fail(409, 'There is already a room with that name.');
    }
    throw err;
  }
}

/**
 * Delete a room.
 *
 * Its nights go by cascade, and its bookings are unassigned rather than
 * destroyed — room_id is ON DELETE SET NULL. They reappear as unassigned on the
 * calendar, which somebody can put right. A lost booking cannot be.
 */
async function deleteRoom({ subscriberId, id }) {
  const row = await one(
    'DELETE FROM rooms WHERE id = $1 AND subscriber_id = $2 RETURNING id',
    [id, subscriberId]
  );
  if (!row) throw fail(404, 'No such room.');
  return true;
}

/**
 * Mark a room clean or dirty.
 *
 * Set by hand on the way in — somebody has cleaned it — and by the system on
 * the way out, when a guest checks out. Only those two directions, because a
 * third way to change it is a third place for it to be wrong.
 */
async function setHousekeeping({ subscriberId, id, state }) {
  if (!['clean', 'dirty'].includes(state)) {
    throw fail(400, 'A room is clean or dirty.');
  }

  const row = await one(
    `UPDATE rooms SET housekeeping = $3, updated_at = now(),
            cleaned_at = CASE WHEN $3 = 'clean' THEN now() ELSE cleaned_at END
      WHERE id = $1 AND subscriber_id = $2
      RETURNING *`,
    [id, subscriberId, state]
  );
  if (!row) throw fail(404, 'No such room.');
  return { ...toRoom({ ...row, group_name: null }), housekeeping: row.housekeeping };
}

/**
 * Rooms that need cleaning today because somebody sleeps in them tonight.
 *
 * The rule the venue works to: a room is cleaned before a guest arrives, every
 * day they stay, and after they leave. Leaving is checking out, which dirties
 * the room by itself (bookings.setStatus). This is the other two: a clean room
 * with a stay holding it tonight — arriving today or still staying — and not
 * cleaned since midnight at the venue goes back to dirty. A turnaround is one
 * clean: cleaning after the checkout is cleaning before the arrival.
 *
 * Run before every read of the day (the desk, the housekeeping board, the
 * dashboard) rather than by a timer at midnight: those are the only places the
 * state is looked at, the update finds nothing to do once it has run, and a
 * missed timer would leave a whole morning's rooms showing clean.
 *
 * `today` is the venue's own date, from its timezone, not the server's.
 */
async function markDue({ subscriberId }) {
  await one(
    `WITH venue AS (
       SELECT id, coalesce(timezone, 'Asia/Bangkok') AS tz FROM subscribers WHERE id = $1
     )
     UPDATE rooms r
        SET housekeeping = 'dirty', updated_at = now()
       FROM venue v
      WHERE r.subscriber_id = v.id
        AND r.housekeeping = 'clean'
        AND (r.cleaned_at IS NULL
             OR (r.cleaned_at AT TIME ZONE v.tz)::date < (now() AT TIME ZONE v.tz)::date)
        AND EXISTS (
              SELECT 1 FROM room_nights n
                JOIN bookings b ON b.id = n.booking_id
               WHERE n.room_id = r.id
                 AND n.night = (now() AT TIME ZONE v.tz)::date
                 AND b.status IN ('confirmed', 'in_house'))`,
    [subscriberId]
  );
}

/** One room, with the type it belongs to. Null rather than a throw. */
async function byId({ subscriberId, id }) {
  const row = await one(
    `SELECT r.*, g.name AS group_name
       FROM rooms r
       JOIN room_groups g ON g.id = r.group_id
      WHERE r.id = $1 AND r.subscriber_id = $2`,
    [id, subscriberId]
  );
  return row ? toRoom(row) : null;
}

/**
 * Open, not selling, or renovating.
 *
 * What each of those stops lives in roomstatus.js, because three screens ask
 * the question and a fourth will — the answer has to be in one place or they
 * will drift into disagreeing about whether a held-back room gets cleaned.
 */
async function setStatus({ subscriberId, id, status }) {
  const wanted = roomstatus.usable(status);
  if (!wanted) throw fail(400, 'That is not a state a room can be in.');

  const row = await one(
    `UPDATE rooms SET status = $3, updated_at = now()
      WHERE id = $1 AND subscriber_id = $2
      RETURNING *`,
    [id, subscriberId, wanted]
  );
  if (!row) throw fail(404, 'No such room.');
  return toRoom({ ...row, group_name: null });
}

module.exports = {
  checkName,
  byId,
  setStatus,
  setHousekeeping,
  markDue,
  listGroups,
  createGroup,
  deleteGroup,
  listRooms,
  createRoom,
  deleteRoom,
};
