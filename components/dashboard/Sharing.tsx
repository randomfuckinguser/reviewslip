"use client";

import { useRef, useState, useTransition } from "react";

import type { SharingData } from "@/lib/customer";

type Result = { sharing?: SharingData; error?: string };

const LEVELS = [
  {
    id: "manager",
    label: "Full Access",
    note: "Everything you can do, except share the business or delete it.",
  },
  {
    id: "frontdesk",
    label: "Front Desk",
    note: "Sees everything. Changes bookings, guests, customers, TM30, messages and room status; not prices, rooms or settings.",
  },
] as const;

/**
 * Who else uses this business, and how much they may do. The owner adds an
 * email with a level; that person signs in with that address (a code, no
 * password) and finds the business on their dashboard.
 */
export default function Sharing({
  initial,
  add,
  change,
  remove,
  leave,
}: {
  initial: SharingData;
  add: (email: string, role: string) => Promise<Result>;
  change: (id: number, role: string) => Promise<Result>;
  remove: (id: number) => Promise<Result>;
  /** Give up a business shared with you; goes back to Businesses. */
  leave: () => Promise<Result>;
}) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const owner = data.you === "owner";

  function run(job: () => Promise<Result>, after?: () => void) {
    setError("");
    start(async () => {
      const r = await job();
      if (r.error) return setError(r.error);
      if (r.sharing) setData(r.sharing);
      after?.();
    });
  }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(
      () => add(String(f.get("email") ?? ""), String(f.get("role") ?? "")),
      () => form.current?.reset()
    );
  }

  return (
    <>
      <section className="group-box" aria-labelledby="people-title" data-tour="sharing-people">
        <h2 id="people-title">People with Access</h2>
        {error ? (
          <p role="alert" style={{ color: "var(--destructive)", margin: 0 }}>
            {error}
          </p>
        ) : null}
        <div className="admin-scroll">
          {/* Three columns: no need for the wide minimum a list table has. */}
          <table className="admin-table" style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th>Person</th>
                <th>Access</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="primary" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>
                  {data.owner}
                  {owner ? " (you)" : ""}
                  <div className="sub">Owner</div>
                </td>
                <td>Everything</td>
                <td />
              </tr>
              {data.members.map((m) => (
                <tr key={m.id}>
                  {/* Whether they have signed in yet, under the address: the
                      table fits its half of the screen. */}
                  <td className="primary" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>
                    {m.email}
                    <div className="sub">{m.joined ? "Signed in" : "Not signed in yet"}</div>
                  </td>
                  <td>
                    {owner ? (
                      <select
                        aria-label={`Access for ${m.email}`}
                        value={m.role}
                        disabled={pending}
                        onChange={(e) => run(() => change(m.id, e.target.value))}
                      >
                        {LEVELS.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      m.roleLabel
                    )}
                  </td>
                  <td className="num">
                    {owner ? (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(`Stop sharing this business with ${m.email}?`)) run(() => remove(m.id));
                        }}
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.members.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted-foreground)" }}>Not shared with anyone yet.</p>
        ) : null}
      </section>

      <section className="group-box" aria-labelledby="share-title" data-tour="sharing-add">
        <h2 id="share-title">{owner ? "Share the Business" : "Your Access"}</h2>
        {owner ? (
          <form ref={form} onSubmit={onAdd} style={{ display: "grid", gap: "0.75rem" }}>
            <label style={{ display: "grid", gap: "0.25rem" }}>
              <span style={{ fontWeight: 500 }}>Email</span>
              <input name="email" type="email" required maxLength={160} autoComplete="off" disabled={pending} />
            </label>
            <fieldset style={{ display: "grid", gap: "0.5rem", border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 500, marginBottom: "0.25rem" }}>Access</legend>
              {LEVELS.map((l, i) => (
                <label key={l.id} style={{ display: "flex", gap: "0.5rem", alignItems: "start" }}>
                  <input type="radio" name="role" value={l.id} defaultChecked={i === 1} disabled={pending} style={{ marginTop: "0.2rem" }} />
                  <span>
                    <strong style={{ fontWeight: 500 }}>{l.label}</strong>
                    <br />
                    <span style={{ color: "var(--muted-foreground)", fontSize: "var(--fs12)" }}>{l.note}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div>
              <button
                type="submit"
                className="btn btn-go"
                disabled={pending}
                data-tip={
                  data.canEmail
                    ? "We email them. They sign in with that address, with a code and no password, and the business is on their dashboard."
                    : "Tell them to sign in at reviewslip.com with that address. They get a code, no password, and the business is on their dashboard."
                }
              >
                Share
              </button>
            </div>
          </form>
        ) : (
          <p style={{ margin: 0 }}>
            {data.owner} shared this business with you. Your access:{" "}
            <strong style={{ fontWeight: 500 }}>{data.roles[data.you]}</strong>.{" "}
            {data.you === "frontdesk"
              ? "You can work bookings, guests, customers, TM30, messages and room status."
              : "You can do everything except share the business or delete it."}
          </p>
        )}
        {!owner ? (
          <div>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Leave this business? It goes from your dashboard until the owner shares it again.")) run(leave);
              }}
            >
              Leave
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}
