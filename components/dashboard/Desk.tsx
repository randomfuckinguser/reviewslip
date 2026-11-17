"use client";

import { useState } from "react";
import type { Booking, DayView, DeskRoom, Room } from "@/lib/customer";

export interface DeskResult {
  error?: string;
}

/**
 * The front desk's day: who is arriving, who is leaving, who is in, and which
 * rooms are ready.
 *
 * One screen, because that is one question — "what is happening today" — and
 * splitting it over tabs means the person answering the phone is on the wrong
 * one. Arrivals lead, since a guest standing at the desk outranks a room
 * waiting to be cleaned.
 *
 * Every action is one press, where the guest is listed. Check-in and
 * check-out are the two things done dozens of times a day, and anything that
 * makes them a dialog makes the calendar the faster route, which defeats the
 * screen. So an arrival that cannot be checked in yet is fixed on its own row:
 * no room gets a room picker, a room not cleaned gets Mark Clean, and then
 * Check In.
 */

function money(b: Booking) {
  return b.total ? `฿${b.total}` : "not priced";
}

/** The arrival's room, when it has one that still needs cleaning. */
function dirtyRoom(b: Booking, rooms: DeskRoom[]): DeskRoom | null {
  const room = b.roomId ? rooms.find((r) => r.id === b.roomId) : undefined;
  return room?.housekeeping === "dirty" ? room : null;
}

export default function Desk({
  day,
  rooms,
  checkIn,
  checkOut,
  setHousekeeping,
  assign,
  onOpen,
}: {
  day: DayView;
  /** Every room, for which type each is: what an arrival with none can have. */
  rooms: Room[];
  checkIn: (id: number) => Promise<DeskResult>;
  checkOut: (id: number) => Promise<DeskResult>;
  setHousekeeping: (roomId: number, state: string) => Promise<DeskResult>;
  assign: (id: number, roomId: number | null) => Promise<DeskResult>;
  onOpen: (booking: Booking) => void;
}) {
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  async function run(key: number, fn: () => Promise<DeskResult>) {
    if (busy !== null) return;
    setBusy(key);
    setProblem("");
    const result = await fn();
    setBusy(null);
    if (result.error) setProblem(result.error);
  }

  const dirty = day.rooms.filter((r) => r.housekeeping === "dirty");
  const ready = day.rooms.filter((r) => r.housekeeping !== "dirty");

  // Rooms somebody is in, or arriving into, tonight. The rest of a type is
  // what an arrival without a room can be given; a clash on a later night of
  // the stay is the review app's to refuse, and it says so.
  const taken = new Set(
    [...day.inHouse, ...day.arrivals].map((b) => b.roomId).filter((id): id is number => id !== null)
  );
  const freeFor = (b: Booking) =>
    rooms.filter((r) => r.groupId === b.groupId && r.status === "active" && !taken.has(r.id));

  return (
    <>
      {problem ? (
        <p className="cal-problem" role="alert">
          {problem}
        </p>
      ) : null}

      {/* --------------------------------------------------------- arrivals */}

      <section className="desk-card" data-tour="today-arrivals">
        <h2>
          Arriving{" "}
          <span className="desk-count">
            {day.counts.toCheckIn} of {day.counts.arrivals} still to check in
          </span>
        </h2>

        {day.arrivals.length === 0 ? (
          <p className="desk-empty">Nobody due in.</p>
        ) : (
          <ul className="desk-list">
            {day.arrivals.map((b) => {
              const toClean = dirtyRoom(b, day.rooms);
              const done = b.status !== "confirmed";
              const free = b.roomId ? [] : freeFor(b);

              return (
                <li key={b.id} className="desk-row">
                  <button type="button" className="desk-who" onClick={() => onOpen(b)}>
                    <strong>{b.guestName}</strong>
                    <span>
                      {b.groupName}
                      {b.roomName ? ` · ${b.roomName}` : ""} · {b.nights} night
                      {b.nights === 1 ? "" : "s"} · {money(b)}
                    </span>
                  </button>

                  {done ? (
                    <span className="desk-done">
                      {b.status === "in_house" ? "In" : b.status.replace("_", " ")}
                    </span>
                  ) : !b.roomId ? (
                    // No room: give one here, from the free rooms of the type
                    // booked, rather than sending the desk to the calendar.
                    free.length ? (
                      <select
                        className="desk-pick"
                        aria-label={`Room for ${b.guestName}`}
                        value=""
                        disabled={busy !== null}
                        onChange={(e) => {
                          const roomId = Number(e.target.value);
                          if (roomId) void run(b.id, () => assign(b.id, roomId));
                        }}
                      >
                        <option value="">{busy === b.id ? "…" : "Give a Room"}</option>
                        {free.map((r) => {
                          const state = day.rooms.find((d) => d.id === r.id);
                          return (
                            <option key={r.id} value={r.id}>
                              {r.name}
                              {state?.housekeeping === "dirty" ? " (to clean)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      // Said before the press, not after. A control that looks
                      // available and then refuses teaches people to distrust it.
                      <span className="desk-blocked">no {b.groupName} free</span>
                    )
                  ) : toClean ? (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busy !== null}
                      onClick={() => void run(-toClean.id, () => setHousekeeping(toClean.id, "clean"))}
                      data-tip={`${toClean.name} still needs cleaning. Mark it clean once it is, then Check In.`}
                    >
                      {busy === -toClean.id ? "…" : `Mark ${toClean.name} Clean`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busy !== null}
                      onClick={() => void run(b.id, () => checkIn(b.id))}
                    >
                      {busy === b.id ? "…" : "Check In"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------- departures */}

      <section className="desk-card" data-tour="today-departures">
        <h2>
          Leaving{" "}
          <span className="desk-count">
            {day.counts.toCheckOut} of {day.counts.departures} still to check out
          </span>
        </h2>

        {day.departures.length === 0 ? (
          <p className="desk-empty">Nobody due out.</p>
        ) : (
          <ul className="desk-list">
            {day.departures.map((b) => (
              <li key={b.id} className="desk-row">
                <button type="button" className="desk-who" onClick={() => onOpen(b)}>
                  <strong>{b.guestName}</strong>
                  <span>
                    {b.roomName ?? b.groupName} · {money(b)}
                  </span>
                </button>

                {b.status === "in_house" ? (
                  <button
                    type="button"
                    className="btn btn-quiet"
                    disabled={busy !== null}
                    onClick={() => void run(b.id, () => checkOut(b.id))}
                  >
                    {busy === b.id ? "…" : "Check Out"}
                  </button>
                ) : (
                  <span className="desk-done">
                    {b.status === "checked_out" ? "Out" : b.status.replace("_", " ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ----------------------------------------------------- housekeeping */}

      <section className="desk-card" data-tour="today-housekeeping">
        <h2>
          Housekeeping{" "}
          <span className="desk-count">
            {dirty.length === 0 ? "everything ready" : `${dirty.length} to clean`}
          </span>
        </h2>

        {day.rooms.length === 0 ? (
          <p className="desk-empty">No rooms set up.</p>
        ) : (
          <>
            {/* Only the rooms that need something: a list of every clean room
                was most of the screen and none of the work. */}
            {dirty.length === 0 ? (
              <p className="desk-empty">Every room is clean.</p>
            ) : (
              <ul className="desk-list">
                {dirty.map((room) => (
                  <li key={room.id} className="desk-row">
                    <span className="desk-who" style={{ cursor: "default" }}>
                      <strong>{room.name}</strong>
                      <span>
                        {room.groupName}
                        {room.status !== "active" ? ` · ${room.status}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busy !== null}
                      onClick={() => void run(-room.id, () => setHousekeeping(room.id, "clean"))}
                    >
                      {busy === -room.id ? "…" : "Mark Clean"}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* The clean ones, small. Turning one back is rare but real
                (something spilled, or it was ticked off by mistake). */}
            {ready.length > 0 ? (
              <div className="desk-ready">
                <p>Ready · press one that needs cleaning again</p>
                <div className="desk-chips">
                  {ready.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      className="desk-chip"
                      disabled={busy !== null}
                      onClick={() => void run(-room.id, () => setHousekeeping(room.id, "dirty"))}
                      title={`${room.name} is clean. Press if it needs cleaning again.`}
                    >
                      {busy === -room.id ? "…" : room.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* --------------------------------------------------------- in house */}

      <section className="desk-card">
        <h2>
          Staying Tonight <span className="desk-count">{day.counts.inHouse}</span>
        </h2>

        {day.inHouse.length === 0 ? (
          <p className="desk-empty">Empty tonight.</p>
        ) : (
          <ul className="desk-list">
            {day.inHouse.map((b) => (
              <li key={b.id} className="desk-row">
                <button type="button" className="desk-who" onClick={() => onOpen(b)}>
                  <strong>{b.guestName}</strong>
                  <span>
                    {b.roomName ?? `${b.groupName} · no room`} · out {b.departure}
                  </span>
                </button>
                <span className="desk-done">
                  {b.status === "in_house" ? "In" : "Not arrived"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

    </>
  );
}
