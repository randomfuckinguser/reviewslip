"use client";

import TourButton from "@/components/help/TourButton";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import GuestList from "./GuestList";
import { nightCount } from "@/lib/nights";
import type { Booking, BookingGuest, RatePlan, Room } from "@/lib/customer";

export interface EditResult {
  error?: string;
}

export interface CreateResult {
  error?: string;
  booking?: Booking;
}

/** What an empty calendar cell already knows, so nobody retypes it. */
export interface Prefill {
  roomId?: number;
  groupId?: number;
  arrival?: string;
  departure?: string;
}

const field: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.8rem",
  borderRadius: 10,
  border: "1px solid var(--jade-line)",
  background: "var(--shade-soft)",
  color: "var(--cream)",
  fontFamily: "inherit",
  fontSize: "0.95rem",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  marginBottom: "0.3rem",
  color: "var(--cream)",
};

const STATUS: { id: Booking["status"]; label: string }[] = [
  { id: "confirmed", label: "Confirmed" },
  { id: "in_house", label: "Checked In" },
  { id: "checked_out", label: "Checked Out" },
  { id: "no_show", label: "No Show" },
  { id: "cancelled", label: "Cancelled" },
];

/** Blank fields, for a booking that does not exist yet. */
const EMPTY = {
  guestName: "",
  guestEmail: "",
  guestPhone: "",
  arrival: "",
  departure: "",
  groupId: "",
  roomId: "",
  ratePlanId: "",
  adults: "2",
  children: "0",
  notes: "",
};

type Fields = typeof EMPTY;

/**
 * One booking — being taken, or being corrected.
 *
 * A dialog rather than a page, because what somebody wants after changing a
 * stay is to look at the calendar again and see where it went; a round trip
 * through another screen puts a navigation between the change and its effect.
 * One component for both because they are the same eleven fields, and the
 * inline form this replaces had quietly drifted to a different subset of them.
 *
 * Taking a booking does not close it. The front desk flow is: take the booking
 * while the guest is standing there, then type their passport into the guest
 * list — so on success the panel becomes the edit view of what was just
 * created, with the guest section now available.
 *
 * Cancelling is here and not on the grid deliberately: it gives the nights back
 * at once, and a gesture that empties a room should take more than one click on
 * a crowded screen.
 */
export default function BookingPanel({
  booking,
  prefill,
  rooms,
  groups,
  plans,
  slug,
  cardBase,
  onClose,
  onCreated,
  create,
  save,
  assign,
  setStatus,
}: {
  /** A booking to correct, the string "new" to take one, or nothing. */
  booking: Booking | "new" | null;
  prefill?: Prefill;
  rooms: Room[];
  groups: { id: number; name: string }[];
  plans: RatePlan[];
  /** Which venue, for the guest and booking endpoints. */
  slug: string;
  /** Where the registration card lives, for the link at check-in. */
  cardBase?: string;
  onClose: () => void;
  /**
   * The booking that was just taken.
   *
   * The panel cannot promote itself from "new" to editing — `booking` is a
   * prop, and writing to its own copy of it only makes the next render seed the
   * blank form again. So the owner is told, and moves the selection.
   */
  onCreated?: (booking: Booking) => void;
  create: (values: Record<string, unknown>) => Promise<CreateResult>;
  save: (id: number, patch: Record<string, unknown>) => Promise<EditResult>;
  /** Separate from `save` because it rewrites the night ledger, not a column. */
  assign: (id: number, roomId: number | null) => Promise<EditResult>;
  setStatus: (id: number, status: string) => Promise<EditResult>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  const [form, setForm] = useState<Fields>(EMPTY);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * The booking being edited, once it is known in full.
   *
   * A stay opened from a grid cell arrives as a partial record — a room-night
   * carries the guest and the dates and nothing else — so the panel paints from
   * that immediately and fills in the email, headcount, notes and total when
   * this lands. Fattening the calendar's payload instead would multiply every
   * one of those fields by the length of every stay on screen.
   */
  const [full, setFull] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);

  const [guests, setGuests] = useState<BookingGuest[]>([]);
  const [canStorePassports, setCanStorePassports] = useState(true);

  const taking = booking === "new";
  const opened = booking !== null;
  /** The best record we have: the fetched one, else what the grid handed over. */
  const current = taking ? null : full ?? (booking as Booking | null);

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setForm((was) => ({ ...was, [key]: value }));
  }

  async function load(id: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/booking/${slug}/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.booking) {
        setFull(data.booking);
        // Only the fields the partial record could not carry. Re-seeding the
        // ones already on screen would throw away anything typed in the second
        // it took this to arrive.
        setForm((was) => ({
          ...was,
          guestEmail: data.booking.guestEmail ?? "",
          guestPhone: data.booking.guestPhone ?? "",
          adults: String(data.booking.adults ?? 2),
          children: String(data.booking.children ?? 0),
          notes: data.booking.notes ?? "",
        }));
      }
      setGuests(data.guests ?? []);
      setCanStorePassports(data.canStorePassports !== false);
    } catch {
      // A detail fetch that fails must not stop somebody changing the dates.
      // The panel keeps what the grid gave it and everything else still works.
    } finally {
      setLoading(false);
    }
  }

  async function reloadGuests(id: number) {
    try {
      const res = await fetch(`/api/guests/${slug}/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setGuests(data.guests ?? []);
      setCanStorePassports(data.canStorePassports !== false);
    } catch {
      // As above.
    }
  }

  // Re-seed when a different booking is opened. Adjusted during render rather
  // than in an effect, so the panel never paints the last booking's guest under
  // this one's title.
  const [seen, setSeen] = useState<Booking | "new" | null>(null);
  if (booking !== seen) {
    setSeen(booking);
    setProblem("");
    setGuests([]);
    setFull(null);

    if (booking === "new") {
      setForm({
        ...EMPTY,
        groupId: prefill?.groupId ? String(prefill.groupId) : String(groups[0]?.id ?? ""),
        roomId: prefill?.roomId ? String(prefill.roomId) : "",
        arrival: prefill?.arrival ?? "",
        // One night, offered. Most bookings taken at a desk are short, and a
        // date somebody has to change is still less work than two they have to
        // type.
        departure:
          prefill?.departure ??
          (prefill?.arrival ? nextDay(prefill.arrival) : ""),
      });
    } else if (booking) {
      setForm({
        ...EMPTY,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail ?? "",
        guestPhone: booking.guestPhone ?? "",
        arrival: booking.arrival,
        departure: booking.departure,
        groupId: String(booking.groupId),
        roomId: booking.roomId ? String(booking.roomId) : "",
        ratePlanId: booking.ratePlanId ? String(booking.ratePlanId) : "",
        adults: String(booking.adults ?? 2),
        children: String(booking.children ?? 0),
        notes: booking.notes ?? "",
      });
      // Fired from render deliberately: it sets no state synchronously, and an
      // effect would paint the previous booking's guests first.
      void load(booking.id);
    }
  }

  // showModal is imperative — there is no prop for "open" that also traps focus
  // and lights the backdrop, so opening and closing has to be done to the node.
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (opened && !node.open) node.showModal();
    if (!opened && node.open) node.close();
  }, [opened]);

  if (!opened) {
    return <dialog ref={dialog} className="editor" aria-label="Booking" />;
  }

  const groupId = Number(form.groupId) || 0;
  const forGroup = rooms.filter((r) => r.groupId === groupId);
  const forGroupPlans = plans.filter((p) => p.groupId === groupId);
  const count = nightCount(form.arrival, form.departure);

  /** Roughly, before the server says. Its own word, because it is a guess. */
  const plan = forGroupPlans.find((p) => String(p.id) === form.ratePlanId) ?? forGroupPlans[0];
  const guide =
    plan?.baseMinor && count > 0
      ? `about ฿${((plan.baseMinor * count) / 100).toLocaleString()}`
      : "";

  async function take() {
    if (busy) return;
    setBusy(true);
    setProblem("");
    try {
      const result = await create({
        guestName: form.guestName.trim(),
        guestEmail: form.guestEmail.trim() || null,
        guestPhone: form.guestPhone.trim() || null,
        arrival: form.arrival,
        departure: form.departure,
        groupId,
        roomId: form.roomId ? Number(form.roomId) : null,
        ratePlanId: form.ratePlanId ? Number(form.ratePlanId) : null,
        adults: Number(form.adults) || 1,
        children: Number(form.children) || 0,
        notes: form.notes.trim() || null,
      });

      if (result.error) {
        setProblem(result.error);
        return;
      }
      // Stay open on what was just taken, so the passport can go in now.
      if (result.booking) onCreated?.(result.booking);
      else onClose();
    } catch {
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (busy || !current) return;
    setBusy(true);
    setProblem("");
    try {
      const result = await save(current.id, {
        guestName: form.guestName,
        guestEmail: form.guestEmail.trim() || null,
        guestPhone: form.guestPhone.trim() || null,
        arrival: form.arrival,
        departure: form.departure,
        groupId,
        adults: Number(form.adults) || 1,
        children: Number(form.children) || 0,
        notes: form.notes.trim() || null,
      });

      // The room moves through its own call, because on the server it is a
      // different operation: it rewrites the night ledger rather than setting a
      // column. Folding it into the patch would also hide which of the two
      // failed, and "the dates saved but the room did not" is exactly the thing
      // somebody needs told.
      const wanted = form.roomId ? Number(form.roomId) : null;
      const roomResult: EditResult =
        !result.error && wanted !== current.roomId
          ? await assign(current.id, wanted)
          : {};

      const err = result.error || roomResult.error;
      if (err) {
        setProblem(err);
        return;
      }
      onClose();
    } catch {
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function mark(status: string) {
    if (busy || !current) return;
    setBusy(true);
    setProblem("");
    try {
      const result = await setStatus(current.id, status);
      if (result.error) setProblem(result.error);
      else {
          onClose();
      }
    } catch {
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addGuest(guest: Record<string, string>) {
    if (!current) return { error: "Save the booking first." };
    const res = await fetch(`/api/guests/${slug}/${current.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guest),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "Could not add that guest." };
    await reloadGuests(current.id);
    return {};
  }

  async function updateGuest(id: number, patch: Record<string, unknown>) {
    if (!current) return { error: "No booking." };
    const res = await fetch(`/api/guests/${slug}/${current.id}?guestId=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "Could not save that guest." };
    // Reloaded rather than patched in place: `reportable`, `ready` and
    // `missing` are all worked out on the server, and guessing at them here
    // would mean two answers to "does this guest need notifying".
    await reloadGuests(current.id);
    return {};
  }

  async function removeGuest(id: number) {
    if (!current) return { error: "No booking." };
    const res = await fetch(`/api/guests/${slug}/${current.id}?guestId=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data.error ?? "Could not remove that guest." };
    }
    await reloadGuests(current.id);
    return {};
  }

  return (
    <dialog
      ref={dialog}
      className="editor"
      aria-labelledby="booking-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="editor-body">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "flex-start",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              id="booking-title"
              style={{
                margin: 0,
                fontFamily: "var(--display)",
                fontWeight: 400,
                fontSize: "1.3rem",
                color: "var(--cream)",
              }}
            >
              {taking ? "Take a Booking" : form.guestName || current?.guestName}
            </h2>
            <span style={{ fontSize: "0.85rem", color: "var(--admin-muted)" }}>
              {taking
                ? "Leave the room blank and it sits unassigned until you pick one."
                : `${current?.groupName ?? ""}${
                    current?.roomName ? ` · ${current.roomName}` : " · no room yet"
                  } · ${current?.source ?? ""}`}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* The form's own tour: it runs inside this dialog. */}
            {taking ? <TourButton tour="booking-form" fromLink={false} /> : null}
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {problem ? (
          <p className="cal-problem" role="alert">
            {problem}
          </p>
        ) : null}

        <div
          style={{
            display: "grid",
            gap: "0.9rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
          }}
        >
          <div style={{ gridColumn: "1 / -1" }} data-tour="bf-guest">
            <label htmlFor="p-guest" style={label}>
              Guest
            </label>
            <input
              id="p-guest"
              value={form.guestName}
              disabled={busy}
              maxLength={120}
              onChange={(e) => set("guestName", e.target.value)}
              style={field}
            />
          </div>

          <div>
            <label htmlFor="p-email" style={label}>
              Email
            </label>
            <input
              id="p-email"
              type="email"
              value={form.guestEmail}
              disabled={busy}
              placeholder={loading ? "…" : ""}
              onChange={(e) => set("guestEmail", e.target.value)}
              style={field}
            />
          </div>

          <div>
            <label htmlFor="p-phone" style={label}>
              Phone
            </label>
            <input
              id="p-phone"
              value={form.guestPhone}
              disabled={busy}
              placeholder={loading ? "…" : ""}
              onChange={(e) => set("guestPhone", e.target.value)}
              style={field}
            />
          </div>

          <div data-tour="bf-dates">
            <label htmlFor="p-arrival" style={label}>
              Arrival
            </label>
            <input
              id="p-arrival"
              type="date"
              value={form.arrival}
              disabled={busy}
              onChange={(e) => set("arrival", e.target.value)}
              style={field}
            />
          </div>

          <div>
            <label htmlFor="p-departure" style={label}>
              Departure
            </label>
            <input
              id="p-departure"
              type="date"
              value={form.departure}
              disabled={busy}
              onChange={(e) => set("departure", e.target.value)}
              style={field}
            />
          </div>

          <div data-tour="bf-room">
            <label htmlFor="p-group" style={label}>
              Room Type
            </label>
            <select
              id="p-group"
              value={form.groupId}
              disabled={busy}
              onChange={(e) => {
                // The room and the rate belong to the old type; keeping either
                // would send a room somebody cannot have.
                setForm((was) => ({
                  ...was,
                  groupId: e.target.value,
                  roomId: "",
                  ratePlanId: "",
                }));
              }}
              style={{ ...field, appearance: "auto" }}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="p-room" style={label}>
              Room
            </label>
            <select
              id="p-room"
              value={form.roomId}
              disabled={busy}
              onChange={(e) => set("roomId", e.target.value)}
              style={{ ...field, appearance: "auto" }}
            >
              <option value="">Not in a Room</option>
              {forGroup.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="p-adults" style={label}>
              Adults
            </label>
            <input
              id="p-adults"
              type="number"
              min={1}
              max={20}
              value={form.adults}
              disabled={busy}
              onChange={(e) => set("adults", e.target.value)}
              style={field}
            />
          </div>

          <div>
            <label htmlFor="p-children" style={label}>
              Children
            </label>
            <input
              id="p-children"
              type="number"
              min={0}
              max={20}
              value={form.children}
              disabled={busy}
              onChange={(e) => set("children", e.target.value)}
              style={field}
            />
          </div>

          {taking && forGroupPlans.length > 0 ? (
            <div>
              <label htmlFor="p-rate" style={label}>
                Rate
              </label>
              <select
                id="p-rate"
                value={form.ratePlanId}
                disabled={busy}
                onChange={(e) => set("ratePlanId", e.target.value)}
                style={{ ...field, appearance: "auto" }}
              >
                <option value="">No Rate</option>
                {forGroupPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.base ? ` · ${p.base}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="p-notes" style={label}>
              Notes
            </label>
            <textarea
              id="p-notes"
              value={form.notes}
              disabled={busy}
              rows={2}
              maxLength={2000}
              placeholder={loading ? "…" : "Late arrival, cot needed, anything the desk should know"}
              onChange={(e) => set("notes", e.target.value)}
              style={{ ...field, resize: "vertical" }}
            />
          </div>
        </div>

        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--admin-muted)" }}>
          {count > 0
            ? `${count} night${count === 1 ? "" : "s"}${
                taking && guide ? ` · ${guide}` : ""
              }`
            : "Departure has to be after arrival"}
          {/*
            What it was quoted at, not what it would cost now. A rate changed in
            March must not reprice a stay taken in January, so this is read-only
            and changing the plan afterwards is deliberately not offered here.
          */}
          {!taking && current?.total ? ` · quoted ${current.total}` : ""}
        </p>

        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          {taking ? (
            <button
              type="button"
              className="btn btn-go"
              data-tour="bf-take"
              disabled={busy || count === 0 || !form.guestName.trim() || !groupId}
              onClick={() => void take()}
            >
              {busy ? "Taking…" : "Take the Booking"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-go"
                disabled={busy || count === 0}
                onClick={() => void commit()}
              >
                {busy ? "Saving…" : "Save"}
              </button>

              {/*
                The card the guest signs. A link rather than a button, so it
                opens in its own tab and the panel behind it keeps whatever
                was being typed — a print dialog that costs somebody their
                half-finished edit is a print dialog they stop using.
              */}
              {cardBase && current ? (
                <Link
                  className="btn btn-quiet"
                  href={`${cardBase}/${current.id}`}
                  target="_blank"
                >
                  Registration Card
                </Link>
              ) : null}

              {STATUS.filter((s) => s.id !== current?.status).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="btn btn-quiet"
                  disabled={busy}
                  onClick={() => void mark(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </>
          )}
        </div>

        {taking ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--admin-muted)" }}>
            Guests and passports can go in once the booking is taken.
          </p>
        ) : current ? (
          <GuestList
            guests={guests}
            canStorePassports={canStorePassports}
            add={addGuest}
            update={updateGuest}
            remove={removeGuest}
          />
        ) : null}
      </div>
    </dialog>
  );
}

/** One night on, for the departure a single-night stay implies. */
function nextDay(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t)
    ? new Date(t + 86_400_000).toISOString().slice(0, 10)
    : "";
}
