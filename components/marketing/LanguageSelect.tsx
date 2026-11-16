"use client";

import { usePathname, useRouter } from "next/navigation";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { localizedPath, stripLocale } from "@/lib/i18n/routing";
import styles from "./LocaleControls.module.css";

/** Language selector. Lives in the nav; switching is a real URL navigation. */
export default function LanguageSelect({
  lang,
  label,
}: {
  lang: Locale;
  label: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  /**
   * Switching language navigates to that language's URL, so the translated page
   * is server-rendered (and indexable) rather than swapped in on the client.
   * The cookie lets the proxy honour the choice on later visits to the root.
   */
  const changeLanguage = (next: Locale) => {
    document.cookie = `rs_lang=${next}; path=/; max-age=31536000; samesite=lax`;
    router.push(localizedPath(next, stripLocale(pathname)));
  };

  return (
    <label className={styles.field}>
      <span className={styles.srOnly}>{label}</span>
      <select
        className={styles.select}
        value={lang}
        onChange={(e) => changeLanguage(e.target.value as Locale)}
        aria-label={label}
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
