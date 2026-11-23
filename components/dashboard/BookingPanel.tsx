"use client";

import FormTourButton from "@/components/help/FormTourButton";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import GuestList from "./GuestList";
import { nightCount } from "@/lib/nights";
import type { Booking, BookingGuest, Customer, PaymentStatus, RatePlan, Room } from "@/lib/customer";

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

/** A booking being taken, as far as the form has it: for the calendar to draw. */
export interface Draft {
  roomId: number | null;
  groupId: number;
  arrival: string;
  departure: string;
  guestName: string;
}

/** The stay's own state, in the order a stay goes through them. */
const STATUS: { id: Booking["status"]; label: string; tone: string }[] = [
  { id: "confirmed", label: "Confirmed", tone: "info" },
  { id: "in_house", label: "Checked In", tone: "good" },
  { id: "checked_out", label: "Checked Out", tone: "muted" },
  { id: "no_show", label: "No Show", tone: "warn" },
  { id: "cancelled", label: "Cancelled", tone: "bad" },
];

/** Whether it is paid. Apart from the stay's state: a guest can be out and still owe. */
const PAYMENT: { id: PaymentStatus; label: string; tone: string }[] = [
  { id: "unpaid", label: "Not Paid", tone: "bad" },
  { id: "deposit", label: "Deposit Paid", tone: "warn" },
  { id: "paid", label: "Paid", tone: "good" },
  { id: "refunded", label: "Refunded", tone: "muted" },
];

/** "27 Sep 2027" from "2027-09-27". */
function shortDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "3rd", for "3rd stay". */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

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
  /** A returning guest picked from the suggestions, or "" for whoever the details match. */
  customerId: "",
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
  docked = true,
  onDraft,
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
  /**
   * At the side of the screen and not modal, on the calendar: the schedule
   * stays in sight and can still be clicked while a booking is taken, so a
   * free night is picked by looking at it rather than remembered.
   */
  docked?: boolean;
  /** Told the room and dates as they are typed, so the calendar can show them. */
  onDraft?: (draft: Draft | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const [form, setForm] = useState<Fields>(EMPTY);
  // The status bar's two answers, kept here so a change shows at once and the
  // panel stays open on it rather than closing to say so.
  const [stay, setStay] = useState<Booking["status"]>("confirmed");
  const [paid, setPaid] = useState<PaymentStatus>("unpaid");
  // A returning guest: who the details being typed might be, and who was picked.
  const [matches, setMatches] = useState<Customer[]>([]);
  const [picked, setPicked] = useState<Customer | null>(null);
  const [copying, setCopying] = useState(false);
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
        setStay(data.booking.status);
        setPaid(data.booking.paymentStatus ?? "unpaid");
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

    setMatches([]);
    setPicked(null);
    if (booking && booking !== "new") {
      setStay(booking.status);
      setPaid(booking.paymentStatus ?? "unpaid");
    }

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

  // A night picked on the calendar while a booking is being taken moves the
  // room and the dates, and nothing else: the guest typed so far stays.
  const [seenPrefill, setSeenPrefill] = useState(prefill);
  if (prefill !== seenPrefill) {
    setSeenPrefill(prefill);
    if (booking === "new" && booking === seen && prefill) {
      setForm((was) => ({
        ...was,
        groupId: prefill.groupId ? String(prefill.groupId) : was.groupId,
        roomId: prefill.roomId ? String(prefill.roomId) : was.roomId,
        arrival: prefill.arrival ?? was.arrival,
        departure:
          prefill.departure ?? (prefill.arrival ? nextDay(prefill.arrival) : was.departure),
      }));
    }
  }

  // showModal is imperative — there is no prop for "open" that also traps focus
  // and lights the backdrop, so opening and closing has to be done to the node.
  // Docked, it is shown without the modal: the calendar beside it stays live.
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (opened && !node.open) {
      if (docked) node.show();
      else node.showModal();
    }
    if (!opened && node.open) node.close();
  }, [opened, docked]);

  // Docked, the page steps aside for the panel so nothing is underneath it.
  useEffect(() => {
    if (!docked) return;
    document.body.classList.toggle("has-side-panel", opened);
    return () => document.body.classList.remove("has-side-panel");
  }, [docked, opened]);

  // A returning guest, offered while their details are typed: by the email if
  // one is going in, else the phone, else the name. Only while taking a
  // booking and nobody has been picked; a quarter-second after the last key.
  const lookFor = (() => {
    if (booking !== "new" || picked) return "";
    if (form.guestEmail.includes("@")) return form.guestEmail.trim();
    if (form.guestPhone.replace(/\D/g, "").length >= 6) return form.guestPhone.trim();
    return form.guestName.trim().length >= 2 ? form.guestName.trim() : "";
  })();
  useEffect(() => {
    if (!lookFor) return;
    let gone = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/${slug}?q=${encodeURIComponent(lookFor)}`, { cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        if (!gone) setMatches(Array.isArray(data?.customers) ? data.customers : []);
      } catch {
        // No suggestions is fine: the booking still takes.
      }
    }, 250);
    return () => {
      gone = true;
      window.clearTimeout(timer);
    };
  }, [lookFor, slug]);
  const offered = lookFor ? matches : [];

  // The booking being taken, for the calendar to draw where it would go.
  const draftRoom = form.roomId;
  const draftGroup = form.groupId;
  const draftArrival = form.arrival;
  const draftDeparture = form.departure;
  const draftName = form.guestName;
  useEffect(() => {
    if (!onDraft) return;
    const valid =
      booking === "new" &&
      /^\d{4}-\d{2}-\d{2}$/.test(draftArrival) &&
      /^\d{4}-\d{2}-\d{2}$/.test(draftDeparture) &&
      draftDeparture > draftArrival;
    onDraft(
      valid
        ? {
            roomId: draftRoom ? Number(draftRoom) : null,
            groupId: Number(draftGroup) || 0,
            arrival: draftArrival,
            departure: draftDeparture,
            guestName: draftName.trim(),
          }
        : null
    );
  }, [onDraft, booking, draftRoom, draftGroup, draftArrival, draftDeparture, draftName]);

  if (!opened) {
    return <dialog ref={dialog} className={`editor bp${docked ? " is-docked" : ""}`} aria-label="Booking" />;
  }

  const groupId = Number(form.groupId) || 0;
  const forGroup = rooms.filter((r) => r.groupId === groupId);
  const forGroupPlans = plans.filter((p) => p.groupId === groupId);
  const count = nightCount(form.arrival, form.departure);

  /**
   * The rate a new booking is priced at: the one picked, else the type's
   * first — the same one the Rate box shows, so the estimate on screen is what
   * gets saved. "none" is No Rate, chosen on purpose.
   */
  const plan =
    form.ratePlanId === "none"
      ? undefined
      : forGroupPlans.find((p) => String(p.id) === form.ratePlanId) ?? forGroupPlans[0];

  async function take(close = false) {
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
        ratePlanId: plan?.id ?? null,
        adults: Number(form.adults) || 1,
        children: Number(form.children) || 0,
        notes: form.notes.trim() || null,
        customerId: form.customerId ? Number(form.customerId) : null,
      });

      if (result.error) {
        setProblem(result.error);
        return;
      }
      // Stay open on what was just taken, so the passport can go in now —
      // unless it was Done.
      if (result.booking && !close) onCreated?.(result.booking);
      else onClose();
    } catch {
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function commit(close = true) {
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
      if (close) onClose();
      else {
        // Saved and still open: what the server now says, here and behind.
        await load(current.id);
        router.refresh();
      }
    } catch {
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  /** The stay's state, from the status bar: changed in place, the panel stays open. */
  async function changeStay(next: Booking["status"]) {
    if (busy || !current || next === stay) return;
    setBusy(true);
    setProblem("");
    try {
      const result = await setStatus(current.id, next);
      if (result.error) setProblem(result.error);
      else setStay(next);
    } catch {
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Whether it is paid, from the status bar. */
  async function changePaid(next: PaymentStatus) {
    if (busy || !current || next === paid) return;
    setBusy(true);
    setProblem("");
    try {
      const res = await fetch(`/api/booking/${slug}/${current.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setProblem(data.error ?? "Could not change that.");
      else {
        setPaid(next);
        // The lists behind the panel say whether a stay is paid too.
        router.refresh();
      }
    } catch {
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  /** A returning guest's party, carried over from their last stay. */
  async function copyGuests() {
    if (!current || copying) return;
    setCopying(true);
    setProblem("");
    try {
      const res = await fetch(`/api/guests/${slug}/${current.id}/copy`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setProblem(data.error ?? "Could not copy the guests.");
      else if (!data.copied) setProblem("Nobody to copy: their last stay has no guests on it, or they are already here.");
      await reloadGuests(current.id);
    } finally {
      setCopying(false);
    }
  }

  /** Fill the guest's details from a returning customer. */
  function pick(customer: Customer) {
    setPicked(customer);
    setMatches([]);
    setForm((was) => ({
      ...was,
      customerId: String(customer.id),
      guestName: customer.name,
      guestEmail: customer.email ?? was.guestEmail,
      guestPhone: customer.phone ?? was.guestPhone,
    }));
  }

  // The customer's own page, beside this venue's other screens.
  const at = pathname.indexOf(`/dashboard/${slug}`);
  const customersBase = at >= 0 ? `${pathname.slice(0, at)}/dashboard/${slug}/customers` : "";
  const stays = full?.customerStays ?? 0;
  const customerId = full?.customerId ?? current?.customerId ?? null;

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

  // What the stay costs, as lines: the nights at the rate they were quoted.
  const stayNights = taking ? count : current?.nights ?? count;
  const totalMinor = taking
    ? plan?.baseMinor && count > 0
      ? plan.baseMinor * count
      : null
    : current?.totalMinor ?? null;
  const unitMinor = totalMinor !== null && stayNights > 0 ? Math.round(totalMinor / stayNights) : null;
  const typeName = groups.find((g) => g.id === groupId)?.name ?? current?.groupName ?? "Room";
  const planName = taking ? plan?.name : plans.find((p) => p.id === current?.ratePlanId)?.name;
  const outstanding: string =
    totalMinor === null
      ? "—"
      : taking
        ? money(totalMinor)
        : paid === "unpaid"
          ? money(totalMinor)
          : paid === "deposit"
            ? "Deposit paid"
            : money(0);
  const stayTone = STATUS.find((s) => s.id === stay)?.tone ?? "info";
  const paidTone = PAYMENT.find((p) => p.id === paid)?.tone ?? "bad";

  return (
    <dialog
      ref={dialog}
      className={`editor bp${docked ? " is-docked" : ""}`}
      aria-labelledby="booking-title"
      onCancel={onClose}
      // Escape closes a modal dialog by itself, not one opened with show().
      onKeyDown={(e) => {
        if (docked && e.key === "Escape") onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="editor-body bp-body">
        {/* The toolbar, as on an edit screen: back, what this is, and the two
            ways out — Save keeps it open, Done saves and closes. */}
        <div className="bp-toolbar">
          <button type="button" className="icon-btn bp-back" onClick={onClose} aria-label="Close" title="Close">
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <h2 id="booking-title" className="bp-title card-title">
            {taking ? "New Booking" : "Edit Booking"}
          </h2>
          <div className="bp-tools">
            {taking ? <FormTourButton tour="booking-form" /> : null}
            <button
              type="button"
              className="btn btn-quiet"
              data-tour={taking ? "bf-take" : undefined}
              disabled={busy || count === 0 || !form.guestName.trim() || !groupId}
              onClick={() => void (taking ? take() : commit(false))}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn btn-go"
              disabled={busy || count === 0 || !form.guestName.trim() || !groupId}
              onClick={() => void (taking ? take(true) : commit(true))}
            >
              Done
            </button>
          </div>
        </div>

        {/* The status band: the stay's state on the left in its colour, and
            whether it is paid on the right. Each one choice to change. */}
        <div className="bp-band" data-tone={taking ? "muted" : stayTone} data-tour="bf-status">
          {taking ? (
            <span className="bp-band-new">New · not taken yet</span>
          ) : (
            <label className="bp-pick" data-tone={stayTone}>
              <select
                aria-label="Stay status"
                value={stay}
                disabled={busy}
                onChange={(e) => void changeStay(e.target.value as Booking["status"])}
              >
                {STATUS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!taking ? (
            <label className="bp-pick bp-pick-pay" data-tone={paidTone}>
              <span className="bp-band-label">Payment</span>
              <select
                aria-label="Payment status"
                value={paid}
                disabled={busy}
                onChange={(e) => void changePaid(e.target.value as PaymentStatus)}
              >
                {PAYMENT.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {problem ? (
          <p className="cal-problem" role="alert">
            {problem}
          </p>
        ) : null}

        {/* Label beside its field, two to a row where they are short: the
            whole booking on one screen without scrolling. */}
        <div className="bp-form">
          <div className="bp-f">
            <span className="bp-l">No.</span>
            <input readOnly value={taking ? "New" : String(current?.id ?? "")} aria-label="Booking number" />
          </div>
          <div className="bp-f">
            <span className="bp-l">Source</span>
            <input readOnly value={taking ? "Desk" : current?.source ?? ""} aria-label="Source" />
          </div>

          <div className="bp-f bp-wide" data-tour="bf-guest">
            <label className="bp-l" htmlFor="p-guest">
              Guest
            </label>
            <div className="bp-v">
              <input
                id="p-guest"
                value={form.guestName}
                disabled={busy}
                maxLength={120}
                autoComplete="off"
                onChange={(e) => {
                  set("guestName", e.target.value);
                  // Typing a different name after picking someone is somebody else.
                  if (picked) {
                    setPicked(null);
                    set("customerId", "");
                  }
                }}
              />
              {picked ? (
                <p className="bp-returning">
                  Returning guest · {picked.stays ?? 0} stay{picked.stays === 1 ? "" : "s"} before
                  {picked.lastArrival ? `, last ${shortDay(picked.lastArrival)}` : ""}
                  {" · "}
                  <button
                    type="button"
                    className="linklike"
                    onClick={() => {
                      setPicked(null);
                      set("customerId", "");
                    }}
                  >
                    Not Them
                  </button>
                </p>
              ) : !taking && stays > 1 ? (
                <p className="bp-returning">
                  Returning guest · {ordinal(stays)} stay
                  {customersBase && customerId ? (
                    <>
                      {" · "}
                      <Link href={`${customersBase}/${customerId}`}>See Their Stays</Link>
                    </>
                  ) : null}
                </p>
              ) : offered.length ? (
                <div className="bp-matches" role="listbox" aria-label="Returning guests">
                  <span className="bp-matches-h">Stayed Before?</span>
                  {offered.map((c) => (
                    <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => pick(c)}>
                      <strong>{c.name}</strong>
                      <span>
                        {[c.email, c.phone].filter(Boolean).join(" · ") || "no email or phone"}
                        {" · "}
                        {c.stays ?? 0} stay{c.stays === 1 ? "" : "s"}
                        {c.lastArrival ? `, last ${shortDay(c.lastArrival)}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="bp-f bp-wide">
            <label className="bp-l" htmlFor="p-email">
              Email
            </label>
            <input
              id="p-email"
              type="email"
              value={form.guestEmail}
              disabled={busy}
              placeholder={loading ? "…" : ""}
              onChange={(e) => set("guestEmail", e.target.value)}
            />
          </div>

          <div className="bp-f bp-wide">
            <label className="bp-l" htmlFor="p-phone">
              Phone
            </label>
            <input
              id="p-phone"
              value={form.guestPhone}
              disabled={busy}
              placeholder={loading ? "…" : ""}
              onChange={(e) => set("guestPhone", e.target.value)}
            />
          </div>

          <div className="bp-f" data-tour="bf-dates">
            <label className="bp-l" htmlFor="p-arrival">
              Arrival
            </label>
            <input
              id="p-arrival"
              type="date"
              value={form.arrival}
              disabled={busy}
              onChange={(e) => set("arrival", e.target.value)}
            />
          </div>
          <div className="bp-f">
            <label className="bp-l" htmlFor="p-departure">
              Departure
            </label>
            <input
              id="p-departure"
              type="date"
              value={form.departure}
              disabled={busy}
              onChange={(e) => set("departure", e.target.value)}
            />
          </div>

          <div className="bp-f" data-tour="bf-room">
            <label className="bp-l" htmlFor="p-group">
              Type
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
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="bp-f">
            <label className="bp-l" htmlFor="p-room">
              Room
            </label>
            <select id="p-room" value={form.roomId} disabled={busy} onChange={(e) => set("roomId", e.target.value)}>
              <option value="">Not in a Room</option>
              {forGroup.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bp-f">
            <label className="bp-l" htmlFor="p-adults">
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
            />
          </div>
          <div className="bp-f">
            <label className="bp-l" htmlFor="p-children">
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
            />
          </div>

          {taking && forGroupPlans.length > 0 ? (
            <div className="bp-f bp-wide">
              <label className="bp-l" htmlFor="p-rate">
                Rate
              </label>
              <select
                id="p-rate"
                value={plan ? String(plan.id) : "none"}
                disabled={busy}
                onChange={(e) => set("ratePlanId", e.target.value)}
              >
                <option value="none">No Rate</option>
                {forGroupPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.base ? ` · ${p.base}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="bp-f bp-wide bp-top">
            <label className="bp-l" htmlFor="p-notes">
              Note
            </label>
            <textarea
              id="p-notes"
              value={form.notes}
              disabled={busy}
              rows={3}
              maxLength={2000}
              placeholder={loading ? "…" : "Late arrival, cot needed, anything the desk should know"}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        {/* What the stay costs, as an invoice's lines: what, how many, at what,
            and what is still owed. The quote is frozen when the booking is
            taken, so a rate changed later does not reprice it. */}
        <section className="bp-items" aria-labelledby="bp-items-h">
          <div className="bp-items-head">
            <h3 id="bp-items-h">Items</h3>
            <span className="bp-owed">
              Outstanding <output>{outstanding}</output>
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th className="num">Qty</th>
                <th className="num">Unit Price</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {typeName}
                  {planName ? <span className="bp-sub">{planName}</span> : null}
                </td>
                <td className="num">
                  {stayNights > 0 ? stayNights : "—"}
                  <span className="bp-sub">night{stayNights === 1 ? "" : "s"}</span>
                </td>
                <td className="num">{unitMinor !== null ? money(unitMinor) : "—"}</td>
                <td className="num">{totalMinor !== null ? money(totalMinor) : "—"}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>
                  {count === 0
                    ? "Departure has to be after arrival"
                    : totalMinor === null
                      ? "No rate on this booking"
                      : taking
                        ? "Estimate, from the rate"
                        : "Quoted when it was taken"}
                </td>
                <td className="num">{totalMinor !== null ? money(totalMinor) : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {!taking && current ? (
          <div className="bp-links">
            {/*
              The card the guest signs. A link rather than a button, so it
              opens in its own tab and the panel behind it keeps whatever was
              being typed.
            */}
            {cardBase ? (
              <Link className="btn btn-quiet" href={`${cardBase}/${current.id}`} target="_blank">
                Registration Card
              </Link>
            ) : null}
            {stays > 1 ? (
              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy || copying}
                onClick={() => void copyGuests()}
                data-tip="Their party from the last stay: names, nationality, birth dates and passports. The date they entered Thailand stays with the old trip."
              >
                {copying ? "Copying…" : "Guests From Last Stay"}
              </button>
            ) : null}
          </div>
        ) : null}

        {taking ? (
          <p className="bp-hint">
            Leave the room blank and it sits unassigned until you pick one. Guests and passports can go in once the
            booking is saved.
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

/** ฿1,800.00, from minor units. */
function money(minor: number): string {
  return `฿${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** One night on, for the departure a single-night stay implies. */
function nextDay(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t)
    ? new Date(t + 86_400_000).toISOString().slice(0, 10)
    : "";
}
