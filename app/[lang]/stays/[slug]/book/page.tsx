import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import BookForm, { type BookState } from "@/components/stays/BookForm";
import { Photo } from "@/components/stays/bits";
import styles from "@/components/stays/stays.module.css";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { market, type Venue } from "@/lib/market";
import EmbedFrame from "@/components/stays/EmbedFrame";
import { count, day, embedFrom, fill, money, stayFromParams, stayQuery, withEmbed } from "@/lib/stays-format";
import { staysText } from "@/lib/stays-text";

export async function generateMetadata({ params }: PageProps<"/[lang]/stays/[slug]/book">): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: isLocale(lang) ? staysText(lang).checkoutTitle : undefined,
    robots: { index: false, follow: false },
  };
}

/**
 * Checkout: who is staying, and the stay they are confirming.
 *
 * The price is read again here and sent with the booking; the review app
 * refuses it if it has changed since, and says the new one. Nothing is charged
 * — payment is at the property until a provider is connected — so the summary
 * says so plainly rather than showing a "due now" of nothing.
 */
export default async function BookPage({ params, searchParams }: PageProps<"/[lang]/stays/[slug]/book">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const t = staysText(locale);
  const query = (await searchParams) ?? {};
  const stay = { ...stayFromParams(query), q: "" };
  const roomId = Number(query.room);
  const planId = Number(query.plan);
  const embed = embedFrom(query);

  let venue: Venue;
  try {
    venue = await market<Venue>(`/venues/${encodeURIComponent(slug)}?${stayQuery(stay)}`);
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const room = venue.rooms.find((r) => r.id === roomId);
  const offer = room?.offers.find((o) => o.planId === planId);
  const back = withEmbed(localizedPath(lang, `/stays/${venue.slug}?${stayQuery(stay)}`), embed);

  if (!room || !offer || !offer.bookable || offer.totalMinor === null || !venue.stay) {
    return (
      <EmbedFrame embed={embed}>
        <div className={`wrap ${styles.page}`}>
          <p className={styles.empty}>
            {t.unavailable}. <Link href={back}>{venue.name}</Link>
          </p>
        </div>
      </EmbedFrame>
    );
  }

  const totalMinor = offer.totalMinor;
  const nights = count(t, "night", venue.stay.nights);

  async function reserve(_state: BookState, data: FormData): Promise<BookState> {
    "use server";
    const values = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? ""),
      requests: String(data.get("requests") ?? ""),
    };
    let booked: { reference: string; key: string | null };
    try {
      booked = await market(`/venues/${encodeURIComponent(slug)}/bookings`, {
        method: "POST",
        body: {
          arrival: data.get("arrival"),
          departure: data.get("departure"),
          adults: Number(data.get("adults")),
          children: Number(data.get("children")),
          rooms: Number(data.get("rooms")),
          groupId: Number(data.get("groupId")),
          planId: Number(data.get("planId")),
          expectTotalMinor: Number(data.get("expectTotalMinor")),
          guest: values,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      const changed = (err as { totalMinor?: number }).totalMinor;
      return {
        error: typeof changed === "number" ? `${message} ${money(changed, venue.currency, locale)}` : message,
        values,
      };
    }
    redirect(withEmbed(localizedPath(locale, `/stays/booking/${booked.reference}?k=${encodeURIComponent(booked.key ?? "")}`), embed));
  }

  return (
    <EmbedFrame embed={embed}>
    <div className={`wrap ${styles.page}`}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href={back}>{venue.name}</Link>
        <span aria-hidden>›</span>
        <span>{t.checkoutTitle}</span>
      </nav>
      <h1 className={styles.h1} style={{ marginBottom: "1.25rem" }}>{t.checkoutTitle}</h1>

      <div className={styles.checkout}>
        <BookForm
          action={reserve}
          t={t}
          agree={fill(t.agree, { venue: venue.name })}
          hidden={{
            arrival: stay.arrival,
            departure: stay.departure,
            adults: stay.adults,
            children: stay.children,
            rooms: stay.rooms,
            groupId: room.id,
            planId: offer.planId,
            expectTotalMinor: totalMinor,
          }}
        />

        <aside className={styles.summary} aria-labelledby="summary-title">
          <Photo id={room.photos[0] ?? venue.photos[0]} alt={room.name} t={t} className={styles.summaryPhoto} />
          <div className={styles.summaryBody}>
            <div>
              <h2 className={styles.boxTitle} id="summary-title">{venue.name}</h2>
              <p className={styles.muted} style={{ margin: "0.2rem 0 0", fontSize: "0.875rem" }}>
                {room.name}{stay.rooms > 1 ? ` × ${stay.rooms}` : ""} · {offer.name}
              </p>
            </div>
            <dl className={styles.lines}>
              <div><dt>{t.checkIn}</dt><dd>{day(stay.arrival, lang, true)} · {venue.profile.checkIn}</dd></div>
              <div><dt>{t.checkOut}</dt><dd>{day(stay.departure, lang, true)} · {venue.profile.checkOut}</dd></div>
              <div><dt>{t.guests}</dt><dd>{count(t, "adult", stay.adults)}{stay.children ? `, ${count(t, "child", stay.children)}` : ""}</dd></div>
              <div><dt>{fill(t.priceFor, { nights })}</dt><dd>{money(totalMinor, venue.currency, lang)}</dd></div>
            </dl>
            <ul className={styles.policy}>
              <li>{offer.breakfast ? t.breakfastIncluded : t.roomOnly}</li>
              <li>{offer.freeCancelUntil ? fill(t.freeCancelUntil, { date: day(offer.freeCancelUntil, lang) }) : t.nonRefundable}</li>
            </ul>
            <dl className={`${styles.lines} ${styles.totalLine}`}>
              <div><dt>{t.total}</dt><dd>{money(totalMinor, venue.currency, lang)}</dd></div>
              <div><dt>{t.dueAtProperty}</dt><dd>{money(totalMinor, venue.currency, lang)}</dd></div>
            </dl>
            <p className={styles.note} style={{ margin: 0 }}>{fill(t.payLater, { venue: venue.name })}</p>
          </div>
        </aside>
      </div>
    </div>
    </EmbedFrame>
  );
}
