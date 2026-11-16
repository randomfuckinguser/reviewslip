"use client";

import { useState } from "react";
import type { Referral } from "@/lib/customer";

/**
 * The invitations an account has sent, and the link for each.
 *
 * A client component only because of the copy button — there is no mail service
 * behind this yet, so the referrer sends the link themselves and the one thing
 * that has to work well is getting it onto the clipboard.
 */

/**
 * Marigold for waiting, jade for done, and a middle state that is neither: they
 * have an account but have not signed in, so nothing has been earned yet.
 *
 * The text colours are the light ones. The venue cards on the dashboard use
 * #8a5a12 and #2f5f4c for these same two chips, and lifting them straight from
 * there is wrong: those sit on a cream card and these sit on the dark canvas,
 * where they measured 2.09 and 1.47 against a 4.5 minimum — the second being
 * close enough to invisible that the chip read as an empty pill.
 */
const STATE_STYLE: Record<Referral["state"], { bg: string; fg: string; label: string }> = {
  invited: { bg: "color-mix(in srgb, var(--alert) 16%, transparent)", fg: "var(--marigold)", label: "Invited" },
  "signed up": { bg: "color-mix(in srgb, var(--alert) 16%, transparent)", fg: "var(--marigold)", label: "Signed up" },
  joined: { bg: "color-mix(in srgb, var(--success) 18%, transparent)", fg: "var(--success)", label: "Joined" },
};

function inviteUrl(base: string, code: string) {
  return `${base}?ref=${encodeURIComponent(code)}`;
}

export default function ReferralList({
  referrals,
  signupUrl,
  revoke,
}: {
  referrals: Referral[];
  /** The sign-up page, absolute, without the code. */
  signupUrl: string;
  /** Server action, taking the invitation's id in a `id` field. */
  revoke: (formData: FormData) => Promise<void>;
}) {
  const [copied, setCopied] = useState<number | null>(null);

  const copy = async (referral: Referral) => {
    const url = inviteUrl(signupUrl, referral.code);

    try {
      await navigator.clipboard.writeText(url);
      setCopied(referral.id);
      window.setTimeout(() => setCopied((id) => (id === referral.id ? null : id)), 2000);
    } catch {
      // Clipboard access is refused on an insecure origin and in some
      // in-app browsers. Falling back to a prompt is ugly, but it is the
      // difference between "select this and copy it" and a button that does
      // nothing and says nothing.
      window.prompt("Copy this link:", url);
    }
  };

  if (referrals.length === 0) {
    return (
      <p style={{ color: "var(--cream-faint)" }}>
        No invitations yet. Add an email address above and you will get a link to
        send them.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.7rem" }}>
      {referrals.map((referral) => {
        const state = STATE_STYLE[referral.state];

        return (
          <li key={referral.id} className="referral-row">
            <span
              style={{
                minWidth: 0,
                overflowWrap: "anywhere",
                fontSize: "0.95rem",
              }}
            >
              {referral.email}
            </span>

            <span
              style={{
                justifySelf: "start",
                borderRadius: 999,
                padding: "0.15rem 0.6rem",
                fontSize: "0.75rem",
                whiteSpace: "nowrap",
                background: state.bg,
                color: state.fg,
              }}
            >
              {state.label}
            </span>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {/* Only worth offering while it can still be used. Once someone
                  has signed up through it the code is spent, and a copy button
                  on a dead link is a support email waiting to happen. */}
              {referral.state === "invited" ? (
                <>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => copy(referral)}
                  >
                    {copied === referral.id ? "Copied" : "Copy Link"}
                  </button>

                  <form action={revoke}>
                    <input type="hidden" name="id" value={referral.id} />
                    <button type="submit" className="btn btn-quiet">
                      Withdraw
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
