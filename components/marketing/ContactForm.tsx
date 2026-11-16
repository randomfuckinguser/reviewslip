"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import {
  CONTACT_EMAIL,
  CONTACT_RECIPIENT,
  CONTACT_RELAY_URL,
  CONTACT_SITE_NAME,
  TURNSTILE_SITE_KEY,
} from "@/lib/site";
import styles from "./ContactForm.module.css";

/**
 * The slice of Turnstile this file uses.
 *
 * Declared rather than pulled from a package: the widget is loaded from
 * Cloudflare's own script tag, so there is nothing installed here to take types
 * from, and three methods is not worth a dependency.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: { sitekey: string; theme?: string }
      ) => string;
      getResponse: (widgetId?: string) => string | undefined;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

type Status = "idle" | "sending" | "success" | "error";

interface Fields {
  name: string;
  email: string;
  business: string;
  locations: string;
  message: string;
}

/**
 * The honeypot's name, kept exactly as the relay's guide specifies it.
 *
 * Not a style choice. A honeypot silently discards any submission that fills it
 * in, so a browser that autofills it makes every real message from that browser
 * vanish with no error anywhere — and browsers autofill on the field's name and
 * label matching a category they recognise, `autocomplete="off"` or not. Edge
 * is the usual culprit and "company" the usual casualty.
 *
 * `hp_field` and "Leave this field blank" match nothing any browser fills in.
 * Renaming either to something more natural is how this breaks.
 */
const HONEYPOT = "hp_field";

const EMPTY: Fields = {
  name: "",
  email: "",
  business: "",
  locations: "",
  message: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactForm({
  f,
  compact = false,
  heading,
  submitLabel,
}: {
  f: Dictionary["contact"]["form"];
  /** Sign-up variant: name + email + business only, no locations or message. */
  compact?: boolean;
  /** Override the form heading (defaults to f.heading). */
  heading?: string;
  /** Override the submit button label (defaults to f.submit). */
  submitLabel?: string;
}) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const turnstileBox = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>("");
  const [scriptReady, setScriptReady] = useState(false);

  /**
   * Renders the Turnstile widget once, when both the script and the box exist.
   *
   * Explicitly rather than letting Turnstile find `.cf-turnstile` itself. Its
   * automatic pass runs when the script loads and scans the document once —
   * which is a race against React mounting this component, and one that is lost
   * silently, leaving no widget and no token. Rendering by hand removes the
   * race and hands back an id, so getResponse and reset act on this widget
   * rather than on whichever one the page happens to hold.
   */
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !scriptReady) return;
    if (!turnstileBox.current || widgetId.current) return;

    widgetId.current = window.turnstile!.render(turnstileBox.current, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
    });
  }, [scriptReady]);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>(
    {}
  );
  const [status, setStatus] = useState<Status>("idle");

  const update = (key: keyof Fields, value: string) => {
    setFields((cur) => ({ ...cur, [key]: value }));
    if (errors[key]) setErrors((cur) => ({ ...cur, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof Fields, string>> = {};
    if (!fields.name.trim()) next.name = f.errRequired;
    if (!fields.email.trim()) next.email = f.errRequired;
    else if (!EMAIL_RE.test(fields.email.trim())) next.email = f.errEmail;
    if (!compact && !fields.message.trim()) next.message = f.errRequired;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const sendViaMailto = () => {
    const lines = [
      `Name: ${fields.name}`,
      `Email: ${fields.email}`,
      fields.business ? `Business: ${fields.business}` : null,
      fields.locations ? `Locations: ${fields.locations}` : null,
      "",
      fields.message,
    ].filter((l) => l !== null);
    const subject = `Reviewslip enquiry — ${fields.name}`;
    const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(lines.join("\n"))}`;
    window.location.href = href;
  };

  /**
   * This form's fields, in the shape the relay accepts.
   *
   * The relay takes name, email, message and an optional company — and this
   * form also asks how many locations a business has, which is the question
   * whose answer decides what to quote them. Rather than drop it, it goes into
   * the message under a heading: a field the relay has no column for is still
   * something the person on the other end needs to read.
   */
  const relayPayload = () => {
    const extra = fields.locations.trim()
      ? `\n\nLocations: ${fields.locations.trim()}`
      : "";

    return {
      site: CONTACT_SITE_NAME,
      recipient: CONTACT_RECIPIENT,
      name: fields.name.trim(),
      email: fields.email.trim(),
      company: fields.business.trim(),
      message: `${fields.message.trim()}${extra}`,
      turnstileToken: widgetId.current
        ? window.turnstile?.getResponse(widgetId.current) ?? ""
        : "",
    };
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;

    // Anything in the honeypot means a machine filled the form in. Silent by
    // design — telling a bot why it failed is telling it how to pass — but
    // logged, because the one thing that also lands here is a browser that
    // autofilled the field, and that failure is otherwise invisible from both
    // sides. See HONEYPOT above.
    const form = e.currentTarget as HTMLFormElement;
    const trap = form.elements.namedItem(HONEYPOT) as HTMLInputElement | null;
    if (trap?.value) {
      console.warn("Contact form: honeypot filled, submission not sent.");
      return;
    }

    if (!validate()) return;

    setStatus("sending");
    try {
      if (CONTACT_RELAY_URL) {
        const res = await fetch(CONTACT_RELAY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(relayPayload()),
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      } else {
        // No relay configured: hand off to the visitor's email client, which is
        // what this form did before there was any backend at all. Kept so the
        // page is never a dead end on a deploy that has not been given the URL.
        sendViaMailto();
      }
      setStatus("success");
      setFields(EMPTY);
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    } catch {
      setStatus("error");
      // A used token is spent whether or not the send worked, so the widget has
      // to go back to the start before a retry can pass.
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    }
  };

  if (status === "success") {
    return (
      <div className={styles.success} role="status">
        <div className={styles.successIcon} aria-hidden="true">
          ✓
        </div>
        <h3 className={styles.successTitle}>{f.successTitle}</h3>
        <p className={styles.successBody}>{f.successBody}</p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <h3 className={styles.heading}>{heading ?? f.heading}</h3>

      {/* Off screen rather than display:none, and out of the tab order. Its
          name and label are load-bearing — see HONEYPOT. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="cf-hp">Leave this field blank</label>
        <input
          type="text"
          id="cf-hp"
          name={HONEYPOT}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {status === "error" && (
        <div className={styles.errorBanner} role="alert">
          <strong>{f.errorTitle}</strong>
          <span>{f.errorBody}</span>
        </div>
      )}

      <div className={styles.row}>
        <Field
          id="cf-name"
          label={f.name}
          error={errors.name}
          value={fields.name}
          onChange={(v) => update("name", v)}
          placeholder={f.namePlaceholder}
          autoComplete="name"
          required
        />
        <Field
          id="cf-email"
          label={f.email}
          error={errors.email}
          value={fields.email}
          onChange={(v) => update("email", v)}
          placeholder={f.emailPlaceholder}
          type="email"
          autoComplete="email"
          required
        />
      </div>

      {compact ? (
        <Field
          id="cf-business"
          label={f.business}
          value={fields.business}
          onChange={(v) => update("business", v)}
          placeholder={f.businessPlaceholder}
          autoComplete="organization"
        />
      ) : (
        <div className={styles.row}>
          <Field
            id="cf-business"
            label={f.business}
            value={fields.business}
            onChange={(v) => update("business", v)}
            placeholder={f.businessPlaceholder}
            autoComplete="organization"
          />
          <Field
            id="cf-locations"
            label={f.locations}
            value={fields.locations}
            onChange={(v) => update("locations", v)}
            type="number"
            inputMode="numeric"
            min={1}
          />
        </div>
      )}

      {!compact && (
        <div className={styles.field}>
          <label htmlFor="cf-message" className={styles.label}>
            {f.message}
          </label>
          <textarea
            id="cf-message"
            className={`${styles.input} ${styles.textarea} ${
              errors.message ? styles.invalid : ""
            }`}
            value={fields.message}
            onChange={(e) => update("message", e.target.value)}
            placeholder={f.messagePlaceholder}
            rows={5}
            aria-invalid={!!errors.message}
          />
          {errors.message && (
            <span className={styles.errorText}>{errors.message}</span>
          )}
        </div>
      )}

      {TURNSTILE_SITE_KEY && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onReady={() => setScriptReady(true)}
          />
          <div ref={turnstileBox} className={styles.turnstile} />
        </>
      )}

      <button
        type="submit"
        className={`btn btn-go ${styles.submit}`}
        disabled={status === "sending"}
      >
        {status === "sending" ? f.sending : submitLabel ?? f.submit}
      </button>

      <p className={styles.orEmail}>
        {f.orEmail}{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  type = "text",
  required = false,
  autoComplete,
  inputMode,
  min,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "numeric";
  min?: number;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.req} aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        className={`${styles.input} ${error ? styles.invalid : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        min={min}
        aria-invalid={!!error}
      />
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
}
