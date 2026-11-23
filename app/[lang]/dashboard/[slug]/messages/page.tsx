import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import GuestMessages from "@/components/dashboard/GuestMessages";
import { call, sessionToken, venueName, type GuestChat, type GuestChatThread } from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Guests' messages to the venue. When nobody can take a call, the guest
 * writes instead of leaving a voicemail; each conversation is a ticket,
 * waiting on the venue until someone answers it here or on the phone.
 */
export default async function MessagesPage({
  params,
  searchParams,
}: PageProps<"/[lang]/dashboard/[slug]/messages">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const token = await sessionToken();
  if (!token) redirect(localizedPath(lang, "/login"));

  let chats: GuestChat[];
  try {
    chats = (await call<{ chats: GuestChat[] }>(`/businesses/${slug}/chats`, { token })).chats;
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const base = `/businesses/${slug}/chats`;

  async function authed(): Promise<string> {
    "use server";
    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));
    return t;
  }

  async function list(): Promise<GuestChat[]> {
    "use server";
    return (await call<{ chats: GuestChat[] }>(base, { token: await authed() })).chats;
  }

  async function attempt(path: string, method: "GET" | "POST", body?: unknown) {
    "use server";
    try {
      return { thread: await call<GuestChatThread>(path, { method, body, token: await authed() }) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not do that. Try again." };
    }
  }

  async function open(id: number) {
    "use server";
    return attempt(`${base}/${Number(id)}`, "GET");
  }

  async function reply(id: number, body: string) {
    "use server";
    return attempt(`${base}/${Number(id)}/reply`, "POST", { body });
  }

  async function setStatus(id: number, status: "open" | "closed") {
    "use server";
    return attempt(`${base}/${Number(id)}/status`, "POST", { status });
  }

  // The email about a new message links to one; otherwise the one that has
  // waited longest.
  const asked = Number((await searchParams)?.chat);
  const waiting = chats.filter((c) => c.status === "open");
  const first = chats.some((c) => c.id === asked)
    ? asked
    : (waiting.length ? waiting[waiting.length - 1].id : chats[0]?.id) ?? null;

  return (
    <>
      <PageHeader tour="messages" title="Messages" sub={await venueName(slug)} back={localizedPath(locale, `/dashboard/${slug}`)} />
      <div className="page-body cols">
        <p className="lede">
          When nobody can take a guest&apos;s call, they write to you instead. Answer here or on the phone: they read it
          where they wrote, and by email if they left one.
        </p>
        <GuestMessages initial={chats} first={first} list={list} open={open} reply={reply} setStatus={setStatus} />
      </div>
    </>
  );
}
