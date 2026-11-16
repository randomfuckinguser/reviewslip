"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";

import type { WelcomeLink } from "@/lib/customer";

/**
 * The links a guest sees after signing up on the welcome page, in the order
 * they see them.
 *
 * Saved as one list rather than row by row: the order is part of what is being
 * saved, and a list half-saved is a page showing a guest the wrong things.
 */
export default function WelcomeLinks({
  initial,
  max,
  maxLabel,
  save,
}: {
  initial: WelcomeLink[];
  max: number;
  maxLabel: number;
  save: (links: WelcomeLink[]) => Promise<{ error?: string; links?: WelcomeLink[] }>;
}) {
  const [rows, setRows] = useState<WelcomeLink[]>(initial.length ? initial : [{ label: "", url: "" }]);
  const [saved, setSaved] = useState<WelcomeLink[]>(initial);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();

  // Disabled until something changes, like every Save in the app.
  const filled = rows.filter((r) => r.label.trim() || r.url.trim());
  const dirty = JSON.stringify(filled) !== JSON.stringify(saved);

  const set = (index: number, patch: Partial<WelcomeLink>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const move = (index: number, step: -1 | 1) => {
    const to = index + step;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[index], next[to]] = [next[to], next[index]];
    setRows(next);
  };

  function onSave() {
    setMessage(null);
    start(async () => {
      const result = await save(filled);
      if (result.error) {
        setMessage({ text: result.error, error: true });
        return;
      }
      // What the server stored, which may differ: "baanponglodge.com" comes
      // back as https://baanponglodge.com/.
      const stored = result.links ?? filled;
      setSaved(stored);
      setRows(stored.length ? stored : [{ label: "", url: "" }]);
      setMessage({ text: "Saved. Guests see these the next time they open the page.", error: false });
    });
  }

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {rows.map((row, index) => (
        <div
          key={index}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(9rem, 14rem) minmax(0, 1fr) auto",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <input
            aria-label={`Link ${index + 1} Label`}
            placeholder="Wi-Fi Details"
            value={row.label}
            maxLength={maxLabel}
            onChange={(e) => set(index, { label: e.target.value })}
          />
          <input
            aria-label={`Link ${index + 1} Address`}
            placeholder="https://… or tel:+66…"
            value={row.url}
            onChange={(e) => set(index, { url: e.target.value })}
          />
          <div style={{ display: "flex", gap: "0.125rem" }}>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Move Link ${index + 1} Up`}
              title="Move Up"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Move Link ${index + 1} Down`}
              title="Move Down"
              disabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove Link ${index + 1}`}
              title="Remove"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-quiet"
          disabled={rows.length >= max}
          onClick={() => setRows([...rows, { label: "", url: "" }])}
        >
          {rows.length >= max ? `${max} Is the Maximum` : "Add Link"}
        </button>
        <button type="button" className="btn btn-go" disabled={!dirty || pending} onClick={onSave}>
          {pending ? "Saving…" : "Save"}
        </button>
        {message ? (
          <span
            role={message.error ? "alert" : "status"}
            style={{ color: message.error ? "var(--destructive)" : "var(--muted-foreground)" }}
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
