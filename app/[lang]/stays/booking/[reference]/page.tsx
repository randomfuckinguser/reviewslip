import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Check, Mail, MessageCircle, Phone, Settings2, X } from "lucide-react";

import styles from "@/components/stays/stays.module.css";
import VoiceCall from "@/components/VoiceCall";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { market, type BookingView, type ChangeQuote } from "@/lib/market";
import EmbedFrame from "@/components/stays/EmbedFrame";
import { addDays, contactLinks, count, day, embedFrom, embedQuery, fill, money, todayInThailand, withEmbed } from "@/lib/stays-format";
import { staysText } from "@/lib/stays-text";

export async function generateMetadata({ params }: PageProps<"/[lang]/stays/booking/[reference]">): Promise<Metadata> {
  const { lang, reference } = await params;
  // The reference, not "confirmed": the same page shows a cancelled booking.
  return {
    title: isLocale(lang) ? `${staysText(lang).reference} ${reference.toUpperCase().slice(0, 12)}` : undefined,
    robots: { index: false, follow: false },
  };
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/**
 * A booking — where checkout lands, and where the email's link goes. Opened by
 * reference and key; without the right key it is the same not-found as a
 * reference that does not exist.
 *
 * Manage Booking opens below it, inside the free-cancellation window: change
 * the dates or the guests (quoted first, confirmed second), or cancel. All of
 * it is forms and server actions, so it works without JavaScript, and each
 * step that changes something is its own deliberate press.
 */
export default async function BookingPage({ params, searchParams }: PageProps<"/[lang]/stays/booking/[reference]">) {
  const { lang, reference } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const t = staysText(lang);
  const query = (await searchParams) ?? {};
  const key = one(query.k);
  const failed = one(query.error).slice(0, 200) || null;
  const managing = one(query.manage) === "1";
  const changed = one(query.changed) === "1";
  const embed = embedFrom(query);
  const path = localizedPath(locale, `/stays/booking/${reference}`);
  // Embed parameters ride along on every address here, so managing a booking
  // inside a host site's frame never drops the guest onto reviewslip.com.
  const here = withEmbed(`${path}?k=${encodeURIComponent(key)}`, embed);
  const manage = `${here}&manage=1`;

  async function cancel() {
    "use server";
    try {
      await market(`/bookings/${encodeURIComponent(reference)}/cancel`, { method: "POST", body: { k: key } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      redirect(`${manage}&error=${encodeURIComponent(message)}#manage`);
    }
    redirect(here);
  }

  async function confirmChange(data: FormData) {
    "use server";
    const change = {
      arrival: String(data.get("arrival") ?? ""),
      departure: String(data.get("departure") ?? ""),
      adults: Number(data.get("adults")),
      children: Number(data.get("children")),
    };
    try {
      await market(`/bookings/${encodeURIComponent(reference)}/change`, {
        method: "POST",
        body: { k: key, ...change, expectTotalMinor: Number(data.get("expectTotalMinor")) },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      redirect(`${manage}&error=${encodeURIComponent(message)}#manage`);
    }
    redirect(`${here}&changed=1`);
  }

  let booking: BookingView | null = null;
  try {
    booking = await market<BookingView>(`/bookings/${encodeURIComponent(reference)}?k=${encodeURIComponent(key)}`);
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
  }

  if (!booking) {
    return (
      <EmbedFrame embed={embed}>
        <div className={`wrap ${styles.page}`}>
          <p className={styles.empty}>{t.bookingMissing}</p>
        </div>
      </EmbedFrame>
    );
  }

  const links = contactLinks(booking.venue.contact);
  const cancelled = booking.status === "cancelled";

  // What the guest asked to change to, if they have asked: the dates and party
  // in the address, quoted against the review app before anything is shown.
  const asked = one(query.arrival)
    ? {
        arrival: one(query.arrival),
        departure: one(query.departure),
        adults: Number(one(query.adults)) || booking.adults,
        children: Number(one(query.children)) || 0,
      }
    : null;
  let quote: ChangeQuote | null = null;
  let quoteError: string | null = null;
  if (managing && asked && booking.changeable) {
    try {
      quote = await market<ChangeQuote>(
        `/bookings/${encodeURIComponent(reference)}/change?${new URLSearchParams({
          k: key,
          arrival: asked.arrival,
          departure: asked.departure,
          adults: String(asked.adults),
          children: String(asked.children),
        })}`
      );
    } catch (err) {
      quoteError = err instanceof Error ? err.message : "Something went wrong.";
    }
  }

  const form = asked ?? { arrival: booking.arrival, departure: booking.departure, adults: booking.adults, children: booking.children };
  const today = todayInThailand();
  const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

  return (
    <EmbedFrame embed={embed}>
    <div className={`wrap ${styles.page}`}>
      <div className={styles.confirmed}>
        <div className={styles.confirmedHead}>
          {!cancelled && (
            <span className={styles.tick}>
              <Check size={22} aria-hidden />
            </span>
          )}
          <h1 className={styles.h1}>{cancelled ? t.cancelled : t.confirmedTitle}</h1>
          {!cancelled && <p className={styles.muted} style={{ margin: 0 }}>{fill(t.confirmedLede, { email: booking.guestEmail })}</p>}
          {cancelled && (
            <p className={styles.muted} style={{ margin: 0 }}>
              {booking.cancelledBy === "venue" ? fill(t.cancelledByVenue, { venue: booking.venue.name }) : t.cancelledByYou}
            </p>
          )}
          <span className={styles.muted} style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>{t.reference}</span>
          <span className={styles.reference}>{booking.reference}</span>
        </div>

        {changed && !cancelled && (
          <p className={styles.notice} role="status">
            <Check size={16} aria-hidden /> {t.changedNotice}
          </p>
        )}

        <div className={styles.box}>
          <h2 className={styles.boxTitle}>{booking.venue.name}</h2>
          <dl className={styles.lines}>
            <div><dt>{t.rooms}</dt><dd>{booking.roomName}{booking.rooms > 1 ? ` × ${booking.rooms}` : ""}{booking.planName ? ` · ${booking.planName}` : ""}</dd></div>
            <div><dt>{t.checkIn}</dt><dd>{day(booking.arrival, lang, true)} · {booking.checkIn}</dd></div>
            <div><dt>{t.checkOut}</dt><dd>{day(booking.departure, lang, true)} · {booking.checkOut}</dd></div>
            <div><dt>{t.guests}</dt><dd>{count(t, "adult", booking.adults)}{booking.children ? `, ${count(t, "child", booking.children)}` : ""} · {count(t, "night", booking.nights)}</dd></div>
            <div><dt>{t.fullName}</dt><dd>{booking.guestName}</dd></div>
          </dl>
          <ul className={styles.policy}>
            <li>{booking.breakfast ? t.breakfastIncluded : t.roomOnly}</li>
            <li>{booking.freeCancelUntil ? fill(t.freeCancelUntil, { date: day(booking.freeCancelUntil, lang) }) : t.nonRefundable}</li>
          </ul>
          {booking.totalMinor !== null && (
            <dl className={`${styles.lines} ${styles.totalLine}`}>
              <div><dt>{t.total}</dt><dd>{money(booking.totalMinor, booking.currency, lang)}</dd></div>
              <div><dt>{t.dueAtProperty}</dt><dd>{money(booking.totalMinor, booking.currency, lang)}</dd></div>
            </dl>
          )}
          {!cancelled && booking.cancellable && !managing && (
            <Link className={`btn btn-go ${styles.manageButton}`} href={`${manage}#manage`}>
              <Settings2 size={16} aria-hidden /> {t.manageBooking}
            </Link>
          )}
        </div>

        {/* ------------------------------------------------ manage booking */}
        {!cancelled && booking.cancellable && managing && (
          <section id="manage" className={styles.manage} aria-labelledby="manage-title">
            <div className={styles.manageHead}>
              <h2 className={styles.h2} id="manage-title" style={{ margin: 0 }}>{t.manageBooking}</h2>
              <Link href={here} className={styles.muted} style={{ fontSize: "0.875rem" }}>{t.backToBooking}</Link>
            </div>

            {failed && (
              <p className={styles.error} role="alert">
                {failed}
              </p>
            )}

            {booking.changeable && (
              <div className={styles.box}>
                <h3 className={styles.boxTitle}>
                  <CalendarDays size={16} aria-hidden /> {t.changeTitle}
                </h3>
                <p className={styles.muted} style={{ margin: 0, fontSize: "0.875rem" }}>{t.changeLede}</p>

                <form method="get" action={path} className={styles.changeForm}>
                  <input type="hidden" name="k" value={key} />
                  <input type="hidden" name="manage" value="1" />
                  {Object.entries(embedQuery(embed)).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                  <label className={styles.label}>
                    {t.checkIn}
                    <input className={styles.input} type="date" name="arrival" min={today} defaultValue={form.arrival} required />
                  </label>
                  <label className={styles.label}>
                    {t.checkOut}
                    <input className={styles.input} type="date" name="departure" min={addDays(today, 1)} defaultValue={form.departure} required />
                  </label>
                  <label className={styles.label}>
                    {t.adults}
                    <select className={styles.input} name="adults" defaultValue={form.adults}>
                      {range(booking.rooms, Math.min(16, booking.maxGuests)).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className={styles.label}>
                    {t.children}
                    <select className={styles.input} name="children" defaultValue={form.children}>
                      {range(0, Math.min(10, booking.maxGuests - booking.rooms)).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <button type="submit" className="btn btn-quiet">{t.checkPrice}</button>
                </form>

                {quoteError && <p className={styles.error} role="alert">{quoteError}</p>}

                {quote && (
                  <div className={styles.quote}>
                    <dl className={styles.lines}>
                      <div><dt>{t.checkIn}</dt><dd>{day(quote.arrival, lang, true)}</dd></div>
                      <div><dt>{t.checkOut}</dt><dd>{day(quote.departure, lang, true)}</dd></div>
                      <div><dt>{t.guests}</dt><dd>{count(t, "adult", quote.adults)}{quote.children ? `, ${count(t, "child", quote.children)}` : ""}</dd></div>
                      <div><dt>{t.newTotal}</dt><dd>{money(quote.totalMinor, booking.currency, lang)}</dd></div>
                      {quote.oldTotalMinor !== null && quote.oldTotalMinor !== quote.totalMinor && (
                        <div><dt>{t.wasTotal}</dt><dd className={styles.was}>{money(quote.oldTotalMinor, booking.currency, lang)}</dd></div>
                      )}
                    </dl>
                    <p className={styles.note} style={{ margin: 0 }}>
                      {quote.freeCancelUntil ? fill(t.freeCancelUntil, { date: day(quote.freeCancelUntil, lang) }) : t.nonRefundable}
                    </p>
                    <form action={confirmChange}>
                      <input type="hidden" name="arrival" value={quote.arrival} />
                      <input type="hidden" name="departure" value={quote.departure} />
                      <input type="hidden" name="adults" value={quote.adults} />
                      <input type="hidden" name="children" value={quote.children} />
                      <input type="hidden" name="expectTotalMinor" value={quote.totalMinor} />
                      <button type="submit" className="btn btn-go">{t.confirmChange}</button>
                    </form>
                  </div>
                )}
              </div>
            )}

            <details className={styles.box}>
              <summary className={styles.cancelSummary}>
                <X size={16} aria-hidden /> {t.cancelTitle}
              </summary>
              <p className={styles.muted} style={{ margin: 0, fontSize: "0.9rem" }}>
                {booking.freeCancelUntil ? `${fill(t.freeCancelUntil, { date: day(booking.freeCancelUntil, lang) })}. ` : ""}
                {t.cancelWarning}
              </p>
              <form action={cancel}>
                <button type="submit" className={`btn ${styles.danger}`}>{t.cancelYes}</button>
              </form>
            </details>
          </section>
        )}

        {!cancelled && !booking.cancellable && (
          <p className={styles.note} style={{ marginTop: "1rem", textAlign: "center" }}>
            {fill(t.cannotManage, { venue: booking.venue.name })}
          </p>
        )}

        {!cancelled && (
          <div
            className={styles.box}
            style={{ marginTop: "1rem" }}
            data-voice-only={Object.values(links).some(Boolean) ? undefined : ""}
          >
            <h2 className={styles.boxTitle}>{fill(t.contactTitle, { venue: booking.venue.name })}</h2>
            <div className={styles.contactButtons}>
              {/* The guest's name and reference go to whoever answers, so they
                  can open the booking before the guest has finished saying who
                  they are. */}
              <VoiceCall
                line={booking.venue.slug}
                team="sales"
                label={fill(t.voiceCallTeam, { team: t.voiceReservations })}
                leaveLabel={t.voiceLeave}
                fallbackHref={links.phone}
                fallbackLabel={t.call}
                phone={booking.venue.contact.phone}
                className="btn btn-quiet"
                caller={`${booking.guestName} · ${booking.reference}`}
                icon={<Phone size={15} aria-hidden />}
              />
              {links.line && <a className="btn btn-quiet" href={links.line} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden /> {t.line}</a>}
              {links.whatsapp && <a className="btn btn-quiet" href={links.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden /> {t.whatsapp}</a>}
              {links.email && <a className="btn btn-quiet" href={links.email}><Mail size={15} aria-hidden /> {t.email}</a>}
            </div>
          </div>
        )}

        <p style={{ textAlign: "center", marginTop: "1.5rem" }}>
          {/* Locked to one venue: back to that venue, not to every venue. */}
          <Link
            className="btn btn-quiet"
            href={withEmbed(localizedPath(lang, embed.venue ? `/stays/${embed.venue}` : "/stays"), embed)}
          >
            {t.anotherStay}
          </Link>
        </p>
      </div>
    </div>
    </EmbedFrame>
  );
}
