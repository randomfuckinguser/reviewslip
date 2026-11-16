import type { TicketMessage } from "@/lib/customer";

/**
 * A ticket's messages, oldest first.
 *
 * Shared by the customer's own view and the staff view, which is why "us" and
 * "them" are a prop: the same message is "Support" to a customer and "You" to
 * the person who wrote it, and a thread that gets that backwards is worse than
 * one with no labels at all.
 */
export default function Thread({
  messages,
  staffLabel,
  customerLabel,
}: {
  messages: TicketMessage[];
  /** What to call a message from staff, from this reader's point of view. */
  staffLabel: string;
  customerLabel: string;
}) {
  if (messages.length === 0) {
    return (
      <p style={{ color: "var(--cream-faint)", fontSize: "0.9rem" }}>
        Nothing on this ticket yet.
      </p>
    );
  }

  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "1rem" }}>
      {messages.map((m) => (
        <li
          key={m.id}
          data-staff={m.fromStaff ? "true" : undefined}
          style={{
            border: "1px solid var(--jade-line)",
            // Staff messages get the accent edge, so a long thread can be
            // skimmed for "did we answer" without reading any of it.
            borderLeft: `3px solid ${m.fromStaff ? "var(--jade)" : "var(--jade-line)"}`,
            borderRadius: 10,
            padding: "0.9rem 1.1rem",
            background: "var(--shade-soft)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "0.5rem",
              fontSize: "0.8rem",
              color: "var(--cream-faint)",
            }}
          >
            <strong style={{ color: m.fromStaff ? "var(--jade)" : "var(--cream)" }}>
              {m.fromStaff ? staffLabel : customerLabel}
            </strong>
            <time dateTime={m.createdAt}>
              {new Date(m.createdAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>

          {/* pre-wrap, so the paragraphs somebody typed survive. Support text
              is the one place where losing line breaks costs comprehension. */}
          <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
            {m.body}
          </p>
        </li>
      ))}
    </ol>
  );
}
