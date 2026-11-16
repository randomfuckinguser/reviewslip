/**
 * Supported languages. `label` is the language's own native name (shown in the
 * selector). Adding a language = add it here + drop a matching dictionary file
 * in lib/i18n/dictionaries.
 */
export const LOCALES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "th", label: "ไทย" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_CODES = LOCALES.map((l) => l.code) as Locale[];

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALE_CODES as string[]).includes(value);
}
