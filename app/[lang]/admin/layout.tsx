import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import AppShell from "@/components/app-shell/AppShell";
import { currentStaff, sessionToken } from "@/lib/customer";
import "../../app.css";

export const metadata: Metadata = {
  title: "Staff",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The gate, in one place, for every staff page.
 *
 * A layout rather than a check repeated per page: a page added later and given
 * no gate of its own is a hole nobody would notice, and the whole point of
 * these pages is that they are invisible to everyone but us.
 *
 * Three outcomes, and only two of them are visible:
 *
 *   no session at all  -> the sign-in page
 *   signed in, not staff -> not found
 *   staff              -> the page
 *
 * The middle one is the one that matters. A customer who hears there is an
 * admin site and tries it gets exactly what they would get for any address that
 * is not a page — no redirect, no 403, nothing that says "you are close". They
 * are already signed in, so a redirect to sign-in would itself be an answer.
 *
 * A stranger with no session gets the sign-in form, which is the same form
 * already public at reviewslip.com/login and gives nothing away. That is the
 * one concession: staff have to be able to get in, and a host that 404s
 * unconditionally cannot be signed into.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await sessionToken();
  if (!token) redirect("/login");

  const me = await currentStaff();
  if (!me) notFound();

  return (
    <AppShell kind="staff" email={me.account.email}>
      {children}
    </AppShell>
  );
}
