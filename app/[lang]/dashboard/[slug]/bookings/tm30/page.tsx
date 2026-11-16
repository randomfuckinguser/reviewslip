import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import Tm30Board from "@/components/dashboard/Tm30Board";
import { call, currentUser, sessionToken, type Tm30Pending, venueName } from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { shift, todayAt } from "@/lib/nights";

export const metadata: Metadata = {
  title: "TM30",
  robots: { index: false, follow: false, nocache: true },
};

export default async function Tm30Page({
  params,
  searchParams,
}: PageProps<"/[lang]/dashboard/[slug]/bookings/tm30">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  const query = await searchParams;
  const pick = (key: string) => {
    const v = Array.isArray(query[key]) ? query[key][0] : query[key];
    return /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null;
  };

  const today = todayAt("Asia/Bangkok");
  // A week back by default. The obligation is 24 hours, so a window that only
  // showed today would hide exactly the arrivals somebody has already missed.
  const from = pick("from") ?? shift(today, -7);
  const to = pick("to") ?? today;

  const token = await sessionToken();

  let data: Tm30Pending;
  try {
    data = await call<Tm30Pending>(
      `/businesses/${slug}/tm30?from=${from}&to=${to}`,
      { token }
    );
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const here = localizedPath(locale, `/dashboard/${slug}/bookings/tm30`);

  async function markNotified(ids: number[]) {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    try {
      await call(`/businesses/${slug}/tm30/notified`, {
        method: "POST",
        body: { ids },
        token: t,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not mark those." };
    }

    revalidatePath(here);
    return {};
  }

  const venue = await venueName(slug);

  return (
    <>
    <PageHeader tour="tm30"
      title="TM30"
      sub={`${venue} · arrivals ${from} to ${to}`}
      back={localizedPath(locale, `/dashboard/${slug}`)}
    />
    <div className="page-body cols">
    <p className="lede" style={{ marginBottom: "1rem" }}>
      Foreign guests have to be notified to Immigration within 24 hours of
      arriving. Download the file, upload it at{" "}
      <a
        href="https://tm30.immigration.go.th"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--jade)" }}
      >
        tm30.immigration.go.th
      </a>
      , then mark them done here.
    </p>

    <Tm30Board
      data={data}
      from={from}
      to={to}
      downloadUrl={`/api/tm30/${slug}?from=${from}&to=${to}`}
      markNotified={markNotified}
    />
    </div>
  </>
  );
}
