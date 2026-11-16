"use client";

import { COUNTRIES } from "@/lib/currency";
import { useCurrency } from "@/lib/CurrencyProvider";
import styles from "./LocaleControls.module.css";

/** Country → currency selector. Lives next to the pricing, where it matters. */
export default function CurrencySelect({ label }: { label: string }) {
  const { countryCode, setCountry } = useCurrency();

  return (
    <label className={styles.field}>
      <span className={styles.srOnly}>{label}</span>
      <select
        className={styles.select}
        value={countryCode}
        onChange={(e) => setCountry(e.target.value)}
        aria-label={label}
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.currency}
          </option>
        ))}
      </select>
    </label>
  );
}
