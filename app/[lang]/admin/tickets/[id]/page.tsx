import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import Thread from "@/components/dashboard/Thread";
import { ReplyBox, type TicketState } from "@/components/dashboard/TicketForms";
import {
  call,
  sessionToken,
  type StaffTicketThread,
} from "@/lib/customer";

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

const STATUS: Record<string, { label: string; colour: string }> = {
  open: { label: "Waiting on us", colour: "var(--marigold)" },
  answered: { label: "Answered — waiting on them", colour: "var(--success)" },
  closed: { label: "Closed", colour: "var(--admin-muted)" },
};

export default async function StaffTicketPage({
  params,
}: PageProps<"/[lang]/admin/tickets/[id]">) {
  const { id } = await params;
  const token = await sessionToken();

  let data: StaffTicketThread;
  try {
    data = await call<StaffTicketThread>(`/admin/tickets/${id}`, { token });
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const { ticket, messages, account } = data;
  const here = `/tickets/${ticket.id}`;

  async function reply(
    _prev: TicketState,
    formData: FormData
  ): Promise<TicketState> {
    "use server";

    const t = await sessionToken();
    const body = String(formData.get("body") ?? "").trim();

    try {
      await call(`/admin/tickets/${id}/reply`, {
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

  async function closeTicket() {
    "use server";

    const t = await sessionToken();
    try {
      await call(`/admin/tickets/${id}/close`, { method: "POST", token: t });
    } catch (err) {
      console.error("Close failed:", err);
    }
    revalidatePath(here);
  }

  const state = STATUS[ticket.status] ?? {
    label: ticket.status,
    colour: "var(--cream)",
  };

  return (
    <>
      <PageHeader
        title={ticket.title}
        sub={`${account.email}${ticket.venue ? ` · ${ticket.venue.name}` : ""} · ${state.label}`}
        back="/tickets"
      />
      <div className="page-body is-narrow">
        <section className="container" aria-labelledby="ticket-h">
          <div className="container-head">
            <div>
              <h2 id="ticket-h">Conversation</h2>
              <p className="container-desc">
                <Link href={`/accounts/${account.id}`}>{account.email}</Link>
                {ticket.venue ? ` · ${ticket.venue.name}` : ""} · opened {when(ticket.createdAt)}
              </p>
            </div>
            <span className="status" style={{ color: state.colour }}>
              {state.label}
            </span>
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            {/* The labels are inverted from the customer's view: the same message
                is "Reviewslip" to them and "You" to whoever is reading here. */}
            <Thread messages={messages} staffLabel="You" customerLabel={account.email} />
          </div>

          <ReplyBox
            action={reply}
            placeholder="Write a reply — it goes to them by email as well"
            submitLabel="Send Reply"
          />

          {ticket.status !== "closed" ? (
            <>
              <hr className="container-rule" />
              <form action={closeTicket}>
                <button
                  type="submit"
                  className="btn btn-quiet"
                  data-tip="Closing frees their one ticket slot. A reply from them reopens it rather than starting a new thread."
                >
                  Close It
                </button>
              </form>
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}
