import type { Metadata } from "next";

import ServerHealth from "@/components/admin/ServerHealth";

export const metadata: Metadata = {
  title: "Server",
  robots: { index: false, follow: false, nocache: true },
};

/** The staff host's Server page. The same view is a tab in the dashboard for admin accounts. */
export default async function StaffServerPage({ searchParams }: PageProps<"/[lang]/admin/server">) {
  const tab = (await searchParams)?.tab;
  // The staff host maps its paths under /admin, so its own address is /server.
  return <ServerHealth tab={typeof tab === "string" ? tab : undefined} base="/server" />;
}
