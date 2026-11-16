"use client";

import { useState, useTransition } from "react";

import type { WelcomeSignup } from "@/lib/customer";

const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

/**
 * Guests who signed up, newest first.
 *
 * Remove is here because a guest is entitled to ask a venue to delete what it
 * holds about them, and the venue needs a way to do it that is not an email to
 * us. It also ends that guest's saved access to the page.
 */
export default function WelcomeSignups({
  initial,
  remove,
}: {
  initial: WelcomeSignup[];
  remove: (id: number) => Promise<{ error?: string }>;
}) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function onRemove(row: WelcomeSignup) {
    if (!window.confirm(`Delete ${row.name} (${row.email})? This cannot be undone.`)) return;
    setError("");
    start(async () => {
      const result = await remove(row.id);
      if (result.error) setError(result.error);
      else setRows((all) => all.filter((r) => r.id !== row.id));
    });
  }

  if (!rows.length) {
    return (
      <p className="lede" style={{ margin: 0 }}>
        No guests yet. They appear here as soon as somebody signs up on the welcome page.
      </p>
    );
  }

  return (
    <div className="admin-scroll">
      {error ? (
        <p role="alert" style={{ color: "var(--destructive)", margin: "0 0 0.5rem" }}>
          {error}
        </p>
      ) : null}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Signed Up</th>
            <th>Agreed to Emails</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="primary">{row.name}</td>
              <td>{row.email}</td>
              <td>{day(row.createdAt)}</td>
              {/* The word, not only a colour: it has to read the same printed
                  in grey or to somebody who cannot tell green from red. */}
              <td style={{ color: row.consent ? "var(--success)" : "var(--muted-foreground)" }}>
                {row.consent ? `Yes, ${day(row.consentedAt)}` : "No"}
              </td>
              <td className="num">
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={pending}
                  onClick={() => onRemove(row)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
