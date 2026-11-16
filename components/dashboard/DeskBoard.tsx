"use client";

import { useState } from "react";
import Desk, { type DeskResult } from "./Desk";
import BookingPanel, { type CreateResult, type EditResult } from "./BookingPanel";
import type { Booking, DayView, RatePlan, Room } from "@/lib/customer";

/**
 * Holds which booking is open, and joins the day list to the panel.
 *
 * The same shape as Diary does for the calendar, and for the same reason: the
 * page stays a server component and passes the actions down, while the piece
 * that needs to remember a selection is a client one.
 *
 * Reusing BookingPanel rather than writing a second editor. A stay opened from
 * the arrivals list and one opened from the grid are the same thing, and two
 * editors would drift — one of them would grow a field the other did not.
 */
export default function DeskBoard({
  day,
  rooms,
  groups,
  plans,
  slug,
  create,
  checkIn,
  checkOut,
  setHousekeeping,
  save,
  assign,
  markStatus,
}: {
  day: DayView;
  rooms: Room[];
  groups: { id: number; name: string }[];
  plans: RatePlan[];
  slug: string;
  create: (values: Record<string, unknown>) => Promise<CreateResult>;
  checkIn: (id: number) => Promise<DeskResult>;
  checkOut: (id: number) => Promise<DeskResult>;
  setHousekeeping: (roomId: number, state: string) => Promise<DeskResult>;
  save: (id: number, patch: Record<string, unknown>) => Promise<EditResult>;
  assign: (id: number, roomId: number | null) => Promise<EditResult>;
  markStatus: (id: number, status: string) => Promise<EditResult>;
}) {
  const [open, setOpen] = useState<Booking | "new" | null>(null);

  return (
    <>
      {/* The day in figures, with the one action that starts something. */}
      <section className="container" aria-labelledby="desk-h" style={{ marginBottom: "1.25rem" }} data-tour="today-summary">
        <div className="container-head">
          <div>
            <h2 id="desk-h">At the Desk</h2>
            <p className="container-desc">Who is coming, who is going, and which rooms need cleaning.</p>
          </div>
          <div className="container-actions">
            <button type="button" className="btn btn-go" onClick={() => setOpen("new")} data-tour="today-take">
              Take a Booking
            </button>
          </div>
        </div>
        <dl className="kv">
          <div>
            <dt>Arriving</dt>
            <dd className="kv-big">{day.counts.arrivals}</dd>
          </div>
          <div>
            <dt>To check in</dt>
            <dd className="kv-big">{day.counts.toCheckIn}</dd>
          </div>
          <div>
            <dt>Leaving</dt>
            <dd className="kv-big">{day.counts.departures}</dd>
          </div>
          <div>
            <dt>To check out</dt>
            <dd className="kv-big">{day.counts.toCheckOut}</dd>
          </div>
          <div>
            <dt>Staying tonight</dt>
            <dd className="kv-big">{day.counts.inHouse}</dd>
          </div>
          <div>
            <dt>Rooms to clean</dt>
            <dd className="kv-big">{day.counts.dirty}</dd>
          </div>
        </dl>
      </section>

      <div className="desk-grid">
        <Desk
          day={day}
          checkIn={checkIn}
          checkOut={checkOut}
          setHousekeeping={setHousekeeping}
          onOpen={setOpen}
        />
      </div>
      <BookingPanel
        booking={open}
        rooms={rooms}
        groups={groups}
        plans={plans}
        slug={slug}
        onClose={() => setOpen(null)}
        onCreated={(made) => setOpen(made)}
        create={create}
        save={save}
        assign={assign}
        setStatus={markStatus}
      />
    </>
  );
}
