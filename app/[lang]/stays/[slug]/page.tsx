import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BedDouble,
  Check,
  Clock,
  Coffee,
  CreditCard,
  Mail,
  MapPin,
  Maximize2,
  MessageCircle,
  Phone,
  Users,
  X,
} from "lucide-react";

import EmbedFrame from "@/components/stays/EmbedFrame";
import StaySearch from "@/components/stays/StaySearch";
import VoiceCall from "@/components/VoiceCall";
import { Photo, RatingBadge } from "@/components/stays/bits";
import styles from "@/components/stays/stays.module.css";
import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { market, type Venue } from "@/lib/market";
import { contactLinks, count, day, embedFrom, embedQuery, fill, money, stayFromParams, stayQuery, withEmbed } from "@/lib/stays-format";
import { amenityLabel, staysText } from "@/lib/stays-text";

async function load(slug: string, query: string): Promise<{ venue: Venue | null; error: string | null }> {
  try {
    return { venue: await market<Venue>(`/venues/${encodeURIComponent(slug)}?${query}`), error: null };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return { venue: null, error: null };
    // Dates the API refuses (in the past, too long): show the venue without
    // prices and say why, rather than a dead page.
    if (status === 400) {
      try {
        return {
          venue: await market<Venue>(`/venues/${encodeURIComponent(slug)}`),
          error: err instanceof Error ? err.message : null,
        };
      } catch {
        return { venue: null, error: null };
      }
    }
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/[lang]/stays/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return {};
  const { venue } = await load(slug, "");
  return venue ? { title: `${venue.name}${venue.place ? ` · ${venue.place}` : ""}` } : {};
}

/**
 * A venue: its photos, what it says about itself, and its rooms — each with
 * its rates in rows, priced for the guest's stay, and Reserve on each row.
 * Down the side, the way to book directly with the venue instead.
 */
export default async function VenuePage({ params, searchParams }: PageProps<"/[lang]/stays/[slug]">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const t = staysText(lang);
  const query = (await searchParams) ?? {};
  const stay = stayFromParams(query);
  const embed = embedFrom(query);

  const { venue, error } = await load(slug, stayQuery({ ...stay, q: "" }));
  if (!venue) notFound();

  const links = contactLinks(venue.profile.contact);
  // Every venue has a line on the softphone; its button shows only while
  // someone answers it, so the box is there even with no other way to reach them.
  const hasLinks = Object.values(links).some(Boolean);
  const nights = venue.stay ? count(t, "night", venue.stay.nights) : "";
  // One, three or five: the grid is a big photo and pairs beside it, and an
  // even count leaves a hole in it.
  const pool = venue.photos.length ? venue.photos : venue.rooms.flatMap((r) => r.photos);
  const gallery = pool.slice(0, pool.length >= 5 ? 5 : pool.length >= 3 ? 3 : 1);
  const here = localizedPath(lang, `/stays/${venue.slug}`);
  const results = withEmbed(localizedPath(lang, `/stays?${stayQuery(stay)}`), embed);

  return (
    <EmbedFrame embed={embed}>
      <div className={`wrap ${styles.page}`} style={{ paddingBottom: "1.25rem" }}>
        {/* No way back to "all stays" from an embed locked to this venue: on a
            hotel's own website, the other hotels are not its to show. */}
        {!embed.venue && (
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link href={results}>{t.backToResults}</Link>
            <span aria-hidden>›</span>
            {venue.place && (
              <>
                <Link href={withEmbed(localizedPath(lang, `/stays?${stayQuery({ ...stay, q: venue.place })}`), embed)}>{venue.place}</Link>
                <span aria-hidden>›</span>
              </>
            )}
            <span>{venue.name}</span>
          </nav>
        )}

        <div className={styles.venueHead}>
          <div>
            <h1 className={styles.h1}>{venue.name}</h1>
            <div className={styles.venueMeta}>
              {venue.place && (
                <span className={styles.place}>
                  <MapPin size={14} aria-hidden /> {venue.place}
                </span>
              )}
              <RatingBadge rating={venue.rating} t={t} />
            </div>
          </div>
          <a href="#rooms" className="btn btn-go">{t.roomsTitle}</a>
        </div>

        <div className={`${styles.gallery} ${gallery.length <= 1 ? styles.galleryOne : gallery.length === 3 ? styles.galleryThree : ""}`}>
          {(gallery.length ? gallery : [null]).map((id, i) => (
            <Photo key={id ?? "none"} id={id} alt={i === 0 ? venue.name : ""} t={t} eager={i === 0} />
          ))}
        </div>
      </div>

      <div className={styles.stickyBar}>
        <div className="wrap">
          <StaySearch action={here} stay={stay} t={t} lang={lang} showWhere={false} tone="bar" extra={embedQuery(embed)} />
        </div>
      </div>

      <div className={`wrap ${styles.page}`}>
        <div className={styles.venueGrid}>
          <div>
            {error && <p className={styles.error}>{error}</p>}

            <section id="rooms" className={styles.section} aria-labelledby="rooms-title">
              <h2 className={styles.h2} id="rooms-title">
                {t.roomsTitle}
                {venue.stay && (
                  <span className={styles.muted} style={{ fontWeight: 400, fontSize: "0.9rem", marginLeft: "0.6rem" }}>
                    {day(venue.stay.arrival, lang)} – {day(venue.stay.departure, lang)} · {nights} ·{" "}
                    {count(t, "adult", venue.stay.adults)}
                    {venue.stay.children ? ` · ${count(t, "child", venue.stay.children)}` : ""} · {count(t, "room", venue.stay.rooms)}
                  </span>
                )}
              </h2>
              {!venue.stay && <p className={styles.muted}>{t.addDates}</p>}

              {venue.rooms.map((room) => (
                <article key={room.id} className={styles.room} aria-labelledby={`room-${room.id}`}>
                  <header className={styles.roomHead}>
                    <h3 className={styles.roomName} id={`room-${room.id}`}>{room.name}</h3>
                  </header>
                  <div className={styles.roomGrid}>
                    <div className={styles.roomInfo}>
                      <Photo id={room.photos[0]} alt={room.name} t={t} className={styles.roomPhoto} />
                      {room.photos.length > 1 && (
                        <div className={styles.roomThumbs}>
                          {room.photos.slice(1, 5).map((id) => (
                            // eslint-disable-next-line @next/next/no-img-element -- proxied venue photo
                            <img key={id} src={`/api/stays/photo/${id}`} alt="" loading="lazy" />
                          ))}
                        </div>
                      )}
                      <ul className={styles.facts}>
                        <li><Users size={15} aria-hidden /> {fill(t.sleeps, { n: room.capacity })}</li>
                        {room.profile.bed && <li><BedDouble size={15} aria-hidden /> {room.profile.bed}</li>}
                        {room.profile.sizeSqm && <li><Maximize2 size={15} aria-hidden /> {fill(t.sizeSqm, { n: room.profile.sizeSqm })}</li>}
                      </ul>
                      {room.profile.amenities.length > 0 && (
                        <ul className={styles.chipList}>
                          {room.profile.amenities.map((key) => <li key={key}>{amenityLabel(key, lang)}</li>)}
                        </ul>
                      )}
                      {room.profile.description && <p className={styles.roomText} style={{ margin: 0 }}>{room.profile.description}</p>}
                    </div>

                    <div>
                      {!venue.stay ? (
                        <p className={styles.unavailable}>{t.addDates}</p>
                      ) : room.fits === false ? (
                        <p className={styles.unavailable}>
                          {room.free !== null && room.free < venue.stay.rooms ? t.unavailable : t.tooSmall}
                        </p>
                      ) : room.offers.length === 0 ? (
                        <p className={styles.unavailable}>{t.unavailable}</p>
                      ) : (
                        <table className={styles.offers}>
                          <thead>
                            <tr>
                              <th>{t.yourChoices}</th>
                              <th className={styles.offerPrice}>{fill(t.priceFor, { nights })}</th>
                              <th><span className="visually-hidden">{t.reserve}</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {room.offers.map((offer) => (
                              <tr key={offer.planId}>
                                <td>
                                  <div className={styles.offerName}>{offer.name}</div>
                                  <ul className={styles.include}>
                                    <li>
                                      {offer.breakfast ? <Coffee size={14} aria-hidden /> : <BedDouble size={14} aria-hidden />}
                                      {offer.breakfast ? t.breakfastIncluded : t.roomOnly}
                                    </li>
                                    <li>
                                      {offer.freeCancelUntil ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
                                      {offer.freeCancelUntil
                                        ? fill(t.freeCancelUntil, { date: day(offer.freeCancelUntil, lang) })
                                        : t.nonRefundable}
                                    </li>
                                    <li className={styles.muted}>
                                      <CreditCard size={14} aria-hidden /> {t.payAtProperty}
                                    </li>
                                  </ul>
                                </td>
                                <td className={styles.offerPrice}>
                                  {offer.bookable && offer.totalMinor !== null ? (
                                    <>
                                      <div className={styles.price}>{money(offer.totalMinor, venue.currency, lang)}</div>
                                      <div className={styles.priceNote}>
                                        {money(offer.perNightMinor ?? 0, venue.currency, lang)} {t.perNight}
                                      </div>
                                      {room.free !== null && room.free <= 3 && (
                                        <div className={styles.left}>{fill(t.onlyLeft, { n: room.free })}</div>
                                      )}
                                    </>
                                  ) : (
                                    <span className={styles.priceNote}>{offer.reason || t.unavailable}</span>
                                  )}
                                </td>
                                <td className={styles.offerAction}>
                                  {offer.bookable && offer.totalMinor !== null && (
                                    <Link
                                      className="btn btn-go"
                                      href={withEmbed(
                                        localizedPath(
                                          lang,
                                          `/stays/${venue.slug}/book?${stayQuery({ ...stay, q: "" }, { room: room.id, plan: offer.planId })}`
                                        ),
                                        embed
                                      )}
                                    >
                                      {t.reserve}
                                    </Link>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </section>

            {venue.profile.about && (
              <section className={styles.section} aria-labelledby="about-title">
                <h2 className={styles.h2} id="about-title">{t.about}</h2>
                <p className={styles.about}>{venue.profile.about}</p>
              </section>
            )}

            {venue.profile.amenities.length > 0 && (
              <section className={styles.section} aria-labelledby="amenities-title">
                <h2 className={styles.h2} id="amenities-title">{t.amenities}</h2>
                <ul className={styles.amenityGrid}>
                  {venue.profile.amenities.map((key) => (
                    <li key={key}><Check size={15} aria-hidden /> {amenityLabel(key, lang)}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className={styles.section} aria-labelledby="policies-title">
              <h2 className={styles.h2} id="policies-title">{t.policies}</h2>
              <ul className={styles.policy}>
                <li><Clock size={15} aria-hidden /> {fill(t.checkInFrom, { time: venue.profile.checkIn })}</li>
                <li><Clock size={15} aria-hidden /> {fill(t.checkOutBy, { time: venue.profile.checkOut })}</li>
                <li><CreditCard size={15} aria-hidden /> {fill(t.payLater, { venue: venue.name })}</li>
              </ul>
            </section>
          </div>

          <aside className={styles.aside}>
            {(
              <div className={styles.box} data-voice-only={hasLinks ? undefined : ""}>
                <h2 className={styles.boxTitle}>{fill(t.contactTitle, { venue: venue.name })}</h2>
                <p className={styles.muted} style={{ margin: 0, fontSize: "0.875rem" }}>{t.contactLede}</p>
                <div className={styles.contactButtons}>
                  <VoiceCall
                    line={venue.slug}
                    team="sales"
                    label={fill(t.voiceCallTeam, { team: t.voiceReservations })}
                    leaveLabel={t.voiceLeave}
                    fallbackHref={links.phone}
                    fallbackLabel={t.call}
                    phone={venue.profile.contact.phone}
                    className="btn btn-quiet"
                    icon={<Phone size={15} aria-hidden />}
                  />
                  {links.line && <a className="btn btn-quiet" href={links.line} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden /> {t.line}</a>}
                  {links.whatsapp && <a className="btn btn-quiet" href={links.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden /> {t.whatsapp}</a>}
                  {links.email && <a className="btn btn-quiet" href={links.email}><Mail size={15} aria-hidden /> {t.email}</a>}
                </div>
              </div>
            )}
            <div className={styles.box}>
              <h2 className={styles.boxTitle}>{t.payAtProperty}</h2>
              <p className={styles.muted} style={{ margin: 0, fontSize: "0.875rem" }}>{fill(t.payLater, { venue: venue.name })}</p>
            </div>
          </aside>
        </div>
      </div>
    </EmbedFrame>
  );
}
