"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { localizedPath } from "@/lib/i18n/routing";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSelect from "./LanguageSelect";
import styles from "./Nav.module.css";

interface Props {
  lang: Locale;
  nav: Dictionary["nav"];
  ctaLabel: string;
  selectors: Dictionary["selectors"];
  /** The marketplace's link, from its own strings rather than the pitch dictionary. */
  staysLabel: string;
}

export default function Nav({ lang, nav, ctaLabel, selectors, staysLabel }: Props) {
  const [open, setOpen] = useState(false);

  // Read after mount, not during render: the server has no idea and guessing
  // would mismatch the hydrated markup. A signed-in visitor sees Sign in for a
  // moment on first paint, which is the price of keeping these pages static.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    setSignedIn(document.cookie.split("; ").includes("rs_signed_in=1"));
  }, []);

  const links = [
    { route: "/stays", label: staysLabel },
    { route: "/how-it-works", label: nav.howItWorks },
    { route: "/#features", label: nav.features },
    { route: "/pricing", label: nav.pricing },
    { route: "/compliance", label: nav.trust },
    { route: "/demo", label: nav.demo },
    { route: "/faq", label: nav.faq },
    { route: "/contact", label: nav.contact },
  ].map((l) => ({
    ...l,
    // "/#features" is an anchor on the home page — localize the page part only.
    href: l.route.startsWith("/#")
      ? `${localizedPath(lang, "/")}${l.route.slice(1)}`.replace("//", "/")
      : localizedPath(lang, l.route),
  }));

  return (
    <header className={styles.header}>
      <div className={`wrap ${styles.bar}`}>
        <Link
          href={localizedPath(lang, "/")}
          className={styles.brand}
          onClick={() => setOpen(false)}
        >
          Reviewslip
        </Link>

        <nav className={styles.desktopNav} aria-label="Primary">
          {links.map((l) => (
            <Link key={l.route} href={l.href} className={styles.link}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <LanguageSelect lang={lang} label={selectors.language} />
          <ThemeToggle className={styles.theme} />
          {signedIn ? (
            <Link
              href={localizedPath(lang, "/dashboard")}
              className="btn btn-quiet"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link href={localizedPath(lang, "/login")} className={styles.signin}>
                {nav.login}
              </Link>
              <Link
                href={localizedPath(lang, "/signup")}
                className="btn btn-quiet"
              >
                {nav.signup}
              </Link>
            </>
          )}
          <Link href={localizedPath(lang, "/contact")} className="btn btn-go">
            {ctaLabel}
          </Link>
        </div>

        <button
          className={styles.burger}
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span data-open={open} />
        </button>
      </div>

      {open && (
        <nav className={styles.mobileNav} aria-label="Mobile">
          {links.map((l) => (
            <Link
              key={l.route}
              href={l.href}
              className={styles.mobileLink}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href={localizedPath(lang, signedIn ? "/dashboard" : "/login")}
            className={styles.mobileLink}
            onClick={() => setOpen(false)}
          >
            {signedIn ? "Dashboard" : nav.login}
          </Link>
          <div className={styles.mobileControls}>
            <LanguageSelect lang={lang} label={selectors.language} />
            <ThemeToggle className={styles.theme} />
          </div>
          {!signedIn && (
            <Link
              href={localizedPath(lang, "/signup")}
              className="btn btn-quiet"
              onClick={() => setOpen(false)}
            >
              {nav.signup}
            </Link>
          )}
          <Link
            href={localizedPath(lang, "/contact")}
            className="btn btn-go"
            onClick={() => setOpen(false)}
          >
            {ctaLabel}
          </Link>
        </nav>
      )}
    </header>
  );
}
