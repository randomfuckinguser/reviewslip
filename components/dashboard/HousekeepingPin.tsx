"use client";

import { useState, useTransition } from "react";

export interface HousekeepingState {
  on: boolean;
  changedAt: string | null;
}

/**
 * Switching the housekeeping board on, and the address it lives at.
 *
 * On the Rooms page rather than in Settings, because the thing it governs is
 * rooms and the person setting it up is standing in front of a room list.
 *
 * The PIN is never shown back, only whether one is set and when it last
 * changed. There is no "reveal" and no recovery: a venue that has forgotten it
 * sets a new one, which is also the only revocation there is — changing it
 * ends every shift opened with the old one, which is what somebody means when
 * they change it after a housekeeper leaves.
 */
export default function HousekeepingPin({
  state,
  url,
  save,
}: {
  state: HousekeepingState;
  /** Where the board lives: the venue's own address. */
  url: string;
  save: (pin: string | null) => Promise<{ ok: boolean; error?: string; on?: boolean }>;
}) {
  const [on, setOn] = useState(state.on);
  const [pin, setPin] = useState("");
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const wanted = pin.trim();
    if (!wanted) return;

    setSaid(null);
    start(async () => {
      const result = await save(wanted).catch(
        (): { ok: boolean; error?: string } => ({ ok: false })
      );
      if (result.ok) {
        setOn(true);
        setPin("");
        setSaid({ ok: true, text: "Saved. Anyone still signed in has been signed out." });
      } else {
        setSaid({ ok: false, text: result.error ?? "That could not be saved." });
      }
    });
  }

  function switchOff() {
    setSaid(null);
    start(async () => {
      const result = await save(null).catch(
        (): { ok: boolean; error?: string } => ({ ok: false })
      );
      if (result.ok) {
        setOn(false);
        setSaid({ ok: true, text: "The board is off. The link no longer opens." });
      } else {
        setSaid({ ok: false, text: result.error ?? "That could not be saved." });
      }
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Denied, or an insecure origin. The address is on screen to be typed.
    }
  }

  return (
    <section style={card} data-tour="rooms-board">
      <h2 style={heading}>Housekeeping Board</h2>
      <p style={lede}>
        A page your housekeepers open on their own phone. It lists today&rsquo;s
        rooms in the order they need doing — turnarounds first — and they tap a
        room to mark it clean, which the front desk sees straight away.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        <code style={link}>{url}</code>
        <button type="button" className="btn btn-quiet" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy Link"}
        </button>
        <span style={{ fontSize: "0.8rem", color: on ? "var(--success)" : "var(--admin-muted)" }}>
          {on ? "On" : "Off — the link will not open"}
        </span>
      </div>

      <form onSubmit={submit} style={form}>
        <label style={{ display: "grid", gap: "0.3rem" }}>
          <span style={label}>
            {on ? "Change the PIN" : "Set a six-digit PIN to switch it on"}
          </span>
          {/*
            Six slots, shown rather than described.

            It read "4 to 8 digits" as placeholder text, and at the
            letter-spacing a PIN field wants, that came out as a row of
            spread-out letters — so people reasonably concluded letters were
            allowed. A fixed length can show itself instead: six dots, and
            nothing left to misread.
          */}
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            aria-label="Six-digit PIN"
            placeholder="••••••"
            style={input}
          />
        </label>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
          <button
            type="submit"
            className="btn btn-quiet"
            disabled={pending || pin.length !== 6}
          >
            {pending ? "Saving…" : on ? "Change It" : "Switch It On"}
          </button>
          {on && (
            <button type="button" className="btn btn-quiet" disabled={pending} onClick={switchOff}>
              Switch Off
            </button>
          )}
        </div>
      </form>

      {said && (
        <p
          role="status"
          style={{
            margin: "0.7rem 0 0",
            fontSize: "0.82rem",
            color: said.ok ? "var(--success)" : "var(--warning)",
          }}
        >
          {said.text}
        </p>
      )}

      <p style={note}>
        {on && state.changedAt
          ? `Last changed ${new Date(state.changedAt).toISOString().slice(0, 10)}. `
          : ""}
        The PIN is shared by whoever is on shift, so treat it as something that
        will end up written down: the board shows room numbers, what needs doing
        and how many guests are coming, and never a guest&rsquo;s name, email or
        telephone number. A shift lasts fourteen hours, and changing the PIN
        ends all of them at once.
      </p>
    </section>
  );
}

const card: React.CSSProperties = {
  background: "var(--paper)",
  color: "var(--ink)",
  borderRadius: 14,
  padding: "1.4rem",
  marginTop: "1.5rem",
};

const heading: React.CSSProperties = { fontSize: "1.1rem", margin: "0 0 0.35rem" };

const lede: React.CSSProperties = {
  margin: "0 0 1rem",
  fontSize: "0.85rem",
  lineHeight: 1.6,
  color: "var(--ink-soft)",
};

const link: React.CSSProperties = {
  fontSize: "0.82rem",
  padding: "0.3rem 0.55rem",
  borderRadius: 8,
  background: "color-mix(in srgb, var(--ink) 6%, transparent)",
  wordBreak: "break-all",
};

const form: React.CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "flex-end",
  flexWrap: "wrap",
  margin: "1rem 0 0",
};

const label: React.CSSProperties = { fontSize: "0.75rem", color: "var(--ink-soft)" };

const input: React.CSSProperties = {
  font: "inherit",
  fontSize: "1.15rem",
  // Tabular, so six digits are six equal columns and a "1" does not leave a
  // gap. The indent puts letter-spaced text back on its centre.
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.35em",
  textIndent: "0.35em",
  textAlign: "center",
  width: "8rem",
  padding: "0.45rem 0.6rem",
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--ink) 20%, transparent)",
  background: "var(--paper)",
  color: "var(--ink)",
};

const note: React.CSSProperties = {
  margin: "1rem 0 0",
  fontSize: "0.78rem",
  lineHeight: 1.6,
  color: "var(--ink-soft)",
};
