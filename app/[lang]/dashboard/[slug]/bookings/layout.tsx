import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { currentUser } from "@/lib/customer";
import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Bookings",
  robots: { index: false, follow: false },
};

/**
 * The reservations module: today's desk, the diary, the rooms, the rates and
 * the Immigration notification.
 *
 * It draws nothing of its own. The Sidebar lists these screens as their own
 * group, and each screen's page header names the venue on its second line —
 * somebody with two properties open in two tabs needs to know which one they
 * are about to check a guest into.
 *
 * What it is for is the ownership check: a page added to this module later and
 * given no check of its own would otherwise be a hole, and the point of a
 * module is that its pages share what is true about all of them.
 */
export default async function BookingsLayout({
  children,
  params,
}: LayoutProps<"/[lang]/dashboard/[slug]/bookings">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  // A slug this account does not own is not found, rather than forbidden —
  // the same answer the API gives, and for the same reason.
  if (!me.businesses.some((b) => b.slug === slug)) notFound();

  return children;
}
