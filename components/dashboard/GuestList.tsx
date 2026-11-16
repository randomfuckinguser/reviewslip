"use client";

import { useState } from "react";
import type { BookingGuest } from "@/lib/customer";

export interface GuestResult {
  error?: string;
}

const field: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.7rem",
  borderRadius: 8,
  border: "1px solid var(--jade-line)",
  background: "var(--shade-soft)",
  color: "var(--cream)",
  fontFamily: "inherit",
  fontSize: "0.9rem",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  marginBottom: "0.2rem",
  color: "var(--admin-muted)",
};

/**
 * The people on a booking, for Thailand's TM30 notification.
 *
 * Separate from the booking's own guest name, which is whoever the reservation
 * is under — a family of four is one booking and four notifiable people, and a
 * company booking is under a name that never arrives.
 *
 * The passport number is write-only from here. What comes back is the last four
 * characters, which is enough to confirm the right document is in hand and
 * enough for nobody to do anything else with. Nothing in this component can ask
 * the server for the whole number; only the export can, and that is a file
 * download somebody deliberately asks for.
 */
export default function GuestList({
  guests,
  canStorePassports,
  add,
  update,
  remove,
}: {
  guests: BookingGuest[];
  /** False when the server has no encryption key — the field is disabled. */
  canStorePassports: boolean;
  add: (guest: Record<string, string>) => Promise<GuestResult>;
  update: (id: number, patch: Record<string, unknown>) => Promise<GuestResult>;
  remove: (id: number) => Promise<GuestResult>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  // Which row is mid-save, so only that select goes quiet rather than the
  // whole list. A front desk with six guests on a booking should not have the
  // other five freeze because one is saving.
  const [saving, setSaving] = useState<number | null>(null);

  const [familyName, setFamilyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [nationality, setNationality] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [arrivedInThailand, setArrivedInThailand] = useState("");

  async function submit() {
    if (busy) return;
    setBusy(true);
    setProblem("");

    const result = await add({
      familyName,
      firstName,
      nationality,
      passportNumber,
      arrivedInThailand,
    });

    setBusy(false);
    if (result.error) {
      setProblem(result.error);
      return;
    }

    // Cleared on success only. A refusal keeps what was typed, because
    // re-entering a passport number from a document already back in somebody's
    // pocket is the worst kind of retry.
    setFamilyName("");
    setFirstName("");
    setNationality("");
    setPassportNumber("");
    setArrivedInThailand("");
    setOpen(false);
  }

  /**
   * Record whether TM30 applies to this guest.
   *
   * Three values, not a checkbox. The column is nullable on purpose — null
   * means "decide from nationality", and an unticked box would be
   * indistinguishable from it, which turns a legal question into a guess. The
   * empty-string case is the select's way of spelling null; it is the only
   * value that goes back to the rule.
   */
  async function setRequired(id: number, choice: string) {
    if (saving !== null) return;
    setSaving(id);
    setProblem("");
    try {
      const result = await update(id, {
        tm30Required: choice === "" ? null : choice === "yes",
      });
      if (result.error) setProblem(result.error);
    } catch {
      setProblem("Could not reach the server. Reload the page and try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ borderTop: "1px solid var(--jade-line)", paddingTop: "1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "1rem",
          marginBottom: "0.6rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.95rem" }}>
          Guests{" "}
          <span style={{ fontWeight: 400, color: "var(--admin-muted)" }}>
            for TM30
          </span>
        </h3>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Cancel" : "Add Guest"}
        </button>
      </div>

      {guests.length === 0 ? (
        <p style={{ margin: "0 0 0.6rem", fontSize: "0.85rem", color: "var(--admin-muted)" }}>
          Nobody recorded. Foreign guests have to be notified to Immigration
          within 24 hours of arriving.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 0.6rem", padding: 0 }}>
          {guests.map((g) => (
            <li
              key={g.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.45rem 0",
                borderBottom: "1px solid color-mix(in srgb, var(--wash) 12%, transparent)",
              }}
            >
              <span style={{ minWidth: 0, fontSize: "0.88rem" }}>
                {g.firstName} {g.familyName}
                <span
                  style={{
                    display: "block",
                    fontSize: "0.76rem",
                    color: g.ready ? "var(--admin-muted)" : "var(--marigold)",
                  }}
                >
                  {g.nationality ?? "no nationality"}
                  {g.passportTail ? ` · passport ••••${g.passportTail}` : ""}
                  {!g.ready && g.reportable ? ` · needs ${g.missing.join(", ")}` : ""}
                  {g.notifiedAt ? " · notified" : ""}
                </span>
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <select
                  aria-label={`TM30 for ${g.firstName} ${g.familyName}`}
                  value={g.tm30Required === null ? "" : g.tm30Required ? "yes" : "no"}
                  disabled={saving !== null}
                  onChange={(e) => void setRequired(g.id, e.target.value)}
                  style={{
                    ...field,
                    width: "auto",
                    padding: "0.3rem 0.45rem",
                    fontSize: "0.78rem",
                    appearance: "auto",
                  }}
                >
                  {/* What the rule decides, said out loud — otherwise "Auto"
                      tells you there is a decision without telling you which
                      way it went. */}
                  <option value="">
                    TM30: {g.reportable ? "yes" : "no"}, by nationality
                  </option>
                  <option value="yes">TM30: Always</option>
                  <option value="no">TM30: Exempt</option>
                </select>

                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={busy || saving !== null}
                  onClick={() => void remove(g.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <div
            style={{
              display: "grid",
              gap: "0.6rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
            }}
          >
            <div>
              <label htmlFor="g-first" style={label}>
                First Name
              </label>
              <input
                id="g-first"
                value={firstName}
                disabled={busy}
                onChange={(e) => setFirstName(e.target.value)}
                style={field}
              />
            </div>
            <div>
              <label htmlFor="g-family" style={label}>
                Family Name
              </label>
              <input
                id="g-family"
                value={familyName}
                disabled={busy}
                onChange={(e) => setFamilyName(e.target.value)}
                style={field}
              />
            </div>
            <div>
              <label htmlFor="g-nat" style={label}>
                Nationality
              </label>
              <input
                id="g-nat"
                value={nationality}
                disabled={busy}
                placeholder="GB"
                onChange={(e) => setNationality(e.target.value)}
                style={field}
              />
            </div>
            <div>
              <label htmlFor="g-passport" style={label}>
                Passport Number
              </label>
              <input
                id="g-passport"
                value={passportNumber}
                disabled={busy || !canStorePassports}
                autoComplete="off"
                onChange={(e) => setPassportNumber(e.target.value)}
                style={field}
              />
            </div>
            <div>
              <label htmlFor="g-arrived" style={label}>
                Entered Thailand
              </label>
              <input
                id="g-arrived"
                type="date"
                value={arrivedInThailand}
                disabled={busy}
                onChange={(e) => setArrivedInThailand(e.target.value)}
                style={field}
              />
            </div>
          </div>

          {!canStorePassports ? (
            // Said before somebody types a passport number and loses it on
            // save, rather than after.
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--marigold)" }}>
              Passport numbers are turned off until SECRET_KEY is set on the
              server. Everything else here will save.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--admin-muted)" }}>
              The number is encrypted and never shown again — only the last four
              digits, and the file you send to Immigration.
            </p>
          )}

          <div>
            <button
              type="button"
              className="btn btn-go"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      ) : null}

      <p role="alert" style={{ margin: problem ? "0.6rem 0 0" : 0, fontSize: "0.85rem", color: "var(--marigold)" }}>
        {problem}
      </p>
    </div>
  );
}
