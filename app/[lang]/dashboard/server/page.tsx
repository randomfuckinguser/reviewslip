import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ServerHealth from "@/components/admin/ServerHealth";
import { currentStaff } from "@/lib/customer";
import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Server",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The server monitor, as a tab in the dashboard — for admin accounts only, so
 * it can be read without going to the staff host. Anybody else gets the same
 * not-found as an address that does not exist.
 */
export default async function DashboardServerPage({ params, searchParams }: PageProps<"/[lang]/dashboard/server">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  if (!(await currentStaff())) notFound();
  const tab = (await searchParams)?.tab;
  return <ServerHealth tab={typeof tab === "string" ? tab : undefined} base={localizedPath(lang, "/dashboard/server")} />;
}
