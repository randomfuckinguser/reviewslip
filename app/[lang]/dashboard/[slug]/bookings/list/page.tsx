import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import BookingListView from "@/components/dashboard/BookingListView";
import RoomTypeFilter from "@/components/dashboard/RoomTypeFilter";
import ViewToggle from "@/components/dashboard/ViewToggle";
import {
  call,
  currentUser,
  sessionToken,
  type Booking,
  type BookingList,
  type RatePlan,
  type Room,
  type RoomGroup,
  venueName,
} from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Bookings",
  robots: { index: false, follow: false },
};

/** One value out of a search param that may arrive twice. */
function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Every booking, filtered.
 *
 * All the state is in the URL. The server reads the filters, the API validates
 * them and echoes back what it applied, and the screen draws itself from that —
 * so there is exactly one copy of "what is being asked for" and it is the one
 * in the address bar.
 */
export default async function BookingListPage({
  params,
  searchParams,
}: PageProps<"/[lang]/dashboard/[slug]/bookings/list">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  const query = await searchParams;

  // Passed through rather than interpreted. The review app owns what a valid
  // filter is, and a second opinion here is a second thing to keep in step.
  const ask = new URLSearchParams();
  for (const [from, to] of [
    ["status", "status"],
    ["type", "groupId"],
    ["room", "roomId"],
    ["from", "from"],
    ["to", "to"],
    ["on", "on"],
    ["q", "q"],
    ["cursor", "cursor"],
  ] as const) {
    const value = one(query[from]);
    if (value) ask.set(to, value);
  }
  // What a desk means by "bookings" unless it says otherwise. Set here and not
  // on the server, because a list endpoint that hides rows by default is a
  // list endpoint that will eventually hide one somebody needed.
  if (!ask.has("status") && !ask.has("q")) {
    ask.set("status", "confirmed,in_house");
  }

  const token = await sessionToken();

  let data: BookingList;
  let rooms: { groups: RoomGroup[]; rooms: Room[] };
  let plans: { plans: RatePlan[] };
  try {
    [data, rooms, plans] = await Promise.all([
      call<BookingList>(`/businesses/${slug}/bookings?${ask.toString()}`, { token }),
      call<{ groups: RoomGroup[]; rooms: Room[] }>(`/businesses/${slug}/rooms`, {
        token,
      }),
      call<{ plans: RatePlan[] }>(`/businesses/${slug}/rates`, { token }),
    ]);
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const here = localizedPath(locale, `/dashboard/${slug}/bookings/list`);

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
      return {
        error: err instanceof Error ? err.message : "Could not move that.",
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

  const venue = await venueName(slug);

  return (
    <>
      <PageHeader tour="bookings-list"
        title="Bookings"
        sub={`${venue} · ${data.bookings.length} shown`}
        back={localizedPath(locale, `/dashboard/${slug}`)}
      />
      <div className="page-body">
      <ViewToggle
        calendar={localizedPath(locale, `/dashboard/${slug}/bookings/calendar`)}
        list={here}
        here="list"
      />

      <RoomTypeFilter groups={rooms.groups} />

      <BookingListView
        data={data}
        groups={rooms.groups}
        rooms={rooms.rooms}
        plans={plans.plans}
        slug={slug}
        create={book}
        save={save}
        assign={assign}
        setStatus={setStatus}
      />
      </div>
    </>
  );
}
