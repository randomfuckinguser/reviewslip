import Link from "next/link";
import { CircleAlert, CircleCheck, ExternalLink, RefreshCw } from "lucide-react";

import type { BookingSummary, BusinessDetail, DayView } from "@/lib/customer";

/**
 * One venue at a glance, laid out like a cloud console's service dashboard:
 *
 *   - Resources: everything there is a count of, each one a way into the
 *     screen behind it, and the ones needing somebody marked;
 *   - Today at the Desk and Review Page Health, side by side underneath (a
 *     booking starts from the header's New Booking);
 *   - Reviews down the right: the month's figures and the last thirty days.
 *
 * Every number here has a page behind it, so nothing on this screen is the only
 * place to find something.
 */

interface Props {
  business: BusinessDetail["business"];
  setup: BusinessDetail["setup"];
  stats: BusinessDetail["stats"];
  /** Null when the venue has no rooms yet, or the call failed. */
  summary: BookingSummary | null;
  /** Today at the desk, by name. Null with no rooms, or when the call failed. */
  day: DayView | null;
  /** The venue's dashboard root, already localised. */
  base: string;
}

interface Resource {
  label: string;
  count: number | string;
  href: string;
  /** Something somebody has to do, not just a figure. */
  attention?: boolean;
}

export default function VenueOverview({ business, setup, stats, summary, day, base }: Props) {
  const bookings = `${base}/bookings`;
  const hasRooms = Boolean(summary && summary.rooms > 0);

  const resources: Resource[] = [
    ...(summary && hasRooms
      ? [
          { label: "Staying tonight", count: `${summary.staying} of ${summary.rooms}`, href: bookings },
          { label: "Arriving today", count: summary.arrivals, href: bookings },
          { label: "Leaving today", count: summary.departures, href: bookings },
          { label: "Waiting to check in", count: summary.toCheckIn, href: bookings, attention: summary.toCheckIn > 0 },
          { label: "Waiting to check out", count: summary.toCheckOut, href: bookings, attention: summary.toCheckOut > 0 },
          { label: "Occupancy tonight", count: `${summary.occupancy}%`, href: `${bookings}/calendar` },
          { label: "Stays with no room", count: summary.unassigned, href: `${bookings}/calendar`, attention: summary.unassigned > 0 },
          { label: "Rooms to clean", count: summary.dirty, href: bookings, attention: summary.dirty > 0 },
          { label: "Guests to notify (TM30)", count: summary.tm30Pending, href: `${bookings}/tm30`, attention: summary.tm30Pending > 0 },
        ]
      : [{ label: "Rooms", count: 0, href: `${bookings}/rooms`, attention: true }]),
    { label: "Reviews this month", count: stats.month.reviews.toLocaleString(), href: `${base}/reviews` },
    { label: "Reviews all time", count: stats.lifetime.reviews.toLocaleString(), href: `${base}/reviews` },
    { label: "Review topics", count: stats.byCategory.length, href: `${base}/settings` },
  ];

  return (
    <div className="console-grid">
      <div className="console-col">
        <section className="container" aria-labelledby="resources-h" data-tour="vd-resources">
          <div className="container-head">
            <div>
              <h2 id="resources-h">Resources</h2>
              <p className="container-desc">
                You are using the following at {business.name} today:
              </p>
            </div>
            <div className="container-actions">
              {/* A plain link to this same screen: the server renders it fresh. */}
              <Link href={base} className="icon-btn is-outlined" title="Refresh" aria-label="Refresh">
                <RefreshCw size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="resource-grid">
            {resources.map((r) => (
              <div key={r.label} className={r.attention ? "resource is-attention" : "resource"}>
                <Link href={r.href}>{r.label}</Link>
                <span className="resource-count">{r.count}</span>
              </div>
            ))}
          </div>

          {!hasRooms ? (
            <p className="container-desc" style={{ marginTop: "0.9rem" }}>
              No rooms set up yet. <Link href={`${bookings}/rooms`}>Add your room types</Link> and the
              calendar, rates and check-in all follow from them.
            </p>
          ) : null}
        </section>

        <div className="console-pair">
          <section className="container" aria-labelledby="desk-h" data-tour="vd-desk">
            <div className="container-head">
              <h2 id="desk-h">Today at the Desk</h2>
              <div className="container-actions">
                <Link className="btn btn-quiet" href={bookings}>
                  Open Today
                </Link>
              </div>
            </div>
            {day ? (
              <>
                <h3 style={{ margin: "0 0 0.25rem" }}>
                  Arriving{" "}
                  <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>({day.arrivals.length})</span>
                </h3>
                {day.arrivals.length ? (
                  <ul className="row-list" style={{ margin: "0 calc(-1 * var(--pad)) 0.75rem" }}>
                    {day.arrivals.slice(0, 4).map((b) => (
                      <li key={b.id}>
                        <span>
                          {b.guestName}
                          <span style={{ color: "var(--muted-foreground)" }}> · {b.roomName ?? "no room yet"}</span>
                        </span>
                        <span className={`status ${b.status === "in_house" ? "is-ok" : b.roomName ? "is-info" : "is-warn"}`}>
                          {b.status === "in_house" ? "In" : b.roomName ? "Due" : "No room"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="container-desc" style={{ marginBottom: "0.75rem" }}>
                    Nobody is due today.
                  </p>
                )}
                <h3 style={{ margin: "0 0 0.25rem" }}>
                  Leaving{" "}
                  <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>({day.departures.length})</span>
                </h3>
                {day.departures.length ? (
                  <ul className="row-list" style={{ margin: "0 calc(-1 * var(--pad)) calc(-1 * var(--pad))" }}>
                    {day.departures.slice(0, 3).map((b) => (
                      <li key={b.id}>
                        <span>
                          {b.guestName}
                          <span style={{ color: "var(--muted-foreground)" }}> · {b.roomName ?? "no room"}</span>
                        </span>
                        <span className={`status ${b.status === "checked_out" ? "is-off" : "is-info"}`}>
                          {b.status === "checked_out" ? "Out" : "Due out"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="container-desc">Nobody is leaving today.</p>
                )}
              </>
            ) : (
              <p className="container-desc">
                No rooms set up yet. <Link href={`${bookings}/rooms`}>Add your room types</Link> and
                today&apos;s arrivals and departures show here.
              </p>
            )}
          </section>


          <section className="container" aria-labelledby="health-h" data-tour="vd-health">
            <div className="container-head">
              <div>
                <h2 id="health-h">Review Page Health</h2>
              </div>
              <div className="container-actions">
                <a
                  className="btn btn-quiet"
                  href={business.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </div>
            </div>

            <dl className="kv" style={{ gridTemplateColumns: "1fr" }}>
              <div>
                <dt>Address</dt>
                <dd>{business.url}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {setup.canTakeReviews ? (
                    <span className="status is-ok">
                      <CircleCheck size={16} aria-hidden="true" />
                      Taking reviews normally.
                    </span>
                  ) : (
                    <span className="status is-error">
                      <CircleAlert size={16} aria-hidden="true" />
                      Not taking reviews yet.
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            <hr className="container-rule" />

            <h3 style={{ margin: "0 0 0.4rem" }}>Setup</h3>
            <table className="console-table container-bleed">
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Step</th>
                </tr>
              </thead>
              <tbody>
                {setup.steps.map((step) => (
                  <tr key={step.id}>
                    <td>
                      {step.done ? (
                        <span className="status is-ok">
                          <CircleCheck size={14} aria-hidden="true" />
                          Done
                        </span>
                      ) : step.blocks ? (
                        <span className="status is-error">
                          <CircleAlert size={14} aria-hidden="true" />
                          Needed
                        </span>
                      ) : (
                        <span className="status is-warn">To do</span>
                      )}
                    </td>
                    <td>{step.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>

      <ReviewsPanel stats={stats} href={`${base}/reviews`} />
    </div>
  );
}

/** Reviews down the right: the month in figures, then the last thirty days. */
function ReviewsPanel({ stats, href }: { stats: BusinessDetail["stats"]; href: string }) {
  const peak = Math.max(...stats.daily.map((d) => d.reviews), 1);
  // A scale of four steps, rounded up so the top line sits above the tallest bar.
  const step = Math.max(1, Math.ceil(peak / 4));
  const top = step * 4;
  const share = stats.month.tokenLimit
    ? Math.round((stats.month.tokens / stats.month.tokenLimit) * 100)
    : 0;
  const first = stats.daily[0]?.day;
  const last = stats.daily[stats.daily.length - 1]?.day;

  return (
    <section className="container" aria-labelledby="reviews-h" data-tour="vd-reviews">
      <div className="container-head">
        <h2 id="reviews-h">Reviews</h2>
        <div className="container-actions">
          <Link className="btn btn-quiet" href={href}>
            Open Reviews
          </Link>
        </div>
      </div>

      <dl className="kv" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div>
          <dt>Date range</dt>
          <dd>Past 30 days</dd>
        </div>
        <div>
          <dt>Last review</dt>
          <dd>{stats.lifetime.lastAt ? stamp(stats.lifetime.lastAt) : "None yet"}</dd>
        </div>
        <div>
          <dt>This month</dt>
          <dd className="kv-big">{stats.month.reviews.toLocaleString()}</dd>
        </div>
        <div>
          <dt>All time</dt>
          <dd className="kv-big">{stats.lifetime.reviews.toLocaleString()}</dd>
        </div>
      </dl>

      <div style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
          <span>Writing tokens this month</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{share}%</span>
        </div>
        <div className={share >= 80 ? "meter is-high" : "meter"} role="progressbar" aria-label="Writing tokens this month" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.min(share, 100)}%` }} />
        </div>
      </div>

      <hr className="container-rule" />

      <h3 style={{ margin: 0 }}>Reviews per day</h3>
      <div className="bar-chart" role="img" aria-label={`Reviews per day over the last 30 days, at most ${peak} in a day`}>
        <div className="bar-scale" aria-hidden="true">
          {[4, 3, 2, 1, 0].map((n) => (
            <span key={n}>{n * step}</span>
          ))}
        </div>
        <div className="bar-plot">
          {stats.daily.map((day) => (
            <span
              key={day.day}
              className={day.reviews === 0 ? "is-zero" : undefined}
              title={`${day.day}: ${day.reviews} review${day.reviews === 1 ? "" : "s"}`}
              style={{ height: `${(day.reviews / top) * 100}%` }}
            />
          ))}
        </div>
        <div className="bar-axis" aria-hidden="true">
          <span>{first ? stamp(first) : ""}</span>
          <span>{last ? stamp(last) : ""}</span>
        </div>
      </div>

      <hr className="container-rule" />
      <h3 style={{ margin: "0 0 0.4rem" }}>What guests pick</h3>
            {stats.byCategory.length > 0 ? (
              <table className="console-table container-bleed" style={{ marginBottom: "-1rem" }}>
                <thead>
                  <tr>
                    <th scope="col">Topic</th>
                    <th scope="col" className="num">
                      Reviews
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byCategory.slice(0, 6).map((row) => (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td className="num">{row.reviews.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="container-desc">
                No reviews yet. The topics guests choose most will show here.
              </p>
            )}
    </section>
  );
}

/**
 * A fixed UTC date.
 *
 * Not the reader's locale, because this renders on the server and again in the
 * browser, and a date that formats differently in the two is a hydration
 * mismatch.
 */
function stamp(when: string): string {
  const d = new Date(when);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
