import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import Sharing from "@/components/dashboard/Sharing";
import { call, sessionToken, venueName, type SharingData } from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Sharing",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Sharing the business with other people: a manager with Full Access, or the
 * front desk. They sign in with their own email and find it on their
 * dashboard. Only the owner changes who has access.
 */
export default async function SharingPage({ params }: PageProps<"/[lang]/dashboard/[slug]/sharing">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const token = await sessionToken();
  if (!token) redirect(localizedPath(lang, "/login"));

  let data: SharingData;
  try {
    data = await call<SharingData>(`/businesses/${slug}/sharing`, { token });
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const base = `/businesses/${slug}/sharing`;

  async function act(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    "use server";
    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));
    try {
      const sharing = await call<SharingData>(path, { method, body, token: t });
      return { sharing };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not save that." };
    }
  }

  async function add(email: string, role: string) {
    "use server";
    return act(base, "POST", { email, role });
  }

  async function change(id: number, role: string) {
    "use server";
    return act(`${base}/${Number(id)}`, "PATCH", { role });
  }

  async function remove(id: number) {
    "use server";
    return act(`${base}/${Number(id)}`, "DELETE");
  }

  async function leave() {
    "use server";
    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));
    try {
      await call(`/businesses/${slug}/leave`, { method: "POST", token: t });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not do that." };
    }
    revalidatePath(localizedPath(locale, "/dashboard"), "layout");
    redirect(localizedPath(locale, "/dashboard"));
  }

  return (
    <>
      <PageHeader tour="sharing" title="Sharing" sub={await venueName(slug)} back={localizedPath(locale, `/dashboard/${slug}`)} />
      <div className="page-body cols">
        <p className="lede">
          Give a manager or your front desk their own sign-in to this business. They use their own email, with a code
          and no password, and see only what their access allows.
        </p>
        <Sharing initial={data} add={add} change={change} remove={remove} leave={leave} />
      </div>
    </>
  );
}
