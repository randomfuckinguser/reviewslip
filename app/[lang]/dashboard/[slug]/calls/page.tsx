import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import VoiceTeam, { type VoiceTeamData } from "@/components/dashboard/VoiceTeam";
import { call, currentUser, sessionToken, venueName } from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Calls",
  robots: { index: false, follow: false, nocache: true },
};

const STATUS: Record<VoiceTeamData["status"], { text: string; tone: string }> = {
  open: { text: "Answering now: guests who press Call ring your phone.", tone: "var(--success)" },
  voicemail: { text: "Nobody is on duty: guests who press Call leave a voice message.", tone: "var(--warning)" },
  off: { text: "Nobody answers yet: guests see your phone number instead.", tone: "var(--muted-foreground)" },
};

/**
 * Calls to the venue, from its side: who answers, and the way into the phone.
 *
 * Guests press Call on the venue's booking pages and in the Guest App, and
 * talk to whoever is on duty, in the browser. The phone itself — going on
 * duty, answering, voicemail, hours — is its own page (the review app's
 * /phone/), opened from here.
 */
export default async function CallsPage({ params }: PageProps<"/[lang]/dashboard/[slug]/calls">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  const token = await sessionToken();
  let data: VoiceTeamData;
  try {
    data = await call<VoiceTeamData>(`/businesses/${slug}/voice`, { token });
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const here = localizedPath(locale, `/dashboard/${slug}/calls`);
  const base = `/businesses/${slug}/voice/staff`;

  async function act(path: string, method: string, body?: unknown): Promise<{ team?: VoiceTeamData; error?: string }> {
    "use server";
    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));
    try {
      const team = await call<VoiceTeamData>(path, { method, body, token: t });
      revalidatePath(here);
      return { team };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not save that." };
    }
  }

  async function invite(name: string, email: string) {
    "use server";
    return act(base, "POST", { name, email });
  }

  async function reinvite(id: number) {
    "use server";
    return act(`${base}/${id}/invite`, "POST");
  }

  async function remove(id: number) {
    "use server";
    return act(`${base}/${id}`, "DELETE");
  }

  const venue = await venueName(slug);
  const status = STATUS[data.status];

  return (
    <>
      <PageHeader tour="calls" title="Calls" sub={venue} back={localizedPath(locale, `/dashboard/${slug}`)}>
        {/* A plain link: the phone is served beside the dashboard, not by this app's router. */}
        {/* Outlined: the screen's one filled button is Add Person. */}
        <a className="btn btn-quiet" href="/phone/" target="_blank" rel="noopener">
          Open the Phone
        </a>
      </PageHeader>

      <div className="page-body cols">
        <p className="lede" style={{ marginBottom: "1rem" }}>
          Guests press Call on your booking pages and in your Guest App and talk to you in the browser — no phone
          number to dial, no charge for the call. Keep the phone open on a computer or phone at the desk, or let it
          ring the phone in your pocket.
        </p>

        <section className="group-box" aria-labelledby="line-title" data-tour="calls-line">
          <h2 id="line-title">Your Line</h2>
          <p role="status" style={{ margin: 0, color: status.tone, fontWeight: 500 }}>{status.text}</p>
          <ol style={{ margin: 0, paddingLeft: "1.2rem", display: "grid", gap: "0.35rem" }}>
            <li>Open the phone and press Go on duty. It stays on duty until you press Go off duty.</li>
            <li>On a phone, turn on ringing so a call rings even with the page closed.</li>
            <li>Nobody free? The guest leaves a voice message, and everyone here gets an email.</li>
          </ol>
        </section>

        <section className="group-box" aria-labelledby="team-title" data-tour="calls-team">
          <h2 id="team-title">Who Answers</h2>
          <VoiceTeam initial={data} invite={invite} reinvite={reinvite} remove={remove} />
        </section>
      </div>
    </>
  );
}
