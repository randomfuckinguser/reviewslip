"use client";

import { Fragment } from "react";
import Link from "next/link";
import { weeksOf } from "@/lib/nights";
import type { Booking, CalendarWindow, TakenNight } from "@/lib/customer";

/** Stacked bars in a week before the rest become a count. */
const LANES = 3;

/** A stay, once, however many nights it holds. */
interface Stay {
  id: number;
  guestName: string;
  status: string;
  arrival: string;
  departure: string;
  roomId: number | null;
  roomName: string | null;
  /** No room yet — the one thing on this screen somebody has to fix. */
  noRoom: boolean;
}

/** A stay's run across one week: where it starts, how wide, and which lane. */
interface Run {
  stay: Stay;
  column: number;
  span: number;
  lane: number;
  /** Whether the bar's own ends are the stay's ends, or the week's. */
  opensLeft: boolean;
  closesRight: boolean;
}

/**
 * A month, laid out as a month, with stays drawn across the nights they hold.
 *
 * The bars are the point. A month that marks a stay only on the day it starts
 * shows a week of steady occupancy as six disconnected percentages with nobody
 * in them — you can see that half the rooms are sold and not that it is the
 * same two guests all week, which is the question. Drawn as a run, a stay reads
 * as one thing with a beginning and an end, and a gap between two of them reads
 * as a night somebody could sell.
 *
 * Occupancy stays as the cell's own shade so the shape of the month is legible
 * before anything is read, with the figure for when the exact number matters.
 *
 * Every bar comes from the room-nights the window already sends, so this costs
 * no extra request.
 */
export default function MonthGrid({
  data,
  groupId = null,
  today = "",
  deskBase,
  onOpen,
  onEmpty,
}: {
  data: CalendarWindow;
  /** Show only this room type, or every one. */
  groupId?: number | null;
  /** Today at the property, as the server worked it out. */
  today?: string;
  /** The desk, for the day numbers to link into. */
  deskBase: string;
  onOpen: (booking: Booking | TakenNight) => void;
  onEmpty?: (prefill: { arrival: string; groupId?: number }) => void;
}) {
  const rooms =
    groupId === null ? data.rooms : data.rooms.filter((r) => r.groupId === groupId);
  const byRoom = new Map(data.rooms.map((r) => [r.id, r]));
  const roomIds = new Set(rooms.map((r) => r.id));
  const capacity = rooms.length;

  // Filtered by the room a stay sits in, not the booking's own type: a stay is
  // wherever it was actually put.
  const nights =
    groupId === null ? data.taken : data.taken.filter((t) => roomIds.has(t.roomId));
  const unassigned =
    groupId === null
      ? data.unassigned
      : data.unassigned.filter((b) => b.groupId === groupId);

  /* ------------------------------------------------------ what is sold when */

  const sold = new Map<string, number>(data.nights.map((d) => [d, 0]));
  const counted = new Map<string, Set<number>>();

  /** A stay holds four nights as four rows; count each booking once a night. */
  function first(date: string, id: number) {
    let set = counted.get(date);
    if (!set) {
      set = new Set();
      counted.set(date, set);
    }
    if (set.has(id)) return false;
    set.add(id);
    return true;
  }

  const stays = new Map<number, Stay>();
  for (const t of nights) {
    if (sold.has(t.night) && first(t.night, t.bookingId)) {
      sold.set(t.night, sold.get(t.night)! + 1);
    }
    if (!stays.has(t.bookingId)) {
      const room = byRoom.get(t.roomId) ?? null;
      stays.set(t.bookingId, {
        id: t.bookingId,
        guestName: t.guestName,
        status: t.status,
        arrival: t.arrival,
        departure: t.departure,
        roomId: t.roomId,
        roomName: room?.name ?? null,
        noRoom: false,
      });
    }
  }

  for (const b of unassigned) {
    stays.set(b.id, {
      id: b.id,
      guestName: b.guestName,
      status: b.status,
      arrival: b.arrival,
      departure: b.departure,
      roomId: null,
      roomName: null,
      noRoom: true,
    });
  }

  const all = [...stays.values()];

  /* ------------------------------------------------------- bars, week by week */

  /**
   * Where a stay sits in a week, and in which lane.
   *
   * Lanes are packed greedily: longest first, each into the topmost lane it
   * fits. A stay therefore keeps the same lane across a week rather than
   * jumping a row halfway along, which is what makes a run read as one thing.
   */
  function runsFor(week: (string | null)[]): { runs: Run[]; hidden: number[] } {
    const dates = week.filter((d): d is string => d !== null);
    if (dates.length === 0) return { runs: [], hidden: [] };

    const from = dates[0];
    const to = dates[dates.length - 1];

    // Nights held, so a stay departing on the 20th covers up to the 19th —
    // the same rule the occupancy figure counts by.
    const touching = all
      .filter((s) => s.arrival <= to && s.departure > from)
      .sort(
        (a, b) =>
          Number(b.noRoom) - Number(a.noRoom) ||
          a.arrival.localeCompare(b.arrival) ||
          b.departure.localeCompare(a.departure)
      );

    const lanes: Run[][] = [];
    const runs: Run[] = [];
    const hidden = new Array(7).fill(0);

    for (const stay of touching) {
      const startDate = stay.arrival > from ? stay.arrival : from;
      const lastNight = dates.filter((d) => d < stay.departure).at(-1);
      if (!lastNight || lastNight < startDate) continue;

      const column = week.indexOf(startDate);
      const endColumn = week.indexOf(lastNight);
      if (column < 0 || endColumn < column) continue;
      const span = endColumn - column + 1;

      let lane = lanes.findIndex(
        (row) => !row.some((r) => r.column <= endColumn && r.column + r.span > column)
      );
      if (lane === -1) {
        lane = lanes.length;
        lanes.push([]);
      }

      const run: Run = {
        stay,
        column,
        span,
        lane,
        opensLeft: stay.arrival >= from,
        closesRight: stay.departure <= to,
      };
      lanes[lane].push(run);

      if (lane < LANES) runs.push(run);
      else for (let c = column; c <= endColumn; c += 1) hidden[c] += 1;
    }

    return { runs, hidden };
  }

  /** What the panel needs, from what a bar knows. */
  function asBooking(stay: Stay): TakenNight {
    return {
      roomId: stay.roomId as number,
      night: stay.arrival,
      bookingId: stay.id,
      guestName: stay.guestName,
      status: stay.status as TakenNight["status"],
      arrival: stay.arrival,
      departure: stay.departure,
      source: "direct",
    };
  }

  const homeless = unassigned.length;

  return (
    <>
      {/*
        Said once, at the top, and only when there is one. A stay with no room
        holds nothing and turns up anyway; it is the only thing on this screen
        that is actually wrong.
      */}
      {homeless > 0 ? (
        <p className="mg-alert">
          <strong>
            {homeless} {homeless === 1 ? "stay has" : "stays have"} no room yet
          </strong>{" "}
          — open one and pick a room, or it holds nothing.
        </p>
      ) : null}

      <div className="mg">
        <div className="mg-weekdays" aria-hidden="true">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        {weeksOf(data.nights).map((week, w) => {
          const { runs, hidden } = runsFor(week);
          const lanes = Math.min(
            LANES,
            runs.reduce((most, r) => Math.max(most, r.lane + 1), 0)
          );

          return (
            <div className="mg-week" key={w}>
              {/* The cells themselves: shading, today, sold out. Behind the
                  bars, because a bar crosses them and a background cannot. */}
              <div className="mg-cells" aria-hidden="true">
                {week.map((date, i) => {
                  if (date === null)
                    return <div className="mg-cell mg-blank" key={`b${i}`} />;

                  const count = sold.get(date) ?? 0;
                  const full =
                    capacity > 0 ? Math.round((count / capacity) * 100) : 0;
                  const marks = [
                    "mg-cell",
                    date === today ? "today" : "",
                    capacity > 0 && count >= capacity ? "full" : "",
                  ].filter(Boolean);

                  return (
                    <div
                      className={marks.join(" ")}
                      key={date}
                      style={
                        count > 0
                          ? ({ "--mg-heat": full / 100 } as React.CSSProperties)
                          : undefined
                      }
                    />
                  );
                })}
              </div>

              <div
                className="mg-grid"
                style={{ "--mg-lanes": lanes } as React.CSSProperties}
              >
                {/*
                  Emitted a day at a time — the day, then the stays that begin
                  on it. Every child is placed explicitly by column and row, so
                  the order here changes nothing on a wide screen; it is what
                  the narrow one reads, where the grid becomes a single column
                  and takes its order from the document. Emitting all seven days
                  first, as this used to, put a week's bars in a heap below the
                  week's dates.
                */}
                {week.map((date, i) => {
                  if (date === null) return null;

                  const count = sold.get(date) ?? 0;
                  const full =
                    capacity > 0 ? Math.round((count / capacity) * 100) : 0;
                  const starting = runs.filter((r) => r.column === i);

                  return (
                    <Fragment key={date}>
                      <div
                        className={`mg-top${date === today ? " today" : ""}`}
                        style={{ gridColumn: i + 1, gridRow: 1 }}
                      >
                        <Link className="mg-num" href={`${deskBase}?date=${date}`}>
                          {Number(date.slice(8, 10))}
                        </Link>
                        {count > 0 ? (
                          <span
                            className={`mg-full${
                              capacity > 0 && count >= capacity ? " sold" : ""
                            }`}
                            title={`${count} of ${capacity} room${capacity === 1 ? "" : "s"} sold`}
                          >
                            {full}%
                          </span>
                        ) : null}
                      </div>

                      {starting.map((run) => (
                        <button
                          type="button"
                          key={run.stay.id}
                          className={[
                            "mg-bar",
                            run.stay.noRoom ? "noroom" : run.stay.status,
                            run.opensLeft ? "opens" : "",
                            run.closesRight ? "closes" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{
                            gridColumn: `${run.column + 1} / span ${run.span}`,
                            gridRow: run.lane + 2,
                          }}
                          title={`${run.stay.guestName} · ${run.stay.arrival} → ${run.stay.departure}${
                            run.stay.roomName
                              ? ` · ${run.stay.roomName}`
                              : " · no room yet"
                          }`}
                          onClick={() => onOpen(asBooking(run.stay))}
                        >
                          {/* The ellipsis only where a stay runs in from the
                              week before. Repeating a name with no mark reads
                              as a second booking. */}
                          {run.opensLeft
                            ? run.stay.guestName
                            : `… ${run.stay.guestName}`}
                        </button>
                      ))}

                      {hidden[i] > 0 ? (
                        <Link
                          className="mg-more"
                          href={`${deskBase}?date=${date}`}
                          style={{ gridColumn: i + 1, gridRow: LANES + 2 }}
                        >
                          +{hidden[i]}
                        </Link>
                      ) : null}

                      {onEmpty ? (
                        <button
                          type="button"
                          className="mg-take"
                          style={{ gridColumn: i + 1, gridRow: LANES + 3 }}
                          title={`Take a booking arriving ${date}`}
                          onClick={() =>
                            onEmpty({ arrival: date, groupId: groupId ?? undefined })
                          }
                        >
                          <span aria-hidden="true">+</span>
                          <span className="visually-hidden">
                            Take a booking arriving {date}
                          </span>
                        </button>
                      ) : null}
                    </Fragment>
                  );
                })}

              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
