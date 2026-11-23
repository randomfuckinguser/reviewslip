import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";


import PageHeader from "@/components/app-shell/PageHeader";
import VoiceCall from "@/components/VoiceCall";
import Thread from "@/components/dashboard/Thread";
import {
  NewTicketForm,
  ReplyBox,
  type TicketState,
} from "@/components/dashboard/TicketForms";
import {
  call,
  currentUser,
  sessionToken,
  type TicketList,
  type TicketThread,
} from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Support",
  robots: { index: false, follow: false },
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS: Record<string, { label: string; colour: string }> = {
  open: { label: "Waiting on us", colour: "var(--marigold)" },
  answered: { label: "Answered", colour: "var(--success)" },
  closed: { label: "Closed", colour: "var(--cream-faint)" },
};

export default async function SupportPage({
  params,
}: PageProps<"/[lang]/dashboard/support">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  const token = await sessionToken();
  const list = await call<TicketList>("/tickets", { token });

  // Only the active one gets its thread fetched. Closed tickets are shown as a
  // list of subjects — the history is worth keeping, but loading every thread
  // to render a page nobody scrolls to is not.
  let thread: TicketThread | null = null;
  if (list.active) {
    thread = await call<TicketThread>(`/tickets/${list.active.id}`, { token });
  }

  const here = localizedPath(locale, "/dashboard/support");

  async function openTicket(
    _prev: TicketState,
    formData: FormData
  ): Promise<TicketState> {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim() || undefined;

    try {
      await call("/tickets", {
        method: "POST",
        body: { title, body, slug },
        token: t,
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not send that.",
        // Returned so a refusal does not throw away what they wrote.
        values: { title, body },
      };
    }

    revalidatePath(here);
    return { ok: true };
  }

  /**
   * The ticket id is a bound argument, not a hidden field.
   *
   * ReplyBox is generic — it renders a textarea and a button and nothing else —
   * so there is no field for an id to travel in, and binding is also the half
   * that cannot be edited in the browser. The API scopes to the account
   * regardless, so this is tidiness rather than the security boundary.
   */
  async function reply(
    id: number,
    _prev: TicketState,
    formData: FormData
  ): Promise<TicketState> {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    const body = String(formData.get("body") ?? "").trim();
    if (!Number.isSafeInteger(id) || id <= 0) return { error: "No such ticket." };

    try {
      await call(`/tickets/${id}/reply`, {
        method: "POST",
        body: { body },
        token: t,
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not send that.",
        values: { body },
      };
    }

    revalidatePath(here);
    return { ok: true };
  }

  async function closeTicket(formData: FormData) {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    const id = Number(formData.get("id"));
    if (!Number.isSafeInteger(id) || id <= 0) return;

    try {
      await call(`/tickets/${id}/close`, { method: "POST", token: t });
    } catch (err) {
      console.error("Close failed:", err);
    }

    revalidatePath(here);
  }

  const past = list.tickets.filter((t) => !t.active);
  const active = thread?.ticket ?? null;

  return (
    <>
      <PageHeader
        title="Support"
        sub={active ? active.title : "No open ticket"}
        back={localizedPath(lang, "/dashboard")}
      >
        {/* Talk to us now instead of writing. The person answering sees who
            is calling. */}
        <VoiceCall
          line="reviewslip"
          team="support"
          label="Call Support"
          className="btn btn-quiet"
          caller={me.account.email}
        />
      </PageHeader>
      <div className="page-body cols is-main">
        {active && thread ? (
          <>
            <p className="lede" style={{ marginBottom: "2rem" }}>
              One ticket at a time — reply here rather than starting another.
            </p>

            <section className="container" aria-labelledby="ticket-h">
              <div className="container-head">
                <div>
                  <h2 id="ticket-h">{active.title}</h2>
                  <p className="container-desc">
                    Opened {when(active.createdAt)}
                    {active.venue ? ` · about ${active.venue.name}` : ""}
                  </p>
                </div>
                <span
                  className="status"
                  style={{ color: STATUS[active.status]?.colour ?? "var(--cream)" }}
                >
                  {STATUS[active.status]?.label ?? active.status}
                </span>
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <Thread
                  messages={thread.messages}
                  staffLabel="Reviewslip"
                  customerLabel="You"
                />
              </div>

              <ReplyBox
                action={reply.bind(null, active.id)}
                submitLabel="Send Reply"
              />

              <hr className="container-rule" />

              <form action={closeTicket}>
                <input type="hidden" name="id" value={active.id} />
                <button
                  type="submit"
                  className="btn btn-quiet"
                  data-tip="Closing frees you to open another. You can still reply here afterwards, which reopens it."
                >
                  This Is Sorted — Close It
                </button>
              </form>
            </section>
          </>
        ) : (
          <>
            <p className="lede" style={{ marginBottom: "2rem" }}>
              Tell us what is wrong and we will reply by email and here.
            </p>
            <NewTicketForm
              action={openTicket}
              venues={me.businesses.map((b) => ({ slug: b.slug, name: b.name }))}
            />
          </>
        )}

        {past.length > 0 ? (
          <section className="container" aria-labelledby="closed-h" style={{ marginTop: "1.25rem" }}>
            <div className="container-head" style={{ marginBottom: 0 }}>
              <h2 id="closed-h">
                Closed{" "}
                <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>({past.length})</span>
              </h2>
            </div>
            <ul className="row-list">
              {past.map((t) => (
                <li key={t.id}>
                  <span>{t.title}</span>
                  <span style={{ color: "var(--muted-foreground)" }}>{when(t.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
