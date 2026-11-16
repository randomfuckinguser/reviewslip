import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import DeskBoard from "@/components/dashboard/DeskBoard";
import {
  call,
  currentUser,
  sessionToken,
  type Booking,
  type DayView,
  type RatePlan,
  type Room,
  type RoomGroup,
  venueName,
} from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { shift, todayAt } from "@/lib/nights";

export const metadata: Metadata = {
  title: "Today",
  robots: { index: false, follow: false },
};

/** "Thursday 11 September" — what somebody checks they are on the right day by. */
function longDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default async function TodayPage({
  params,
  searchParams,
}: PageProps<"/[lang]/dashboard/[slug]/bookings">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  const query = await searchParams;
  const asked = Array.isArray(query.date) ? query.date[0] : query.date;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(asked ?? ""))
    ? String(asked)
    : todayAt("Asia/Bangkok");

  const token = await sessionToken();

  let day: DayView;
  let rooms: { groups: RoomGroup[]; rooms: Room[] };
  let plans: { plans: RatePlan[] };
  try {
    [day, rooms, plans] = await Promise.all([
      call<DayView>(`/businesses/${slug}/day?date=${date}`, { token }),
      call<{ groups: RoomGroup[]; rooms: Room[] }>(`/businesses/${slug}/rooms`, {
        token,
      }),
      call<{ plans: RatePlan[] }>(`/businesses/${slug}/rates`, { token }),
    ]);
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const here = localizedPath(locale, `/dashboard/${slug}/bookings`);

  /**
   * Take a booking from the desk.
   *
   * The same action the calendar has, because somebody walking in without a
   * reservation is the commonest way a booking starts, and the desk is where
   * they are standing. Returns the booking so the panel can stay open on it and
   * the passport can go in straight away.
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
      return {
        error: err instanceof Error ? err.message : "Could not take that booking.",
      };
    }
  }
  const link = (d: string) => (d === todayAt("Asia/Bangkok") ? here : `${here}?date=${d}`);

  async function mark(id: number, status: string) {
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
      // Returned rather than thrown: the caller is a button in a list that has
      // to say what happened without taking the page down with it.
      return { error: err instanceof Error ? err.message : "Could not do that." };
    }

    revalidatePath(here);
    return {};
  }

  async function checkIn(id: number) {
    "use server";
    return mark(id, "in_house");
  }

  async function checkOut(id: number) {
    "use server";
    return mark(id, "checked_out");
  }

  async function setHousekeeping(roomId: number, state: string) {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    try {
      await call(`/businesses/${slug}/rooms/${roomId}/housekeeping`, {
        method: "POST",
        body: { state },
        token: t,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not do that." };
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
      return { error: err instanceof Error ? err.message : "Could not save that." };
    }

    revalidatePath(here);
    return {};
  }

  async function assign(id: number, roomId: number | null) {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    try {
      await call(`/businesses/${slug}/bookings/${id}/assign`, {
        method: "POST",
        body: { roomId },
        token: t,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not move that." };
    }

    revalidatePath(here);
    return {};
  }

  const venue = await venueName(slug);

  return (
    <>
    {/* The day is the second line, beside the venue: it is what this screen is
        showing, and it changes with the three buttons on the right. */}
    <PageHeader tour="today"
      title="Today"
      sub={`${venue} · ${longDate(date)}`}
      back={localizedPath(locale, `/dashboard/${slug}`)}
    >
      <Link className="btn btn-quiet" href={link(shift(date, -1))}>
        Yesterday
      </Link>
      <Link className="btn btn-quiet" href={here}>
        Today
      </Link>
      <Link className="btn btn-quiet" href={link(shift(date, 1))}>
        Tomorrow
      </Link>
    </PageHeader>
    <div className="page-body">

    {/* Something to fix before they walk in: a flashbar across the top. */}
    {day.counts.unassignedArrivals > 0 ? (
      <div className="flash is-warn" role="status">
        <span>
          {day.counts.unassignedArrivals} arrival
          {day.counts.unassignedArrivals === 1 ? "" : "s"} with no room — give them one on the{" "}
          <Link href={localizedPath(lang, `/dashboard/${slug}/bookings/calendar`)}>calendar</Link>.
        </span>
      </div>
    ) : (
      <p className="admin-sub">Everything arriving today has a room.</p>
    )}

    <DeskBoard
      day={day}
      rooms={rooms.rooms}
      groups={rooms.groups.map((g) => ({ id: g.id, name: g.name }))}
      plans={plans.plans}
      slug={slug}
      create={book}
      checkIn={checkIn}
      checkOut={checkOut}
      setHousekeeping={setHousekeeping}
      save={save}
      assign={assign}
      markStatus={mark}
    />
    </div>
  </>
  );
}
