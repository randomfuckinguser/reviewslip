"use client";

import { useActionState, useEffect, useRef } from "react";

export interface TicketState {
  error?: string;
  ok?: boolean;
  /** What they typed, so a refusal does not throw it away. */
  values?: { title?: string; body?: string };
}

const EMPTY: TicketState = {};

const field: React.CSSProperties = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  border: "1px solid var(--jade-line)",
  background: "var(--shade-soft)",
  color: "var(--cream)",
  fontFamily: "inherit",
  fontSize: "0.95rem",
  lineHeight: 1.6,
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.85rem",
  marginBottom: "0.35rem",
  color: "var(--cream)",
};

/*
 * Both forms below restore what was typed after a refusal.
 *
 * React resets an uncontrolled form once its action resolves, so without it a
 * rejected ticket empties every box and leaves a message about text no longer
 * on screen. Somebody who has just written four paragraphs about a problem must
 * not lose them to a validation error.
 *
 * Written out in each form rather than shared as a hook taking the refs. A hook
 * assigning to refs handed to it is mutating its own arguments, which React's
 * immutability rule refuses — rightly, since it makes the write invisible from
 * the component that owns them. Each form writes only refs it declared itself.
 */

function Problem({ error }: { error?: string }) {
  return (
    <p
      role="status"
      style={{
        margin: error ? "0.7rem 0 0" : 0,
        fontSize: "0.9rem",
        color: "var(--marigold)",
      }}
    >
      {error ?? ""}
    </p>
  );
}

/* -------------------------------------------------------------- new ticket */

export function NewTicketForm({
  action,
  venues,
}: {
  action: (state: TicketState, formData: FormData) => Promise<TicketState>;
  /** The account's own venues, so a ticket can name one. Optional to fill in. */
  venues: { slug: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const title = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!state.error || !state.values) return;
    if (title.current && state.values.title !== undefined) {
      title.current.value = state.values.title;
    }
    if (body.current && state.values.body !== undefined) {
      body.current.value = state.values.body;
    }
  }, [state]);

  return (
    <form action={formAction} style={{ display: "grid", gap: "1rem" }}>
      <div>
        <label htmlFor="ticket-title" style={label}>
          Subject
        </label>
        <input
          ref={title}
          id="ticket-title"
          name="title"
          required
          maxLength={120}
          disabled={pending}
          placeholder="What is going wrong?"
          style={field}
        />
      </div>

      {venues.length > 0 ? (
        <div>
          <label htmlFor="ticket-venue" style={label}>
            Which business? <span style={{ color: "var(--cream-faint)" }}>(optional)</span>
          </label>
          <select
            id="ticket-venue"
            name="slug"
            disabled={pending}
            style={{ ...field, appearance: "auto" }}
          >
            <option value="">Not About One in Particular</option>
            {venues.map((v) => (
              <option key={v.slug} value={v.slug}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label htmlFor="ticket-body" style={label}>
          What Happened
        </label>
        <textarea
          ref={body}
          id="ticket-body"
          name="body"
          required
          rows={7}
          maxLength={4000}
          disabled={pending}
          placeholder="What you did, what you expected, and what happened instead."
          style={{ ...field, resize: "vertical" }}
        />
      </div>

      <div>
        <button type="submit" className="btn btn-go" disabled={pending}>
          {pending ? "Sending…" : "Send It"}
        </button>
        <Problem error={state.error} />
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------- reply */

export function ReplyBox({
  action,
  placeholder = "Write a reply",
  submitLabel = "Reply",
}: {
  action: (state: TicketState, formData: FormData) => Promise<TicketState>;
  placeholder?: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const body = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!state.error || !state.values) return;
    if (body.current && state.values.body !== undefined) {
      body.current.value = state.values.body;
    }
  }, [state]);

  return (
    <form action={formAction} style={{ display: "grid", gap: "0.75rem" }}>
      <textarea
        ref={body}
        name="body"
        required
        rows={5}
        maxLength={4000}
        disabled={pending}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{ ...field, resize: "vertical" }}
      />
      <div>
        <button type="submit" className="btn btn-go" disabled={pending}>
          {pending ? "Sending…" : submitLabel}
        </button>
        <Problem error={state.error} />
      </div>
    </form>
  );
}
