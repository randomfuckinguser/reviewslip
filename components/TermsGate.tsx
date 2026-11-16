"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { getDisclaimer } from "@/lib/disclaimer";
import { localizedPath } from "@/lib/i18n/routing";
import styles from "./TermsGate.module.css";

/**
 * First-visit terms/disclaimer. Shown once per visitor (persisted), and re-shown
 * if the disclaimer version changes. Renders nothing on the server and only
 * after mount, so it never causes a hydration mismatch and crawlers see the full
 * page rather than an interstitial.
 */
export default function TermsGate({ lang }: { lang: Locale }) {
  const d = getDisclaimer(lang);
  const storageKey = `rs_terms_ack_v${d.version}`;

  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let acked = false;
    try {
      acked = localStorage.getItem(storageKey) === "1";
    } catch {
      // Storage blocked (private mode / cookies off): show it, don't hard-fail.
    }
    if (!acked) setOpen(true);
  }, [storageKey]);

  // Lock background scroll and move focus into the dialog while it's open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    acceptRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const accept = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
    setOpen(false);
  };

  // Keep focus trapped inside the dialog; it's a required acknowledgement, so
  // Escape and outside clicks intentionally do not dismiss it.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} aria-hidden={false}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-gate-title"
        aria-describedby="terms-gate-intro"
        onKeyDown={onKeyDown}
      >
        <div className={styles.scroll}>
          <h2 id="terms-gate-title" className={styles.title}>
            {d.title}
          </h2>
          <p id="terms-gate-intro" className={styles.intro}>
            {d.intro}
          </p>

          <h3 className={styles.heading}>{d.risksHeading}</h3>
          <ul className={styles.risks}>
            {d.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>

          <h3 className={styles.heading}>{d.liabilityHeading}</h3>
          <p className={styles.liability}>{d.liability}</p>

          <p className={styles.agree}>{d.agree}</p>
        </div>

        <div className={styles.actions}>
          <Link
            href={localizedPath(lang, "/legal/terms")}
            className={styles.termsLink}
          >
            {d.fullTerms}
          </Link>
          <button
            ref={acceptRef}
            type="button"
            className="btn btn-go"
            onClick={accept}
          >
            {d.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
