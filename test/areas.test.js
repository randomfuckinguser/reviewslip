'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const checklist = require('../checklist');

/* The usual list: what a venue starting from nothing is offered. */

test('the usual list is beds made, toilet paper and four towels, in areas', () => {
  assert.deepEqual(checklist.STARTER, [
    { area: 'Bedroom', label: 'Beds made' },
    { area: 'Bathroom', label: 'Toilet paper replaced' },
    { area: 'Bathroom', label: '4 towels in the room' },
  ]);
});

test('only the usual lines a venue does not have are offered', () => {
  assert.equal(checklist.missingStarter([]).length, 3);

  // Matched on the words, whatever the case or spacing.
  const missing = checklist.missingStarter([{ label: '  beds  MADE ' }, { label: 'Floors mopped' }]);
  assert.deepEqual(missing.map((m) => m.label), ['Toilet paper replaced', '4 towels in the room']);

  assert.deepEqual(
    checklist.missingStarter(checklist.STARTER.map((s) => ({ label: s.label }))),
    []
  );
});

test('an area needs a name', () => {
  assert.ok(checklist.checkAreaName(''));
  assert.ok(checklist.checkAreaName(' x '));
  assert.equal(checklist.checkAreaName('Bathroom'), null);
});

test("a room's list carries each line's area", () => {
  const list = checklist.forGroup(
    [
      { id: 1, groupId: null, areaId: 7, label: 'Beds made', sort: 1 },
      { id: 2, groupId: null, label: 'Floors mopped', sort: 2 },
    ],
    null
  );
  const room = checklist.forRoom(list, [1]);
  assert.deepEqual(
    room.items.map((i) => [i.label, i.areaId, i.done]),
    [
      ['Beds made', 7, true],
      ['Floors mopped', null, false],
    ]
  );
});

/* The limit: counted per room's list, not across the whole venue. */

test("the limit counts a room's own list, so each type can have lines of its own", () => {
  const line = (groupId) => ({ groupId });
  const max = checklist.MAX_ITEMS;
  // 20 lines for every room and 9 for each of four types: 29 per room, and
  // 56 across the venue — far past the old venue-wide count, still allowed.
  const venue = [
    ...Array.from({ length: 20 }, () => line(null)),
    ...[1, 2, 3, 4].flatMap((g) => Array.from({ length: 9 }, () => line(g))),
  ];
  assert.equal(20 + 9, max - 1);
  assert.equal(checklist.tooMany(venue, 1), null);
  assert.equal(checklist.tooMany(venue, null), null);

  // One more for type 1 fills its list; type 2 still has room.
  const full = venue.concat(line(1));
  assert.match(checklist.tooMany(full, 1), /room type's list is already/);
  assert.equal(checklist.tooMany(full, 2), null);
  // A line for every room would push type 1 over, so it is refused.
  assert.match(checklist.tooMany(full, null), /line for every room would make it longer/);
  // A type with no lines of its own yet is counted as the shared lines.
  assert.equal(checklist.tooMany(venue, 99), null);
});

test('the venue as a whole has a backstop', () => {
  const lots = Array.from({ length: checklist.MAX_VENUE_ITEMS }, (_, i) => ({ groupId: i }));
  assert.match(checklist.tooMany(lots, 1), /across every room type/);
});

test('a line can be ticked by a photo instead of a tap, and the board is told so', () => {
  const list = checklist.forGroup(
    [
      { id: 1, groupId: null, areaId: 1, label: 'Beds made', sort: 1 },
      { id: 2, groupId: null, areaId: 2, label: '4 towels in the room', sort: 1, needsPhoto: true },
    ],
    null
  );
  const room = checklist.forRoom(list, [1]);
  assert.deepEqual(room.items.map((i) => [i.label, i.needsPhoto, i.done]), [
    ['Beds made', false, true],
    ['4 towels in the room', true, false],
  ]);
  assert.equal(room.all, false);
});
