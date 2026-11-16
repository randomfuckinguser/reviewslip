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
