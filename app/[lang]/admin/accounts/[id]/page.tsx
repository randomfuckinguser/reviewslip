import Link from "next/link";
import { notFound } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import { call, sessionToken, type StaffAccountDetail } from "@/lib/customer";

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Same three words the customer's own referrals page uses. */
const STATE: Record<string, { label: string; colour: string }> = {
  invited: { label: "Invited", colour: "var(--marigold)" },
  "signed up": { label: "Signed up", colour: "var(--marigold)" },
  joined: { label: "Joined", colour: "var(--success)" },
};

export default async function StaffAccountPage({
  params,
}: PageProps<"/[lang]/admin/accounts/[id]">) {
  const { id } = await params;
  const token = await sessionToken();

  let data: StaffAccountDetail;
  try {
    data = await call<StaffAccountDetail>(`/admin/accounts/${id}`, { token });
  } catch (err) {
    // The API answers 404 for a missing account and for a caller who is not
    // staff. Both become this page's own not-found — there is nothing here to
    // tell apart, and the layout has already established the caller is staff.
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const { account, plan, venues, referrals, referredBy } = data;

  return (
    <>
      <PageHeader
        title={account.email}
        sub={`${account.username} · ${plan.name} · ${account.status}${account.isAdmin ? " · staff" : ""} · joined ${when(account.createdAt)}`}
        back="/"
      />
      <div className="page-body cols">
      {/* ------------------------------------------------------------ plan */}

      <div className="admin-card wide">
        <h2>Plan</h2>
        <p style={{ margin: 0, fontSize: "var(--fs14)", color: "var(--admin-muted)" }}>
          <strong style={{ color: "var(--cream)" }}>{plan.name}</strong> ·{" "}
          {venues.length} of {plan.venues === null ? "unlimited" : plan.venues} venues
          used · {plan.reviewsPerBusiness.toLocaleString()} reviews and{" "}
          {plan.tokensPerMonthPerBusiness.toLocaleString()} tokens per venue per
          month
        </p>
        {plan.venues !== null && venues.length > plan.venues ? (
          <p style={{ margin: "0.6rem 0 0", fontSize: "var(--fs14)", color: "var(--marigold)" }}>
            Over the plan limit by {venues.length - plan.venues}.
          </p>
        ) : null}
      </div>

      {/* ---------------------------------------------------------- venues */}

      <div className="admin-card">
        <h2>Venues ({venues.length})</h2>

        {venues.length === 0 ? (
          <p className="admin-empty" style={{ padding: "1.25rem" }}>None yet.</p>
        ) : (
          <div className="admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Venue</th>
                  <th className="num">Reviews</th>
                  <th className="num">Taken</th>
                  <th className="num">Last</th>
                </tr>
              </thead>
              <tbody>
                {venues.map((v) => (
                  <tr key={v.slug}>
                    <td>
                      <span
                        className={`status ${v.status !== "active" ? "is-off" : v.ready ? "is-ok" : "is-warn"}`}
                      >
                        {v.status !== "active" ? v.status : v.ready ? "Live" : "No review link"}
                      </span>
                    </td>
                    <td>
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="primary"
                      >
                        {v.name}
                      </a>
                      <span className="sub">{v.slug}</span>
                    </td>
                    <td className="num">{v.reviews.toLocaleString()}</td>
                    <td className="num">
                      {/* Drafts someone actually pressed Proceed on. The gap
                          between this and Reviews is the number worth watching. */}
                      {v.taken.toLocaleString()}
                    </td>
                    <td className="num" style={{ color: "var(--admin-muted)" }}>
                      {when(v.lastReview)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- referrals */}

      <div className="admin-card">
        <h2 style={{ marginBottom: "0.3rem" }}>Referrals</h2>
        <p style={{ margin: "0 0 0.9rem", fontSize: "var(--fs14)" }}>
          <strong
            style={{
              color: referrals.progress.earned ? "var(--marigold)" : "var(--cream)",
            }}
          >
            {referrals.progress.qualified} of {referrals.progress.needed} joined
          </strong>
          <span style={{ color: "var(--admin-muted)" }}>
            {" "}
            · {referrals.invited.length} invited
            {referrals.progress.earned
              ? ` · earned ${referrals.progress.worth}% off, not yet applied`
              : ""}
          </span>
        </p>

        {referredBy ? (
          <p style={{ margin: "0 0 0.9rem", fontSize: "var(--fs14)", color: "var(--admin-muted)" }}>
            Referred by{" "}
            <Link href={`/accounts/${referredBy.id}`} style={{ color: "var(--jade)" }}>
              {referredBy.email}
            </Link>
            {referredBy.qualified ? " (counted)" : " (not counted yet)"}
          </p>
        ) : null}

        {referrals.invited.length === 0 ? (
          <p className="admin-empty" style={{ padding: "1.25rem" }}>None sent.</p>
        ) : (
          <div className="admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Invited</th>
                  <th>Sent</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {referrals.invited.map((r) => {
                  const state = STATE[r.state] ?? { label: r.state, colour: "var(--cream)" };
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="status" style={{ color: state.colour }}>
                          {state.label}
                        </span>
                      </td>
                      <td style={{ overflowWrap: "anywhere" }}>
                        {r.email}
                        {/* The invited address is only a label — signing up
                            with a different one still counts — so when they
                            differ, say so rather than showing one and
                            implying the other. */}
                        {r.joinedAs && r.joinedAs.toLowerCase() !== r.email.toLowerCase() ? (
                          <span className="sub">signed up as {r.joinedAs}</span>
                        ) : null}
                      </td>
                      <td style={{ color: "var(--admin-muted)", whiteSpace: "nowrap" }}>
                        {when(r.invitedAt)}
                      </td>
                      <td style={{ color: "var(--admin-muted)", whiteSpace: "nowrap" }}>
                        {when(r.qualifiedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </>
  );
}
