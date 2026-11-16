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
 * Staff get an email with a link to choose a password: that makes them a
 * Reviewslip account that opens only the phone, signed in like anyone else. They
 * answer this venue only and never see the dashboard. Without email set up on
 * the server, the link comes back here to send by hand.
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
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
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
      setLink(r.team?.link ? { name, url: r.team.link } : null);
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
                            setLink(r.team?.link ? { name: p.name, url: r.team.link } : null)
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
            Send this link to {link.name}. It lets them choose a password for Reviewslip and works for 14 days.
          </p>
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
          <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Name</span>
          <input name="name" required maxLength={60} autoComplete="off" disabled={pending} />
        </label>
        <label style={{ display: "grid", gap: "0.25rem", flex: "2 1 14rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Email</span>
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
              ? "We email them a link to choose a password. They sign in to Reviewslip like you do, see only the Phone, and answer this venue's calls."
              : "You will get a link to send them yourself. They sign in to Reviewslip like you do, see only the Phone, and answer this venue's calls."
          }
        >
          Add Person
        </button>
      </form>
    </div>
  );
}
