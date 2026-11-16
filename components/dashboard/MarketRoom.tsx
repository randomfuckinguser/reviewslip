"use client";

import { useState, useTransition } from "react";

import type { MarketPlan, RoomProfile } from "@/lib/market";
import { amenityLabel } from "@/lib/stays-text";

import styles from "./MarketListing.module.css";

export interface PlanTerms {
  id: number;
  breakfast: boolean;
  cancelDays: number | null;
}

const CANCEL_CHOICES: { value: string; label: string }[] = [
  { value: "", label: "Non-refundable" },
  { value: "0", label: "Free until the day of arrival" },
  ...[1, 2, 3, 5, 7, 14, 30].map((n) => ({
    value: String(n),
    label: `Free until ${n} day${n === 1 ? "" : "s"} before`,
  })),
];

/**
 * One room type as guests see it: what it is like, the bed, the size, its
 * amenities — and, for each of its rates, whether breakfast is included and
 * how it cancels. Those two are what a guest compares between two prices for
 * the same room, so they sit beside the rate rather than on another screen.
 *
 * Prices themselves stay on the Rates screen, which already owns them.
 */
export default function MarketRoom({
  name,
  capacity,
  initial,
  plans,
  amenities,
  currency,
  save,
}: {
  name: string;
  capacity: number;
  initial: RoomProfile;
  plans: MarketPlan[];
  amenities: string[];
  currency: string;
  save: (room: RoomProfile, terms: PlanTerms[]) => Promise<{ error?: string }>;
}) {
  const startTerms = plans.map((p) => ({ id: p.id, breakfast: p.breakfast, cancelDays: p.cancelDays }));
  const [room, setRoom] = useState(initial);
  const [terms, setTerms] = useState<PlanTerms[]>(startTerms);
  const [saved, setSaved] = useState({ room: initial, terms: startTerms });
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();

  const dirty = JSON.stringify({ room, terms }) !== JSON.stringify(saved);
  const setTerm = (id: number, patch: Partial<PlanTerms>) =>
    setTerms(terms.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  function onSave() {
    setMessage(null);
    start(async () => {
      const result = await save(room, terms);
      if (result.error) {
        setMessage({ text: result.error, error: true });
        return;
      }
      setSaved({ room, terms });
      setMessage({ text: "Saved.", error: false });
    });
  }

  return (
    <div className={styles.stack}>
      <div className={styles.row3}>
        <label className={styles.field}>
          Bed
          <input value={room.bed} maxLength={60} placeholder="1 king bed" onChange={(e) => setRoom({ ...room, bed: e.target.value })} />
        </label>
        <label className={styles.field}>
          Size (m²)
          <input
            type="number"
            min={5}
            max={1000}
            value={room.sizeSqm ?? ""}
            onChange={(e) => setRoom({ ...room, sizeSqm: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label className={styles.field}>
          Sleeps
          <input value={capacity} disabled title="Set on the Rooms screen" />
        </label>
      </div>

      <label className={styles.field}>
        Description
        <textarea
          rows={3}
          maxLength={1000}
          value={room.description}
          placeholder={`What a guest gets in the ${name}.`}
          onChange={(e) => setRoom({ ...room, description: e.target.value })}
        />
      </label>

      <fieldset className={styles.fieldset}>
        <legend>In the Room</legend>
        <div className={styles.checks}>
          {amenities.map((key) => (
            <label key={key} className={styles.check}>
              <input
                type="checkbox"
                checked={room.amenities.includes(key)}
                onChange={(e) =>
                  setRoom({
                    ...room,
                    amenities: e.target.checked
                      ? amenities.filter((k) => k === key || room.amenities.includes(k))
                      : room.amenities.filter((k) => k !== key),
                  })
                }
              />
              {amenityLabel(key, "en")}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Rates</legend>
        {plans.length === 0 ? (
          <p className={styles.hint} style={{ margin: 0 }}>
            No rates yet. Add one on the Rates screen — a room type with no price cannot be booked.
          </p>
        ) : (
          <table className="admin-table terms-table">
            <thead>
              <tr>
                <th>Rate</th>
                <th>Base Price</th>
                <th>Breakfast</th>
                <th>Cancellation</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const term = terms.find((t) => t.id === plan.id)!;
                return (
                  <tr key={plan.id}>
                    <td>{plan.name}</td>
                    <td>
                      {plan.baseMinor === null
                        ? "Not priced"
                        : `${currency} ${(plan.baseMinor / 100).toLocaleString("en-US")}`}
                    </td>
                    <td>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={term.breakfast}
                          onChange={(e) => setTerm(plan.id, { breakfast: e.target.checked })}
                        />
                        Included
                      </label>
                    </td>
                    <td>
                      <select
                        aria-label={`${plan.name} Cancellation`}
                        value={term.cancelDays === null ? "" : String(term.cancelDays)}
                        onChange={(e) => setTerm(plan.id, { cancelDays: e.target.value === "" ? null : Number(e.target.value) })}
                      >
                        {CANCEL_CHOICES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </fieldset>

      <div className={styles.actions}>
        {message && (
          <p className={message.error ? styles.error : styles.ok} role={message.error ? "alert" : "status"}>
            {message.text}
          </p>
        )}
        <button type="button" className="btn btn-quiet" disabled={!dirty || pending} onClick={onSave}>
          {pending ? "Saving…" : "Save Room"}
        </button>
      </div>
    </div>
  );
}
