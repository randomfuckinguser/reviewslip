import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, Coffee, MapPin } from "lucide-react";

import EmbedFrame from "@/components/stays/EmbedFrame";
import StaySearch from "@/components/stays/StaySearch";
import { Photo, RatingBadge } from "@/components/stays/bits";
import styles from "@/components/stays/stays.module.css";
import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { market, type SearchResult } from "@/lib/market";
import { count, embedFrom, embedQuery, fill, money, nightsBetween, stayFromParams, stayQuery, withEmbed } from "@/lib/stays-format";
import { amenityLabel, staysText } from "@/lib/stays-text";

export async function generateMetadata({ params }: PageProps<"/[lang]/stays">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return { title: staysText(lang).navStays };
}

/** Price brackets in whole units of the currency. Thai baht, which is all of them today. */
const BRACKETS = [1000, 2000, 3500, 5000];

const SORTS = ["recommended", "price", "rating"] as const;
type Sort = (typeof SORTS)[number];

/**
 * Search results: the venues with a room for this party on these dates, the
 * cheapest first offer of each on the right, filters down the side.
 *
 * Filtering and sorting happen here rather than in the API: one search's
 * results are a page of venues, and the filters are a question about that page.
 */
export default async function StaysPage({ params, searchParams }: PageProps<"/[lang]/stays">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = staysText(lang);
  const query = (await searchParams) ?? {};
  const stay = stayFromParams(query);
  const embed = embedFrom(query);

  // An embed locked to one venue has no results page: the search is that
  // venue's, so it goes straight there with the dates filled in.
  if (embed.venue) {
    redirect(withEmbed(localizedPath(lang, `/stays/${embed.venue}?${stayQuery({ ...stay, q: "" })}`), embed));
  }

  const sort: Sort = SORTS.includes(query.sort as Sort) ? (query.sort as Sort) : "recommended";
  const breakfast = query.breakfast === "1";
  const freeCancel = query.cancel === "1";
  const maxPrice = Number(query.max) || 0;
  const minRating = Number(query.rating) || 0;

  let results: SearchResult[] = [];
  let places: string[] = [];
  let error: string | null = null;
  try {
    const [found, known] = await Promise.all([
      market<{ results: SearchResult[] }>(`/search?${stayQuery(stay)}`),
      market<{ places: { place: string }[] }>("/places"),
    ]);
    results = found.results;
    places = known.places.map((p) => p.place);
  } catch (err) {
    error = err instanceof Error ? err.message : "Something went wrong.";
  }

  const shown = results
    .filter((r) => !breakfast || r.breakfast)
    .filter((r) => !freeCancel || r.freeCancel)
    .filter((r) => !maxPrice || (r.from && r.from.perNightMinor <= maxPrice * 100))
    .filter((r) => !minRating || (r.rating && r.rating.average >= minRating));

  if (sort === "price") {
    shown.sort((a, b) => (a.from?.perNightMinor ?? Infinity) - (b.from?.perNightMinor ?? Infinity));
  } else if (sort === "rating") {
    shown.sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0));
  }

  const base = localizedPath(lang, "/stays");
  const keep = { sort: sort === "recommended" ? undefined : sort, breakfast: breakfast ? 1 : undefined, cancel: freeCancel ? 1 : undefined, max: maxPrice || undefined, rating: minRating || undefined };
  const nights = count(t, "night", nightsBetween(stay.arrival, stay.departure));
  const filtersOn = breakfast || freeCancel || maxPrice || minRating;

  return (
    <EmbedFrame embed={embed}>
      <div className={styles.top}>
        <div className="wrap">
          <StaySearch action={base} stay={stay} places={places} t={t} lang={lang} tone="bar" extra={embedQuery(embed)} />
        </div>
      </div>

      <div className={`wrap ${styles.page}`}>
        <div className={styles.results}>
          <form method="get" action={base} className={styles.filters} aria-label={t.filters}>
            {Object.entries({ q: stay.q, arrival: stay.arrival, departure: stay.departure, adults: stay.adults, children: stay.children, rooms: stay.rooms, sort: keep.sort, ...embedQuery(embed) }).map(
              ([name, value]) => (value === undefined || value === "" ? null : <input key={name} type="hidden" name={name} value={value} />)
            )}

            <fieldset>
              <legend>{t.filterOptions}</legend>
              <label className={styles.check}>
                <input type="checkbox" name="breakfast" value="1" defaultChecked={breakfast} /> {t.breakfastIncluded}
              </label>
              <label className={styles.check}>
                <input type="checkbox" name="cancel" value="1" defaultChecked={freeCancel} /> {t.freeCancellation}
              </label>
            </fieldset>

            <fieldset>
              <legend>{t.filterPrice}</legend>
              <label className={styles.check}>
                <input type="radio" name="max" value="" defaultChecked={!maxPrice} /> {t.anyPrice}
              </label>
              {BRACKETS.map((amount) => (
                <label key={amount} className={styles.check}>
                  <input type="radio" name="max" value={amount} defaultChecked={maxPrice === amount} />{" "}
                  {fill(t.upTo, { amount: money(amount * 100, results[0]?.currency ?? "THB", lang) })}
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>{t.filterRating}</legend>
              {[0, 4, 4.5].map((value) => (
                <label key={value} className={styles.check}>
                  <input type="radio" name="rating" value={value || ""} defaultChecked={minRating === value} />{" "}
                  {value ? fill(t.ratingAtLeast, { n: value }) : t.anyRating}
                </label>
              ))}
            </fieldset>

            <div className={styles.filterActions}>
              <button type="submit" className={`btn btn-go ${styles.small}`}>{t.apply}</button>
              {filtersOn ? (
                <Link className={`btn btn-quiet ${styles.small}`} href={withEmbed(`${base}?${stayQuery(stay, { sort: keep.sort })}`, embed)}>
                  {t.clear}
                </Link>
              ) : null}
            </div>
          </form>

          <section aria-labelledby="results-title">
            <div className={styles.resultsHead}>
              <div>
                <h1 className={styles.h1} id="results-title">
                  {stay.q ? fill(t.resultsIn, { place: stay.q }) : t.resultsAll}
                </h1>
                <p className={styles.muted} style={{ margin: "0.25rem 0 0" }}>
                  {count(t, "place", shown.length)}
                </p>
              </div>
              <nav className={styles.sort} aria-label={t.sortBy}>
                {SORTS.map((s) => (
                  <Link
                    key={s}
                    className={styles.sortLink}
                    aria-current={s === sort ? "true" : undefined}
                    href={withEmbed(`${base}?${stayQuery(stay, { ...keep, sort: s === "recommended" ? undefined : s })}`, embed)}
                  >
                    {s === "price" ? t.sortPrice : s === "rating" ? t.sortRating : t.sortRecommended}
                  </Link>
                ))}
              </nav>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            {!error && shown.length === 0 && <p className={styles.empty}>{t.noResults}</p>}

            <ul className={styles.list}>
              {shown.map((r) => {
                const href = withEmbed(localizedPath(lang, `/stays/${r.slug}?${stayQuery(stay)}`), embed);
                return (
                  <li key={r.slug} className={styles.card}>
                    <Photo id={r.photo} alt={r.name} t={t} className={styles.cardPhoto} />
                    <div className={styles.cardBody}>
                      <h2 className={styles.cardTitle}>
                        <Link href={href}>{r.name}</Link>
                      </h2>
                      {r.place && (
                        <span className={styles.place}>
                          <MapPin size={14} aria-hidden /> {r.place}
                        </span>
                      )}
                      <RatingBadge rating={r.rating} t={t} />
                      {r.from && (
                        <p className={styles.muted} style={{ margin: 0, fontSize: "0.85rem" }}>
                          {r.from.roomName} · {r.from.planName}
                        </p>
                      )}
                      <ul className={styles.tags}>
                        {r.freeCancel && (
                          <li className={styles.tag}>
                            <Check size={14} aria-hidden /> {t.freeCancellation}
                          </li>
                        )}
                        {r.breakfast && (
                          <li className={styles.tag}>
                            <Coffee size={14} aria-hidden /> {t.breakfastIncluded}
                          </li>
                        )}
                      </ul>
                      {r.amenities.length > 0 && (
                        <ul className={styles.chipList}>
                          {r.amenities.slice(0, 5).map((key) => (
                            <li key={key}>{amenityLabel(key, lang)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className={styles.cardPrice}>
                      {r.from ? (
                        <>
                          {r.from.roomsLeft <= 3 && <span className={styles.left}>{fill(t.onlyLeft, { n: r.from.roomsLeft })}</span>}
                          <span className={styles.price}>{money(r.from.perNightMinor, r.currency, lang)}</span>
                          <span className={styles.priceNote}>{t.perNight}</span>
                          <span className={styles.priceNote}>
                            {fill(t.totalFor, { amount: money(r.from.totalMinor, r.currency, lang), nights })}
                          </span>
                        </>
                      ) : (
                        <span className={styles.priceNote}>{t.noRooms}</span>
                      )}
                      <Link href={href} className={`btn ${r.from ? "btn-go" : "btn-quiet"}`}>
                        {t.seeAvailability}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </EmbedFrame>
  );
}
