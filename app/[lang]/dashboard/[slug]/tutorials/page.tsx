import { notFound, redirect } from "next/navigation";

import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

/**
 * Tutorials listed one tour per screen. There is one tour of the whole
 * dashboard now (Take the Tour in the sidebar), so an old link here starts it.
 */
export default async function TutorialsPage({ params }: PageProps<"/[lang]/dashboard/[slug]/tutorials">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  redirect(localizedPath(lang, `/dashboard/${slug}?tour=all`));
}
