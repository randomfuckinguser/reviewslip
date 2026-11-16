import type { Locale } from "@/lib/i18n/config";
import type { StaysText } from "@/lib/stays-text";

/**
 * Formatting for the marketplace pages: money, dates, counts, contact links,
 * and the stay a search defaults to. No server imports, so client components
 * use it too.
 */

/** `{name}` placeholders, filled. Unknown names are left visible, not blanked. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (all, key) => (key in vars ? String(vars[key]) : all));
}

type Pair = "adult" | "child" | "room" | "night" | "review" | "place";

/** "1 night" or "3 nights", from the 1 / N pair in the strings. */
export function count(t: StaysText, pair: Pair, n: number): string {
  const key = `${pair}${n === 1 ? "1" : "N"}` as keyof StaysText;
  return fill(t[key], { n });
}

/**
 * Minor units as the guest's own currency format.
 *
 * Decimals only when the amount has them: Thai rates are whole baht, and
 * "฿1,200.00" on every card is noise.
 */
export function money(minor: number, currency: string, lang: Locale): string {
  const whole = minor % 100 === 0;
  try {
    return new Intl.NumberFormat(lang, {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toLocaleString("en-US")}`;
  }
}

/** "Tue 20 Oct" in the guest's language. Dates are calendar days, read as UTC. */
export function day(iso: string, lang: Locale, withYear = false): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang, {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(date);
}

/** A calendar day, plus or minus some days. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today in Thailand, where every venue is. */
export function todayInThailand(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export interface Stay {
  q: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  rooms: number;
}

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function int(value: string, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/**
 * The stay a page is showing, from its address.
 *
 * Missing or unreadable dates become tomorrow for one night — a results page
 * with prices on it is more use than one asking for dates first, and the bar
 * at the top changes them in one go. The server checks everything again.
 */
export function stayFromParams(params: Params): Stay {
  const today = todayInThailand();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  let arrival = one(params, "arrival");
  let departure = one(params, "departure");
  if (!iso.test(arrival) || arrival < today) arrival = addDays(today, 1);
  if (!iso.test(departure) || departure <= arrival) departure = addDays(arrival, 1);
  const rooms = int(one(params, "rooms"), 1, 1, 4);
  return {
    q: one(params, "q").trim().slice(0, 80),
    arrival,
    departure,
    adults: Math.max(rooms, int(one(params, "adults"), 2, 1, 16)),
    children: int(one(params, "children"), 0, 0, 10),
    rooms,
  };
}

export function stayQuery(stay: Stay, extra: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams();
  if (stay.q) params.set("q", stay.q);
  params.set("arrival", stay.arrival);
  params.set("departure", stay.departure);
  params.set("adults", String(stay.adults));
  params.set("children", String(stay.children));
  params.set("rooms", String(stay.rooms));
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

export function nightsBetween(arrival: string, departure: string): number {
  return Math.round(
    (Date.parse(`${departure}T00:00:00Z`) - Date.parse(`${arrival}T00:00:00Z`)) / 86_400_000
  );
}

/* --------------------------------------------------------------- contact */

/** The links that open a phone's own apps, from what the venue typed. */
export function contactLinks(contact: { phone: string; email: string; line: string; whatsapp: string }) {
  const digits = (value: string) => value.replace(/[^\d+]/g, "");
  return {
    phone: contact.phone ? `tel:${digits(contact.phone)}` : null,
    email: contact.email ? `mailto:${contact.email}` : null,
    line: contact.line
      ? /^https:\/\//i.test(contact.line)
        ? contact.line
        : `https://line.me/R/ti/p/${encodeURIComponent(contact.line.startsWith("@") ? contact.line : `@${contact.line}`)}`
      : null,
    whatsapp: contact.whatsapp ? `https://wa.me/${digits(contact.whatsapp).replace(/^\+/, "")}` : null,
  };
}

/** Where a marketplace photo is fetched from, through this site. */
export function photoSrc(id: number): string {
  return `/api/stays/photo/${id}`;
}

/* ------------------------------------------------------------------ embed */

/**
 * Embed mode: the Stays pages running inside another website's iframe
 * (public/embed.js puts them there).
 *
 * Carried in the address, not a cookie, because a third-party iframe often
 * cannot keep cookies — and because every link, form and redirect has to keep
 * it, or one click takes the guest out of the frame and onto reviewslip.com.
 *
 * - embed=1   the flag: no site header or footer, height reported to the host
 * - venue     lock to one venue: results go straight to it, no "All stays"
 * - accent    the host site's colour for the main buttons, as hex without #
 * - theme     light (the default: most host sites are), dark, or auto to
 *             follow the visitor's own setting
 */
export interface Embed {
  on: boolean;
  venue: string | null;
  accent: string | null;
  theme: "light" | "dark" | "auto";
}

export const NO_EMBED: Embed = { on: false, venue: null, accent: null, theme: "auto" };

export function embedFrom(params: Params): Embed {
  if (one(params, "embed") !== "1") return NO_EMBED;
  const venue = one(params, "venue").toLowerCase();
  const accent = one(params, "accent").replace(/^#/, "").toLowerCase();
  return {
    on: true,
    venue: /^[a-z0-9][a-z0-9-]{0,31}$/.test(venue) ? venue : null,
    // Hex only: it ends up in a style attribute.
    accent: /^([0-9a-f]{3}|[0-9a-f]{6})$/.test(accent) ? accent : null,
    theme: one(params, "theme") === "dark" ? "dark" : one(params, "theme") === "auto" ? "auto" : "light",
  };
}

/** The embed parameters, for hidden form fields and query strings. */
export function embedQuery(embed: Embed): Record<string, string> {
  if (!embed.on) return {};
  return {
    embed: "1",
    ...(embed.venue ? { venue: embed.venue } : {}),
    ...(embed.accent ? { accent: embed.accent } : {}),
    ...(embed.theme !== "light" ? { theme: embed.theme } : {}),
  };
}

/** A link inside the Stays pages, kept inside the frame. */
export function withEmbed(href: string, embed: Embed): string {
  if (!embed.on) return href;
  const [path, hash] = href.split("#");
  const extra = new URLSearchParams(embedQuery(embed)).toString();
  return `${path}${path.includes("?") ? "&" : "?"}${extra}${hash !== undefined ? `#${hash}` : ""}`;
}
