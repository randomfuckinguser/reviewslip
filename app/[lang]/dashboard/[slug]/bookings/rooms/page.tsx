import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import CleaningStandard, {
  type ChecklistItem,
  type RoomState,
} from "@/components/dashboard/CleaningStandard";
import HousekeepingPin, {
  type HousekeepingState,
} from "@/components/dashboard/HousekeepingPin";
import PageHeader from "@/components/app-shell/PageHeader";
import RoomsSetup, { type RoomsState } from "@/components/dashboard/RoomsSetup";
import {
  call,
  currentUser,
  sessionToken,
  type Room,
  type RoomGroup,
  venueName,
} from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Rooms",
  robots: { index: false, follow: false },
};

export default async function RoomsPage({
  params,
}: PageProps<"/[lang]/dashboard/[slug]/bookings/rooms">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  const token = await sessionToken();

  let data: { groups: RoomGroup[]; rooms: Room[] };
  try {
    data = await call(`/businesses/${slug}/rooms`, { token });
  } catch (err) {
    // The API answers 404 both for a venue that does not exist and one that
    // belongs to somebody else. Neither is this account's business.
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  /*
   * The venue's own address and whether the board is switched on.
   *
   * Caught rather than awaited into the happy path: the rooms page is how
   * somebody sets a property up, and it must not fail to load because a second
   * call did. Without it the card simply does not appear.
   */
  let venue: { url: string; housekeeping: HousekeepingState } | null = null;
  try {
    const detail = await call<{
      business: { url: string };
      housekeeping?: HousekeepingState;
    }>(`/businesses/${slug}`, { token });
    venue = {
      url: detail.business.url,
      // Absent on a review app that has not been deployed yet, which reads as
      // off rather than as an error.
      housekeeping: detail.housekeeping ?? { on: false, changedAt: null },
    };
  } catch (err) {
    console.error(`Could not read the venue for ${slug}:`, err);
  }

  /*
   * The cleaning standard and the states a room can be in.
   *
   * Caught, like the venue above: this page is how somebody sets a property
   * up and it must not fail to load because a second call did. A review app
   * that has not been deployed yet simply has no standard to show.
   */
  let standard: { items: ChecklistItem[]; states: RoomState[] } | null = null;
  try {
    standard = await call<{ items: ChecklistItem[]; states: RoomState[] }>(
      `/businesses/${slug}/checklist`,
      { token }
    );
  } catch (err) {
    console.error(`Could not read the cleaning standard for ${slug}:`, err);
  }

  const here = localizedPath(locale, `/dashboard/${slug}/bookings/rooms`);

  async function addGroup(
    _prev: RoomsState,
    formData: FormData
  ): Promise<RoomsState> {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    const name = String(formData.get("name") ?? "").trim();
    const capacity = Number(formData.get("capacity") ?? 2);

    try {
      await call(`/businesses/${slug}/room-groups`, {
        method: "POST",
        body: { name, capacity },
        token: t,
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not add that.",
        values: { name },
      };
    }

    revalidatePath(here);
    return { ok: true };
  }

  async function addRoom(
    _prev: RoomsState,
    formData: FormData
  ): Promise<RoomsState> {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    const name = String(formData.get("name") ?? "").trim();
    const groupId = Number(formData.get("groupId"));

    try {
      await call(`/businesses/${slug}/rooms`, {
        method: "POST",
        body: { name, groupId },
        token: t,
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not add that.",
        values: { name },
      };
    }

    revalidatePath(here);
    return { ok: true };
  }

  async function remove(formData: FormData) {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    const kind = String(formData.get("kind") ?? "");
    const id = Number(formData.get("id"));
    if (!Number.isSafeInteger(id) || id <= 0) return;

    const path = kind === "group" ? "room-groups" : "rooms";

    try {
      await call(`/businesses/${slug}/${path}/${id}`, {
        method: "DELETE",
        token: t,
      });
    } catch (err) {
      // Swallowed: the only refusal that reaches here is a room type still
      // holding bookings, and the list re-renders with it still present, which
      // is the honest outcome. Worth a message once anybody asks why.
      console.error("Remove failed:", err);
    }

    revalidatePath(here);
  }

  /** A line of the standard. No room type means every room. */
  async function addItem(label: string, groupId: number | null) {
    "use server";

    const current = await sessionToken();
    if (!current) return { ok: false, error: "Sign in again." };

    try {
      await call(`/businesses/${slug}/checklist`, {
        method: "POST",
        body: { label, groupId },
        token: current,
      });
      revalidatePath(here);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "That could not be saved.",
      };
    }
  }

  /** Take a line out. Its ticks go with it. */
  async function removeItem(id: number) {
    "use server";

    const current = await sessionToken();
    if (!current) return { ok: false, error: "Sign in again." };

    try {
      await call(`/businesses/${slug}/checklist/${id}`, {
        method: "DELETE",
        token: current,
      });
      revalidatePath(here);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "That could not be removed.",
      };
    }
  }

  /** Open, not selling, or renovating — on one room. */
  async function setStatus(id: number, status: string) {
    "use server";

    const current = await sessionToken();
    if (!current) return { ok: false, error: "Sign in again." };

    try {
      await call(`/businesses/${slug}/rooms/${id}/status`, {
        method: "POST",
        body: { status },
        token: current,
      });
      revalidatePath(here);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "That could not be changed.",
      };
    }
  }

  /**
   * Attaches a reference photograph to a line, or takes it off with null.
   *
   * The picture arrives already scaled down — lib/photo.ts does that in the
   * browser, so a phone's eight megabyte original never crosses the network.
   * The review app checks it again regardless: raster only, and capped.
   *
   * No revalidate. Adding pictures to a standard is a dozen of them in a row,
   * and re-rendering the whole Rooms page between each one would make that
   * unbearable; the control keeps its own state instead.
   */
  async function setPhoto(id: number, dataUri: string | null) {
    "use server";

    const current = await sessionToken();
    if (!current) return { ok: false, error: "Sign in again." };

    try {
      await call(`/businesses/${slug}/checklist/${id}/photo`, {
        method: "PUT",
        body: { photo: dataUri },
        token: current,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "That photo could not be saved.",
      };
    }
  }

  /** Sets, changes or clears the PIN. Never reads one back. */
  async function savePin(pin: string | null) {
    "use server";

    const current = await sessionToken();
    if (!current) return { ok: false, error: "Sign in again." };

    try {
      const saved = await call<{ on: boolean }>(
        `/businesses/${slug}/housekeeping/pin`,
        { method: "POST", body: { pin }, token: current }
      );
      revalidatePath(here);
      return { ok: true, on: saved.on };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "That could not be saved.",
      };
    }
  }

  const venueLabel = await venueName(slug);

  return (
    <>
    <PageHeader tour="rooms"
      title="Rooms"
      sub={`${venueLabel} · ${data.rooms.length} room${data.rooms.length === 1 ? "" : "s"} in ${data.groups.length} type${data.groups.length === 1 ? "" : "s"}`}
      back={localizedPath(locale, `/dashboard/${slug}`)}
    />
    <div className="page-body flow">
    <p className="lede" style={{ marginBottom: "1rem" }}>
      Set these up once. The calendar and every booking read from them.
    </p>

    <RoomsSetup
      groups={data.groups}
      rooms={data.rooms}
      addGroup={addGroup}
      addRoom={addRoom}
      remove={remove}
    />

    {standard && (
      <CleaningStandard
        slug={slug}
        setPhoto={setPhoto}
        items={standard.items}
        states={standard.states}
        groups={data.groups.map((g) => ({ id: g.id, name: g.name }))}
        rooms={data.rooms.map((r) => ({
          id: r.id,
          name: r.name,
          groupName: r.groupName,
          status: r.status,
        }))}
        addItem={addItem}
        removeItem={removeItem}
        setStatus={setStatus}
      />
    )}

    {venue && (
      <HousekeepingPin
        state={venue.housekeeping}
        url={`${venue.url.replace(/\/$/, "")}/housekeeping`}
        save={savePin}
      />
    )}

    <p style={{ marginTop: "1.5rem" }}>
      <Link
        className="btn btn-go"
        href={localizedPath(lang, `/dashboard/${slug}/bookings/calendar`)}
      >
        Open the Calendar
      </Link>
    </p>
    </div>
  </>
  );
}
