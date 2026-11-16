"use client";

import { useActionState } from "react";

import type { StaysText } from "@/lib/stays-text";

import styles from "./stays.module.css";

export interface BookState {
  error?: string;
  values?: { name: string; email: string; phone: string; requests: string };
}

/**
 * The guest's details and Confirm Booking.
 *
 * A server action does the booking, so this works with JavaScript off; this
 * component only keeps what was typed when the server says no, and stops a
 * second press while the first is on its way — a double-booked guest is the
 * one mistake here that costs somebody a night.
 */
export default function BookForm({
  action,
  hidden,
  t,
  agree,
}: {
  action: (state: BookState, data: FormData) => Promise<BookState>;
  hidden: Record<string, string | number>;
  t: StaysText;
  agree: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const v = state.values;

  return (
    <form action={submit} className={styles.form}>
      <h2 className={styles.h2} style={{ margin: 0 }}>{t.guestDetails}</h2>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <label className={styles.label}>
        {t.fullName}
        <input className={styles.input} name="name" autoComplete="name" required maxLength={120} defaultValue={v?.name} />
      </label>
      <div className={styles.formRow}>
        <label className={styles.label}>
          {t.email}
          <input className={styles.input} name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={v?.email} />
        </label>
        <label className={styles.label}>
          {t.phone}
          <input className={styles.input} name="phone" type="tel" autoComplete="tel" required maxLength={24} placeholder="+66 81 234 5678" defaultValue={v?.phone} />
          <span className={styles.hint}>{t.phoneHint}</span>
        </label>
      </div>
      <label className={styles.label}>
        {t.requests}
        <textarea className={styles.input} name="requests" rows={3} maxLength={1000} defaultValue={v?.requests} />
        <span className={styles.hint}>{t.requestsHint}</span>
      </label>

      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}

      <p className={styles.note} style={{ margin: 0 }}>{agree}</p>
      <button type="submit" className="btn btn-go" disabled={pending}>
        {pending ? t.confirming : t.confirm}
      </button>
    </form>
  );
}
