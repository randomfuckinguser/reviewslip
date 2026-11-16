"use client";

import Link from "next/link";
import { useState } from "react";
import { PLANS, PLACEHOLDER_PRICING } from "@/lib/plans";
import type { PlanId, BillingCycle } from "@/lib/plans";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { localizedPath } from "@/lib/i18n/routing";
import { useCurrency } from "@/lib/CurrencyProvider";
import CurrencySelect from "./CurrencySelect";
import styles from "./PricingCards.module.css";

interface Props {
  lang: Locale;
  /** Label for the currency selector (t.selectors.country). */
  currencyLabel: string;
  t: {
    pricing: Dictionary["pricing"];
    plans: Dictionary["plans"];
  };
}

export default function PricingCards({ lang, currencyLabel, t }: Props) {
  const { money } = useCurrency();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const ctaHref = localizedPath(lang, "/contact");

  const f = t.plans.features;
  const meta: Record<
    PlanId,
    { name: string; tagline: string; features: string[] }
  > = {
    starter: {
      name: t.plans.starterName,
      tagline: t.plans.starterTagline,
      features: [f.venues1, f.qr, f.drafts, f.oneTap, f.branding],
    },
    pro: {
      name: t.plans.proName,
      tagline: t.plans.proTagline,
      features: [f.venues3, f.qr, f.drafts, f.oneTap, f.branding],
    },
    business: {
      name: t.plans.businessName,
      tagline: t.plans.businessTagline,
      features: [f.venues10, f.qr, f.drafts, f.oneTap, f.branding],
    },
  };

  function display(plan: (typeof PLANS)[number]) {
    const value = cycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
    if (value === null) return { amount: t.pricing.custom, suffix: "" };
    if (value === 0) return { amount: t.pricing.free, suffix: "" };
    return {
      amount: money(value),
      suffix: cycle === "yearly" ? t.pricing.perYear : t.pricing.perMonth,
    };
  }

  return (
    <div>
      <div className={styles.controls}>
        <div className={styles.toggle} role="group" aria-label="Billing period">
          <button
            type="button"
            className={styles.toggleBtn}
            aria-pressed={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
          >
            {t.pricing.monthly}
          </button>
          <button
            type="button"
            className={styles.toggleBtn}
            aria-pressed={cycle === "yearly"}
            onClick={() => setCycle("yearly")}
          >
            {t.pricing.yearly}
            <span className={styles.save}>{t.pricing.savings}</span>
          </button>
        </div>

        <CurrencySelect label={currencyLabel} />
      </div>

      {PLACEHOLDER_PRICING && (
        <p className={styles.disclaimer}>{t.pricing.disclaimer}</p>
      )}

      <div className={styles.grid}>
        {PLANS.map((plan) => {
          const price = display(plan);
          const m = meta[plan.id];
          return (
            <div
              key={plan.id}
              className={`${styles.card} ${
                plan.recommended ? styles.recommended : ""
              }`}
            >
              {plan.recommended && (
                <span className={styles.badge}>{t.pricing.mostPopular}</span>
              )}
              <h3 className={styles.name}>{m.name}</h3>
              <p className={styles.tagline}>{m.tagline}</p>

              <div className={styles.priceRow}>
                <span className={styles.price}>{price.amount}</span>
                {price.suffix && (
                  <span className={styles.per}>{price.suffix}</span>
                )}
              </div>
              <p className={styles.billNote}>
                {cycle === "yearly" ? t.pricing.billedAnnually : " "}
              </p>

              <Link
                href={ctaHref}
                className={`btn ${plan.recommended ? "btn-go" : "btn-quiet"} ${
                  styles.cta
                }`}
              >
                {t.plans.cta}
              </Link>

              <ul className={styles.features}>
                {m.features.map((feat) => (
                  <li key={feat}>
                    <span className={styles.check} aria-hidden="true">
                      ✓
                    </span>
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
