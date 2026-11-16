"use client";

import { useActionState, useEffect, useRef } from "react";

export interface InviteState {
  error?: string;
  ok?: boolean;
  /** The address that was refused, so it can be put back in the box. */
  email?: string;
}

const EMPTY: InviteState = {};

/**
 * The invite box, as a client component so a refusal can be read.
 *
 * The review app turns several invitations down — a malformed address, your own
 * address, one you have already invited, and now one that already belongs to a
 * customer. Every one of those used to be swallowed by the server action, which
 * meant the page re-rendered with no new row and no explanation: identical, from
 * the outside, to the button not working. The "they are already a customer"
 * case is the one that makes that unacceptable, because it is a refusal the
 * referrer can do something about.
 */
export default function InviteForm({
  action,
  canEmail,
}: {
  action: (state: InviteState, formData: FormData) => Promise<InviteState>;
  /** Whether the server can actually send, which changes what to promise. */
  canEmail: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const box = useRef<HTMLInputElement>(null);

  // Puts a refused address back.
  //
  // React resets an uncontrolled form once its action resolves, so without this
  // a rejection empties the box and leaves a sentence about an address no
  // longer on screen. The field has to be restored rather than merely not
  // cleared. On success the reset is what we want, so nothing happens.
  useEffect(() => {
    if (state.error && state.email && box.current) {
      box.current.value = state.email;
    }
  }, [state]);

  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <p
        style={{
          color: "var(--cream-faint)",
          fontSize: "0.9rem",
          margin: "0 0 1rem",
        }}
      >
        {canEmail
          ? "We will email them an invitation once. If it does not arrive, copy the link below and send it yourself."
          : "You will get a link to send them yourself. We do not email anyone on your behalf."}
      </p>

      <form
        action={formAction}
        style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}
      >
        <input
          ref={box}
          type="email"
          name="email"
          required
          disabled={pending}
          placeholder="their@email.com"
          aria-label="Email address to invite"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "invite-error" : undefined}
          style={{
            flex: "1 1 16rem",
            padding: "0.7rem 0.9rem",
            borderRadius: 10,
            border: `1px solid ${state.error ? "var(--marigold)" : "var(--jade-line)"}`,
            background: "var(--shade-soft)",
            color: "var(--cream)",
            fontFamily: "inherit",
            fontSize: "0.95rem",
          }}
        />
        <button type="submit" className="btn btn-go" disabled={pending}>
          {pending ? "Creating…" : "Create Invitation"}
        </button>
      </form>

      {/* A live region, so the message reaches a screen reader too — the border
          colour above is the only other thing that changes. */}
      <p
        id="invite-error"
        role="status"
        style={{
          margin: state.error ? "0.7rem 0 0" : 0,
          fontSize: "0.9rem",
          color: "var(--marigold)",
          minHeight: state.error ? undefined : 0,
        }}
      >
        {state.error ?? ""}
      </p>
    </div>
  );
}
