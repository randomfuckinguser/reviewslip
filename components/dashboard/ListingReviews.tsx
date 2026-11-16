"use client";

import { useState, useTransition } from "react";

import { PLATFORMS } from "@/lib/platforms.data";

export interface ListingReview {
  id: number;
  platform: string;
  platformLabel: string;
  author: string | null;
  rating: number | null;
  body: string | null;
  postedAt: string;
  /** Whether that date is real, or worked out from "3 weeks ago". */
  approximate?: boolean;
  repliedAt: string | null;
  replyBody: string | null;
  url: string | null;
}

export interface ListingGroup {
  platform: string;
  label: string;
  reviews: ListingReview[];
  unanswered: number;
}

export interface Connector {
  id: string;
  platform: string | null;
  label: string;
  ready: boolean;
  missing: string | null;
  /** Whether pressing anything would actually go and look. */
  automatic: boolean;
}

/** What one listing gave up on a fetch. */
export interface Ran {
  id: string;
  platform: string | null;
  label: string;
  /** How many were on the page, before the window was applied. */
  read?: number;
  stored: number;
  added: number;
  reason?: string | null;
  /** The page it was read off, when that is not the listing it is on. */
  via?: string | null;
}

export interface Listings {
  from: string;
  days: number;
  total: number;
  unanswered: number;
  groups: ListingGroup[];
  connectors: Connector[];
  /** Present only on the answer to a fetch. */
  ran?: Ran[];
}

export interface NewReview {
  platform: string;
  author: string;
  rating: number | null;
  postedAt: string;
  body: string;
  url: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Fixed parts in UTC, so the server and the browser agree. */
function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function hexOf(platform: string): string | null {
  return PLATFORMS.find((p) => p.id === platform)?.hex ?? null;
}

/**
 * Reviews already on the venue's listings, grouped by the listing.
 *
 * The other direction from everything else on this page: not what this product
 * helped write, but what the world wrote anyway. The two are kept visibly
 * apart because adding them together would misstate both — one is work done
 * here, the other is work waiting to be answered.
 *
 * What an owner comes to this for is the unanswered count. A review nobody
 * replied to is the only actionable thing in the list, so it is what the
 * headings carry and what the sort brings to the top within each group.
 */
export default function ListingReviews({
  initial,
  markReplied,
  addReview,
  checkNow,
}: {
  initial: Listings;
  markReplied: (id: number, replied: boolean) => Promise<{ ok: boolean; data?: Listings }>;
  addReview: (input: NewReview) => Promise<{ ok: boolean; error?: string; data?: Listings }>;
  checkNow: () => Promise<{ ok: boolean; error?: string; data?: Listings }>;
}) {
  const [data, setData] = useState<Listings>(initial);
  /**
   * What the last fetch found, per listing.
   *
   * Kept apart from the list itself because "nothing changed" and "nothing
   * happened" look identical on a screen that only shows the result. A fetch
   * that read fourteen reviews and found none of them new is a success, and
   * without this line it is indistinguishable from a button that does nothing.
   */
  const [ran, setRan] = useState<Ran[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Which ones are marked answered, held here so the tick moves on the press.
   *
   * Marking twenty replies with a round trip visible on each is the sort of
   * thing people give up halfway through, and the failure is recoverable: the
   * row goes back to how it was.
   */
  const [replied, setReplied] = useState<Record<number, boolean>>({});

  function isReplied(review: ListingReview): boolean {
    return replied[review.id] ?? review.repliedAt !== null;
  }

  function onReplied(review: ListingReview) {
    const next = !isReplied(review);
    setReplied((cur) => ({ ...cur, [review.id]: next }));

    startTransition(async () => {
      const result = await markReplied(review.id, next).catch(
        (): { ok: boolean; data?: Listings } => ({ ok: false })
      );
      if (!result?.ok) {
        setReplied((cur) => ({ ...cur, [review.id]: !next }));
        setError("That could not be saved. Try again in a moment.");
        return;
      }
      // The counts in the headings are the server's, so they have to come back
      // from it — deriving them here is how two numbers on one screen end up
      // disagreeing.
      if ("data" in result && result.data) {
        setData(result.data);
        setReplied({});
      }
    });
  }

  function onCheck() {
    setError(null);
    startTransition(async () => {
      const result = await checkNow().catch(
        (): { ok: boolean; error?: string; data?: Listings } => ({ ok: false })
      );
      if (result?.ok && result.data) {
        setData(result.data);
        setRan(result.data.ran ?? []);
        setReplied({});
      } else {
        setError(result?.error ?? "Nothing could be fetched just now.");
      }
    });
  }

  /*
   * Defensive, because this state is replaced wholesale by whatever a write
   * hands back — and a write that answers with *nearly* the list took the
   * whole page down rather than the panel: the render succeeded, the next one
   * read `.filter` off a field the response had left out, and the error
   * boundary above this swallowed the reviews, the ratings and the header
   * with it. The route it happened on has been fixed; this is so that the
   * next route to get it wrong costs a missing footnote instead.
   */
  const connectors = data.connectors ?? initial.connectors ?? [];
  const automatic = connectors.filter((c) => c.automatic);
  const waiting = connectors.filter((c) => !c.ready && c.missing);

  return (
    <div style={card}>
      <div style={head}>
        <div>
          <h2 style={heading}>On Your Listings</h2>
          <p style={{ fontSize: "0.8rem", color: "var(--ink-soft)", margin: "0.15rem 0 0" }}>
            What guests wrote on the sites themselves, over the last{" "}
            {data.days} days.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {automatic.length > 0 && (
            <button type="button" onClick={onCheck} disabled={pending} style={quiet}>
              {pending ? "Looking…" : "Check for New"}
            </button>
          )}
          <button
            type="button"
            onClick={() => { setAdding((v) => !v); setError(null); }}
            style={quiet}
          >
            {adding ? "Cancel" : "Add One"}
          </button>
        </div>
      </div>

      {data.total > 0 && (
        <p style={{ fontSize: "0.85rem", margin: "0.9rem 0 0" }}>
          <strong style={{ fontWeight: 500 }}>{data.total}</strong> review
          {data.total === 1 ? "" : "s"}
          {data.unanswered > 0 ? (
            <>
              , <strong style={{ fontWeight: 500, color: "var(--warning)" }}>
                {data.unanswered} not answered
              </strong>
            </>
          ) : (
            <> — all answered</>
          )}
          .
        </p>
      )}

      {error && (
        <p role="status" style={{ fontSize: "0.8rem", color: "var(--warning)", margin: "0.6rem 0 0" }}>
          {error}
        </p>
      )}

      {ran && (
        <ul role="status" style={ranList}>
          {ran.length === 0 && (
            <li style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>
              Nothing could be read. Check the listing links in Settings.
            </li>
          )}
          {ran.map((r, i) => (
            <li key={`${r.id}-${r.platform}-${i}`} style={{ fontSize: "0.78rem" }}>
              <strong style={{ fontWeight: 500 }}>{r.label}</strong>{" "}
              {r.reason ? (
                <span style={{ color: "var(--ink-soft)" }}>— {r.reason}</span>
              ) : (
                <span style={{ color: "var(--ink-soft)" }}>
                  — {r.read ?? r.stored} on the page
                  {typeof r.read === "number" && r.read > r.stored
                    ? `, ${r.stored} inside the window`
                    : ""}
                  , {r.added === 0 ? "none new" : `${r.added} new`}
                  {r.via ? `, off the ${r.via} page` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddReview
          connectors={connectors}
          onDone={(result) => {
            if (result.ok && result.data) {
              setData(result.data);
              setReplied({});
              setAdding(false);
              setError(null);
            } else {
              setError(result.error ?? "That could not be saved.");
            }
          }}
          add={addReview}
        />
      )}

      {(data.groups ?? []).length === 0 ? (
        <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)", margin: "0.9rem 0 0" }}>
          Nothing here yet. Reviews land here when a listing can be read
          automatically, or when you add one — and either way they are matched
          against what is already here, so the same review does not arrive
          twice.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "1.6rem", marginTop: "1.2rem" }}>
          {(data.groups ?? []).map((g) => {
            const hex = hexOf(g.platform);
            return (
              <section key={g.platform}>
                <h3 style={groupHead}>
                  {hex && <span aria-hidden="true" style={dot(hex)} />}
                  {g.label}
                  <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>
                    {g.reviews.length}
                  </span>
                  {g.unanswered > 0 && (
                    <span style={badge}>{g.unanswered} to answer</span>
                  )}
                </h3>

                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.9rem" }}>
                  {g.reviews.map((review) => (
                    <li key={review.id} style={row}>
                      <div style={rowHead}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                          {review.author ?? "Someone"}
                          {review.rating !== null && (
                            <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>
                              {" · "}
                              {review.rating}/5
                            </span>
                          )}
                        </span>
                        <span
                          style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}
                          title={
                            review.approximate
                              ? "The listing page shows how long ago, not a date, so this is worked out from that"
                              : undefined
                          }
                        >
                          {review.approximate ? "about " : ""}
                          {stamp(review.postedAt)}
                        </span>
                      </div>

                      {review.body && (
                        <p style={{ fontSize: "0.9rem", lineHeight: 1.5, margin: "0.4rem 0 0" }}>
                          {review.body}
                        </p>
                      )}

                      {review.replyBody && (
                        <p style={reply}>
                          <strong style={{ fontWeight: 500 }}>You replied:</strong>{" "}
                          {review.replyBody}
                        </p>
                      )}

                      <div style={meta}>
                        <button
                          type="button"
                          aria-pressed={isReplied(review)}
                          onClick={() => onReplied(review)}
                          style={mark(isReplied(review))}
                        >
                          {isReplied(review) ? "✓ Answered" : "Mark Answered"}
                        </button>

                        {review.url && (
                          <a
                            href={review.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            style={{ fontSize: "0.75rem", color: "var(--jade)" }}
                          >
                            Open on {g.label}
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/*
        Why a listing is not in the list above.
        An owner asking "where is my Tripadvisor?" deserves the reason beside
        the absence. The waits here are paperwork — an API allow-list, a
        partner agreement — so the honest thing is to name them rather than
        show a Connect button that fails with nothing to do next.
      */}
      {waiting.length > 0 && (
        <details style={{ marginTop: "1.4rem" }}>
          <summary style={{ fontSize: "0.8rem", color: "var(--ink-soft)", cursor: "pointer" }}>
            Reading These Automatically
          </summary>
          <ul style={{ margin: "0.6rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: "0.35rem" }}>
            {waiting.map((c) => (
              <li key={c.id} style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>
                <strong style={{ fontWeight: 500, color: "var(--ink)" }}>{c.label}</strong>
                {" needs "}
                {c.missing}.
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Adding one by hand.
 *
 * This is the path that works today, and it goes through the same route a
 * connector would: the same de-duplication, the same window, the same reply
 * tracking. Somebody who types the same review in twice gets one review.
 */
function AddReview({
  connectors,
  add,
  onDone,
}: {
  connectors: Connector[];
  add: (input: NewReview) => Promise<{ ok: boolean; error?: string; data?: Listings }>;
  onDone: (result: { ok: boolean; error?: string; data?: Listings }) => void;
}) {
  const sites = connectors.filter((c) => c.platform);
  const [platform, setPlatform] = useState(sites[0]?.platform ?? PLATFORMS[0].id);
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState("5");
  const [postedAt, setPostedAt] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await add({
        platform,
        author: author.trim(),
        rating: rating === "" ? null : Number(rating),
        // A date and no time is midnight UTC, which is what the day-level
        // matching in the review app compares on anyway.
        postedAt: postedAt || new Date().toISOString().slice(0, 10),
        body: body.trim(),
        url: url.trim(),
      }).catch((): { ok: boolean; error?: string; data?: Listings } => ({ ok: false }));
      onDone(result);
    });
  }

  return (
    <form onSubmit={submit} style={form}>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <label style={field}>
          <span style={label}>Listing</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={input}>
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>

        <label style={field}>
          <span style={label}>Who Wrote It</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} style={input} />
        </label>

        <label style={{ ...field, maxWidth: "6rem" }}>
          <span style={label}>Stars</span>
          <select value={rating} onChange={(e) => setRating(e.target.value)} style={input}>
            <option value="">—</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <label style={{ ...field, maxWidth: "10rem" }}>
          <span style={label}>When</span>
          <input
            type="date"
            value={postedAt}
            onChange={(e) => setPostedAt(e.target.value)}
            style={input}
          />
        </label>
      </div>

      <label style={field}>
        <span style={label}>What It Says</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          style={{ ...input, resize: "vertical" }}
        />
      </label>

      <label style={field}>
        <span style={label}>Link to It (Optional)</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} style={input} />
      </label>

      <div>
        <button type="submit" disabled={pending || (!body.trim() && rating === "")} style={go}>
          {pending ? "Saving…" : "Add It"}
        </button>
      </div>
    </form>
  );
}

const card: React.CSSProperties = {
  background: "var(--paper)",
  color: "var(--ink)",
  borderRadius: 14,
  padding: "1.4rem",
};

const head: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
};

const heading: React.CSSProperties = {
  fontSize: "1.2rem",
  margin: 0,
};

const groupHead: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  margin: "0 0 0.7rem",
  fontSize: "0.85rem",
  fontWeight: 500,
};

function dot(hex: string): React.CSSProperties {
  return {
    width: "0.55rem",
    height: "0.55rem",
    borderRadius: "50%",
    background: hex,
    flex: "0 0 auto",
  };
}

const ranList: React.CSSProperties = {
  listStyle: "none",
  margin: "0.8rem 0 0",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  background: "color-mix(in srgb, var(--ink) 4%, transparent)",
  display: "grid",
  gap: "0.3rem",
};

const badge: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 500,
  color: "var(--warning)",
  background: "color-mix(in srgb, var(--warning) 14%, transparent)",
  borderRadius: 999,
  padding: "0.1rem 0.45rem",
};

const row: React.CSSProperties = {
  borderTop: "1px solid color-mix(in srgb, var(--ink) 12%, transparent)",
  paddingTop: "0.9rem",
};

const rowHead: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "0.75rem",
};

const reply: React.CSSProperties = {
  fontSize: "0.82rem",
  lineHeight: 1.5,
  margin: "0.5rem 0 0",
  paddingLeft: "0.7rem",
  borderLeft: "2px solid color-mix(in srgb, var(--ink) 18%, transparent)",
  color: "var(--ink-soft)",
};

const meta: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  marginTop: "0.6rem",
  flexWrap: "wrap",
};

/**
 * The answered toggle.
 *
 * A toggle rather than a one-way "Mark answered", because the reason to press
 * it is usually a reply left somewhere this cannot see — and somebody who
 * marks the wrong row needs a way back that is not support.
 */
function mark(on: boolean): React.CSSProperties {
  return {
    fontSize: "0.75rem",
    fontWeight: 500,
    cursor: "pointer",
    borderRadius: 999,
    padding: "0.22rem 0.6rem",
    border: on ? "1px solid transparent" : "1px solid color-mix(in srgb, var(--ink) 24%, transparent)",
    background: on ? "color-mix(in srgb, var(--success) 14%, transparent)" : "transparent",
    color: on ? "var(--success)" : "var(--ink)",
  };
}

const form: React.CSSProperties = {
  display: "grid",
  gap: "0.7rem",
  margin: "1rem 0 0",
  padding: "1rem",
  borderRadius: 10,
  background: "color-mix(in srgb, var(--ink) 4%, transparent)",
};

const field: React.CSSProperties = {
  display: "grid",
  gap: "0.25rem",
  flex: "1 1 10rem",
};

const label: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--ink-soft)",
};

const input: React.CSSProperties = {
  font: "inherit",
  fontSize: "0.85rem",
  padding: "0.4rem 0.5rem",
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--ink) 20%, transparent)",
  background: "var(--paper)",
  color: "var(--ink)",
  width: "100%",
};

const quiet: React.CSSProperties = {
  font: "inherit",
  fontSize: "0.8rem",
  cursor: "pointer",
  borderRadius: 999,
  padding: "0.3rem 0.75rem",
  border: "1px solid color-mix(in srgb, var(--ink) 24%, transparent)",
  background: "transparent",
  color: "var(--ink)",
};

const go: React.CSSProperties = {
  font: "inherit",
  fontSize: "0.85rem",
  fontWeight: 500,
  cursor: "pointer",
  borderRadius: 999,
  padding: "0.4rem 1rem",
  border: 0,
  background: "var(--jade)",
  color: "var(--shade-deep)",
};
