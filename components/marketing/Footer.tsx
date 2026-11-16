import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { localizedPath } from "@/lib/i18n/routing";
import { getLanding } from "@/lib/landing";
import styles from "./Footer.module.css";

/** Server component — no interactivity, so it ships zero client JavaScript. */
export default function Footer({ lang, t }: { lang: Locale; t: Dictionary }) {
  const columns = [
    {
      title: t.footer.colProduct,
      links: [
        { route: "/get-started", label: getLanding(lang).eyebrow },
        { route: "/how-it-works", label: t.nav.howItWorks },
        { route: "/pricing", label: t.nav.pricing },
        { route: "/demo", label: t.nav.demo },
        { route: "/faq", label: t.nav.faq },
      ],
    },
    {
      title: t.footer.colCompany,
      links: [
        { route: "/compliance", label: t.footer.complianceTrust },
        { route: "/contact", label: t.nav.contact },
        { route: "/legal/privacy", label: t.footer.privacy },
        { route: "/legal/terms", label: t.footer.terms },
      ],
    },
  ];

  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.brandCol}>
          <div className={styles.brand}>Reviewslip</div>
          <p className={styles.blurb}>{t.footer.blurb}</p>
        </div>

        {columns.map((col) => (
          <div key={col.title} className={styles.col}>
            <h4 className={styles.colTitle}>{col.title}</h4>
            {col.links.map((l) => (
              <Link
                key={l.route}
                href={localizedPath(lang, l.route)}
                className={styles.link}
              >
                {l.label}
              </Link>
            ))}
          </div>
        ))}

        <div className={styles.col}>
          <h4 className={styles.colTitle}>{t.footer.colGetStarted}</h4>
          <Link href={localizedPath(lang, "/signup")} className="btn btn-go">
            {t.nav.signup}
          </Link>
          <Link
            href={localizedPath(lang, "/contact")}
            className={`btn btn-quiet ${styles.secondaryCta}`}
          >
            {t.common.getInTouch}
          </Link>
          <Link href={localizedPath(lang, "/login")} className={styles.link}>
            {t.nav.login}
          </Link>
        </div>
      </div>

      <div className={`wrap ${styles.legal}`}>
        <span>{t.footer.rights.replace("{year}", String(year))}</span>
        <span className={styles.note}>{t.common.brandNote}</span>
      </div>
    </footer>
  );
}
