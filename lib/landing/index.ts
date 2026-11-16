import { type Locale, DEFAULT_LOCALE } from "../i18n/config";
import en, { type Landing } from "./en";
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

const LANDINGS: Partial<Record<Locale, Landing>> = {
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

export function getLanding(locale: Locale): Landing {
  return LANDINGS[locale] ?? LANDINGS[DEFAULT_LOCALE] ?? en;
}

export type { Landing };
