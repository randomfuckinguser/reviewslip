"use client";

import { useState } from "react";
import type { Booking, DayView, DeskRoom } from "@/lib/customer";

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
 * Every action is one press. Check-in and check-out are the two things done
 * dozens of times a day, and anything that makes them a dialog makes the
 * calendar the faster route, which defeats the screen.
 */

function money(b: Booking) {
  return b.total ? `฿${b.total}` : "not priced";
}

/** An arrival that cannot be checked in says so, instead of failing on press. */
function blockedReason(b: Booking, rooms: DeskRoom[]): string | null {
  if (!b.roomId) return "no room yet";
  const room = rooms.find((r) => r.id === b.roomId);
  if (room?.housekeeping === "dirty") return `${room.name} not cleaned`;
  return null;
}

export default function Desk({
  day,
  checkIn,
  checkOut,
  setHousekeeping,
  onOpen,
}: {
  day: DayView;
  checkIn: (id: number) => Promise<DeskResult>;
  checkOut: (id: number) => Promise<DeskResult>;
  setHousekeeping: (roomId: number, state: string) => Promise<DeskResult>;
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
              const blocked = blockedReason(b, day.rooms);
              const done = b.status !== "confirmed";

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
                  ) : blocked ? (
                    // Said before the press, not after. A button that looks
                    // available and then refuses teaches people to distrust it.
                    <span className="desk-blocked">{blocked}</span>
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

      {/* ----------------------------------------------------- housekeeping */}

      <section className="desk-card" data-tour="today-housekeeping">
        <h2>
          Housekeeping{" "}
          <span className="desk-count">
            {dirty.length === 0
              ? "everything ready"
              : `${dirty.length} to clean`}
          </span>
        </h2>

        {day.rooms.length === 0 ? (
          <p className="desk-empty">No rooms set up.</p>
        ) : (
          <ul className="desk-list">
            {day.rooms.map((room) => (
              <li key={room.id} className="desk-row">
                <span className="desk-who" style={{ cursor: "default" }}>
                  <strong>{room.name}</strong>
                  <span>
                    {room.groupName}
                    {room.status !== "active" ? ` · ${room.status}` : ""}
                  </span>
                </span>

                {room.housekeeping === "dirty" ? (
                  <button
                    type="button"
                    className="btn btn-quiet"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(-room.id, () => setHousekeeping(room.id, "clean"))
                    }
                  >
                    {busy === -room.id ? "…" : "Mark Clean"}
                  </button>
                ) : (
                  // Turning a clean room dirty is rare but real — somebody
                  // spilled something, or it was ticked off by mistake. Quiet
                  // rather than absent.
                  <button
                    type="button"
                    className="desk-quiet-link"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(-room.id, () => setHousekeeping(room.id, "dirty"))
                    }
                  >
                    clean
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
