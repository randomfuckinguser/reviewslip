"use client";

import { useState, useTransition } from "react";

import { PLATFORMS } from "@/lib/platforms.data";

export interface ReviewRow {
  id: number;
  review_text: string;
  category_id: string | null;
  rating: number | null;
  created_at: string;
  /** What the writer was working from. Absent on rows written before this. */
  language?: string | null;
  length?: string | null;
  /**
   * Which listing the guest took it to, by platform id.
   *
   * Optional, and null on rows from before it was recorded — those were
   * backfilled as proceeded because they predate the distinction, so there is
   * no answer to give for them rather than a wrong one.
   */
  proceeded_to?: string | null;
}

/** Codes to names, mirroring config.js in the review app. */
const LANGUAGES: Record<string, string> = {
  en: "English", th: "Thai", zh: "Chinese", ja: "Japanese", ko: "Korean",
  es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese",
  nl: "Dutch",
};

const LENGTHS: Record<string, string> = {
  any: "any length",
  short: "short",
  detailed: "detailed",
};

/**
 * What this review was generated from, in words.
 *
 * A rating is only actionable if you can see what produced the thing you are
 * rating: two stars on a review is a shrug, two stars on "the welcome, detailed,
 * in Thai" is a lead. The stored `category_id` is topic ids joined with "+",
 * which is the shape the meter groups on, so it has to be unpicked here.
 *
 * Every part is optional. Rows written before these columns existed have none
 * of it, and a review missing its context is still one worth rating.
 */
function contextNote(review: ReviewRow): string {
  const topics = (review.category_id ?? "")
    .split("+")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => id.replace(/-/g, " "));

  const parts = [topics.length ? topics.join(", ") : "no topic picked"];

  // "any" and English are the defaults, so saying them adds a word and no
  // information. What is worth surfacing is when a guest chose otherwise.
  if (review.length && review.length !== "any") {
    parts.push(LENGTHS[review.length] ?? review.length);
  }
  if (review.language && review.language !== "en") {
    parts.push(`in ${LANGUAGES[review.language] ?? review.language}`);
  }

  // Where it went used to be the last part of this line. It is the group
  // heading now, and printing it again on all forty rows underneath is the
  // kind of repetition that makes a list harder to read rather than fuller.
  return parts.join(" · ");
}

interface Group {
  id: string;
  label: string;
  hex: string | null;
  reviews: ReviewRow[];
}

/**
 * The reviews, split by the listing each one was taken to.
 *
 * Which listing a review reached is the thing an owner is actually asking
 * about — the same review is worth different amounts depending on where it
 * landed, and a single column mixing all of them makes that answerable only by
 * reading every line. Grouped, the shape of the month is visible at a glance:
 * forty to Google and two to Tripadvisor is a different business problem from
 * twenty-one each.
 *
 * Platform order rather than size order, so the groups do not rearrange
 * themselves between visits. A list that reorders under you is one you have to
 * re-read every time.
 *
 * Rows recorded before the destination was, and rows from a venue that had one
 * listing so nothing needed choosing, have no answer. They go last, under a
 * heading that says so rather than being quietly filed under Google.
 */
function group(reviews: ReviewRow[]): Group[] {
  const groups: Group[] = [];

  for (const platform of PLATFORMS) {
    const mine = reviews.filter((r) => r.proceeded_to === platform.id);
    if (mine.length) {
      groups.push({
        id: platform.id,
        label: platform.label,
        hex: platform.hex ?? null,
        reviews: mine,
      });
    }
  }

  const known = new Set(PLATFORMS.map((p) => p.id));
  const rest = reviews.filter((r) => !r.proceeded_to || !known.has(r.proceeded_to));
  if (rest.length) {
    groups.push({ id: "_rest", label: "Listing not recorded", hex: null, reviews: rest });
  }

  return groups;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The date, formatted the same on both sides of hydration.
 *
 * `toLocaleDateString()` was rendering 17/08/2026 on the server, whose Node
 * process is en-GB, and 8/17/2026 in a browser set to en-US — a mismatch React
 * reports as a hydration failure and recovers from by throwing away the server
 * HTML for the whole list. Fixed parts in UTC agree everywhere, and a written
 * month has the side benefit of being unambiguous to both audiences rather than
 * wrong for one of them.
 */
function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * One star.
 *
 * Inline SVG rather than the ★ character: that renders as whatever the platform
 * decides, at a different weight and size per OS, and it cannot inherit the
 * button's colour — so the filled state could not be drawn in the ink colour.
 */
function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.6}
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.35l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95L12 2.5z" />
    </svg>
  );
}

/**
 * The latest reviews, with a rating and its context on each.
 *
 * Rating is optimistic: the stars move immediately and revert if the server
 * refuses. Waiting on a round trip to acknowledge a button press makes working
 * through twenty of them feel broken, and the failure case is rare and
 * recoverable — the row simply goes back to how it was.
 */
export default function ReviewList({
  reviews,
  notTaken = 0,
  failed = false,
  rate,
}: {
  reviews: ReviewRow[];
  /**
   * Written, and never taken to a listing.
   *
   * The stat cards above count every generation, because that is what the
   * tokens were spent on. This list holds only what a guest carried away. Both
   * are true, and without this number the two look like a contradiction.
   */
  notTaken?: number;
  /** The list could not be fetched — which is not the same as it being empty. */
  failed?: boolean;
  rate: (id: number, rating: number | null) => Promise<{ ok: boolean }>;
}) {
  const [ratings, setRatings] = useState<Record<number, number | null>>(() =>
    Object.fromEntries(reviews.map((r) => [r.id, r.rating]))
  );
  const [, startTransition] = useTransition();

  const groups = group(reviews);

  function onRate(id: number, stars: number) {
    const before = ratings[id] ?? null;
    // Tapping the star that is already the rating clears it. A rating you
    // cannot undo is one people are reluctant to give in the first place —
    // which matters most for five, the one that changes what gets written.
    const next = before === stars ? null : stars;

    setRatings((cur) => ({ ...cur, [id]: next }));

    startTransition(async () => {
      const result = await rate(id, next).catch(() => ({ ok: false }));
      if (!result?.ok) setRatings((cur) => ({ ...cur, [id]: before }));
    });
  }

  const head = (
    <div className="container-head">
      <div>
        <h2 id="rv-h">
          Latest Reviews
          {reviews.length > 0 && <span className="count"> ({reviews.length})</span>}
        </h2>
        <p className="container-desc">Reviews guests wrote here and took to a listing.</p>
      </div>
    </div>
  );

  if (failed) {
    return (
      <section className="container" aria-labelledby="rv-h">
        {head}
        <p className="rv-empty">
          These could not be loaded just now, which is not the same as there being none.
          Try again in a moment.
        </p>
      </section>
    );
  }

  if (reviews.length === 0) {
    return (
      <section className="container" aria-labelledby="rv-h">
        {head}
        {notTaken > 0 ? (
          /*
           * The reviews exist. There was nowhere to take them: this list holds
           * only reviews a guest carried off to a listing, and "nothing yet"
           * would read as a product that does not work.
           */
          <p className="rv-empty">
            <strong>
              {notTaken} review{notTaken === 1 ? " has" : "s have"} been written
            </strong>{" "}
            and none reached a listing. If your review page has no Google or Tripadvisor link,
            guests have nothing to press. Check the setup on the venue&rsquo;s dashboard.
          </p>
        ) : (
          <p className="rv-empty">
            <strong>No reviews yet</strong>
            <br />
            They appear here once a guest writes one and takes it to a listing.
          </p>
        )}
      </section>
    );
  }

  const rated = Object.values(ratings).filter((r) => r !== null).length;

  return (
    <section className="container" aria-labelledby="rv-h">
      {head}

      {/* The figures, as the console's key-value row. "Not used" still cost a
          generation, which is why it is counted at all. */}
      <dl className="kv rv-kv">
        <div>
          <dt>Taken to a listing</dt>
          <dd className="kv-big">{reviews.length.toLocaleString()}</dd>
        </div>
        <div>
          <dt data-tip="Written, then left without pressing Proceed. They still count against this month.">
            Written, not used
          </dt>
          <dd className="kv-big">{notTaken.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Rated by you</dt>
          <dd className="kv-big">
            {rated}
            <span className="rv-of"> of {reviews.length}</span>
          </dd>
        </div>
      </dl>

      {/* Fixed frame: forty reviews would otherwise run far down the page. */}
      <div className="rv-scroll">
        {groups.map((g) => (
          <section key={g.id} aria-label={g.label}>
            <h3 className="rv-group">
              {g.hex && <span aria-hidden="true" className="rv-dot" style={{ background: g.hex }} />}
              {g.label}
              <span className="count">({g.reviews.length})</span>
            </h3>

            <ul className="rv-rows">
              {g.reviews.map((review) => {
                const rating = ratings[review.id] ?? null;

                return (
                  <li key={review.id}>
                    <p className="rv-text">{review.review_text}</p>
                    <div className="rv-meta">
                      <span>
                        {contextNote(review)} · {stamp(review.created_at)}
                      </span>
                      <span className="rv-stars" role="radiogroup" aria-label="Your rating">
                        {[1, 2, 3, 4, 5].map((n) => {
                          const filled = rating !== null && n <= rating;
                          return (
                            <button
                              key={n}
                              type="button"
                              role="radio"
                              aria-checked={rating === n}
                              aria-label={n === 1 ? "1 star" : n + " stars"}
                              title={
                                n === 5
                                  ? "Five stars: the writer keeps this one and follows it"
                                  : n + " stars"
                              }
                              onClick={() => onRate(review.id, n)}
                              className={
                                filled ? (rating === 5 ? "is-on is-top" : "is-on") : undefined
                              }
                            >
                              <Star filled={filled} />
                            </button>
                          );
                        })}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <p className="container-foot">
        Your stars teach the writer: 5 keeps a review as an example, 1–2 marks one to avoid,
        3–4 are only recorded.
      </p>
    </section>
  );
}
