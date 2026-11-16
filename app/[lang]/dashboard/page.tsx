import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleAlert, CircleCheck, Plus } from "lucide-react";

import PageHeader from "@/components/app-shell/PageHeader";
import { currentUser } from "@/lib/customer";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Dashboard",
  // A signed-in page has nothing to offer an index and every reason to stay out
  // of one.
  robots: { index: false, follow: false },
};

/** A usage figure with a thin meter under it. Amber at 80%, because a meter
 *  only helps while there is time. */
function Meter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit?: number;
}) {
  // A missing limit used to crash the whole page on .toLocaleString(). One field
  // absent from an API response — a version skew between the two deploys, say —
  // should cost that meter its denominator, not the dashboard.
  const cap = Number.isFinite(limit) && (limit as number) > 0 ? (limit as number) : 0;
  const share = cap > 0 ? Math.min(used / cap, 1) : 0;

  return (
    <div style={{ minWidth: "9rem" }}>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {used.toLocaleString()}
        {cap > 0 ? <span style={{ color: "var(--muted-foreground)" }}> / {cap.toLocaleString()}</span> : null}
      </span>
      <div
        className={share >= 0.8 ? "meter is-high" : "meter"}
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={cap || undefined}
      >
        <span style={{ width: `${Math.max(share * 100, used > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}

export default async function DashboardPage({
  params,
}: PageProps<"/[lang]/dashboard">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  const t = getDictionary(lang);
  const businessLimit = me.plan.businesses === null ? "unlimited" : me.plan.businesses;

  return (
    <>
      {/* The second line is the plan's two meters in words: what this list is
          measured against. Refer a Business and Support are Sidebar entries, so
          the header carries the one action this screen has. */}
      <PageHeader
        title="Businesses"
        sub={`${me.usage.businesses} of ${businessLimit} on ${me.plan.name} · ${me.usage.reviewsThisMonth.toLocaleString()} of ${me.plan.reviewAllowance.toLocaleString()} reviews this month`}
      >
        {/* At the cap this still goes to the same page, which explains the
            limit and offers plans — better than a button that does nothing. */}
        <Link
          className="btn btn-go"
          href={localizedPath(lang, "/dashboard/businesses/new")}
        >
          <Plus size={15} aria-hidden="true" />
          Add a Business
        </Link>
      </PageHeader>
      <div className="page-body">
          <section className="container" aria-labelledby="plan-h" style={{ marginBottom: "1rem" }}>
            <div className="container-head">
              <h2 id="plan-h">Plan</h2>
            </div>
            <dl className="kv">
              <div>
                <dt>Plan</dt>
                <dd className="kv-big">{me.plan.name}</dd>
              </div>
              <div>
                <dt>Businesses</dt>
                <dd className="kv-big">
                  {me.usage.businesses}
                  <span style={{ fontSize: "0.875rem", fontWeight: 400 }}> of {businessLimit}</span>
                </dd>
              </div>
              <div>
                <dt>Reviews this month</dt>
                <dd className="kv-big">
                  {me.usage.reviewsThisMonth.toLocaleString()}
                  <span style={{ fontSize: "0.875rem", fontWeight: 400 }}>
                    {" "}
                    of {me.plan.reviewAllowance.toLocaleString()}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Per business</dt>
                <dd>{me.plan.reviewsPerBusiness.toLocaleString()} reviews a month</dd>
              </div>
            </dl>
          </section>

          {/* The console's table container: name and count, then the rows. */}
          <section className="container is-table" aria-labelledby="biz-h">
          <div className="container-head">
            <div>
              <h2 id="biz-h">
                Businesses <span className="count">({me.businesses.length})</span>
              </h2>
              <p className="container-desc">Each business on this account and how much of this month it has used.</p>
            </div>
          </div>

            {me.businesses.length === 0 ? (
              <p className="admin-empty" style={{ padding: "1.25rem" }}>
                No businesses yet. {t.common.getInTouch} —{" "}
                <Link href={localizedPath(lang, "/contact")}>get in touch</Link> and
                we will set the first one up.
              </p>
            ) : (
              <div className="list-view">
                <table className="console-table" style={{ minWidth: "48rem" }} aria-labelledby="biz-h">
                  <thead>
                    <tr>
                      <th scope="col">Status</th>
                      <th scope="col">Name</th>
                      <th scope="col">Review page</th>
                      <th scope="col">Reviews this month</th>
                      <th scope="col">Tokens this month</th>
                      <th scope="col" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {me.businesses.map((business) => (
                      <tr key={business.slug}>
                        <td>
                          {business.status !== "active" ? (
                            <span className="status is-off">{business.status}</span>
                          ) : business.ready ? (
                            <span className="status is-ok">
                              <CircleCheck size={15} aria-hidden="true" />
                              Live
                            </span>
                          ) : (
                            <span className="status is-warn">
                              <CircleAlert size={15} aria-hidden="true" />
                              No review link
                            </span>
                          )}
                        </td>
                        <td>
                          <Link
                            href={localizedPath(lang, `/dashboard/${business.slug}`)}
                            style={{ fontWeight: 700, color: "var(--primary)" }}
                          >
                            {business.name}
                          </Link>
                        </td>
                        <td style={{ wordBreak: "break-all" }}>
                          <a href={business.url} target="_blank" rel="noreferrer">
                            {business.url.replace(/^https?:\/\//, "")}
                          </a>
                        </td>
                        {/* Against the per-business limit, not the account total:
                            a business metered against 15,000 would look idle at
                            1,400. */}
                        <td>
                          <Meter
                            label={`${business.name}: reviews this month`}
                            used={business.usage.reviews}
                            limit={me.plan.reviewsPerBusiness}
                          />
                        </td>
                        <td>
                          <Meter
                            label={`${business.name}: tokens this month`}
                            used={business.usage.tokens}
                            limit={business.usage.tokenLimit}
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Link
                            className="btn btn-quiet"
                            href={localizedPath(lang, `/dashboard/${business.slug}/settings`)}
                          >
                            Settings
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
      </div>
    </>
  );
}
