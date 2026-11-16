import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import MarketListing, { type ListingDraft } from "@/components/dashboard/MarketListing";
import MarketPhotos from "@/components/dashboard/MarketPhotos";
import MarketRoom, { type PlanTerms } from "@/components/dashboard/MarketRoom";
import styles from "@/components/dashboard/MarketListing.module.css";
import { call, currentUser, sessionToken, venueName } from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import type { MarketSettings, RoomProfile } from "@/lib/market";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Online Booking",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The venue on the Reviewslip marketplace, from its side: listing, what guests
 * read, photos, and each room type's details and rate terms.
 *
 * Rooms, prices and availability are not edited here — the Rooms and Rates
 * screens own them, and the marketplace reads what they wrote.
 */
export default async function OnlineBookingPage({
  params,
}: PageProps<"/[lang]/dashboard/[slug]/bookings/online">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  const token = await sessionToken();
  let data: MarketSettings;
  try {
    data = await call<MarketSettings>(`/businesses/${slug}/market`, { token });
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const here = localizedPath(locale, `/dashboard/${slug}/bookings/online`);
  const base = `/businesses/${slug}/market`;

  /** Every action here: signed in, one call, the page re-read, any error as text. */
  async function act(path: string, method: string, body?: unknown): Promise<{ error?: string }> {
    "use server";
    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));
    try {
      await call(path, { method, body, token: t });
      revalidatePath(here);
      return {};
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not save that." };
    }
  }

  async function saveListing(draft: ListingDraft) {
    "use server";
    return act(base, "PUT", draft);
  }

  async function addPhoto(groupId: number | null, data: string) {
    "use server";
    return act(`${base}/photos`, "POST", { groupId, data });
  }

  async function removePhoto(id: number) {
    "use server";
    return act(`${base}/photos/${id}`, "DELETE");
  }

  async function coverPhoto(id: number) {
    "use server";
    return act(`${base}/photos/${id}/cover`, "POST");
  }

  async function saveRoom(groupId: number, room: RoomProfile, terms: PlanTerms[]) {
    "use server";
    const saved = await act(`${base}/rooms/${groupId}`, "PUT", room);
    if (saved.error) return saved;
    for (const term of terms) {
      const result = await act(`${base}/plans/${term.id}`, "PUT", {
        breakfast: term.breakfast,
        cancelDays: term.cancelDays,
      });
      if (result.error) return result;
    }
    return {};
  }

  const venue = await venueName(slug);
  const publicPage = localizedPath(locale, `/stays/${slug}`);

  return (
    <>
      <PageHeader tour="online-booking"
        title="Online Booking"
        sub={`${venue} · ${data.listed ? "Listed on Reviewslip" : "Not listed"}`}
        back={localizedPath(locale, `/dashboard/${slug}`)}
      >
        {data.listed && (
          <a className="btn btn-quiet" href={publicPage} target="_blank" rel="noreferrer">
            View on Reviewslip
          </a>
        )}
      </PageHeader>

      <div className="page-body flow">
        <p className="lede" style={{ marginBottom: "1rem" }}>
          Guests find you on Reviewslip, see what is free on their dates, and book directly — confirmed straight away
          and on your calendar, unassigned. Prices and rooms come from the Rates and Rooms screens.
        </p>

        <section className="group-box" aria-labelledby="listing-title" data-tour="ob-listing">
          <h2 id="listing-title">Listing</h2>
          <MarketListing
            initial={{ listed: data.listed, place: data.place, profile: data.profile }}
            amenities={data.amenities.venue}
            save={saveListing}
          />
        </section>

        {/* The same booking pages on the venue's own website: two lines it
            pastes into any site builder. public/embed.js does the rest. */}
        <section className="group-box" aria-labelledby="embed-title" data-tour="ob-embed">
          <h2 id="embed-title">On Your Website</h2>
          <p className={styles.hint} style={{ margin: 0 }}>
            Paste this where you want guests to book on your own website — a Custom HTML block on WordPress, an
            Embed element on Wix, a Code block on Squarespace. Bookings come here, as they do from Reviewslip.
            Add <code>data-accent=&quot;#1f4fa3&quot;</code> to match your button colour.
          </p>
          <textarea
            readOnly
            rows={2}
            aria-label="Embed code"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.8rem" }}
            value={`<div data-reviewslip-booking data-venue="${slug}"></div>\n<script src="${SITE_URL}/embed.js" async></script>`}
          />
          {!data.listed && (
            <p className={styles.hint} style={{ margin: 0 }}>
              Switch on List on Reviewslip above first: the embed shows only listed venues.
            </p>
          )}
        </section>

        <section className="group-box" aria-labelledby="photos-title" data-tour="ob-photos">
          <h2 id="photos-title">Photos</h2>
          <p className={styles.hint} style={{ margin: 0 }}>
            The venue itself: outside, the garden, the common areas. Up to {data.limits.venuePhotos}. Room photos go
            with each room below.
          </p>
          <MarketPhotos
            slug={slug}
            photos={data.photos}
            max={data.limits.venuePhotos}
            label={venue}
            add={addPhoto.bind(null, null)}
            remove={removePhoto}
            cover={coverPhoto}
          />
        </section>

        <section className="group-box wide" aria-labelledby="rooms-title" data-tour="ob-rooms">
          <h2 id="rooms-title">Rooms</h2>
          {data.rooms.length === 0 && (
            <p className={styles.hint} style={{ margin: 0 }}>
              No room types yet. Add them on the Rooms screen first.
            </p>
          )}
          {/* Two room types to a row: each is a short form of its own. */}
          <div className="cols-grid">
          {data.rooms.map((room) => (
            <div key={room.id} className={styles.room}>
              <div className={styles.roomHead}>
                <h3>{room.name}</h3>
              </div>
              <MarketPhotos
                slug={slug}
                photos={room.photos}
                max={data.limits.roomPhotos}
                label={room.name}
                add={addPhoto.bind(null, room.id)}
                remove={removePhoto}
                cover={coverPhoto}
              />
              <MarketRoom
                name={room.name}
                capacity={room.capacity}
                initial={room.profile}
                plans={room.plans}
                amenities={data.amenities.room}
                currency={data.currency}
                save={saveRoom.bind(null, room.id)}
              />
            </div>
          ))}
          </div>
        </section>
      </div>
    </>
  );
}
