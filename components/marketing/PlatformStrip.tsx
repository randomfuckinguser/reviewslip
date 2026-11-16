import type { Locale } from "@/lib/i18n/config";
import { SUPPORTED_PLATFORMS, worksWithLabel } from "@/lib/platforms";
import styles from "./PlatformStrip.module.css";

/** "Works with Google · TripAdvisor · LINE · …" — server component, no JS. */
export default function PlatformStrip({ lang }: { lang: Locale }) {
  return (
    <div className={styles.strip}>
      <span className={styles.label}>{worksWithLabel(lang)}</span>
      <ul className={styles.list}>
        {SUPPORTED_PLATFORMS.map((p) => (
          <li key={p} className={styles.item}>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
