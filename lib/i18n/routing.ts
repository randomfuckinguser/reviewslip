import { LOCALE_CODES, DEFAULT_LOCALE, type Locale } from "./config";
import { SITE_URL } from "../site";

/**
 * URL strategy: the default locale (English) lives at the root — `/pricing` —
 * while every other language is prefixed — `/es/pricing`. Middleware rewrites
 * unprefixed paths onto the `[lang]` segment internally and redirects the
 * explicit `/en/...` form back to the clean root form so there is exactly one
 * canonical URL per page per language.
 */

/** Every indexable route, as an unprefixed path. Drives the sitemap + hreflang. */
export const ROUTES = [
  "/",
  "/get-started",
  "/how-it-works",
  "/pricing",
  "/demo",
  "/faq",
  "/compliance",
  "/contact",
  "/login",
  "/signup",
  "/dashboard",
  "/dashboard/businesses/new",
  "/legal/privacy",
  "/legal/terms",
] as const;

export type Route = (typeof ROUTES)[number];

/**
 * BCP-47 tags emitted in hreflang. Our internal codes are mostly already valid;
 * Chinese is disambiguated to Simplified since that is what we translated.
 */
const HREFLANG: Record<Locale, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "pt",
  it: "it",
  nl: "nl",
  th: "th",
  zh: "zh-Hans",
  ja: "ja",
  ko: "ko",
};

/** Path for a route in a given locale. English is unprefixed. */
export function localizedPath(lang: Locale, route: string): string {
  const clean = route === "/" ? "" : route;
  if (lang === DEFAULT_LOCALE) return clean || "/";
  return `/${lang}${clean}`;
}

/** Absolute URL for a route in a given locale. */
export function localizedUrl(lang: Locale, route: string): string {
  const path = localizedPath(lang, route);
  return `${SITE_URL}${path === "/" ? "" : path}`;
}

/**
 * hreflang alternates for a route: every language plus `x-default` (English),
 * which tells search engines what to serve when no language matches.
 */
export function alternateLanguages(route: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const code of LOCALE_CODES) {
    map[HREFLANG[code]] = localizedUrl(code, route);
  }
  map["x-default"] = localizedUrl(DEFAULT_LOCALE, route);
  return map;
}

/**
 * Strip a leading locale segment from a pathname, returning the bare route.
 * `/es/pricing` -> `/pricing`, `/pricing` -> `/pricing`, `/es` -> `/`.
 */
export function stripLocale(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length && (LOCALE_CODES as string[]).includes(segments[0])) {
    segments.shift();
  }
  return "/" + segments.join("/");
}
