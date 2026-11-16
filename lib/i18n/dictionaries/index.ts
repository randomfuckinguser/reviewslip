import { type Locale, DEFAULT_LOCALE } from "../config";
import en, { type Dictionary } from "./en";
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

const DICTIONARIES: Record<Locale, Dictionary> = {
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

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}
