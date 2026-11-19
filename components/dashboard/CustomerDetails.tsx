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
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok?: boolean; error?: string }>({});

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((was) => ({ ...was, [key]: e.target.value }));
    setSaid({});
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const result = await save(values);
    setBusy(false);
    setSaid(result.error ? { error: result.error } : { ok: true });
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
        <span>Notes for next time</span>
        <textarea
          rows={4}
          value={values.notes}
          onChange={set("notes")}
          maxLength={2000}
          placeholder="Likes a quiet room, allergic to nuts, always asks for late check-out"
        />
      </label>
      <div className="cu-save">
        <button type="submit" className="btn btn-go" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {said.error ? (
          <span role="alert" className="cu-said is-error">
            {said.error}
          </span>
        ) : said.ok ? (
          <span role="status" className="cu-said">
            Saved.
          </span>
        ) : null}
      </div>
    </form>
  );
}
