'use strict';

const roomstatus = require('./roomstatus');

/**
 * What each room needs doing today.
 *
 * Pure: bookings and rooms in, a board out. No database and no network, so the
 * ordering — which is the whole value of this screen — can be tested against
 * made-up days rather than by waiting for a real morning to go wrong.
 *
 * The board is for housekeepers, not for the desk, and that decides what is on
 * it. A housekeeper needs to know which room, what state it is in, what is
 * happening to it today and how many people are coming. They do not need the
 * guest's name, email or phone, and this deliberately does not carry them: the
 * screen is opened with a PIN that a whole shift shares and that gets written
 * on a whiteboard eventually, so the less it can show the better. A name adds
 * nothing to stripping a bed.
 */

/**
 * The jobs, most urgent first.
 *
 * `rank` orders the board. The order is the argument this module is making, so
 * it is worth saying why it is this one:
 *
 *   A turnaround — somebody left this morning and somebody else arrives this
 *   afternoon — is the only job with a deadline attached to it that is not
 *   under anybody's control. It goes first, always, however clean the room
 *   looks, because the cost of it being late is a guest standing in reception.
 *
 *   An arrival into a dirty room is the same problem one step behind.
 *
 *   A departure with nobody following is real work with no deadline; a
 *   stayover is a refresh; a free clean room is nothing at all and sits at the
 *   bottom where it can be skimmed past.
 */
const JOBS = {
  turnaround: { rank: 0, label: 'Turnaround', note: 'Out today, in today' },
  arrival: { rank: 1, label: 'Arriving', note: 'Guest arriving today' },
  departure: { rank: 2, label: 'Departed', note: 'Guest left today' },
  stayover: { rank: 3, label: 'Staying', note: 'Daily clean, guest still in' },
  free: { rank: 4, label: 'Free', note: 'Nobody in it' },
};

/** Statuses that mean somebody is really in the room. */
const HOLDS = new Set(['confirmed', 'in_house', 'checked_out']);

function heads(booking) {
  const n = Number(booking?.adults ?? 0) + Number(booking?.children ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * One day's work.
 *
 * @param {object} args
 * @param {string} args.date - the day being worked, YYYY-MM-DD
 * @param {Array} args.rooms - id, name, groupName, status, housekeeping
 * @param {Array} args.bookings - anything overlapping the day, with roomId
 * @param {Map} [args.progress] - room id to {done, total, all}, from checklists
 * @returns {{date: string, jobs: object[], counts: object}}
 */
function board({ date, rooms = [], bookings = [], progress = new Map() }) {
  const byRoom = new Map();
  for (const b of bookings) {
    if (!b || !b.roomId) continue;
    if (!HOLDS.has(b.status)) continue;
    const list = byRoom.get(b.roomId);
    if (list) list.push(b);
    else byRoom.set(b.roomId, [b]);
  }

  const jobs = rooms
    /*
     * Whether this room gets cleaned is a property of its status, and the
     * three statuses do not agree about it: a room held back from sale still
     * has to be cleaned — staff, family, a long stay — and a room being
     * retiled does not. Asking roomstatus rather than comparing to 'active'
     * is what keeps this screen and the calendar from drifting apart.
     */
    .filter((r) => roomstatus.cleaned(r.status))
    .map((room) => {
      const mine = byRoom.get(room.id) ?? [];

      const leaving = mine.find((b) => b.departure === date);
      const coming = mine.find((b) => b.arrival === date);
      const staying = mine.find((b) => b.arrival < date && b.departure > date);

      let kind = 'free';
      if (leaving && coming) kind = 'turnaround';
      else if (coming) kind = 'arrival';
      else if (leaving) kind = 'departure';
      else if (staying) kind = 'stayover';

      const job = JOBS[kind];
      const dirty = room.housekeeping !== 'clean';

      /*
       * How far through the list this room is.
       *
       * Counts only, not the list itself: the board draws twenty rooms and
       * sending every line of every standard would be most of the payload for
       * something nobody has opened yet. The list arrives when a room is
       * tapped.
       */
      const checks = progress.get(room.id) ?? null;

      /*
       * Ready means "a guest could walk into it now", which is not the same as
       * clean. A room that is clean and has somebody arriving is ready; a room
       * that is clean and still has this morning's guest in it until eleven is
       * not the housekeeper's problem yet.
       */
      const ready = !dirty && kind !== 'turnaround' && kind !== 'departure';

      return {
        roomId: room.id,
        room: room.name,
        type: room.groupName ?? null,
        dirty,
        kind,
        label: job.label,
        note: job.note,
        ready,
        /*
         * How many people are coming, when somebody is. It changes the work —
         * a family needs an extra bed made up and more towels — and it is the
         * one thing about a guest this screen has any business knowing.
         */
        guests: coming ? heads(coming) : staying ? heads(staying) : null,
        checks: checks ? { done: checks.done, total: checks.total, all: checks.all } : null,
        // Sorted on, not shown: see the comment on JOBS.
        rank: job.rank + (dirty ? 0 : 0.5),
      };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.type ?? '').localeCompare(b.type ?? '') ||
        a.room.localeCompare(b.room, undefined, { numeric: true })
    );

  return {
    date,
    jobs,
    counts: {
      rooms: jobs.length,
      dirty: jobs.filter((j) => j.dirty).length,
      /*
       * The number somebody is actually chasing: rooms that have to be done
       * before this evening because a guest is coming into them.
       */
      due: jobs.filter((j) => j.dirty && (j.kind === 'turnaround' || j.kind === 'arrival'))
        .length,
      turnarounds: jobs.filter((j) => j.kind === 'turnaround').length,
      /*
       * Rooms somebody has started and not finished.
       *
       * The one number the list itself cannot show at a glance, and the one a
       * supervisor walks the corridor looking for: a room half done is a room
       * where something was interrupted.
       */
      started: jobs.filter((j) => j.checks && j.checks.done > 0 && !j.checks.all).length,
      arrivals: jobs.filter((j) => j.kind === 'arrival' || j.kind === 'turnaround').length,
      departures: jobs.filter((j) => j.kind === 'departure' || j.kind === 'turnaround')
        .length,
    },
  };
}

/** Whether a state somebody sent is one a room can be in. */
function usableState(value) {
  const state = String(value ?? '').trim().toLowerCase();
  return state === 'clean' || state === 'dirty' ? state : null;
}

module.exports = { board, usableState, JOBS, HOLDS };
