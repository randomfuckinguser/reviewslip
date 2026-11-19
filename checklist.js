'use strict';

/**
 * What has to be done in a room, and how much of it has been.
 *
 * "Mark clean" was one button, which is one bit of information about twenty
 * minutes of work. It is enough for the desk — can somebody be put in there —
 * and it is nothing at all for the person doing the work, who has to hold the
 * standard in their head and remember whether they did the kettle.
 *
 * So a list, per room type, because the work genuinely differs: a loft has a
 * staircase, a family suite has a sofa bed, and a bungalow has neither. An
 * item with no type on it belongs to every room, which is where most of them
 * end up — the bathroom gets cleaned whatever the room is called.
 *
 * Pure. The rules for what a room's list is and when it counts as done can be
 * tested without a database, which matters because "done" is the thing the
 * desk reads.
 */

/**
 * Long enough to be a standard, short enough that somebody reads it.
 *
 * Counted per room: the lines for every room plus that type's own, which is
 * the list a housekeeper actually reads. Counting the whole venue instead
 * meant a lodge with four room types ran out of lines before each type had
 * anything of its own.
 */
const MAX_ITEMS = 30;

/** Every line the venue has, across all its types: only a backstop. */
const MAX_VENUE_ITEMS = 150;
const MAX_LABEL = 80;

/**
 * Areas: the parts of a room the list is grouped into — Bedroom, Bathroom.
 *
 * Each has a photograph of how it should be left, and each gets a photograph
 * of how it was left: the housekeeper takes one when the area is done, so the
 * owner can see the result without walking the corridor. A dozen is more
 * areas than any room has.
 */
const MAX_AREAS = 12;
const MAX_AREA_NAME = 40;

/** How long the housekeepers' photographs are kept, in days. */
const KEEP_RESULTS_DAYS = 14;

/**
 * The usual list, for a venue starting from nothing.
 *
 * The three things a guest notices first when they were missed. Added on a
 * tap from the dashboard rather than to every venue unasked, so nobody finds
 * lines in their standard that they did not write.
 */
const STARTER = [
  { area: 'Bedroom', label: 'Beds made' },
  { area: 'Bathroom', label: 'Toilet paper replaced' },
  { area: 'Bathroom', label: '4 towels in the room' },
];

function clean(value, max = MAX_LABEL) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * @returns {string|null} why the label will not do, or null if it will
 */
function checkLabel(value) {
  const label = clean(value);
  if (!label) return 'Write what needs doing.';
  if (label.length < 2) return 'That is too short to be an instruction.';
  return null;
}

/**
 * @returns {string|null} why the area name will not do, or null if it will
 */
function checkAreaName(value) {
  const name = clean(value, MAX_AREA_NAME);
  if (!name) return 'Name the area — Bedroom, Bathroom.';
  if (name.length < 2) return 'That is too short to be an area.';
  return null;
}

/**
 * Which of the usual lines a venue does not have yet.
 *
 * Matched on the words, ignoring case, so a venue that already wrote "Beds
 * made" is not given a second one.
 *
 * @param {object[]} items - the venue's lines, with label
 */
function missingStarter(items) {
  const have = new Set((items ?? []).map((i) => clean(i.label).toLowerCase()));
  return STARTER.filter((s) => !have.has(s.label.toLowerCase()));
}

/**
 * Why one more line would make a list too long, or null if it fits.
 *
 * A line for one type lengthens that type's list; a line for every room
 * lengthens all of them, so it has to fit the longest.
 *
 * @param {object[]} items - every line the venue has, with groupId
 * @param {number|null} groupId - the type the new line is for, null for every room
 * @returns {string|null}
 */
function tooMany(items, groupId) {
  const every = items ?? [];
  if (every.length >= MAX_VENUE_ITEMS) {
    return `That is already ${MAX_VENUE_ITEMS} lines across every room type.`;
  }
  const shared = every.filter((i) => i.groupId === null || i.groupId === undefined).length;
  const own = new Map();
  for (const i of every) {
    if (i.groupId !== null && i.groupId !== undefined) own.set(i.groupId, (own.get(i.groupId) ?? 0) + 1);
  }
  const longest =
    groupId === null || groupId === undefined
      ? shared + Math.max(0, ...own.values())
      : shared + (own.get(groupId) ?? 0);
  if (longest < MAX_ITEMS) return null;
  return groupId === null || groupId === undefined
    ? `A room's list is already ${MAX_ITEMS} things to check, and a line for every room would make it longer. Add it to one room type, or take a line out first.`
    : `That room type's list is already ${MAX_ITEMS} things to check. A list nobody reads to the end is not a standard.`;
}

/**
 * The list for one room type, in order.
 *
 * Items with no type come first and then the type's own, each block in its own
 * sort order. General before specific because that is the order the work
 * happens in — strip and clean the room, then the thing this room has that the
 * others do not.
 *
 * @param {object[]} items - every item the venue has, any type
 * @param {number|null} groupId - the room type being cleaned
 */
function forGroup(items, groupId) {
  const mine = (items ?? []).filter(
    (i) => i.groupId === null || i.groupId === undefined || i.groupId === groupId
  );

  return mine
    .slice()
    .sort(
      (a, b) =>
        // Null group first: 0 before 1.
        (a.groupId == null ? 0 : 1) - (b.groupId == null ? 0 : 1) ||
        (a.sort ?? 0) - (b.sort ?? 0) ||
        a.id - b.id
    )
    .slice(0, MAX_ITEMS);
}

/**
 * One room's list for today, with what has already been ticked.
 *
 * @param {object[]} items - the list for this room's type, from forGroup
 * @param {Set<number>|number[]} done - item ids already ticked for this room
 * @returns {{items: object[], done: number, total: number, all: boolean}}
 */
function forRoom(items, done) {
  const ticked = done instanceof Set ? done : new Set(done ?? []);
  const list = (items ?? []).map((item) => ({
    id: item.id,
    label: item.label,
    groupId: item.groupId ?? null,
    areaId: item.areaId ?? null,
    // A flag, not the picture. "Bathroom clean" means something different to
    // everybody reading it, and a photograph settles in one glance what the
    // words cannot — but it is fetched from its own route, so a roomful of
    // them is not one download. See checklists.js.
    hasPhoto: Boolean(item.hasPhoto),
    // Ticked by taking a photograph of it, not by a tap.
    needsPhoto: Boolean(item.needsPhoto),
    done: ticked.has(item.id),
  }));

  const count = list.filter((i) => i.done).length;
  return {
    items: list,
    done: count,
    total: list.length,
    /*
     * A room with no list at all is not "all done" — it is a room with no
     * standard written for it yet, and saying everything is finished would be
     * a claim nobody made. The board shows nothing rather than a tick.
     */
    all: list.length > 0 && count === list.length,
  };
}

module.exports = {
  MAX_ITEMS,
  MAX_VENUE_ITEMS,
  MAX_LABEL,
  MAX_AREAS,
  MAX_AREA_NAME,
  KEEP_RESULTS_DAYS,
  STARTER,
  clean,
  checkLabel,
  checkAreaName,
  missingStarter,
  tooMany,
  forGroup,
  forRoom,
};
