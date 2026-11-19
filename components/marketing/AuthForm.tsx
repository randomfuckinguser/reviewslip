"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { localizedPath } from "@/lib/i18n/routing";
import { AUTH_ENDPOINT } from "@/lib/site";
import styles from "./AuthForm.module.css";

type Status = "idle" | "sending" | "pending" | "error";

/**
 * email     the address (and, on sign-up, the name, business and terms)
 * code      the six digits from the email
 * password  signing in the old way, for an account that has one
 */
type Step = "email" | "code" | "password";

interface Fields {
  name: string;
  email: string;
  business: string;
  code: string;
  password: string;
}

const EMPTY: Fields = {
  name: "",
  email: "",
  business: "",
  code: "",
  password: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign in and sign up with a code from the email.
 *
 * No password to make up: the email, a six-digit code sent to it, and signed
 * in — kept signed in on this device. An account that already has a password
 * can still use it, one link down, so nobody is locked out by a slow email.
 */
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
  const words = auth.code;

  const [step, setStep] = useState<Step>("email");
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [accepted, setAccepted] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [resent, setResent] = useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<keyof Fields | "terms", string>>
  >({});
  const [status, setStatus] = useState<Status>("idle");
  const codeInput = useRef<HTMLInputElement>(null);

  const update = (key: keyof Fields, value: string) => {
    setFields((cur) => ({ ...cur, [key]: value }));
    if (errors[key]) setErrors((cur) => ({ ...cur, [key]: undefined }));
  };

  const checkEmail = (next: Partial<Record<keyof Fields | "terms", string>>) => {
    if (!fields.email.trim()) next.email = form.errRequired;
    else if (!EMAIL_RE.test(fields.email.trim())) next.email = form.errEmail;
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof Fields | "terms", string>> = {};
    if (step === "email") {
      checkEmail(next);
      if (isSignup) {
        if (!fields.name.trim()) next.name = form.errRequired;
        if (!accepted) next.terms = auth.errors.termsRequired;
      }
    } else if (step === "code") {
      if (!/^\d{6}$/.test(fields.code.replace(/[\s-]/g, ""))) next.code = words.errCode;
    } else {
      checkEmail(next);
      if (!fields.password) next.password = form.errRequired;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** One call to the auth route; the error, if any, lands on `field`. */
  async function post(
    body: Record<string, unknown>,
    field: keyof Fields
  ): Promise<Record<string, unknown> | null> {
    const res = await fetch(AUTH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ lang, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The review app owns the rules, so its message is the accurate one.
      if (typeof data.error === "string") {
        setErrors({ [field]: data.error });
        setStatus("idle");
        return null;
      }
      setStatus("error");
      return null;
    }
    return data;
  }

  /** In: back where they came from (the phone, say), or the dashboard. */
  function arrive(data: Record<string, unknown>) {
    // ?next= only ever to a path on this site, never another one.
    const next = new URLSearchParams(window.location.search).get("next") ?? "";
    const back = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
    window.location.assign(
      back ?? (typeof data.redirect === "string" ? data.redirect : localizedPath(lang, "/"))
    );
  }

  async function sendCode(again = false) {
    setStatus("sending");
    const data = await post(
      { mode: "code", email: fields.email.trim(), create: isSignup },
      again ? "code" : "email"
    );
    if (!data) return;
    setStatus("idle");
    setResent(again);
    setStep("code");
    setFields((cur) => ({ ...cur, code: "" }));
    setTimeout(() => codeInput.current?.focus(), 0);
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    if (!validate()) return;

    // No backend yet: stop here, and send nothing anywhere.
    if (!AUTH_ENDPOINT) {
      setFields((cur) => ({ ...cur, password: "", code: "" }));
      setStatus("pending");
      return;
    }

    try {
      if (step === "email") return await sendCode();

      setStatus("sending");
      const data =
        step === "code"
          ? await post(
              {
                mode: "verify",
                email: fields.email.trim(),
                code: fields.code,
                create: isSignup,
                ...(isSignup ? { name: fields.name.trim(), business: fields.business.trim(), referralCode } : {}),
              },
              "code"
            )
          : await post({ mode: "login", email: fields.email.trim(), password: fields.password }, "password");
      // The password goes from state the moment it has been used.
      setFields((cur) => ({ ...cur, password: "" }));
      if (data) arrive(data);
    } catch {
      setFields((cur) => ({ ...cur, password: "" }));
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

  const sending = status === "sending";
  const email = fields.email.trim();

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <h2 className={styles.heading}>{copy.title}</h2>
      <p className={styles.sub}>
        {step === "code"
          ? (isSignup ? words.sentSignup : words.sentLogin).replace("{email}", email)
          : copy.lede}
      </p>

      {status === "error" && (
        <div className={styles.errorBanner} role="alert">
          <strong>{form.errorTitle}</strong>
          <span>{form.errorBody}</span>
        </div>
      )}

      {step === "code" ? (
        <>
          <Field
            id="auth-code"
            label={words.label}
            error={errors.code}
            hint={resent ? words.resent : words.stay}
            value={fields.code}
            onChange={(v) => update("code", v.replace(/[^\d\s-]/g, "").slice(0, 7))}
            placeholder="123456"
            autoComplete="one-time-code"
            inputMode="numeric"
            inputRef={codeInput}
            required
          />

          <button type="submit" className={`btn btn-go ${styles.submit}`} disabled={sending}>
            {sending ? copy.sending : copy.submit}
          </button>

          <div className={styles.checkRow}>
            <button
              type="button"
              className={`${styles.forgot} ${styles.linkButton}`}
              disabled={sending}
              onClick={() => void sendCode(true)}
            >
              {words.resend}
            </button>
            <button
              type="button"
              className={`${styles.forgot} ${styles.linkButton}`}
              onClick={() => {
                setStep("email");
                setErrors({});
                setStatus("idle");
              }}
            >
              {words.otherEmail}
            </button>
          </div>
        </>
      ) : (
        <>
          {isSignup && step === "email" && (
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
            hint={step === "email" ? words.stay : undefined}
            required
          />

          {isSignup && step === "email" && (
            <Field
              id="auth-business"
              label={form.business}
              value={fields.business}
              onChange={(v) => update("business", v)}
              placeholder={form.businessPlaceholder}
              autoComplete="organization"
            />
          )}

          {step === "password" && (
            <Field
              id="auth-password"
              label={auth.fields.password}
              error={errors.password}
              value={fields.password}
              onChange={(v) => update("password", v)}
              type={reveal ? "text" : "password"}
              autoComplete="current-password"
              required
              reveal={{
                on: reveal,
                label: reveal ? auth.fields.hide : auth.fields.show,
                toggle: () => setReveal((v) => !v),
              }}
            />
          )}

          {isSignup && (
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
          )}

          <button type="submit" className={`btn btn-go ${styles.submit}`} disabled={sending}>
            {sending
              ? step === "password"
                ? copy.sending
                : words.sending
              : step === "password"
                ? copy.submit
                : words.send}
          </button>

          {!isSignup && (
            <button
              type="button"
              className={`${styles.forgot} ${styles.linkButton}`}
              onClick={() => {
                setStep(step === "password" ? "email" : "password");
                setErrors({});
                setFields((cur) => ({ ...cur, password: "" }));
              }}
            >
              {step === "password" ? words.useCode : words.usePassword}
            </button>
          )}
        </>
      )}

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
  inputMode,
  inputRef,
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
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  inputRef?: React.Ref<HTMLInputElement>;
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
          inputMode={inputMode}
          ref={inputRef}
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
