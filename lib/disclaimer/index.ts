import { type Locale, DEFAULT_LOCALE } from "../i18n/config";
import en, { type Disclaimer } from "./en";
import es from "./es";
import fr from "./fr";
import de from "./de";
import pt from "./pt";
import it from "./it";
import nl from "./nl";
import th from "./th";
import zh from "./zh";
import ja from "./ja";
import ko from "./ko";

/**
 * Locale → disclaimer. Any locale may be absent (translations land over time);
 * getDisclaimer falls back to English so the modal always renders and the build
 * never breaks on a missing translation.
 */
const DISCLAIMERS: Partial<Record<Locale, Disclaimer>> = {
  en,
  es,
  fr,
  de,
  pt,
  it,
  nl,
  th,
  zh,
  ja,
  ko,
};

export function getDisclaimer(locale: Locale): Disclaimer {
  return DISCLAIMERS[locale] ?? DISCLAIMERS[DEFAULT_LOCALE] ?? en;
}

export type { Disclaimer };
