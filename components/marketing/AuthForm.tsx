"use client";

import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { localizedPath } from "@/lib/i18n/routing";
import { AUTH_ENDPOINT } from "@/lib/site";
import styles from "./AuthForm.module.css";

type Status = "idle" | "sending" | "pending" | "error";

interface Fields {
  name: string;
  email: string;
  business: string;
  password: string;
  confirm: string;
}

const EMPTY: Fields = {
  name: "",
  email: "",
  business: "",
  password: "",
  confirm: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;

export default function AuthForm({
  mode,
  lang,
  auth,
  form,
  referralCode = "",
}: {
  mode: "login" | "signup";
  lang: Locale;
  auth: Dictionary["auth"];
  /** Shared field labels, so login/sign-up match the contact form wording. */
  form: Dictionary["contact"]["form"];
  /**
   * The invitation this signup arrived through, off `?ref=` in the URL.
   *
   * Passed along and otherwise ignored. It is not validated here and its
   * absence changes nothing — whether it names a real invitation is a question
   * only the review app can answer, and the answer must never be the reason
   * somebody fails to get an account.
   */
  referralCode?: string;
}) {
  const isSignup = mode === "signup";
  const copy = isSignup ? auth.signup : auth.login;

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [accepted, setAccepted] = useState(false);
  const [remember, setRemember] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<keyof Fields | "terms", string>>
  >({});
  const [status, setStatus] = useState<Status>("idle");

  const update = (key: keyof Fields, value: string) => {
    setFields((cur) => ({ ...cur, [key]: value }));
    if (errors[key]) setErrors((cur) => ({ ...cur, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof Fields | "terms", string>> = {};

    if (!fields.email.trim()) next.email = form.errRequired;
    else if (!EMAIL_RE.test(fields.email.trim())) next.email = form.errEmail;

    if (!fields.password) next.password = form.errRequired;

    if (isSignup) {
      if (!fields.name.trim()) next.name = form.errRequired;
      // Length is only enforced on sign-up: an existing password set under
      // older rules must still be able to log in.
      if (fields.password && fields.password.length < MIN_PASSWORD) {
        next.password = auth.errors.passwordShort;
      }
      if (!fields.confirm) next.confirm = form.errRequired;
      else if (fields.confirm !== fields.password) {
        next.confirm = auth.errors.passwordMatch;
      }
      if (!accepted) next.terms = auth.errors.termsRequired;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** Drop the secrets from component state the moment we're done with them. */
  const clearSecrets = () =>
    setFields((cur) => ({ ...cur, password: "", confirm: "" }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    if (!validate()) return;

    // No backend yet: stop here. The password is never transmitted, and
    // deliberately never falls back to mailto the way the contact form does.
    if (!AUTH_ENDPOINT) {
      clearSecrets();
      setStatus("pending");
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch(AUTH_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          mode,
          lang,
          email: fields.email.trim(),
          password: fields.password,
          ...(isSignup
            ? {
                name: fields.name.trim(),
                business: fields.business.trim(),
                referralCode,
              }
            : { remember }),
        }),
      });

      const data = await res.json().catch(() => ({}));
      clearSecrets();

      if (!res.ok) {
        // The backend owns the rules, so its message is the accurate one. Both
        // the common failures — wrong credentials, email already registered —
        // are about the email field, which is where someone will look.
        if (typeof data.error === "string") {
          setErrors({ email: data.error });
          setStatus("idle");
          return;
        }
        setStatus("error");
        return;
      }

      // The session is set as an httpOnly cookie; a full navigation is what
      // makes the server-rendered dashboard pick it up. ?next= sends someone
      // back where they came from — the phone, signing in to answer — and only
      // ever to a path on this site, never another one.
      const next = new URLSearchParams(window.location.search).get("next") ?? "";
      const back = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
      window.location.assign(back ?? data.redirect ?? localizedPath(lang, "/"));
    } catch {
      clearSecrets();
      setStatus("error");
    }
  };

  if (status === "pending") {
    return (
      <div className={styles.notice} role="status">
        <div className={styles.noticeIcon} aria-hidden="true">
          ✓
        </div>
        <h3 className={styles.noticeTitle}>{auth.pendingTitle}</h3>
        <p className={styles.noticeBody}>{auth.pendingBody}</p>
        <Link href={localizedPath(lang, "/contact")} className="btn btn-go">
          {auth.pendingCta}
        </Link>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <h2 className={styles.heading}>{copy.title}</h2>
      <p className={styles.sub}>{copy.lede}</p>

      {status === "error" && (
        <div className={styles.errorBanner} role="alert">
          <strong>{form.errorTitle}</strong>
          <span>{form.errorBody}</span>
        </div>
      )}

      {isSignup && (
        <Field
          id="auth-name"
          label={form.name}
          error={errors.name}
          value={fields.name}
          onChange={(v) => update("name", v)}
          placeholder={form.namePlaceholder}
          autoComplete="name"
          required
        />
      )}

      <Field
        id="auth-email"
        label={form.email}
        error={errors.email}
        value={fields.email}
        onChange={(v) => update("email", v)}
        placeholder={form.emailPlaceholder}
        type="email"
        autoComplete={isSignup ? "email" : "username"}
        required
      />

      {isSignup && (
        <Field
          id="auth-business"
          label={form.business}
          value={fields.business}
          onChange={(v) => update("business", v)}
          placeholder={form.businessPlaceholder}
          autoComplete="organization"
        />
      )}

      <Field
        id="auth-password"
        label={auth.fields.password}
        error={errors.password}
        value={fields.password}
        onChange={(v) => update("password", v)}
        placeholder={isSignup ? auth.fields.passwordPlaceholder : undefined}
        hint={isSignup ? auth.fields.passwordHint : undefined}
        type={reveal ? "text" : "password"}
        autoComplete={isSignup ? "new-password" : "current-password"}
        required
        reveal={{
          on: reveal,
          label: reveal ? auth.fields.hide : auth.fields.show,
          toggle: () => setReveal((v) => !v),
        }}
      />

      {isSignup && (
        <Field
          id="auth-confirm"
          label={auth.fields.confirm}
          error={errors.confirm}
          value={fields.confirm}
          onChange={(v) => update("confirm", v)}
          placeholder={auth.fields.confirmPlaceholder}
          type={reveal ? "text" : "password"}
          autoComplete="new-password"
          required
        />
      )}

      {isSignup ? (
        <div className={styles.check}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={accepted}
              onChange={(e) => {
                setAccepted(e.target.checked);
                if (errors.terms) {
                  setErrors((cur) => ({ ...cur, terms: undefined }));
                }
              }}
              aria-invalid={!!errors.terms}
            />
            {/* Split into lead/mid/end rather than one string with a hardcoded
                full stop: German puts the verb last ("… zu."), and ja/ko need a
                trailing clause ("…に同意します。"). */}
            <span>
              {auth.terms.lead}
              <Link href={localizedPath(lang, "/legal/terms")}>
                {auth.terms.termsLink}
              </Link>
              {auth.terms.mid}
              <Link href={localizedPath(lang, "/legal/privacy")}>
                {auth.terms.privacyLink}
              </Link>
              {auth.terms.end}
            </span>
          </label>
          {errors.terms && (
            <span className={styles.errorText}>{errors.terms}</span>
          )}
        </div>
      ) : (
        <div className={styles.checkRow}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>{auth.login.remember}</span>
          </label>
          <Link
            href={localizedPath(lang, "/contact")}
            className={styles.forgot}
          >
            {auth.login.forgot}
          </Link>
        </div>
      )}

      <button
        type="submit"
        className={`btn btn-go ${styles.submit}`}
        disabled={status === "sending"}
      >
        {status === "sending" ? copy.sending : copy.submit}
      </button>

      <p className={styles.alt}>
        {copy.altLead}{" "}
        <Link href={localizedPath(lang, isSignup ? "/login" : "/signup")}>
          {copy.altLink}
        </Link>
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
  hint,
  placeholder,
  type = "text",
  required = false,
  autoComplete,
  reveal,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  /** Renders the show/hide toggle inside the input. */
  reveal?: { on: boolean; label: string; toggle: () => void };
}) {
  // The hint is replaced by the error message, so only point at it while it is
  // actually on the page — a dangling aria-describedby confuses screen readers.
  const showHint = !!hint && !error;
  const hintId = showHint ? `${id}-hint` : undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && (
          <span className={styles.req} aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>

      <div className={styles.inputWrap}>
        <input
          id={id}
          type={type}
          className={`${styles.input} ${error ? styles.invalid : ""} ${
            reveal ? styles.hasToggle : ""
          }`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={hintId}
        />
        {reveal && (
          <button
            type="button"
            className={styles.toggle}
            onClick={reveal.toggle}
            aria-label={reveal.label}
            aria-pressed={reveal.on}
          >
            {reveal.on ? "○" : "●"}
          </button>
        )}
      </div>

      {showHint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
}
