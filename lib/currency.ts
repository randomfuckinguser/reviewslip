/**
 * Country → currency configuration for the pricing display.
 *
 * NOTE: exchange rates are PLACEHOLDERS relative to USD (the base all plan
 * prices are stored in). Swap them for live/desired rates before launch.
 * Formatting uses Intl.NumberFormat so symbols and digit grouping are correct
 * per currency; prices are rounded to whole units since they're placeholders.
 */

export interface Country {
  /** ISO country code (also the selector value). */
  code: string;
  /** English display name in the selector. */
  name: string;
  flag: string;
  currency: string; // ISO 4217
  /** Units of this currency per 1 USD. */
  rate: number;
  /** BCP-47 locale used purely for number formatting. */
  numberLocale: string;
}

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", flag: "🇺🇸", currency: "USD", rate: 1, numberLocale: "en-US" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", currency: "GBP", rate: 0.79, numberLocale: "en-GB" },
  { code: "EU", name: "Eurozone", flag: "🇪🇺", currency: "EUR", rate: 0.92, numberLocale: "de-DE" },
  { code: "CA", name: "Canada", flag: "🇨🇦", currency: "CAD", rate: 1.36, numberLocale: "en-CA" },
  { code: "AU", name: "Australia", flag: "🇦🇺", currency: "AUD", rate: 1.52, numberLocale: "en-AU" },
  { code: "TH", name: "Thailand", flag: "🇹🇭", currency: "THB", rate: 36, numberLocale: "th-TH" },
  { code: "JP", name: "Japan", flag: "🇯🇵", currency: "JPY", rate: 155, numberLocale: "ja-JP" },
  { code: "CN", name: "China", flag: "🇨🇳", currency: "CNY", rate: 7.2, numberLocale: "zh-CN" },
  { code: "KR", name: "South Korea", flag: "🇰🇷", currency: "KRW", rate: 1350, numberLocale: "ko-KR" },
];

export const DEFAULT_COUNTRY = "US";

export function getCountry(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

/**
 * Convert a base USD amount to the country's currency and format it with the
 * right symbol/grouping. Rounded to whole units (placeholder pricing).
 */
export function formatMoney(usd: number, country: Country): string {
  const converted = usd * country.rate;
  // Round to a tidy whole number for display.
  const rounded = Math.round(converted);
  return new Intl.NumberFormat(country.numberLocale, {
    style: "currency",
    currency: country.currency,
    maximumFractionDigits: 0,
  }).format(rounded);
}
