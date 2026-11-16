import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import PageHeader from "@/components/app-shell/PageHeader";
import Diary from "@/components/dashboard/Diary";
import RoomTypeFilter from "@/components/dashboard/RoomTypeFilter";
import ViewToggle from "@/components/dashboard/ViewToggle";
import {
  call,
  currentUser,
  sessionToken,
  type Booking,
  type CalendarWindow,
  type RatePlan,
  venueName,
} from "@/lib/customer";
import {
  addMonths,
  daysInMonth,
  monthLabel,
  monthStart,
  todayAt,
} from "@/lib/nights";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Calendar",
  robots: { index: false, follow: false },
};

export default async function CalendarPage({
  params,
  searchParams,
}: PageProps<"/[lang]/dashboard/[slug]/bookings/calendar">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  const query = await searchParams;
  const asked = Array.isArray(query.start) ? query.start[0] : query.start;

  // TODO: read the venue's own timezone once the settings page exposes it. The
  // column exists; until it is editable, the market this is built for is the
  // right default and is better than UTC by seven hours.
  /*
   * A whole month, snapped to the 1st.
   *
   * Snapped rather than taken literally, so a hand-typed or stale
   * `?start=2026-02-17` draws February instead of a ragged window running into
   * March — which would put the same night in two different views depending on
   * how somebody arrived.
   */
  const start =
    monthStart(String(asked ?? "")) ?? monthStart(todayAt("Asia/Bangkok"))!;
  const days = daysInMonth(start);

  // Which room type, if any. Zero and nonsense both mean "all", because a
  // broken link should show the calendar rather than nothing.
  // Which calendar. The timeline is the default: it is the one that answers
  // "which room", and the only one a stay can be dragged across.
  const askedShape = Array.isArray(query.shape) ? query.shape[0] : query.shape;
  const shape = askedShape === "month" ? "month" : "timeline";

  const askedType = Array.isArray(query.type) ? query.type[0] : query.type;
  const typeId = Number(askedType);
  const groupId = Number.isSafeInteger(typeId) && typeId > 0 ? typeId : null;

  const token = await sessionToken();

  let data: CalendarWindow;
  let plans: { plans: RatePlan[] };
  try {
    [data, plans] = await Promise.all([
      call<CalendarWindow>(
        `/businesses/${slug}/calendar?start=${start}&days=${days}`,
        { token }
      ),
      call<{ plans: RatePlan[] }>(`/businesses/${slug}/rates`, { token }),
    ]);
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const here = localizedPath(locale, `/dashboard/${slug}/bookings/calendar`);

  /**
   * Take a booking.
   *
   * Returns the booking rather than just success, so the panel can stay open on
   * what was taken and let somebody put the passport in while the guest is
   * still at the desk. Errors come back as values, not throws — the caller is a
   * dialog that has to show them, and a thrown error there is an error boundary
   * over the whole calendar.
   */
  async function book(values: Record<string, unknown>) {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    try {
      const made = await call<{ booking: Booking }>(`/businesses/${slug}/bookings`, {
        method: "POST",
        body: values,
        token: t,
      });
      revalidatePath(here);
      return { booking: made.booking };
    } catch (err) {
      // The review app owns the rules — the dates, the capacity and the clash —
      // and its wording is the accurate one.
      return {
        error: err instanceof Error ? err.message : "Could not take that booking.",
      };
    }
  }

  /**
   * The three things that can be done to a booking, as server actions.
   *
   * They return `{ error }` rather than throwing, because the caller is a
   * dragged block that has already moved on screen and has to decide whether to
   * put itself back. A thrown error there is an error boundary and a lost grid.
   */
  /**
   * Where a dragged stay ended up.
   *
   * One PATCH, because the room and the dates are one change: the review app
   * does both inside a transaction, so a drag cannot half-land — in the new
   * room on the old nights, holding a room it was never given.
   *
   * Errors come back as values rather than thrown. The caller is a bar that
   * has already moved on screen and has to decide whether to put itself back;
   * a throw there is an error boundary and a lost calendar.
   */
  async function moveStay(
    bookingId: number,
    to: { roomId: number | null; arrival: string; departure: string }
  ) {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    try {
      await call(`/businesses/${slug}/bookings/${bookingId}`, {
        method: "PATCH",
        body: to,
        token: t,
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not move that.",
      };
    }

    revalidatePath(here);
    return {};
  }

  async function move(bookingId: number, roomId: number | null) {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    try {
      await call(`/businesses/${slug}/bookings/${bookingId}/assign`, {
        method: "POST",
        body: { roomId },
        token: t,
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not move that.",
      };
    }

    revalidatePath(here);
    return {};
  }

  async function save(id: number, patch: Record<string, unknown>) {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    try {
      await call(`/businesses/${slug}/bookings/${id}`, {
        method: "PATCH",
        body: patch,
        token: t,
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not save that.",
      };
    }

    revalidatePath(here);
    return {};
  }

  async function setStatus(id: number, status: string) {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    try {
      await call(`/businesses/${slug}/bookings/${id}/status`, {
        method: "POST",
        body: { status },
        token: t,
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not change that.",
      };
    }

    revalidatePath(here);
    return {};
  }

  /**
   * The room types, with how many rooms each holds.
   *
   * Taken from the rooms that came back rather than fetched separately — which
   * does mean a type with no rooms in it cannot be booked from this page, and
   * should not be: there is nothing to put anybody in.
   */
  const groups = Array.from(
    data.rooms.reduce((seen, r) => {
      const at = seen.get(r.groupId);
      if (at) at.rooms += 1;
      else seen.set(r.groupId, { id: r.groupId, name: r.groupName ?? "", capacity: 0, sort: 0, rooms: 1 });
      return seen;
    }, new Map<number, { id: number; name: string; capacity: number; sort: number; rooms: number }>()).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  /** This page at another month, keeping the room-type filter. */
  function month(at: string): string {
    const next = new URLSearchParams();
    if (at) next.set("start", at);
    if (groupId) next.set("type", String(groupId));
    if (shape === "month") next.set("shape", shape);
    const q = next.toString();
    return q ? `${here}?${q}` : here;
  }

  const venue = await venueName(slug);

  return (
    <>
    <PageHeader tour="calendar"
      title="Calendar"
      sub={`${venue} · ${monthLabel(start, locale)}`}
      back={localizedPath(locale, `/dashboard/${slug}`)}
    >
      <Link
        className="icon-btn"
        href={month(addMonths(start, -1))}
        aria-label="Previous Month"
        title="Previous Month"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </Link>
      <Link className="btn btn-quiet" href={month("")}>
        <CalendarDays size={15} aria-hidden="true" />
        This Month
      </Link>
      <Link
        className="icon-btn"
        href={month(addMonths(start, 1))}
        aria-label="Next Month"
        title="Next Month"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </PageHeader>
    <div className="page-body">

    <ViewToggle
      calendar={localizedPath(locale, `/dashboard/${slug}/bookings/calendar`)}
      list={localizedPath(locale, `/dashboard/${slug}/bookings/list`)}
      here="calendar"
      shape={shape}
    />

    <RoomTypeFilter groups={groups} />

    {data.rooms.length === 0 ? (
      <p className="admin-empty">
        No rooms yet.{" "}
        <Link
          href={localizedPath(lang, `/dashboard/${slug}/bookings/rooms`)}
          style={{ color: "var(--jade)" }}
        >
          Set up room types and rooms
        </Link>{" "}
        and the calendar will draw itself.
      </p>
    ) : (
      <Diary
        data={data}
        groupId={groupId}
        today={todayAt("Asia/Bangkok")}
        shape={shape}
        move={moveStay}
        deskBase={localizedPath(locale, `/dashboard/${slug}/bookings`)}
        cardBase={localizedPath(locale, `/dashboard/${slug}/bookings/card`)}
        slug={slug}
        groups={groups}
        plans={plans.plans}
        create={book}
        save={save}
        assign={move}
        setStatus={setStatus}
      />
    )}

    </div>
  </>
  );
}
