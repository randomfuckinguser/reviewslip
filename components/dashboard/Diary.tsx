"use client";

import { useCallback, useState } from "react";
import MonthGrid from "./MonthGrid";
import Timeline, { type MoveResult } from "./Timeline";
import BookingPanel, {
  type CreateResult,
  type Draft,
  type EditResult,
  type Prefill,
} from "./BookingPanel";
import type { Booking, CalendarWindow, RatePlan, TakenNight } from "@/lib/customer";

/**
 * Holds which booking is open, and joins the grid to the panel.
 *
 * Both need to be client components — one drags, the other is a dialog — and
 * they need to agree on the selection, so the state lives above them. The page
 * itself stays a server component and passes the actions down.
 */
export default function Diary({
  data,
  groupId = null,
  today = "",
  shape = "timeline",
  deskBase,
  cardBase,
  slug,
  groups,
  plans,
  create,
  move,
  save,
  assign,
  setStatus,
}: {
  data: CalendarWindow;
  groupId?: number | null;
  /** Today at the property, worked out on the server. */
  today?: string;
  /**
   * Which calendar.
   *
   * The timeline answers "which room", the month answers "what does the month
   * look like". Neither is a worse version of the other, and only the timeline
   * can be dragged — a month of days has no room axis to drag along.
   */
  shape?: "timeline" | "month";
  /** The desk, for the month's day numbers to link into. */
  deskBase: string;
  /** The registration cards, for the link in the panel. */
  cardBase?: string;
  slug: string;
  groups: { id: number; name: string }[];
  plans: RatePlan[];
  create: (values: Record<string, unknown>) => Promise<CreateResult>;
  /** A dragged stay: its room and its dates, in one call. */
  move: (
    bookingId: number,
    to: { roomId: number | null; arrival: string; departure: string }
  ) => Promise<MoveResult>;
  save: (id: number, patch: Record<string, unknown>) => Promise<EditResult>;
  assign: (id: number, roomId: number | null) => Promise<EditResult>;
  setStatus: (id: number, status: string) => Promise<EditResult>;
}) {
  const [open, setOpen] = useState<Booking | "new" | null>(null);
  const [prefill, setPrefill] = useState<Prefill | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const onDraft = useCallback((d: Draft | null) => setDraft(d), []);


  /**
   * A free night clicked. With a booking already being taken in that room
   * from an earlier night, it is the last night: click the first night, then
   * the last, and the stay is drawn between them. Anything else starts again
   * from the night clicked.
   */
  function pick(where: { roomId: number; groupId: number; arrival: string }) {
    if (
      open === "new" &&
      prefill?.roomId === where.roomId &&
      prefill.arrival &&
      !prefill.departure &&
      where.arrival > prefill.arrival
    ) {
      setPrefill({ ...prefill, departure: nextNight(where.arrival) });
      return;
    }
    setPrefill(where);
    setOpen("new");
  }

  /**
   * What the grid knows about a stay, shaped as a booking.
   *
   * A grid cell knows a stay by its room-night, which carries the guest and the
   * dates but not the headcount, the email or the money. This is the instant
   * paint; the panel fetches the rest and fills it in.
   *
   * The fields that are genuinely unknown are left null rather than guessed.
   * This used to say `adults: 1` and `nights: 0`, which are not unknowns, they
   * are wrong answers — and a panel showing "1 adult" for a family of four is
   * worse than one showing a dash for half a second.
   */
  function toBooking(source: Booking | TakenNight): Booking {
    if ("id" in source) return source;

    const room = data.rooms.find((r) => r.id === source.roomId);
    return {
      id: source.bookingId,
      groupId: room?.groupId ?? 0,
      groupName: room?.groupName ?? null,
      roomId: source.roomId,
      roomName: room?.name ?? null,
      guestName: source.guestName,
      guestEmail: null,
      guestPhone: null,
      adults: 0,
      children: 0,
      arrival: source.arrival,
      departure: source.departure,
      nights: 0,
      status: source.status,
      source: source.source,
      notes: null,
      ratePlanId: null,
      totalMinor: null,
      total: null,
      createdAt: "",
    };
  }

  return (
    <>
      <div className="cal-actions">
        <p>Click a free night to book it, or</p>
        <button
          type="button"
          className="btn btn-go"
          onClick={() => {
            setPrefill(undefined);
            setOpen("new");
          }}
        >
          Take a Booking
        </button>
      </div>

      {shape === "month" ? (
        <MonthGrid
          data={data}
          groupId={groupId}
          today={today}
          deskBase={deskBase}
          onOpen={(source) => {
            setPrefill(undefined);
            setOpen(toBooking(source));
          }}
          onEmpty={(where) => {
            setPrefill(where);
            setOpen("new");
          }}
        />
      ) : (
        <Timeline
          data={data}
          groupId={groupId}
          today={today}
          move={move}
          onOpen={(source) => {
            setPrefill(undefined);
            setOpen(toBooking(source));
          }}
          onEmpty={pick}
          draft={open === "new" ? draft : null}
        />
      )}
      <BookingPanel
        booking={open}
        prefill={prefill}
        rooms={data.rooms}
        groups={groups}
        plans={plans}
        slug={slug}
        cardBase={cardBase}
        onClose={() => setOpen(null)}
        onCreated={(made) => setOpen(made)}
        create={create}
        save={save}
        assign={assign}
        setStatus={setStatus}
        docked
        onDraft={onDraft}
      />
    </>
  );
}

/** The day after a night, as the stay's departure. */
function nextNight(night: string): string {
  const d = new Date(`${night}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
