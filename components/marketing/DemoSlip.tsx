"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import styles from "./DemoSlip.module.css";

type Phase = "idle" | "generating" | "ready";
type CategoryId = "service" | "food" | "clean" | "value" | "location" | "cosy";

const CATEGORY_IDS: CategoryId[] = [
  "service",
  "food",
  "clean",
  "value",
  "location",
  "cosy",
];

interface Props {
  /** Only the slices this component needs, so the RSC payload stays small. */
  t: {
    slip: Dictionary["slip"];
    demoReviews: Dictionary["demoReviews"];
  };
  /** Business name shown on the slip. */
  venue?: string;
  /** Pre-select a couple of categories and auto-generate once on mount. */
  autoStart?: boolean;
}

export default function DemoSlip({ t, venue, autoStart = false }: Props) {
  const [selected, setSelected] = useState<CategoryId[]>(
    autoStart ? ["service", "food"] : []
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [review, setReview] = useState("");
  const [variant, setVariant] = useState(0);
  const [copied, setCopied] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // Build a short sample review from the selected categories (canned copy).
  const draft = useCallback(
    (ids: CategoryId[], v: number) => {
      const use = ids.length ? ids : (["service"] as CategoryId[]);
      const parts = use.slice(0, 2).map((id) => {
        const opts = t.demoReviews[id];
        return opts[v % opts.length];
      });
      return parts.join(" ");
    },
    [t]
  );

  const generate = useCallback(
    (v: number) => {
      clearTimers();
      setCopied(false);
      setPhase("generating");
      setReview("");
      const timer = setTimeout(() => {
        setReview(draft(selected, v));
        setPhase("ready");
      }, 900);
      timers.current.push(timer);
    },
    [selected, draft]
  );

  useEffect(() => {
    if (autoStart) {
      const timer = setTimeout(() => generate(0), 500);
      timers.current.push(timer);
    }
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: CategoryId) => {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
    setPhase("idle");
    setReview("");
  };

  const regenerate = () => {
    const next = variant + 1;
    setVariant(next);
    generate(next);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(review);
      setCopied(true);
      const timer = setTimeout(() => setCopied(false), 2000);
      timers.current.push(timer);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`slip venue-look ${styles.slip}`} role="group" aria-label="Review demo">
      <div className={styles.head}>
        <div>
          <div className="slip-eyebrow">{venue ?? "Baanpong Lodge"}</div>
          <div className="slip-title">{t.slip.thanks}</div>
        </div>
        <div className={styles.gear} aria-hidden="true">
          ✦
        </div>
      </div>

      <p className={styles.prompt}>{t.slip.prompt}</p>
      <div className="chips">
        {CATEGORY_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="chip chip-ink"
            aria-pressed={selected.includes(id)}
            onClick={() => toggle(id)}
          >
            {t.slip.categories[id]}
          </button>
        ))}
      </div>

      <hr className="slip-rule" />

      <div className="slip-stars" aria-label={t.slip.fiveStars}>
        ★★★★★
      </div>

      <div className={`slip-review ${styles.review}`} aria-live="polite">
        {phase === "generating" && (
          <>
            <span className="skeleton" style={{ width: "96%" }} />
            <span className="skeleton" style={{ width: "88%" }} />
            <span className="skeleton" style={{ width: "72%" }} />
          </>
        )}
        {phase === "ready" && <span className="settle">{review}</span>}
        {phase === "idle" && (
          <span className={styles.placeholder}>{t.slip.placeholder}</span>
        )}
      </div>

      <div className={styles.actions}>
        {phase === "ready" ? (
          <>
            <button
              key="regenerate"
              type="button"
              className="btn btn-quiet-ink"
              onClick={regenerate}
            >
              {t.slip.regenerate}
            </button>
            <button
              key="copy"
              type="button"
              className="btn btn-ink"
              onClick={copy}
            >
              {copied ? t.slip.copied : t.slip.copy}
            </button>
            <button key="go" type="button" className="btn btn-go">
              {t.slip.proceed}
            </button>
          </>
        ) : (
          <button
            key="generate"
            type="button"
            className="btn btn-go"
            onClick={() => generate(variant)}
            disabled={phase === "generating"}
          >
            {phase === "generating" ? t.slip.writing : t.slip.generate}
          </button>
        )}
      </div>
    </div>
  );
}
