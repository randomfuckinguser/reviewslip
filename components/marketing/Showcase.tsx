"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import {
  CalendarDays,
  Check,
  LayoutDashboard,
  MessageSquareText,
  Phone,
  QrCode,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

import type { ShotId, ShowcaseText } from "@/lib/showcase-text";
import styles from "./Showcase.module.css";

const ICONS: Record<ShotId, LucideIcon> = {
  dashboard: LayoutDashboard,
  reviews: MessageSquareText,
  calendar: CalendarDays,
  "guest-app": Smartphone,
  phone: Phone,
  "table-card": QrCode,
};

/** What the browser frame's address bar reads over each screen. */
const ADDRESS: Record<ShotId, string> = {
  dashboard: "reviewslip.com/dashboard",
  reviews: "reviewslip.com/dashboard/reviews",
  calendar: "reviewslip.com/dashboard/bookings/calendar",
  "guest-app": "reviewslip.com/dashboard/welcome",
  phone: "reviewslip.com/phone",
  "table-card": "reviewslip.com/dashboard/poster",
};

/**
 * Real screens from the app, a tab each, the way the console shows a
 * resource's tabs: the words on one side, the screen on the other.
 *
 * Each screen is there twice, light and dark, and the site's theme shows one
 * (Next's own pattern for themed images). Both are lazy, and a hidden image is
 * never fetched, so a visitor downloads only the screen they are looking at,
 * in the theme they are using.
 */
export default function Showcase({ t, demoHref }: { t: ShowcaseText; demoHref: string }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys move along the tabs, Home and End to either end: the WAI-ARIA
  // tabs pattern, with the tab following the focus.
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = t.shots.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className={styles.showcase}>
      <div className={styles.tabs} role="tablist" aria-label={t.tabsLabel}>
        {t.shots.map((shot, i) => {
          const Icon = ICONS[shot.id];
          return (
            <button
              key={shot.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`sc-tab-${shot.id}`}
              aria-controls={`sc-panel-${shot.id}`}
              aria-selected={i === active}
              tabIndex={i === active ? 0 : -1}
              className={styles.tab}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <Icon size={16} aria-hidden="true" />
              {shot.tab}
            </button>
          );
        })}
      </div>

      {t.shots.map((shot, i) => {
        const phone = shot.id === "phone";
        const size = phone
          ? { width: 600, height: 1298, sizes: "(min-width: 900px) 208px, 62vw" }
          : { width: 1600, height: 1000, sizes: "(min-width: 1100px) 700px, (min-width: 900px) 60vw, 100vw" };
        return (
          <div
            key={shot.id}
            role="tabpanel"
            id={`sc-panel-${shot.id}`}
            aria-labelledby={`sc-tab-${shot.id}`}
            hidden={i !== active}
            className={styles.panel}
          >
            <div className={styles.copy}>
              <h3 className={styles.title}>{shot.title}</h3>
              <p className={styles.body}>{shot.body}</p>
              <ul className={styles.points}>
                {shot.points.map((point) => (
                  <li key={point}>
                    <Check size={16} aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href={demoHref} className={styles.demo}>
                {t.demo} →
              </Link>
            </div>

            <figure className={phone ? styles.phone : styles.browser}>
              {phone ? null : (
                <div className={styles.bar} aria-hidden="true">
                  <span className={styles.dots}>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className={styles.address}>{ADDRESS[shot.id]}</span>
                </div>
              )}
              <Image
                src={`/showcase/${shot.id}-light.webp`}
                alt={shot.alt}
                {...size}
                className={styles.light}
              />
              <Image
                src={`/showcase/${shot.id}-dark.webp`}
                alt={shot.alt}
                {...size}
                className={styles.dark}
              />
            </figure>
          </div>
        );
      })}

      <p className={styles.note}>{t.note}</p>
    </div>
  );
}
