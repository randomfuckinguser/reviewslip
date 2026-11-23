"use client";

import { useRef, useState, useTransition } from "react";

export interface VoicePerson {
  id: number;
  name: string;
  email: string;
  you: boolean;
  invited: boolean;
  onDuty: boolean;
  presence: "online" | "call" | "offline";
}

export interface VoiceTeamData {
  status: "open" | "voicemail" | "off";
  phoneUrl: string;
  canEmail: boolean;
  opened: boolean;
  people: VoicePerson[];
  link?: string | null;
  /** The invite's code, when there is no mail to send it in. */
  code?: string | null;
}

type Result = { team?: VoiceTeamData; error?: string };

/** Where someone is, in words: never a colour alone. */
function state(p: VoicePerson): { text: string; tone: string } {
  if (p.invited) return { text: "Invited, not signed in yet", tone: "var(--muted-foreground)" };
  if (p.presence === "call") return { text: "On a call", tone: "var(--warning)" };
  if (p.onDuty && p.presence === "online") return { text: "On duty, phone open", tone: "var(--success)" };
  if (p.onDuty) return { text: "On duty, phone closed", tone: "var(--warning)" };
  return { text: "Off duty", tone: "var(--muted-foreground)" };
}

/**
 * Who answers this venue's calls: the owner, and the staff they invite.
 *
 * Staff get an email with a link and a six-digit code: they press the link, or
 * open the app, enter the code, and are signed in — no password — as a
 * Reviewslip account that opens only the phone. They answer this venue only and
 * never see the dashboard. Without email set up on the server, the link and the
 * code come back here to send by hand.
 */
export default function VoiceTeam({
  initial,
  invite,
  reinvite,
  remove,
}: {
  initial: VoiceTeamData;
  invite: (name: string, email: string) => Promise<Result>;
  reinvite: (id: number) => Promise<Result>;
  remove: (id: number) => Promise<Result>;
}) {
  const [team, setTeam] = useState(initial);
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ name: string; url: string; code: string } | null>(null);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  function run(job: () => Promise<Result>, after?: (r: Result) => void) {
    setError("");
    start(async () => {
      const r = await job();
      if (r.error) return setError(r.error);
      if (r.team) setTeam(r.team);
      after?.(r);
    });
  }

  function onInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "");
    const email = String(data.get("email") ?? "");
    run(() => invite(name, email), (r) => {
      form.current?.reset();
      setLink(r.team?.link ? { name, url: r.team.link, code: r.team.code ?? "" } : null);
    });
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {error ? (
        <p role="alert" style={{ color: "var(--destructive)", margin: 0 }}>
          {error}
        </p>
      ) : null}

      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>Email</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {!team.opened ? (
              <tr>
                <td>
                  <span className="status is-off">Not set up</span>
                </td>
                <td className="primary">You</td>
                <td style={{ color: "var(--muted-foreground)" }}>
                  Open the phone once to answer your own calls.
                </td>
                <td />
              </tr>
            ) : null}
            {team.people.map((p) => {
              const s = state(p);
              return (
                <tr key={p.id}>
                  {/* Status first: a dot in its colour and the words. */}
                  <td>
                    <span className="status" style={{ color: s.tone }}>
                      {s.text}
                    </span>
                  </td>
                  <td className="primary">
                    {p.name}
                    {p.you ? " (you)" : ""}
                  </td>
                  <td>{p.email}</td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    {p.invited ? (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={pending}
                        onClick={() =>
                          run(() => reinvite(p.id), (r) =>
                            setLink(r.team?.link ? { name: p.name, url: r.team.link, code: r.team.code ?? "" } : null)
                          )
                        }
                      >
                        Resend Invite
                      </button>
                    ) : null}{" "}
                    {!p.you ? (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(`Stop ${p.name} answering calls for this venue?`)) run(() => remove(p.id));
                        }}
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {link ? (
        <div className="group-box" role="status" style={{ margin: 0 }}>
          <p style={{ margin: 0 }}>
            Send {link.name} this link and code. They open the link, or the Reviewslip app, and enter the
            code: no password, and they stay signed in. Both work for 14 days.
          </p>
          {link.code ? (
            <p style={{ margin: "0.5rem 0 0", fontSize: "var(--fs24)", fontWeight: 700, letterSpacing: "0.2em" }} aria-label="Invite code">
              {link.code}
            </p>
          ) : null}
          <input
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Invite link"
            style={{ width: "100%", marginTop: "0.5rem" }}
          />
        </div>
      ) : null}

      <form ref={form} onSubmit={onInvite} data-tour="calls-add" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ display: "grid", gap: "0.25rem", flex: "1 1 10rem" }}>
          <span style={{ fontSize: "var(--fs14)", fontWeight: 500 }}>Name</span>
          <input name="name" required maxLength={60} autoComplete="off" disabled={pending} />
        </label>
        <label style={{ display: "grid", gap: "0.25rem", flex: "2 1 14rem" }}>
          <span style={{ fontSize: "var(--fs14)", fontWeight: 500 }}>Email</span>
          <input name="email" type="email" required autoComplete="off" disabled={pending} />
        </label>
        {/* What Add Person does is said on it, as a tip, not as small print
            under it. */}
        <button
          type="submit"
          className="btn btn-go"
          disabled={pending}
          data-tip={
            team.canEmail
              ? "We email them a link and a code. They enter the code, no password, and stay signed in. They see only the Phone and answer this venue's calls."
              : "You will get a link and a code to send them yourself. They enter the code, no password, and stay signed in. They see only the Phone and answer this venue's calls."
          }
        >
          Add Person
        </button>
      </form>
    </div>
  );
}
