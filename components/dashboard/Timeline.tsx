"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { shift } from "@/lib/nights";
import type { Booking, CalendarWindow, Room, TakenNight } from "@/lib/customer";

export interface MoveResult {
  error?: string;
}

/** What a drag is doing to the stay under the pointer. */
type Mode = "move" | "start" | "end";

/** A stay, once, with the room it sits in. */
interface Stay {
  id: number;
  guestName: string;
  status: string;
  arrival: string;
  departure: string;
  roomId: number | null;
  /** Which room type it was booked as, which is true even with no room yet. */
  groupId: number;
  /**
   * How many people, when the grid knows.
   *
   * Null for a stay read off a room-night, which carries the guest's name and
   * the dates and nothing else. Null is "not known here", and a warning is not
   * raised on it — a capacity warning nobody can substantiate is worse than
   * none, because it teaches people to click through warnings.
   */
  heads: number | null;
  source: string;
}

/**
 * A line down the side of the grid.
 *
 * Rooms, and one holding row per type for the bookings that have not been
 * given a room yet. The holding row is a real row and not a list beside the
 * grid, because the question it answers — "where can this one go?" — is
 * answered by the fortnight of nights to the right of it, and an unassigned
 * booking listed somewhere else is one nobody assigns.
 */
type Row =
  | { key: string; kind: "room"; groupId: number; groupName: string | null; room: Room }
  | { key: string; kind: "holding"; groupId: number; groupName: string | null };

/** Where a stay has been dragged to, before the server has agreed. */
interface Ghost {
  id: number;
  /** Null when it is over a holding row: a booking with no room is normal. */
  roomId: number | null;
  groupId: number;
  arrival: string;
  departure: string;
}

const TONE: Record<string, string> = {
  confirmed: "confirmed",
  in_house: "in-house",
  checked_out: "out",
};

/**
 * Rooms down the side, a month of nights across, and stays you can drag.
 *
 * The grid answers the question the month cannot: *which room*. A month of
 * days tells you the 14th is busy; only this tells you that it is busy in
 * every bungalow and the suite is empty, which is the thing somebody moves a
 * booking about.
 *
 * Two layers, the same as the month view. Cells underneath take the clicks for
 * an empty night; stays sit on top as absolutely positioned bars, because a bar
 * that is a run of table cells cannot be dragged as one object, and dragging is
 * the point of this screen.
 *
 * Pointer events rather than HTML5 drag-and-drop. Drag-and-drop gives a drop
 * target and nothing else — no live position, so no preview — and it does not
 * fire under a finger at all, which rules out the tablet a front desk actually
 * runs on. Pointer events are one code path for mouse, pen and touch.
 *
 * Two gestures, and they were one until they were separated deliberately.
 * Dragging the body of a stay moves it between rooms and does not touch its
 * dates: moving sideways and vertically at once meant that reaching for the
 * room below also shifted the stay a day, and nothing on screen said the dates
 * had changed. Dragging an end still changes the dates, because that gesture
 * is unambiguous — nobody pulls an end by accident. Everything else about a
 * booking, dates included, is in the panel a click opens.
 */
export default function Timeline({
  data,
  groupId = null,
  today = "",
  move,
  onOpen,
  onEmpty,
  draft = null,
}: {
  data: CalendarWindow;
  /** Show only this room type, or every one. Display only — see below. */
  groupId?: number | null;
  today?: string;
  /**
   * Where a stay ended up: its room, and its dates.
   *
   * One call rather than one for the room and another for the dates. A drag
   * changes one or the other now, but the server takes both together and two
   * calls would mean a state where it landed in the right room on the wrong
   * nights. `roomId` is null when it has been put back in a holding row.
   */
  move: (
    bookingId: number,
    to: { roomId: number | null; arrival: string; departure: string }
  ) => Promise<MoveResult>;
  onOpen: (booking: Booking | TakenNight) => void;
  onEmpty?: (prefill: { roomId: number; groupId: number; arrival: string }) => void;
  /** A booking being taken in the panel: drawn where it would go, dashed. */
  draft?: { roomId: number | null; groupId: number; arrival: string; departure: string; guestName: string } | null;
}) {
  const { nights } = data;

  const rooms =
    groupId === null ? data.rooms : data.rooms.filter((r) => r.groupId === groupId);

  /**
   * The rows, in drawing order: each type's rooms, then its holding row.
   *
   * Last within the type rather than first. First would put a row that is
   * usually empty above every group and push the rooms down the screen four
   * times over; last keeps the rooms together and still leaves the holding row
   * where somebody scanning a type will pass it.
   */
  const rows: Row[] = [];
  {
    const sorted = [...rooms].sort(
      (a, b) =>
        (a.groupName ?? "").localeCompare(b.groupName ?? "") ||
        a.name.localeCompare(b.name, undefined, { numeric: true })
    );

    for (let i = 0; i < sorted.length; i += 1) {
      const room = sorted[i];
      rows.push({
        key: `room:${room.id}`,
        kind: "room",
        groupId: room.groupId,
        groupName: room.groupName,
        room,
      });

      const last = i === sorted.length - 1 || sorted[i + 1].groupId !== room.groupId;
      if (last) {
        rows.push({
          key: `hold:${room.groupId}`,
          kind: "holding",
          groupId: room.groupId,
          groupName: room.groupName,
        });
      }
    }
  }

  const rowOf = new Map(rows.map((r, i) => [r.key, i]));
  const keyFor = (roomId: number | null, group: number) =>
    roomId === null ? `hold:${group}` : `room:${roomId}`;

  /** Room and type facts a warning needs, by id. */
  const roomOf = new Map(data.rooms.map((r) => [r.id, r]));

  const [problem, setProblem] = useState("");
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);
  /*
   * Where the stay is being dragged to, in two places on purpose.
   *
   * The state is what renders. The ref is what `finish` reads, because an
   * event handler closes over the state as it was at its render — and pointerup
   * can land before React has re-rendered from the last pointermove. Reading
   * the ref is reading the drag as it actually is.
   */
  const [ghost, setGhostState] = useState<Ghost | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  function setGhost(next: Ghost | null) {
    ghostRef.current = next;
    setGhostState(next);
  }

  const track = useRef<HTMLDivElement | null>(null);

  /*
   * The columns fit the space they are given. A fixed day width meant that with
   * the booking form open beside it the month ran off to the right, and the
   * nights being booked were under the scroll. Measured, so the whole month
   * shows whenever it reasonably can; below the narrowest readable width it
   * scrolls as before. The room column narrows first, since rooms are names
   * like "101".
   */
  const scroller = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<{ day: number; room: number } | null>(null);
  const count = data.nights.length;
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const measure = () => {
      const width = node.clientWidth;
      let room = 10 * rem;
      let day = Math.floor((width - room) / count);
      if (day < 22) {
        room = 6 * rem;
        day = Math.floor((width - room) / count);
      }
      setFit({ day: Math.max(18, Math.min(day, count > 16 ? 48 : 64)), room });
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(node);
    return () => watch.disconnect();
  }, [count]);
  const drag = useRef<{
    stay: Stay;
    mode: Mode;
    x: number;
    y: number;
    /**
     * Whether the pointer has gone anywhere yet. A press that never moves is
     * a click, and a click on a stay opens it: the bar captures the pointer to
     * drag, so the name inside it would otherwise never hear the click.
     */
    moved: boolean;
    /**
     * Where the stay was when the drag began, not where the server has it.
     *
     * Those differ for as long as a saved change is in flight: the ghost is
     * left in place on success so the stay does not flash back to its old
     * nights, which means a second drag started in that moment would otherwise
     * measure from dates nobody can see. A drag has to move the thing that is
     * under the pointer.
     */
    origin: { roomId: number | null; groupId: number; arrival: string; departure: string };
  } | null>(null);

  /* ------------------------------------------------------------ the stays */

  const stays = new Map<number, Stay>();
  for (const t of data.taken) {
    if (!stays.has(t.bookingId)) {
      stays.set(t.bookingId, {
        id: t.bookingId,
        guestName: t.guestName,
        status: t.status,
        arrival: t.arrival,
        departure: t.departure,
        roomId: t.roomId,
        groupId: roomOf.get(t.roomId)?.groupId ?? 0,
        heads: null,
        source: t.source,
      });
    }
  }

  /*
   * And the ones nobody has given a room to.
   *
   * These arrive as whole bookings rather than room-nights — they hold no
   * nights, which is exactly what makes them unassigned — so they carry the
   * headcount that a room-night does not, and they are the stays a capacity
   * warning can actually be raised about.
   */
  for (const b of data.unassigned) {
    if (groupId !== null && b.groupId !== groupId) continue;
    if (stays.has(b.id)) continue;
    stays.set(b.id, {
      id: b.id,
      guestName: b.guestName,
      status: b.status,
      arrival: b.arrival,
      departure: b.departure,
      roomId: null,
      groupId: b.groupId,
      heads: (b.adults ?? 0) + (b.children ?? 0) || null,
      source: b.source,
    });
  }

  /*
   * Re-seed when the server sends a different window, or a saved change.
   *
   * Only the rendered ghost is cleared here, not the ref: touching a ref during
   * render is the thing the lint rule is about, and there is nothing to clear
   * anyway — a drag that is still in progress has its own truth in the ref, and
   * one that has finished set it to null already.
   */
  const [seen, setSeen] = useState(data);
  if (data !== seen) {
    setSeen(data);
    setGhostState(null);
    setProblem("");
    setWarning("");
  }

  /*
   * Declared before the lane packing below, and that is load-bearing.
   *
   * The packing calls `place`, `place` calls this, and a const arrow function
   * referenced before its own line is a ReferenceError rather than an
   * undefined — so moving this down again takes the whole calendar out.
   */
  const index = (night: string) => nights.indexOf(night);

  /* ------------------------------------------------------------- the lanes */

  /**
   * Which stays are on which row, and how many deep a holding row has to be.
   *
   * A room row can never need more than one lane: two guests in one room on
   * one night is the thing the whole inventory refuses. A holding row has no
   * such rule — that is what being unassigned means — so four bookings for the
   * same Tuesday all land on it, and without this they are drawn exactly on
   * top of one another. Three of the four would be invisible, on the one row
   * that exists to make sure nothing is forgotten.
   *
   * Greedy by arrival, which is the usual interval-packing and is enough here:
   * the aim is that every bar can be seen and grabbed, not the fewest possible
   * lanes.
   */
  /*
   * Packed from where each stay is, never from where one is being dragged.
   * Packing from the drag made a holding row gain or lose a lane as the bar
   * crossed it, every row below moved, the pointer was suddenly over another
   * room, the bar went there, the lane came back — and the grid shook.
   */
  const byRow = new Map<string, Stay[]>();
  for (const stay of stays.values()) {
    const key = place(stay, false).key;
    const list = byRow.get(key);
    if (list) list.push(stay);
    else byRow.set(key, [stay]);
  }

  const laneOf = new Map<number, number>();
  const lanesIn = new Map<string, number>();
  for (const row of rows) {
    if (row.kind !== "holding") continue;

    const mine = (byRow.get(row.key) ?? [])
      .slice()
      .sort((a, b) => place(a, false).arrival.localeCompare(place(b, false).arrival));

    const freeFrom: string[] = [];
    for (const stay of mine) {
      const p = place(stay, false);
      let lane = freeFrom.findIndex((end) => end <= p.arrival);
      if (lane === -1) {
        lane = freeFrom.length;
        freeFrom.push(p.departure);
      } else {
        freeFrom[lane] = p.departure;
      }
      laneOf.set(stay.id, lane);
    }

    lanesIn.set(row.key, Math.max(1, freeFrom.length));
  }

  /**
   * How far down each row starts, in row units and group headings.
   *
   * Arithmetic rather than measurement, because it has to be known during
   * render to place a bar, and a measured height is only known after one. The
   * heights are CSS variables so the sums here and the layout there cannot
   * disagree — which is also why a holding row is counted as a whole number of
   * ordinary rows rather than given a height of its own.
   */
  const offsetOf = new Map<string, { rows: number; heads: number }>();
  {
    let units = 0;
    let heads = 0;
    rows.forEach((row, i) => {
      if (i === 0 || rows[i - 1].groupId !== row.groupId) heads += 1;
      offsetOf.set(row.key, { rows: units, heads });
      units += lanesIn.get(row.key) ?? 1;
    });
  }

  /**
   * Would this stay clash where it is being dropped?
   *
   * Checked against every room-night on screen except the stay's own, so an
   * impossible drop refuses instantly rather than after a round trip. The
   * server checks again — this is the courtesy, not the rule.
   *
   * A holding row cannot clash: nothing there holds a room, which is the
   * whole of what it means to be unassigned.
   */
  function clashes(id: number, roomId: number | null, from: string, to: string) {
    if (roomId === null) return false;
    return data.taken.some(
      (t) =>
        t.roomId === roomId &&
        t.bookingId !== id &&
        t.night >= from &&
        t.night < to
    );
  }

  /**
   * Things that are odd about a placement but not impossible.
   *
   * Separate from `clashes` because the two deserve different answers. Two
   * guests in one room on one night is a fact about the world and is refused.
   * A family of four in a double, or a garden bungalow booking put in a loft,
   * is a judgement — and the desk routinely knows something this does not: a
   * cot is going in, the guest asked to be moved, the type was a placeholder.
   * Refusing those would teach people that the grid is wrong and to work
   * around it, which is how a warning stops being read.
   */
  function concerns(stay: Stay, to: { roomId: number | null; arrival: string; departure: string }) {
    const said: string[] = [];
    if (to.roomId === null) return said;

    const room = roomOf.get(to.roomId);
    if (!room) return said;

    /*
     * Which state, not merely "not active".
     *
     * There are three now and they mean different things: a room held back
     * from sale can perfectly well have somebody put in it by hand — staff,
     * family, a long stay — and one being renovated cannot. Saying "out of
     * service" about both told the desk the wrong thing about one of them.
     */
    if (room.status === "renovating" || room.status === "out_of_service") {
      said.push(`${room.name} is being renovated`);
    } else if (room.status === "not_selling") {
      said.push(`${room.name} is held back from sale`);
    }
    if (room.groupId !== stay.groupId) {
      const booked = rows.find((r) => r.groupId === stay.groupId)?.groupName;
      said.push(
        booked
          ? `this was booked as ${booked} and ${room.name} is ${room.groupName}`
          : `${room.name} is a different room type`
      );
    }
    if (today && to.arrival < today && stay.status === "confirmed") {
      said.push("it arrives in the past");
    }

    return said;
  }

  /** The live warning while a drag is happening, or "". */
  function liveWarning(stay: Stay, g: Ghost, mode: Mode) {
    if (clashes(stay.id, g.roomId, g.arrival, g.departure)) {
      return g.roomId === null
        ? ""
        : `${roomOf.get(g.roomId)?.name ?? "That room"} is taken on one of those nights`;
    }

    if (mode !== "move") {
      const said: string[] = [];
      const nights_ = Math.round(
        (new Date(`${g.departure}T00:00:00Z`).getTime() -
          new Date(`${g.arrival}T00:00:00Z`).getTime()) /
          86_400_000
      );
      if (nights_ <= 1) said.push("one night is the shortest a stay can be");
      if (today && g.departure <= today) said.push("it would end in the past");
      if (stay.status === "checked_out") said.push("this guest has already checked out");
      return said.join(", ");
    }

    return concerns(stay, g).join(", ");
  }

  /* ----------------------------------------------------------- the drag */

  function begin(e: React.PointerEvent, stay: Stay, mode: Mode) {
    const from = place(stay);
    if (busy) return;
    // A stay with no room has no ends to pull: there is nothing to size it
    // against, and its dates are the panel's business.
    if (mode !== "move" && from.roomId === null) return;
    e.preventDefault();
    e.stopPropagation();
    // Capture so the drag survives the pointer leaving the bar — which it does
    // immediately, because the bar is what is moving. Guarded because a pointer
    // id the browser has already released throws here, and a throw would end
    // the drag before it started rather than degrade it.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Without capture the drag still works while the pointer is over the
      // grid, which is where it is.
    }

    drag.current = {
      stay,
      mode,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      origin: {
        roomId: from.roomId,
        groupId: stay.groupId,
        arrival: from.arrival,
        departure: from.departure,
      },
    };
    setGhost({
      id: stay.id,
      roomId: from.roomId,
      groupId: stay.groupId,
      arrival: from.arrival,
      departure: from.departure,
    });
    setProblem("");
    setWarning("");
  }

  function during(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !track.current) return;
    // A few pixels of wobble in a click is not a drag.
    if (!d.moved) {
      if (Math.abs(e.clientX - d.x) < 5 && Math.abs(e.clientY - d.y) < 5) return;
      d.moved = true;
    }

    const width = track.current.getBoundingClientRect().width / nights.length;
    const days = Math.round((e.clientX - d.x) / width);

    let roomId = d.origin.roomId;
    let group = d.origin.groupId;
    let arrival = d.origin.arrival;
    let departure = d.origin.departure;

    if (d.mode === "move") {
      /*
       * The row under the pointer, and nothing else.
       *
       * Read from the rows themselves rather than from arithmetic, because a
       * group heading makes the rows unevenly spaced and a computed row index
       * drifts past the first one.
       *
       * The dates are deliberately untouched. Moving between rooms and across
       * days in one gesture meant that reaching for the room below also shifted
       * the stay by a day, and nothing said so — the bar simply ended up on
       * different nights. Dates are changed by pulling an end, or in the panel.
       */
      const under = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find((el) => el instanceof HTMLElement && el.dataset.row);
      const key = (under as HTMLElement | undefined)?.dataset.row;
      if (key && rowOf.has(key)) {
        const row = rows[rowOf.get(key) as number];
        roomId = row.kind === "room" ? row.room.id : null;
        group = row.groupId;
      }
    } else if (d.mode === "start") {
      arrival = shift(d.origin.arrival, days);
      // A stay is at least one night; the database says so too.
      if (arrival >= departure) arrival = shift(departure, -1);
    } else {
      departure = shift(d.origin.departure, days);
      if (departure <= arrival) departure = shift(arrival, 1);
    }

    const next = { id: d.stay.id, roomId, groupId: group, arrival, departure };
    setGhost(next);
    setWarning(liveWarning(d.stay, next, d.mode));
  }

  async function finish() {
    const d = drag.current;
    const g = ghostRef.current;
    drag.current = null;
    if (!d || !g) return;

    // Pressed and let go without moving: open it.
    if (!d.moved) {
      setGhost(null);
      setWarning("");
      const p = place(d.stay, false);
      onOpen({
        roomId: d.stay.roomId as number,
        night: p.arrival,
        bookingId: d.stay.id,
        guestName: d.stay.guestName,
        status: d.stay.status as TakenNight["status"],
        arrival: p.arrival,
        departure: p.departure,
        source: d.stay.source,
      });
      return;
    }

    const unchanged =
      g.roomId === d.origin.roomId &&
      g.arrival === d.origin.arrival &&
      g.departure === d.origin.departure;
    if (unchanged) {
      setGhost(null);
      setWarning("");
      return;
    }

    if (clashes(d.stay.id, g.roomId, g.arrival, g.departure)) {
      setGhost(null);
      setWarning("");
      setProblem(
        `${d.stay.guestName} cannot go there — the room is taken on one of those nights.`
      );
      return;
    }

    /*
     * Warnings are carried through the save rather than stopping it.
     *
     * The desk is allowed to do the odd thing; what it is not allowed to do is
     * not notice. So the sentence stays on screen after the move lands, which
     * is also when it is most useful — the bar is where they put it and the
     * note says what is unusual about that.
     */
    const said = concerns(d.stay, g);

    setBusy(true);
    try {
      const result = await move(d.stay.id, {
        roomId: g.roomId,
        arrival: g.arrival,
        departure: g.departure,
      });
      // Left in place on success: the page revalidates and the new window
      // replaces the ghost. Clearing it here would flash the stay back to
      // where it started for the length of the round trip.
      if (result.error) {
        setGhost(null);
        setWarning("");
        setProblem(result.error);
      } else {
        setWarning(
          said.length
            ? `Moved ${d.stay.guestName} — ${said.join(", ")}.`
            : ""
        );
      }
    } catch {
      setGhost(null);
      setWarning("");
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  // The booking being taken stays in sight: when the month is wider than the
  // space and the nights picked are off to one side, the grid scrolls to them.
  const draftKey = draft ? `${draft.roomId}:${draft.arrival}:${draft.departure}` : "";
  useEffect(() => {
    if (!draftKey) return;
    document
      .querySelector(".tl-stay.draft")
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [draftKey]);

  /** Where a stay sits now — dragged, or as the server has it (`live` false). */
  function place(stay: Stay, live = true) {
    const g = live && ghost?.id === stay.id ? ghost : null;
    const roomId = g ? g.roomId : stay.roomId;
    const group = g ? g.groupId : stay.groupId;
    const arrival = g ? g.arrival : stay.arrival;
    const departure = g ? g.departure : stay.departure;

    // Clipped to the window, so a stay running in from last month still draws.
    const from = Math.max(0, index(arrival) === -1 && arrival < nights[0] ? 0 : index(arrival));
    const lastNight = shift(departure, -1);
    const to =
      index(lastNight) === -1 && lastNight > nights[nights.length - 1]
        ? nights.length - 1
        : index(lastNight);

    return {
      roomId,
      key: keyFor(roomId, group),
      from,
      to,
      arrival,
      departure,
      dragging: Boolean(g),
    };
  }

  return (
    <>
      {/* Floating, not above the grid: a line appearing over the rows pushed
          them down mid-drag, the pointer landed on the room above, the line
          went, the rows came back up — the grid shook. Here nothing moves. */}
      {problem || warning ? (
        <div className="tl-notes">
          {problem ? (
            <p className="cal-problem" role="alert">
              {problem}
            </p>
          ) : null}
          {warning ? (
            <p className="tl-warn" role="status">
              {warning}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="admin-scroll" ref={scroller}>
        <div
          className="tl"
          data-tour="cal-grid"
          style={
            {
              "--tl-day": fit ? `${fit.day}px` : nights.length > 16 ? "2.1rem" : "3rem",
              "--tl-room": fit ? `${fit.room}px` : "10rem",
              "--tl-cols": nights.length,
            } as React.CSSProperties
          }
          onPointerMove={during}
          onPointerUp={() => void finish()}
          onPointerCancel={() => {
            drag.current = null;
            setGhost(null);
            setWarning("");
          }}
        >
          <div className="tl-head">
            <div className="tl-room tl-corner">Room</div>
            <div className="tl-days" ref={track}>
              {nights.map((night) => {
                const d = new Date(`${night}T12:00:00Z`);
                const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                return (
                  <div
                    key={night}
                    className={`tl-day${weekend ? " weekend" : ""}${
                      night === today ? " today" : ""
                    }`}
                  >
                    <span>{["S", "M", "T", "W", "T", "F", "S"][d.getUTCDay()]}</span>
                    <b>{d.getUTCDate()}</b>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tl-body">
            {rows.map((row, at) => {
              const opensGroup = at === 0 || rows[at - 1].groupId !== row.groupId;
              const holding = row.kind === "holding";
              const waiting = holding ? (byRow.get(row.key) ?? []).length : 0;

              return (
                <Fragment key={row.key}>
                  {opensGroup ? (
                    <div className="tl-group">
                      <div className="tl-room">{row.groupName}</div>
                      <div className="tl-groupfill" />
                    </div>
                  ) : null}

                  <div
                    className={`tl-row${holding ? " holding" : ""}`}
                    style={
                      { "--tl-rows": lanesIn.get(row.key) ?? 1 } as React.CSSProperties
                    }
                  >
                    <div className="tl-room">
                      {holding ? (
                        <span className="tl-holdlabel" data-tour="cal-noroom">
                          No room yet
                          {waiting ? <b>{waiting}</b> : null}
                        </span>
                      ) : (
                        row.room.name
                      )}
                    </div>
                    <div className="tl-track" data-row={row.key}>
                      {nights.map((night) => {
                        const d = new Date(`${night}T12:00:00Z`);
                        const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;

                        /*
                         * A holding row's cells take a drop and nothing else.
                         * "Book this night" has no meaning without a room, and
                         * a button that opens a panel you cannot complete is
                         * worse than a cell that does nothing.
                         */
                        if (holding) {
                          return (
                            <div
                              key={night}
                              data-row={row.key}
                              className={`tl-cell hold${weekend ? " weekend" : ""}${
                                night === today ? " today" : ""
                              }`}
                            />
                          );
                        }

                        return (
                          <button
                            key={night}
                            type="button"
                            data-row={row.key}
                            className={`tl-cell${weekend ? " weekend" : ""}${
                              night === today ? " today" : ""
                            }`}
                            title={`${row.room.name} · ${night}`}
                            onClick={() =>
                              onEmpty?.({
                                roomId: row.room.id,
                                groupId: row.room.groupId,
                                arrival: night,
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                </Fragment>
              );
            })}

            {/*
              Every stay in one layer, over the rows rather than inside them.

              This is not tidiness. A bar rendered inside its room's row is a
              different DOM node the moment the drag moves it to another room —
              React takes it out of one parent and builds it in the next — and
              the node the pointer was captured on no longer exists. The drag
              dies halfway, silently, exactly when it crosses a row, which is
              most of what dragging here is for. In one layer the room is a
              `top` and nothing is ever re-parented.
            */}
            <div className="tl-stays">
              {[...stays.values()].map((stay) => {
                const p = place(stay);
                if (p.to < 0 || p.from > nights.length - 1) return null;

                const at = offsetOf.get(p.key);
                if (!at) return null;

                const span = Math.max(1, p.to - p.from + 1);
                const unplaced = p.roomId === null;
                // Its packed lane belongs to the row it came from; dragged into
                // another row it rides on that row's first lane.
                const lane =
                  p.dragging && p.key !== place(stay, false).key ? 0 : (laneOf.get(stay.id) ?? 0);

                return (
                  <div
                    key={stay.id}
                    className={`tl-stay ${TONE[stay.status] ?? "confirmed"}${
                      p.dragging ? " dragging" : ""
                    }${unplaced ? " unplaced" : ""}`}
                    style={{
                      left: `calc(${p.from} * var(--tl-day))`,
                      width: `calc(${span} * var(--tl-day))`,
                      top: `calc(${at.rows + lane} * var(--tl-row-h) + ${at.heads} * var(--tl-group-h) + 2px)`,
                    }}
                    title={`${stay.guestName} · ${p.arrival} → ${p.departure}${
                      unplaced ? " · no room yet" : ""
                    }`}
                    onPointerDown={(e) => begin(e, stay, "move")}
                  >
                    {unplaced ? null : (
                      <span
                        className="tl-grip start"
                        onPointerDown={(e) => begin(e, stay, "start")}
                        aria-hidden="true"
                      />
                    )}
                    <button
                      type="button"
                      className="tl-who"
                      // From the keyboard (Enter or Space: detail 0). A pointer's
                      // click is the press-and-release finish() opens on.
                      onClick={(e) =>
                        e.detail === 0 &&
                        onOpen({
                          roomId: stay.roomId as number,
                          night: p.arrival,
                          bookingId: stay.id,
                          guestName: stay.guestName,
                          status: stay.status as TakenNight["status"],
                          arrival: p.arrival,
                          departure: p.departure,
                          source: stay.source,
                        })
                      }
                    >
                      {stay.guestName}
                    </button>
                    {unplaced ? null : (
                      <span
                        className="tl-grip end"
                        onPointerDown={(e) => begin(e, stay, "end")}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })}

              {/* The booking being taken, where it would go. Not a stay yet,
                  so it takes no clicks: the nights under it still can. */}
              {(() => {
                if (!draft) return null;
                const from = draft.arrival < nights[0] ? 0 : index(draft.arrival);
                const lastNight = shift(draft.departure, -1);
                const to = lastNight > nights[nights.length - 1] ? nights.length - 1 : index(lastNight);
                if (from < 0 || to < 0 || to < from) return null;
                const at = offsetOf.get(keyFor(draft.roomId, draft.groupId));
                if (!at) return null;
                return (
                  <div
                    className="tl-stay draft"
                    aria-hidden="true"
                    style={{
                      left: `calc(${from} * var(--tl-day))`,
                      width: `calc(${to - from + 1} * var(--tl-day))`,
                      top: `calc(${at.rows} * var(--tl-row-h) + ${at.heads} * var(--tl-group-h) + 2px)`,
                    }}
                  >
                    <span className="tl-who">{draft.guestName || "New booking"}</span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      <p className="tl-hint">
        Click a free night to take a booking there; with the form open, click a later night in the
        same room to make it the last night. Drag a stay up or down to put it in another room, or
        into <b>No room yet</b> to take it out of one. Pull either end to make it longer or
        shorter. Click the name to open it.
      </p>
    </>
  );
}
