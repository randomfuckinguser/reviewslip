import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import PageHeader from "@/components/app-shell/PageHeader";
import CustomerDetails from "@/components/dashboard/CustomerDetails";
import {
  call,
  currentUser,
  sessionToken,
  venueName,
  type BookingStatus,
  type Customer,
  type CustomerStay,
  type PaymentStatus,
} from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Customer",
  robots: { index: false, follow: false },
};

const STAY: Record<BookingStatus, { label: string; tone: string }> = {
  confirmed: { label: "Confirmed", tone: "info" },
  in_house: { label: "Checked In", tone: "good" },
  checked_out: { label: "Checked Out", tone: "muted" },
  no_show: { label: "No Show", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "bad" },
};

const PAID: Record<PaymentStatus, { label: string; tone: string }> = {
  unpaid: { label: "Not Paid", tone: "bad" },
  deposit: { label: "Deposit Paid", tone: "warn" },
  paid: { label: "Paid", tone: "good" },
  refunded: { label: "Refunded", tone: "muted" },
};

function day(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * One customer: who they are and every stay of theirs.
 *
 * Two columns, the details beside the stays: what you want while a returning
 * guest is on the phone is their name, their note and what they had last time,
 * all at once.
 */
export default async function CustomerPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string; id: string }>;
}) {
  const { lang, slug, id } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));
  if (!me.businesses.some((b) => b.slug === slug)) notFound();

  const token = await sessionToken();
  let data: { customer: Customer; stays: CustomerStay[] };
  try {
    data = await call(`/businesses/${slug}/customers/${encodeURIComponent(id)}`, { token });
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const here = localizedPath(locale, `/dashboard/${slug}/customers/${id}`);
  const calendar = localizedPath(locale, `/dashboard/${slug}/bookings/calendar`);

  async function save(values: { name: string; email: string; phone: string; notes: string }) {
    "use server";
    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));
    try {
      await call(`/businesses/${slug}/customers/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: values,
        token: t,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not save that." };
    }
    revalidatePath(here);
    return {};
  }

  const { customer, stays } = data;
  const venue = await venueName(slug);
  const owed = stays.filter((s) => s.paymentStatus !== "paid" && s.paymentStatus !== "refunded" && s.status !== "cancelled").length;

  return (
    <>
      <PageHeader
        title={customer.name}
        sub={`${venue} · ${customer.stays ?? 0} stay${customer.stays === 1 ? "" : "s"}${customer.spent ? ` · ${customer.spent} spent` : ""}`}
        back={localizedPath(locale, `/dashboard/${slug}/customers`)}
      />
      <div className="page-body cols">
        <section className="group-box" aria-labelledby="cu-details-h">
          <h2 id="cu-details-h">Details</h2>
          <CustomerDetails customer={customer} save={save} />
        </section>

        <section className="group-box" aria-labelledby="cu-stays-h">
          <h2 id="cu-stays-h">
            Stays <span className="count">({stays.length})</span>
          </h2>
          {owed > 0 ? (
            <p className="cu-owed">
              {owed} stay{owed === 1 ? "" : "s"} not paid in full
            </p>
          ) : null}
          {stays.length === 0 ? (
            <p className="admin-empty">No stays yet.</p>
          ) : (
            <ul className="cu-stays">
              {stays.map((s) => (
                <li key={s.id}>
                  <div className="cu-stay-main">
                    <strong>
                      {day(s.arrival)} → {day(s.departure)}
                    </strong>
                    <span>
                      {s.groupName}
                      {s.roomName ? ` · ${s.roomName}` : " · no room yet"}
                      {s.total ? ` · ${s.total}` : ""}
                    </span>
                  </div>
                  <div className="cu-stay-tags">
                    <span className="bp-pill" data-tone={STAY[s.status].tone}>
                      {STAY[s.status].label}
                    </span>
                    <span className="bp-pill" data-tone={PAID[s.paymentStatus].tone}>
                      {PAID[s.paymentStatus].label}
                    </span>
                    <Link
                      className="icon-btn"
                      href={`${calendar}?start=${s.arrival.slice(0, 7)}-01`}
                      aria-label={`Show ${day(s.arrival)} on the calendar`}
                      title="Show on the calendar"
                    >
                      <CalendarDays size={15} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
