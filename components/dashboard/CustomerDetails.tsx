"use client";

import { useState } from "react";
import type { Customer } from "@/lib/customer";

/**
 * A customer's details and the note kept for next time.
 *
 * The same person across stays, so a correction here is the one the next
 * booking finds: change the email and their next booking by that email joins
 * them. A booking already taken keeps the details it was taken with.
 */
export default function CustomerDetails({
  customer,
  save,
}: {
  customer: Customer;
  save: (values: { name: string; email: string; phone: string; notes: string }) => Promise<{ error?: string }>;
}) {
  const [values, setValues] = useState({
    name: customer.name,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    notes: customer.notes ?? "",
  });
  // What was last saved: Save can act only once something differs from it,
  // and saving quietly moves it forward — no "Saved" to read.
  const [saved, setSaved] = useState(values);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => values[k] !== saved[k]);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((was) => ({ ...was, [key]: e.target.value }));
    setError("");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !changed) return;
    setBusy(true);
    const result = await save(values);
    setBusy(false);
    if (result.error) setError(result.error);
    else setSaved(values);
  }

  return (
    <form className="cu-form" onSubmit={submit}>
      <label>
        <span>Name</span>
        <input value={values.name} onChange={set("name")} maxLength={120} required />
      </label>
      <div className="cu-pair">
        <label>
          <span>Email</span>
          <input type="email" value={values.email} onChange={set("email")} maxLength={200} />
        </label>
        <label>
          <span>Phone</span>
          <input value={values.phone} onChange={set("phone")} maxLength={40} />
        </label>
      </div>
      <label>
        <span>Notes for Next Time</span>
        <textarea
          rows={4}
          value={values.notes}
          onChange={set("notes")}
          maxLength={2000}
          placeholder="Likes a quiet room, allergic to nuts, always asks for late check-out"
        />
      </label>
      <div className="cu-save">
        <button type="submit" className="btn btn-go" disabled={busy || !changed}>
          {busy ? "Saving…" : "Save"}
        </button>
        {error ? (
          <span role="alert" className="cu-said">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
