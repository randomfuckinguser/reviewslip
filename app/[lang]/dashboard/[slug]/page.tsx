import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import SetupProgress from "@/components/dashboard/SetupProgress";
import VenueOverview from "@/components/dashboard/VenueOverview";
import {
  call,
  sessionToken,
  type BookingSummary,
  type BusinessDetail,
} from "@/lib/customer";
import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { todayAt } from "@/lib/nights";

export const metadata: Metadata = {
  title: "Business",
  robots: { index: false, follow: false },
};

/**
 * One venue, and the two ways in.
 *
 * The hub. Everything worth knowing at a glance across the top, then bookings
 * and reviews side by side, each as a summary with its own screen behind it.
 *
 * It no longer carries the review list. Forty reviews in a column beside a bar
 * chart is a scroll inside a scroll, and the numbers people open this page for
 * were underneath it. It also means one fewer round trip on the page opened
 * most often.
 */
export default async function BusinessPage({
  params,
}: PageProps<"/[lang]/dashboard/[slug]">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  const token = await sessionToken();
  if (!token) redirect(localizedPath(lang, "/login"));

  let data: BusinessDetail;
  try {
    data = await call<BusinessDetail>(`/businesses/${slug}`, { token });
  } catch (err) {
    // The API answers 404 for a business belonging to someone else as well as one
    // that does not exist — deliberately, and it stays that way here.
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  /*
   * Tonight's rooms, for the widget — its own call, and its own failure.
   *
   * A venue not using the reservations module at all, or a review app deployed
   * a few minutes behind this one, should still get the page. Null renders the
   * widget's "nothing set up yet" and nothing else notices.
   *
   * Today is worked out here rather than asked for, because the API would
   * answer in UTC — which in Bangkok is still yesterday until seven in the
   * morning. An occupancy figure for the wrong night is worse than no figure.
   */
  let summary: BookingSummary | null = null;
  try {
    summary = await call<BookingSummary>(
      `/businesses/${slug}/summary?today=${todayAt("Asia/Bangkok")}`,
      { token }
    );
  } catch (err) {
    // Left null — the widget has something to say about that. Logged, because
    // a venue that does have rooms and shows the setup prompt is a bug, and
    // this line is the only place it would ever be visible.
    console.error(`Could not load the bookings summary for ${slug}:`, err);
  }

  const { business, stats } = data;

  return (
    <>
      {/* The Home dashboard has nothing above it, so it has no Back. The second
          line is the venue's public address — the thing most often copied off
          this screen. */}
      <PageHeader tour="venue-dashboard" title={business.name} sub={business.url}>
        <a className="btn btn-quiet" href={business.url} target="_blank" rel="noreferrer">
          Open Review Page
        </a>
        <Link
          className="btn btn-go"
          href={localizedPath(lang, `/dashboard/${business.slug}/bookings`)}
        >
          New Booking
        </Link>
      </PageHeader>
      <div className="page-body">
        {/* Above everything, and gone once it is finished. An unfinished
            venue has one thing worth doing and it is not reading occupancy. */}
        {data.setup ? (
          <SetupProgress
            setup={data.setup}
            settings={localizedPath(lang, `/dashboard/${business.slug}/settings`)}
          />
        ) : null}

        <VenueOverview
          business={business}
          setup={data.setup}
          stats={stats}
          summary={summary}
          base={localizedPath(lang, `/dashboard/${business.slug}`)}
        />
      </div>
    </>
  );
}
