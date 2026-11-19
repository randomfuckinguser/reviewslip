'use strict';

const { all, one, query } = require('./db');
const checklist = require('./checklist');

/**
 * The checklist in the database: the standard, and the ticks against it.
 *
 * The rules for what a room's list is and when it counts as done live in
 * checklist.js, which is pure. This is the half that reads and writes.
 */

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

function toItem(row) {
  return {
    id: row.id,
    groupId: row.group_id ?? null,
    groupName: row.group_name ?? null,
    areaId: row.area_id ?? null,
    areaName: row.area_name ?? null,
    label: row.label,
    sort: row.sort,
    /*
     * Whether there is a photograph, not the photograph.
     *
     * A standard can run to two dozen lines and each picture is up to 250kB;
     * inlining them would make one list a six megabyte download, every
     * morning, on a phone in a corridor. They are served from their own route
     * instead, so the browser fetches each one once and caches it.
     */
    hasPhoto: Boolean(row.has_photo),
  };
}

/** Every item a venue has, whatever type it belongs to. */
async function items(subscriberId) {
  const rows = await all(
    // Named columns rather than c.*, so the photograph is not read out of the
    // database on every listing only to be thrown away.
    `SELECT c.id, c.group_id, c.area_id, c.label, c.sort,
            (c.photo IS NOT NULL) AS has_photo,
            g.name AS group_name,
            a.name AS area_name
       FROM checklist_items c
       LEFT JOIN room_groups g ON g.id = c.group_id
       LEFT JOIN cleaning_areas a ON a.id = c.area_id
      WHERE c.subscriber_id = $1
      ORDER BY (c.group_id IS NOT NULL), c.sort, c.id`,
    [subscriberId]
  );
  return rows.map(toItem);
}

/**
 * The picture itself, for the route that serves it.
 *
 * Scoped to the venue like everything else here: an item id is a small
 * integer and guessing one belonging to another business must return nothing
 * rather than somebody else's photograph.
 *
 * @returns {Promise<string|null>} the stored data URI
 */
async function photo({ subscriberId, id }) {
  const row = await one(
    'SELECT photo FROM checklist_items WHERE id = $1 AND subscriber_id = $2',
    [id, subscriberId]
  );
  return row?.photo ?? null;
}

/**
 * Attach a photograph to a line, or take it off with null.
 *
 * The bytes are checked by the caller against assets.isStoredPhoto — raster
 * only, and capped — because this module does not know what a picture is.
 */
async function setPhoto({ subscriberId, id, photo: value }) {
  const row = await one(
    `UPDATE checklist_items
        SET photo = $3
      WHERE id = $1 AND subscriber_id = $2
      RETURNING id, (photo IS NOT NULL) AS has_photo`,
    [id, subscriberId, value ?? null]
  );
  if (!row) throw fail(404, 'No such item.');
  return { id: row.id, hasPhoto: Boolean(row.has_photo) };
}

/**
 * Add a line to the standard.
 *
 * `groupId` null means every room. The type is checked against this venue's
 * own groups rather than trusted, because the id arrives from a form.
 */
async function add({ subscriberId, groupId = null, areaId = null, label }) {
  const wrong = checklist.checkLabel(label);
  if (wrong) throw fail(400, wrong);

  let group = null;
  if (groupId !== null && groupId !== undefined && groupId !== '') {
    const found = await one(
      'SELECT id FROM room_groups WHERE id = $1 AND subscriber_id = $2',
      [Number(groupId), subscriberId]
    );
    if (!found) throw fail(404, 'No such room type.');
    group = found.id;
  }

  // Counted against the list it lands in, not the whole venue: see MAX_ITEMS.
  const crowded = checklist.tooMany(
    await all('SELECT group_id AS "groupId" FROM checklist_items WHERE subscriber_id = $1', [subscriberId]),
    group
  );
  if (crowded) throw fail(400, crowded);

  // The area, like the type, checked against this venue's own.
  let area = null;
  if (areaId !== null && areaId !== undefined && areaId !== '') {
    const found = await one(
      'SELECT id FROM cleaning_areas WHERE id = $1 AND subscriber_id = $2',
      [Number(areaId), subscriberId]
    );
    if (!found) throw fail(404, 'No such area.');
    area = found.id;
  }

  // Appended, so a new line lands at the bottom of the list it belongs to
  // rather than in the middle of a sequence somebody arranged.
  const last = await one(
    `SELECT coalesce(max(sort), 0) AS n FROM checklist_items
      WHERE subscriber_id = $1 AND group_id IS NOT DISTINCT FROM $2`,
    [subscriberId, group]
  );

  const row = await one(
    `INSERT INTO checklist_items (subscriber_id, group_id, area_id, label, sort)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [subscriberId, group, area, checklist.clean(label), Number(last?.n ?? 0) + 1]
  );
  return toItem(row);
}

/** Take a line out. Its ticks go with it — see the migration. */
async function remove({ subscriberId, id }) {
  const row = await one(
    'DELETE FROM checklist_items WHERE id = $1 AND subscriber_id = $2 RETURNING id',
    [id, subscriberId]
  );
  if (!row) throw fail(404, 'No such item.');
  return { id: row.id };
}

/**
 * One room's list for a day, with what has been ticked.
 *
 * @returns {Promise<{items: object[], done: number, total: number, all: boolean}>}
 */
async function forRoom({ subscriberId, roomId, groupId, day }) {
  const [every, ticks, venueAreas, taken] = await Promise.all([
    items(subscriberId),
    all(
      'SELECT item_id FROM room_checks WHERE subscriber_id = $1 AND room_id = $2 AND on_day = $3',
      [subscriberId, roomId, day]
    ),
    areas(subscriberId),
    all(
      `SELECT area_id, taken_at FROM room_area_photos
        WHERE subscriber_id = $1 AND room_id = $2 AND on_day = $3`,
      [subscriberId, roomId, day]
    ),
  ]);

  const takenAt = new Map(taken.map((t) => [t.area_id, t.taken_at]));
  return {
    ...checklist.forRoom(checklist.forGroup(every, groupId), ticks.map((t) => t.item_id)),
    /*
     * Every area, with whether it has been photographed today. All of them
     * rather than only those with lines for this type: an area with no lines
     * still gets its photograph taken.
     */
    areas: venueAreas.map((a) => ({
      id: a.id,
      name: a.name,
      hasPhoto: a.hasPhoto,
      takenAt: takenAt.get(a.id) ?? null,
    })),
  };
}

/**
 * Every room's progress for a day, keyed by room id.
 *
 * One query rather than one per room: the board draws twenty-odd rooms and a
 * round trip each would be the slowest thing on a screen that is opened on a
 * phone in a corridor.
 */
async function progress({ subscriberId, day, rooms }) {
  const every = await items(subscriberId);
  const ticks = await all(
    'SELECT room_id, item_id FROM room_checks WHERE subscriber_id = $1 AND on_day = $2',
    [subscriberId, day]
  );

  const byRoom = new Map();
  for (const t of ticks) {
    const set = byRoom.get(t.room_id);
    if (set) set.add(t.item_id);
    else byRoom.set(t.room_id, new Set([t.item_id]));
  }

  const out = new Map();
  for (const room of rooms) {
    const list = checklist.forGroup(every, room.groupId ?? null);
    out.set(room.id, checklist.forRoom(list, byRoom.get(room.id) ?? new Set()));
  }
  return out;
}

/**
 * Tick one, or untick it.
 *
 * The insert does nothing when it is already there, so a second tap on a bad
 * signal is harmless rather than an error somebody sees in a corridor.
 */
async function setChecked({ subscriberId, roomId, itemId, day, done }) {
  const room = await one(
    'SELECT id FROM rooms WHERE id = $1 AND subscriber_id = $2',
    [roomId, subscriberId]
  );
  if (!room) throw fail(404, 'No such room.');

  const item = await one(
    'SELECT id FROM checklist_items WHERE id = $1 AND subscriber_id = $2',
    [itemId, subscriberId]
  );
  if (!item) throw fail(404, 'No such item.');

  if (done) {
    await query(
      `INSERT INTO room_checks (subscriber_id, room_id, item_id, on_day)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (room_id, item_id, on_day) DO NOTHING`,
      [subscriberId, roomId, itemId, day]
    );
  } else {
    await query(
      'DELETE FROM room_checks WHERE room_id = $1 AND item_id = $2 AND on_day = $3',
      [roomId, itemId, day]
    );
  }

  return { itemId, done: Boolean(done) };
}

/**
 * Start the room again.
 *
 * Called when a room is put back to dirty: the ticks described a room that no
 * longer exists in that state, and leaving them would tell the next person the
 * work was already done.
 */
async function clearRoom({ subscriberId, roomId, day }) {
  await query(
    'DELETE FROM room_checks WHERE subscriber_id = $1 AND room_id = $2 AND on_day = $3',
    [subscriberId, roomId, day]
  );
  // The photographs too: they show a room that is not in that state any more.
  await query(
    'DELETE FROM room_area_photos WHERE subscriber_id = $1 AND room_id = $2 AND on_day = $3',
    [subscriberId, roomId, day]
  );
}

/* ------------------------------------------------------------------ areas */

function toArea(row) {
  return {
    id: row.id,
    name: row.name,
    sort: row.sort,
    // A flag, not the picture: see toItem.
    hasPhoto: Boolean(row.has_photo),
  };
}

/** A venue's areas, in order. */
async function areas(subscriberId) {
  const rows = await all(
    `SELECT id, name, sort, (photo IS NOT NULL) AS has_photo
       FROM cleaning_areas
      WHERE subscriber_id = $1
      ORDER BY sort, id`,
    [subscriberId]
  );
  return rows.map(toArea);
}

/** Add an area, at the end. A name the venue already has is refused. */
async function addArea({ subscriberId, name }) {
  const wrong = checklist.checkAreaName(name);
  if (wrong) throw fail(400, wrong);
  const tidy = checklist.clean(name, checklist.MAX_AREA_NAME);

  const existing = await all(
    'SELECT lower(name) AS name FROM cleaning_areas WHERE subscriber_id = $1',
    [subscriberId]
  );
  if (existing.length >= checklist.MAX_AREAS) {
    throw fail(400, `That is already ${checklist.MAX_AREAS} areas.`);
  }
  if (existing.some((a) => a.name === tidy.toLowerCase())) {
    throw fail(409, `There is already an area called ${tidy}.`);
  }

  const last = await one(
    'SELECT coalesce(max(sort), 0) AS n FROM cleaning_areas WHERE subscriber_id = $1',
    [subscriberId]
  );
  const row = await one(
    `INSERT INTO cleaning_areas (subscriber_id, name, sort)
     VALUES ($1, $2, $3)
     RETURNING id, name, sort, false AS has_photo`,
    [subscriberId, tidy, Number(last?.n ?? 0) + 1]
  );
  return toArea(row);
}

/**
 * Take an area out. Its lines stay, as lines for the whole room: losing
 * somebody's written standard because they tidied the headings would be a
 * surprise. Its photographs go.
 */
async function removeArea({ subscriberId, id }) {
  const row = await one(
    'DELETE FROM cleaning_areas WHERE id = $1 AND subscriber_id = $2 RETURNING id',
    [id, subscriberId]
  );
  if (!row) throw fail(404, 'No such area.');
  return { id: row.id };
}

/** An area's picture of how it should be left, as a data URI. */
async function areaPhoto({ subscriberId, id }) {
  const row = await one(
    'SELECT photo FROM cleaning_areas WHERE id = $1 AND subscriber_id = $2',
    [id, subscriberId]
  );
  return row?.photo ?? null;
}

/** Attach the picture, or take it off with null. Checked by the caller. */
async function setAreaPhoto({ subscriberId, id, photo: value }) {
  const row = await one(
    `UPDATE cleaning_areas
        SET photo = $3
      WHERE id = $1 AND subscriber_id = $2
      RETURNING id, (photo IS NOT NULL) AS has_photo`,
    [id, subscriberId, value ?? null]
  );
  if (!row) throw fail(404, 'No such area.');
  return { id: row.id, hasPhoto: Boolean(row.has_photo) };
}

/**
 * The usual list: Bedroom and Bathroom, beds made, toilet paper, four towels.
 *
 * Only what is missing, so pressing it twice, or after writing one of the
 * lines already, adds nothing twice. Areas are matched by name, so a venue
 * that already has a Bathroom gets the lines in its own.
 *
 * @returns {Promise<{added: number}>}
 */
async function starter({ subscriberId }) {
  const missing = checklist.missingStarter(await items(subscriberId));
  let have = await areas(subscriberId);

  for (const line of missing) {
    let area = have.find((a) => a.name.toLowerCase() === line.area.toLowerCase());
    if (!area) {
      area = await addArea({ subscriberId, name: line.area });
      have = have.concat(area);
    }
    await add({ subscriberId, areaId: area.id, label: line.label });
  }

  return { added: missing.length };
}

/* ------------------------------------------------- the housekeepers' photos */

/**
 * The housekeeper's photograph of an area as they left it, or null to take
 * it back. One per room, area and day; a retake replaces it.
 *
 * Photographs older than KEEP_RESULTS_DAYS are dropped here, on the way in,
 * rather than by a timer: the table only grows when somebody adds to it.
 */
async function setResult({ subscriberId, roomId, areaId, day, photo: value }) {
  const room = await one(
    'SELECT id FROM rooms WHERE id = $1 AND subscriber_id = $2',
    [roomId, subscriberId]
  );
  if (!room) throw fail(404, 'No such room.');
  const area = await one(
    'SELECT id FROM cleaning_areas WHERE id = $1 AND subscriber_id = $2',
    [areaId, subscriberId]
  );
  if (!area) throw fail(404, 'No such area.');

  if (value === null || value === undefined) {
    await query(
      'DELETE FROM room_area_photos WHERE room_id = $1 AND area_id = $2 AND on_day = $3',
      [roomId, areaId, day]
    );
    return { areaId, takenAt: null };
  }

  const row = await one(
    `INSERT INTO room_area_photos (subscriber_id, room_id, area_id, on_day, photo)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (room_id, area_id, on_day)
       DO UPDATE SET photo = EXCLUDED.photo, taken_at = now()
     RETURNING taken_at`,
    [subscriberId, roomId, areaId, day, value]
  );

  await query(
    `DELETE FROM room_area_photos
      WHERE subscriber_id = $1 AND on_day < $2::date - $3::int`,
    [subscriberId, day, checklist.KEEP_RESULTS_DAYS]
  );

  return { areaId, takenAt: row.taken_at };
}

/** One housekeeper's photograph, as a data URI. */
async function resultPhoto({ subscriberId, roomId, areaId, day }) {
  const row = await one(
    `SELECT photo FROM room_area_photos
      WHERE subscriber_id = $1 AND room_id = $2 AND area_id = $3 AND on_day = $4`,
    [subscriberId, roomId, areaId, day]
  );
  return row?.photo ?? null;
}

/**
 * What was photographed on a day, room by room, for the owner. The times
 * only; each picture is its own request.
 */
async function results({ subscriberId, day }) {
  const rows = await all(
    `SELECT p.room_id, r.name AS room, g.name AS type,
            p.area_id, a.name AS area, p.taken_at
       FROM room_area_photos p
       JOIN rooms r ON r.id = p.room_id
       LEFT JOIN room_groups g ON g.id = r.group_id
       JOIN cleaning_areas a ON a.id = p.area_id
      WHERE p.subscriber_id = $1 AND p.on_day = $2
      ORDER BY r.sort, r.id, a.sort, a.id`,
    [subscriberId, day]
  );

  const byRoom = new Map();
  for (const r of rows) {
    let room = byRoom.get(r.room_id);
    if (!room) {
      room = { roomId: r.room_id, room: r.room, type: r.type ?? null, areas: [] };
      byRoom.set(r.room_id, room);
    }
    room.areas.push({ areaId: r.area_id, area: r.area, takenAt: r.taken_at });
  }
  return [...byRoom.values()];
}

module.exports = {
  items,
  add,
  remove,
  photo,
  setPhoto,
  forRoom,
  progress,
  setChecked,
  clearRoom,
  areas,
  addArea,
  removeArea,
  areaPhoto,
  setAreaPhoto,
  starter,
  setResult,
  resultPhoto,
  results,
};
