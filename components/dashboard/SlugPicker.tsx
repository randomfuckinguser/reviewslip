"use client";

import { useActionState, useEffect, useRef, useState } from "react";

export interface CreateBusinessState {
  error?: string;
  /** Echoed back so a rejected form does not empty itself. */
  values?: { slug?: string; name?: string };
}

type Action = (
  state: CreateBusinessState,
  formData: FormData
) => Promise<CreateBusinessState>;

const EMPTY: CreateBusinessState = {};

interface Check {
  state: "idle" | "checking" | "ok" | "bad";
  reason?: string;
}

/** The same shape the review app requires, so the field cannot offer an
 *  address the server would then refuse. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
}

export default function SlugPicker({
  action,
  baseDomain,
}: {
  action: Action;
  baseDomain: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);

  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  // Once someone edits the address themselves the name stops driving it —
  // otherwise a later change to the name would undo their choice silently.
  const [edited, setEdited] = useState(Boolean(state.values?.slug));
  const [check, setCheck] = useState<Check>({ state: "idle" });

  const shown = edited ? slug : slugify(name);

  // Each request records the value it was for, so a slow answer for an earlier
  // keystroke cannot overwrite a newer one. That race is the usual bug here.
  const latest = useRef("");

  useEffect(() => {
    const value = shown;
    latest.current = value;

    if (!value) {
      setCheck({ state: "idle" });
      return;
    }

    setCheck({ state: "checking" });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/slug?slug=${encodeURIComponent(value)}`);
        const data = await res.json();
        if (latest.current !== value) return;

        setCheck(
          data.valid && data.available
            ? { state: "ok" }
            : {
                state: "bad",
                reason: data.reason ?? data.error ?? "Not usable.",
              }
        );
      } catch {
        if (latest.current === value) {
          setCheck({ state: "bad", reason: "Could not check that address." });
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [shown]);

  const ready = check.state === "ok" && name.trim().length > 0;

  const input: React.CSSProperties = {
    width: "100%",
    padding: "0.65rem 0.8rem",
    borderRadius: 10,
    border: "1px solid var(--jade-line)",
    background: "color-mix(in srgb, var(--cream) 6%, transparent)",
    color: "var(--cream)",
    font: "inherit",
  };

  return (
    <form action={formAction} style={{ display: "grid", gap: "1.25rem", maxWidth: "34rem" }}>
      <div style={{ display: "grid", gap: "0.35rem" }}>
        <label htmlFor="name" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
          Business Name
        </label>
        <input
          id="name"
          name="name"
          style={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Baanpong Lodge"
          required
        />
        <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
          What guests see at the top of the page.
        </span>
      </div>

      <div style={{ display: "grid", gap: "0.35rem" }}>
        <label htmlFor="slug" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
          Address
        </label>
        <div style={{ display: "flex" }}>
          <input
            id="slug"
            name="slug"
            style={{
              ...input,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              borderRight: "none",
              textAlign: "right",
            }}
            value={shown}
            onChange={(e) => {
              setEdited(true);
              setSlug(slugify(e.target.value));
            }}
            maxLength={32}
            placeholder="baanpong"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <span
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 0.8rem",
              border: "1px solid var(--jade-line)",
              borderLeft: "none",
              borderTopRightRadius: 10,
              borderBottomRightRadius: 10,
              color: "var(--ink-soft)",
              whiteSpace: "nowrap",
            }}
          >
            .{baseDomain}
          </span>
        </div>

        <span
          aria-live="polite"
          style={{
            fontSize: "0.85rem",
            minHeight: "1.2rem",
            color:
              check.state === "ok"
                ? "var(--success)"
                : check.state === "bad"
                  ? "var(--destructive)"
                  : "var(--ink-soft)",
          }}
        >
          {check.state === "checking" && "Checking…"}
          {check.state === "ok" && `${shown}.${baseDomain} is available`}
          {check.state === "bad" && check.reason}
          {check.state === "idle" &&
            "Filled in from the name — edit it if you like."}
        </span>

        <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
          This becomes the business&apos;s own web address and what a QR code points
          at. Changing it later means reprinting the code, so pick one you can
          live with.
        </span>
      </div>

      <p aria-live="polite" style={{ minHeight: "1.25rem", color: "var(--destructive)", fontSize: "0.88rem" }}>
        {state.error ?? ""}
      </p>

      <div>
        <button className="btn btn-go" type="submit" disabled={pending || !ready}>
          {pending ? "Creating…" : "Create Business"}
        </button>
      </div>
    </form>
  );
}
