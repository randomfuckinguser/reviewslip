import Link from "next/link";

import PageHeader from "@/components/app-shell/PageHeader";
import { call, sessionToken, type StaffAccount } from "@/lib/customer";

interface Overview {
  accounts: number;
  venues: number;
  orphans: number;
  reviewsThisMonth: number;
  takenThisMonth: number;
  openTickets: number;
  referralsJoined: number;
}

/** Numbers a person reads at a glance, not exact timestamps. */
function since(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days)) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * One headline number.
 *
 * `attention` is reserved for a number that means somebody has to act *and*
 * that returns to zero when they do — the ticket queue, and little else. Never
 * "the fourth tile needs a colour", and never a standing condition either: a
 * tint that is always on is decoration, and once it is decoration a real
 * warning somewhere else on the page stops being visible.
 */
function Tile({
  label,
  value,
  note,
  attention,
}: {
  label: string;
  value: number;
  note?: string;
  attention?: boolean;
}) {
  return (
    <div className={`admin-tile${attention ? " admin-tile-attention" : ""}`}>
      <span className="admin-tile-label">{label}</span>
      <span className="admin-tile-value">{value.toLocaleString()}</span>
      {note ? <span className="admin-tile-note">{note}</span> : null}
    </div>
  );
}

export default async function AdminAccountsPage() {
  const token = await sessionToken();

  // Two calls rather than one endpoint returning both: the tiles are platform
  // totals and the table is a list, and folding them together would mean one
  // slow query blocking the other. In parallel, so it costs one round trip.
  const [overview, { accounts }] = await Promise.all([
    call<Overview>("/admin/overview", { token }),
    call<{ accounts: StaffAccount[] }>("/admin/accounts", { token }),
  ]);

  const earned = accounts.filter((a) => a.progress.earned).length;

  return (
    <>
      <PageHeader
        title="Accounts"
        sub={`${accounts.length} account${accounts.length === 1 ? "" : "s"} · everything on the platform, right now`}
      />
      <div className="page-body">
      <div className="admin-tiles">
        <Tile
          label="Accounts"
          value={overview.accounts}
          note={`${accounts.filter((a) => a.venues > 0).length} with a venue`}
        />
        {/* Not marked for attention, even with orphans. Venues with no owner is
            a standing condition that may never be cleared, so an amber tile
            here would be amber for ever — and a warning colour that is always
            on stops being a warning anywhere on the page. The count still says
            it; the Venues tab is where it gets acted on. */}
        <Tile
          label="Venues"
          value={overview.venues}
          note={
            overview.orphans > 0
              ? `${overview.orphans} with no owner`
              : "all owned"
          }
        />
        <Tile
          label="Reviews this month"
          value={overview.reviewsThisMonth}
          note={`${overview.takenThisMonth.toLocaleString()} taken to a listing`}
        />
        <Tile
          label="Open tickets"
          value={overview.openTickets}
          note={overview.openTickets > 0 ? "waiting on us" : "nothing waiting"}
          attention={overview.openTickets > 0}
        />
      </div>

      <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.25rem" }}>Accounts</h2>
      <p className="admin-sub" style={{ marginBottom: "1rem" }}>
        Newest first · {overview.referralsJoined} referral
        {overview.referralsJoined === 1 ? "" : "s"} joined · {earned} at the
        discount
      </p>

      {accounts.length === 0 ? (
        <p className="admin-empty">No accounts yet.</p>
      ) : (
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Plan</th>
                <th className="num">Venues</th>
                <th className="num">Referrals</th>
                <th className="num">Joined</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/accounts/${a.id}`} className="primary">
                      {a.email}
                    </Link>
                    <span className="sub">
                      {a.username}
                      {a.isAdmin ? " · staff" : ""}
                      {a.status !== "active" ? ` · ${a.status}` : ""}
                    </span>
                  </td>
                  <td>{a.plan}</td>
                  <td className="num">{a.venues}</td>
                  <td className="num">
                    {/* Qualified over the bar, not over invitations sent. Five
                        is the number that means anything, and "3/7" would read
                        as though sending more helped. */}
                    <span
                      style={{
                        color: a.progress.earned ? "var(--marigold)" : "var(--cream)",
                      }}
                    >
                      {a.referrals.qualified}/{a.progress.needed}
                    </span>
                    {a.referrals.total > a.referrals.qualified ? (
                      <span style={{ color: "var(--admin-muted)" }}>
                        {" "}
                        ({a.referrals.total} sent)
                      </span>
                    ) : null}
                  </td>
                  <td className="num" style={{ color: "var(--admin-muted)" }}>
                    {since(a.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </>
  );
}
