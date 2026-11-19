import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Search } from "lucide-react";

import PageHeader from "@/components/app-shell/PageHeader";
import { call, currentUser, sessionToken, venueName, type Customer } from "@/lib/customer";
import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Customers",
  robots: { index: false, follow: false },
};

/** "13 Nov 2026" from "2026-11-13". */
function day(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Everybody who has stayed, or booked to: one row per person, not per stay.
 *
 * A booking finds its customer by email or phone when it is taken, so a guest
 * who comes back is one row with their stays counted. Search reads names,
 * addresses and phone numbers. A row opens the customer: their details, a note
 * for next time, and every stay.
 */
export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));
  if (!me.businesses.some((b) => b.slug === slug)) notFound();

  const query = await searchParams;
  const q = String((Array.isArray(query.q) ? query.q[0] : query.q) ?? "").trim();

  const token = await sessionToken();
  const { customers } = await call<{ customers: Customer[] }>(
    `/businesses/${slug}/customers?q=${encodeURIComponent(q)}&limit=200`,
    { token }
  );
  const venue = await venueName(slug);
  const here = localizedPath(lang, `/dashboard/${slug}/customers`);
  const returning = customers.filter((c) => (c.stays ?? 0) > 1).length;

  return (
    <>
      <PageHeader
        tour="customers"
        title="Customers"
        sub={`${venue} · ${customers.length}${customers.length === 200 ? "+" : ""} ${q ? "found" : "customers"} · ${returning} returning`}
        back={localizedPath(lang, `/dashboard/${slug}`)}
      />
      <div className="page-body">
        <section className="container is-table" aria-labelledby="cu-h">
          <div className="container-head">
            <div>
              <h2 id="cu-h">
                Customers <span className="count">({customers.length})</span>
              </h2>
              <p className="container-desc">
                Each guest once, however many stays. A booking finds a returning guest by their email
                or phone. A row opens the customer.
              </p>
            </div>
            <div className="container-actions">
              <form className="desk-find" action={here} role="search" data-tour="cu-search">
                <Search size={15} aria-hidden="true" />
                <input
                  name="q"
                  type="search"
                  defaultValue={q}
                  placeholder="Name, email or phone"
                  aria-label="Find a customer"
                />
              </form>
            </div>
          </div>

          {customers.length === 0 ? (
            <p className="admin-empty">
              {q ? `Nobody matches “${q}”.` : "Nobody yet. Every booking taken adds its guest here."}
            </p>
          ) : (
            <div className="admin-scroll" data-tour="cu-list">
              <table className="admin-table is-middle">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th className="num">Stays</th>
                    <th>Last Stay</th>
                    <th className="num">Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td className="primary">
                        <Link href={`${here}/${c.id}`}>{c.name}</Link>
                        {(c.stays ?? 0) > 1 ? <span className="cu-returning">Returning</span> : null}
                      </td>
                      <td>{c.email ?? "—"}</td>
                      <td>{c.phone ?? "—"}</td>
                      <td className="num">{c.stays ?? 0}</td>
                      <td>{day(c.lastArrival)}</td>
                      <td className="num">{c.spent ?? "—"}</td>
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
