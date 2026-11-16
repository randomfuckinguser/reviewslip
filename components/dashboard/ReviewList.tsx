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
      width="17"
      height="17"
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

  if (failed) {
    return (
      <div style={card}>
        <h2 style={heading}>Latest Reviews</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
          These could not be loaded just now — which is not the same as there
          being none. The counts above come from a different query and are still
          right. Try again in a moment; if it keeps happening, tell us.
        </p>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div style={card}>
        <h2 style={heading}>Latest Reviews</h2>
        {notTaken > 0 ? (
          /*
           * The reviews exist. There was nowhere to take them.
           *
           * This list holds only reviews a guest carried off to a listing, and
           * the sentence that used to be here — "Nothing yet. Reviews appear
           * here as guests generate them" — is the one reading of that which is
           * wrong. An owner with no listing link set saw it while guests were
           * writing reviews all week, and concluded the product did not work.
           *
           * The explanation was already written, twenty lines below, inside the
           * branch that only renders when the list is *not* empty: visible
           * exactly when it was not needed.
           */
          <p style={{ fontSize: "0.85rem", color: "var(--ink)" }}>
            <strong style={{ fontWeight: 500 }}>
              {notTaken} review{notTaken === 1 ? " has" : "s have"} been written
            </strong>{" "}
            and none of them reached a listing. This list only holds the ones a
            guest took somewhere — so if your review page has no Google or
            Tripadvisor link on it, there is nothing for them to press and
            nothing lands here. Check the setup on this venue&rsquo;s page.
          </p>
        ) : (
          <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
            Nothing yet. Reviews appear here once a guest writes one and takes
            it to a listing.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={card}>
      <h2 style={heading}>Latest Reviews</h2>
      {notTaken > 0 && (
        <p style={{ fontSize: "0.8rem", color: "var(--ink-soft)", margin: "0 0 0.6rem" }}>
          These are the ones a guest took to a listing.{" "}
          <strong style={{ fontWeight: 500 }}>
            {notTaken} more {notTaken === 1 ? "was" : "were"} written and not
            used
          </strong>{" "}
          — someone generated a review and left without pressing a Proceed
          button. Those still count against the month above, because they still
          cost a generation.
        </p>
      )}
      <p style={{ fontSize: "0.8rem", color: "var(--ink-soft)", margin: "0 0 1rem" }}>
        Five stars means you would be glad to see it on your listing — those are
        kept and shown to the writer on every review it writes from then on. One
        and two are shown to it as things to avoid. Three and four are recorded
        and not fed back: they are the ones that were merely fine, and teaching
        it to aim at fine is how everything ends up fine.
      </p>

      {/* Fixed frame: twenty reviews would otherwise push the stats card and
          everything below it far off the page. The list scrolls inside itself. */}
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: "0 0.5rem 0 0",
          display: "grid",
          gap: "1.6rem",
          maxHeight: "26rem",
          overflowY: "auto",
          overscrollBehavior: "contain",
        }}
      >
        {groups.map((g) => (
          <li key={g.id}>
            <h3 style={groupHead}>
              {g.hex && <span aria-hidden="true" style={dot(g.hex)} />}
              {g.label}
              <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>
                {g.reviews.length}
              </span>
            </h3>

            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "grid",
                gap: "0.9rem",
              }}
            >
              {g.reviews.map((review) => {
              const rating = ratings[review.id] ?? null;

              return (
                <li key={review.id} style={row}>
                  <p style={{ fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
                    {review.review_text}
                  </p>
                  <div style={meta}>
                    <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                      {contextNote(review)} ·{" "}
                      {stamp(review.created_at)}
                    </span>
                    <span
                      style={{ display: "flex", gap: "0.1rem" }}
                      role="radiogroup"
                      aria-label="Rating"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={rating === n}
                          aria-label={n === 1 ? "1 star" : n + " stars"}
                          title={
                            n === 5
                              ? "Five stars — the writer keeps this one and follows it"
                              : n + " stars"
                          }
                          onClick={() => onRate(review.id, n)}
                          style={star(rating !== null && n <= rating, rating === 5)}
                        >
                          <Star filled={rating !== null && n <= rating} />
                        </button>
                      ))}
                    </span>
                  </div>
                </li>
              );
            })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--paper)",
  color: "var(--ink)",
  borderRadius: 14,
  padding: "1.4rem",
};

const heading: React.CSSProperties = {
  fontSize: "1.2rem",
  margin: "0 0 0.2rem",
};

/**
 * A group's heading.
 *
 * Sticky, because the frame scrolls inside itself: without it you scroll past
 * "Google" into forty rows and the answer to "which listing is this" is off
 * the top of the box.
 */
const groupHead: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  margin: "0 0 0.7rem",
  padding: "0.35rem 0",
  fontSize: "0.85rem",
  fontWeight: 500,
  letterSpacing: "0.01em",
  background: "var(--paper)",
};

/** The listing's own colour, small. */
function dot(hex: string): React.CSSProperties {
  return {
    width: "0.55rem",
    height: "0.55rem",
    borderRadius: "50%",
    background: hex,
    flex: "0 0 auto",
  };
}

const row: React.CSSProperties = {
  borderTop: "1px solid color-mix(in srgb, var(--ink) 12%, transparent)",
  paddingTop: "0.9rem",
};

const meta: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  marginTop: "0.5rem",
  flexWrap: "wrap",
};

/**
 * One star in the row.
 *
 * Borderless, unlike the two thumbs it replaces: five bordered pills read as
 * five separate switches, and a rating is one control. A full five keeps a
 * warmer colour than the rest, so the state that actually changes what gets
 * written is the one that stands out on the page.
 */
function star(filled: boolean, top: boolean): React.CSSProperties {
  return {
    width: "1.55rem",
    height: "1.9rem",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    padding: 0,
    border: 0,
    background: "transparent",
    color: filled ? (top ? "var(--warning)" : "var(--success)") : "color-mix(in srgb, var(--ink) 28%, transparent)",
  };
}
