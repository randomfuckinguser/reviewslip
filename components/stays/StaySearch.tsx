"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, MapPin, Minus, Plus, Search, Users } from "lucide-react";

import type { Locale } from "@/lib/i18n/config";
import { addDays, count, todayInThailand, type Stay } from "@/lib/stays-format";
import type { StaysText } from "@/lib/stays-text";

import styles from "./stays.module.css";

/**
 * The booking bar: where, check-in, check-out, guests and rooms, Search.
 *
 * A plain GET form, so the results are an address a guest can share and the
 * back button works; this component only keeps the dates in order and draws
 * the guests picker. Native date inputs, because on a phone they open the
 * phone's own calendar, which is better than anything drawn here.
 *
 * Dates may be left empty — the home page is static and cannot know today —
 * and the results page fills them with tomorrow for one night.
 */
export default function StaySearch({
  action,
  stay,
  places = [],
  t,
  lang,
  showWhere = true,
  tone = "hero",
  extra = {},
}: {
  action: string;
  stay: Stay;
  places?: string[];
  t: StaysText;
  lang: Locale;
  showWhere?: boolean;
  tone?: "hero" | "bar";
  /** Fields carried through the search unchanged: embed mode's parameters. */
  extra?: Record<string, string>;
}) {
  const id = useId();
  const [arrival, setArrival] = useState(stay.arrival);
  const [departure, setDeparture] = useState(stay.departure);
  const [adults, setAdults] = useState(stay.adults);
  const [children, setChildren] = useState(stay.children);
  const [rooms, setRooms] = useState(stay.rooms);
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);

  const today = todayInThailand();

  // Closed by a click anywhere else or by Escape, like every popover a guest
  // has used before.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (picker.current && !picker.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function changeArrival(value: string) {
    setArrival(value);
    // Departure follows: a check-out on or before check-in is never meant.
    if (value && departure <= value) setDeparture(addDays(value, 1));
  }

  function changeRooms(value: number) {
    setRooms(value);
    if (adults < value) setAdults(value);
  }

  const summary = [count(t, "adult", adults), children ? count(t, "child", children) : null, count(t, "room", rooms)]
    .filter(Boolean)
    .join(" · ");

  const steppers: { label: string; hint?: string; value: number; set: (n: number) => void; min: number; max: number }[] = [
    { label: t.adults, value: adults, set: setAdults, min: rooms, max: 16 },
    { label: t.children, hint: t.childrenHint, value: children, set: setChildren, min: 0, max: 10 },
    { label: t.rooms, value: rooms, set: changeRooms, min: 1, max: 4 },
  ];

  return (
    <form
      action={action}
      method="get"
      className={`${styles.bar} ${tone === "bar" ? styles.barCompact : ""} ${showWhere ? "" : styles.barNoWhere}`}
      lang={lang}
    >
      {Object.entries(extra).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {showWhere && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            <MapPin size={14} aria-hidden /> {t.where}
          </span>
          <input
            name="q"
            defaultValue={stay.q}
            placeholder={t.wherePlaceholder}
            list={`${id}-places`}
            autoComplete="off"
            className={styles.fieldInput}
          />
          <datalist id={`${id}-places`}>
            {places.map((place) => (
              <option key={place} value={place} />
            ))}
          </datalist>
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          <CalendarDays size={14} aria-hidden /> {t.checkIn}
        </span>
        <input
          type="date"
          name="arrival"
          min={today}
          value={arrival}
          onChange={(e) => changeArrival(e.target.value)}
          className={styles.fieldInput}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          <CalendarDays size={14} aria-hidden /> {t.checkOut}
        </span>
        <input
          type="date"
          name="departure"
          min={arrival ? addDays(arrival, 1) : today}
          value={departure}
          onChange={(e) => setDeparture(e.target.value)}
          className={styles.fieldInput}
        />
      </label>

      <div className={`${styles.field} ${styles.fieldGuests}`} ref={picker}>
        <span className={styles.fieldLabel} id={`${id}-guests`}>
          <Users size={14} aria-hidden /> {t.guests}
        </span>
        <button
          type="button"
          className={styles.fieldButton}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={`${id}-guests`}
          onClick={() => setOpen((v) => !v)}
        >
          {summary}
        </button>
        <input type="hidden" name="adults" value={adults} />
        <input type="hidden" name="children" value={children} />
        <input type="hidden" name="rooms" value={rooms} />

        {open && (
          <div className={styles.popover} role="dialog" aria-label={t.guests}>
            {steppers.map((s) => (
              <div key={s.label} className={styles.stepper}>
                <div>
                  <div className={styles.stepperLabel}>{s.label}</div>
                  {s.hint && <div className={styles.stepperHint}>{s.hint}</div>}
                </div>
                <div className={styles.stepperControls}>
                  <button
                    type="button"
                    aria-label={`${s.label} −`}
                    disabled={s.value <= s.min}
                    onClick={() => s.set(s.value - 1)}
                  >
                    <Minus size={14} aria-hidden />
                  </button>
                  <output aria-live="polite">{s.value}</output>
                  <button
                    type="button"
                    aria-label={`${s.label} +`}
                    disabled={s.value >= s.max}
                    onClick={() => s.set(s.value + 1)}
                  >
                    <Plus size={14} aria-hidden />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-go" onClick={() => setOpen(false)}>
              {t.done}
            </button>
          </div>
        )}
      </div>

      <button type="submit" className={`btn btn-go ${styles.searchButton}`}>
        <Search size={16} aria-hidden />
        {showWhere ? t.search : t.update}
      </button>
    </form>
  );
}
