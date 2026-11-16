import { type Locale, DEFAULT_LOCALE } from "./i18n/config";

/**
 * Review platforms Reviewslip can help customers post to. These are brand
 * names, so they are never translated. Order is intentional (most-used first).
 */
export const SUPPORTED_PLATFORMS = [
  "Google",
  "TripAdvisor",
  "LINE",
  "Facebook",
  "Xiaohongshu",
  "Wongnai",
] as const;

/** Human-readable list, e.g. "Google, TripAdvisor, LINE, Facebook, Xiaohongshu and Wongnai". */
export function platformsSentence(conjunction = "and"): string {
  const list = [...SUPPORTED_PLATFORMS];
  const last = list.pop();
  return `${list.join(", ")} ${conjunction} ${last}`;
}

/**
 * Short "Works with" lead-in for the platforms strip, per locale. Kept here
 * (not in the UI dictionary) so adding platforms needs no dictionary changes.
 */
const WORKS_WITH: Record<Locale, string> = {
  en: "Works with",
  es: "Compatible con",
  fr: "Compatible avec",
  de: "Kompatibel mit",
  pt: "Compatível com",
  it: "Compatibile con",
  nl: "Werkt met",
  th: "ใช้งานได้กับ",
  zh: "支持平台",
  ja: "対応プラットフォーム",
  ko: "지원 플랫폼",
};

export function worksWithLabel(lang: Locale): string {
  return WORKS_WITH[lang] ?? WORKS_WITH[DEFAULT_LOCALE];
}
