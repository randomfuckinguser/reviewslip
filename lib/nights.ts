/**
 * Calendar dates, for the reservations screens.
 *
 * The browser half of `nights.js` in the review app, and deliberately the same
 * rules: a date here is a calendar date written 'YYYY-MM-DD', never an instant,
 * and a night belongs to the day it starts — a stay from the 3rd to the 5th
 * occupies the 3rd and the 4th.
 *
 * Arithmetic goes through Date.UTC, which has no zone and no daylight saving to
 * step on. `todayAt` is the one function that knows about a timezone at all,
 * and it only ever asks what the date is somewhere, never does sums with it.
 *
 * No `server-only`: the calendars are client components and need `weeksOf` and
 * `monthLabel` in the browser. Nothing here touches a cookie or the network,
 * so there is nothing to leak.
 *
 * Pure and dependency-free, so it is the file that gets unit tests the day this
 * project has a runner. It does not have one yet; until then the same rules are
 * covered in the review app's `test/prompt.test.js`, against `nights.js`.
 */

const DAY = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A date string, or null. Strict: '2026-02-30' is not a date. */
export function parse(value: string): string | null {
  const match = DATE_RE.exec(value ?? "");
  if (!match) return null;

  const [, y, m, d] = match;
  const stamp = Date.UTC(Number(y), Number(m) - 1, Number(d));
  // The round trip. Date.UTC(2026, 1, 30) is the 2nd of March, and this is
  // where that gets caught rather than silently moving somebody's arrival.
  return new Date(stamp).toISOString().slice(0, 10) === value ? value : null;
}

function stampOf(value: string): number | null {
  return parse(value) === null
    ? null
    : Date.UTC(
        Number(value.slice(0, 4)),
        Number(value.slice(5, 7)) - 1,
        Number(value.slice(8, 10))
      );
}

function format(stamp: number): string {
  return new Date(stamp).toISOString().slice(0, 10);
}

/**
 * Today where the property is, not where the server is.
 *
 * A date worked out from UTC is yesterday's until seven in the morning in
 * Bangkok — which is exactly when a front desk opens the screen and asks who is
 * arriving.
 */
export function todayAt(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** The date `count` days away. Negative goes back. */
export function shift(date: string, count: number): string {
  const stamp = stampOf(date);
  return stamp === null ? date : format(stamp + count * DAY);
}

/** The first of the month a date falls in. */
export function monthStart(date: string): string | null {
  return parse(date) === null ? null : `${date.slice(0, 7)}-01`;
}

/** 28, 29, 30 or 31. Day zero of the next month is the last day of this one. */
export function daysInMonth(date: string): number {
  return new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)
  ).getUTCDate();
}

/**
 * The same day, `count` months away, clamped to a day that exists.
 *
 * The 31st of January plus one month is the 28th of February — not the 3rd of
 * March, which is what the naive version gives and what makes a calendar skip
 * the month it was asked to show. Built from the month, never by adding thirty
 * days.
 */
export function addMonths(date: string, count: number): string {
  if (parse(date) === null) return date;

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));

  const first = format(Date.UTC(year, month - 1 + count, 1));
  const last = daysInMonth(first);
  return `${first.slice(0, 7)}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** "February 2026", in the reader's language. */
export function monthLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** The nights a stay occupies: arrival included, departure excluded. */
export function nightsBetween(arrival: string, departure: string): string[] {
  const from = stampOf(arrival);
  const to = stampOf(departure);
  if (from === null || to === null || to <= from) return [];

  const out: string[] = [];
  for (let at = from; at < to; at += DAY) out.push(format(at));
  return out;
}

/** How many nights a stay occupies. Zero for a stay that is not one. */
export function nightCount(arrival: string, departure: string): number {
  return nightsBetween(arrival, departure).length;
}

/** Sunday is 0, matching Date.getUTCDay and the weekday header. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Whether a night starts a week, for the heavier border on a month grid. */
export function isWeekStart(date: string): boolean {
  return weekdayOf(date) === 0;
}

/**
 * A month's nights in Sunday-aligned rows, padded with nulls.
 *
 * The padding is what makes a month grid line up under its weekday header: the
 * 1st of a month that starts on a Wednesday needs three empty cells before it,
 * and the last row needs however many it takes to reach Saturday. Nulls rather
 * than the neighbouring months' dates, because a cell you can price belongs to
 * the month on screen — a greyed-out 31st of January sitting in February's grid
 * is a cell somebody will click.
 */
export function weeksOf(nights: string[]): (string | null)[][] {
  if (nights.length === 0) return [];

  const cells: (string | null)[] = [
    ...Array<null>(weekdayOf(nights[0])).fill(null),
    ...nights,
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let at = 0; at < cells.length; at += 7) weeks.push(cells.slice(at, at + 7));
  return weeks;
}
