"use client";

import { useState, useTransition } from "react";

import type { MarketProfile } from "@/lib/market";
import { amenityLabel } from "@/lib/stays-text";

import styles from "./MarketListing.module.css";

export interface ListingDraft {
  listed: boolean;
  place: string;
  profile: MarketProfile;
}

/**
 * The venue on the marketplace: whether it is listed, where guests find it,
 * what it says about itself, how to reach it, and how guests pay.
 *
 * One Save for all of it, disabled until something changes. Listing on is
 * refused by the server while there is nothing a guest could book, and the
 * reason comes back here as the message.
 */
export default function MarketListing({
  initial,
  amenities,
  save,
}: {
  initial: ListingDraft;
  amenities: string[];
  save: (draft: ListingDraft) => Promise<{ error?: string }>;
}) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const profile = draft.profile;
  const setProfile = (patch: Partial<MarketProfile>) => setDraft({ ...draft, profile: { ...profile, ...patch } });
  const setContact = (patch: Partial<MarketProfile["contact"]>) =>
    setProfile({ contact: { ...profile.contact, ...patch } });

  function onSave() {
    setMessage(null);
    start(async () => {
      const result = await save(draft);
      if (result.error) {
        setMessage({ text: result.error, error: true });
        return;
      }
      setSaved(draft);
      setMessage({
        text: draft.listed ? "Saved. Guests can find and book you on Reviewslip." : "Saved. You are not listed.",
        error: false,
      });
    });
  }

  return (
    <div className={styles.stack}>
      <label className={styles.toggle}>
        <input type="checkbox" checked={draft.listed} onChange={(e) => setDraft({ ...draft, listed: e.target.checked })} />
        <span>
          <strong>List on Reviewslip</strong>
          <span className={styles.hint}>
            Guests searching Reviewslip see your rooms, prices and availability, and book directly. No commission.
          </span>
        </span>
      </label>

      <div className={styles.row2}>
        <label className={styles.field}>
          Place
          <input
            value={draft.place}
            maxLength={80}
            placeholder="San Kamphaeng, Chiang Mai"
            onChange={(e) => setDraft({ ...draft, place: e.target.value })}
          />
          <span className={styles.hint}>What guests type to find you: the town, then the province.</span>
        </label>
        <div className={styles.row2}>
          <label className={styles.field}>
            Check-in From
            <input type="time" value={profile.checkIn} onChange={(e) => setProfile({ checkIn: e.target.value })} />
          </label>
          <label className={styles.field}>
            Check-out By
            <input type="time" value={profile.checkOut} onChange={(e) => setProfile({ checkOut: e.target.value })} />
          </label>
        </div>
      </div>

      <label className={styles.field}>
        About
        <textarea
          rows={5}
          maxLength={2000}
          value={profile.about}
          placeholder="What it is like to stay with you: the house, the setting, what is nearby."
          onChange={(e) => setProfile({ about: e.target.value })}
        />
      </label>

      <fieldset className={styles.fieldset}>
        <legend>Amenities</legend>
        <div className={styles.checks}>
          {amenities.map((key) => (
            <label key={key} className={styles.check}>
              <input
                type="checkbox"
                checked={profile.amenities.includes(key)}
                onChange={(e) =>
                  setProfile({
                    amenities: e.target.checked
                      ? amenities.filter((k) => k === key || profile.amenities.includes(k))
                      : profile.amenities.filter((k) => k !== key),
                  })
                }
              />
              {amenityLabel(key, "en")}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Contact</legend>
        <p className={styles.hint} style={{ margin: 0 }}>
          Shown beside your rooms for guests who would rather talk to you first. Leave any of them empty.
        </p>
        <div className={styles.row4}>
          <label className={styles.field}>
            Phone
            <input value={profile.contact.phone} placeholder="+66 81 234 5678" onChange={(e) => setContact({ phone: e.target.value })} />
          </label>
          <label className={styles.field}>
            Email
            <input type="email" value={profile.contact.email} onChange={(e) => setContact({ email: e.target.value })} />
          </label>
          <label className={styles.field}>
            LINE
            <input value={profile.contact.line} placeholder="@baanpong" onChange={(e) => setContact({ line: e.target.value })} />
          </label>
          <label className={styles.field}>
            WhatsApp
            <input value={profile.contact.whatsapp} placeholder="+66 81 234 5678" onChange={(e) => setContact({ whatsapp: e.target.value })} />
          </label>
        </div>
        <p className={styles.hint}>
          Guests can also call you in the browser from these pages and the Guest App, on the Phone in the
          sidebar. Choose who answers under Calls; the phone number above stays for browsers that cannot place a
          call.
        </p>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Payment</legend>
        <div className={styles.checks}>
          <label className={styles.check}>
            <input
              type="radio"
              name="payment"
              checked={profile.payment.mode === "full"}
              onChange={() => setProfile({ payment: { mode: "full", depositPct: null } })}
            />
            Full Amount at Booking
          </label>
          <label className={styles.check}>
            <input
              type="radio"
              name="payment"
              checked={profile.payment.mode === "deposit"}
              onChange={() => setProfile({ payment: { mode: "deposit", depositPct: profile.payment.depositPct ?? 30 } })}
            />
            Deposit at Booking
          </label>
          {profile.payment.mode === "deposit" && (
            <label className={styles.check}>
              <input
                type="number"
                min={5}
                max={95}
                step={5}
                style={{ width: "5rem" }}
                value={profile.payment.depositPct ?? 30}
                onChange={(e) => setProfile({ payment: { mode: "deposit", depositPct: Number(e.target.value) } })}
              />
              % of the stay
            </label>
          )}
        </div>
        <p className={styles.hint} style={{ margin: 0 }}>
          Takes effect once online payment is connected. Until then every guest pays at the property, and the booking
          page says so.
        </p>
      </fieldset>

      <div className={styles.actions}>
        {message && (
          <p className={message.error ? styles.error : styles.ok} role={message.error ? "alert" : "status"}>
            {message.text}
          </p>
        )}
        <button type="button" className="btn btn-go" disabled={!dirty || pending} onClick={onSave}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
