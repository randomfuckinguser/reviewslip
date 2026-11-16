import { notFound, redirect } from "next/navigation";

import AppShell from "@/components/app-shell/AppShell";
import { currentUser } from "@/lib/customer";
import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import "../../app.css";

/**
 * The customer dashboard's shell: the Sidebar, around every screen beneath it.
 *
 * The sign-in check is here as well as on each page. The pages keep theirs —
 * they need the account for their own reasons — but the shell cannot draw a nav
 * for nobody, and a screen added later with no check of its own still gets this
 * one.
 */
export default async function DashboardLayout({
  children,
  params,
}: LayoutProps<"/[lang]/dashboard">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));
  // Invited front-desk staff have an account for the phone and nothing else.
  if (me.account.phoneOnly) redirect("/phone/");

  return (
    <AppShell
      kind="customer"
      lang={lang}
      email={me.account.email}
      venues={me.businesses.map(({ slug, name }) => ({ slug, name }))}
      isAdmin={me.account.isAdmin === true}
    >
      {children}
    </AppShell>
  );
}
