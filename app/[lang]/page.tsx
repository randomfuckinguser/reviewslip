import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import DemoSlip from "@/components/marketing/DemoSlip";
import PricingCards from "@/components/marketing/PricingCards";
import Faq from "@/components/marketing/Faq";
import PlatformStrip from "@/components/marketing/PlatformStrip";
import JsonLd from "@/components/JsonLd";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/i18n/metadata";
import { localizedPath } from "@/lib/i18n/routing";
import {
  organizationJsonLd,
  webSiteJsonLd,
  softwareAppJsonLd,
  faqJsonLd,
} from "@/lib/seo/jsonLd";
import StaySearch from "@/components/stays/StaySearch";
import stays from "@/components/stays/stays.module.css";
import { staysText } from "@/lib/stays-text";
import styles from "./home.module.css";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return buildPageMetadata(lang, "/", getDictionary(lang).seo.home);
}

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const t = getDictionary(lang);
  const h = t.home;
  const s = staysText(lang);

  return (
    <>
      <JsonLd
        data={[
          organizationJsonLd(lang, t),
          webSiteJsonLd(lang, t),
          softwareAppJsonLd(lang, t),
          faqJsonLd(h.faq),
        ]}
      />

      {/* Find a stay: the marketplace's bar, first thing on the page. */}
      <section className={stays.hero} aria-labelledby="stays-title">
        <div className="wrap">
          <span className="eyebrow">{s.heroEyebrow}</span>
          <h2 className={stays.heroTitle} id="stays-title">{s.heroTitle}</h2>
          <p className={stays.heroLede}>{s.heroLede}</p>
          <StaySearch
            action={localizedPath(lang, "/stays")}
            stay={{ q: "", arrival: "", departure: "", adults: 2, children: 0, rooms: 1 }}
            t={s}
            lang={lang}
          />
        </div>
      </section>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={`wrap ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <span className="eyebrow">{h.heroEyebrow}</span>
            <h1 className={styles.h1}>
              {h.heroTitleLead} <em>{h.heroTitleEm}</em>
            </h1>
            <p className="lede">{h.heroLede}</p>
            <div className={styles.heroActions}>
              <Link href={localizedPath(lang, "/contact")} className="btn btn-go">
                {t.common.getInTouch}
              </Link>
              <Link href={localizedPath(lang, "/demo")} className="btn btn-quiet">
                {t.common.tryDemo}
              </Link>
            </div>
            <p className={styles.heroNote}>{h.heroNote}</p>
          </div>

          <div className={styles.heroSlip}>
            <DemoSlip
              t={{ slip: t.slip, demoReviews: t.demoReviews }}
              autoStart
            />
          </div>
        </div>
      </section>

      {/* Supported platforms */}
      <section className={styles.platforms}>
        <div className="wrap">
          <PlatformStrip lang={lang} />
        </div>
      </section>

      {/* Social proof */}
      <section className={styles.proof}>
        <div className={`wrap ${styles.proofRow}`}>
          <span className={styles.proofStars}>★★★★★</span>
          <span>{h.proofRating}</span>
          <span className={styles.proofDivider} />
          <span>{h.proofBuiltFor}</span>
        </div>
      </section>

      {/* How it works */}
      <section className="section">
        <div className="wrap">
          <div className={styles.sectionHead}>
            <span className="eyebrow">{h.howEyebrow}</span>
            <h2 className={styles.h2}>{h.howTitle}</h2>
          </div>
          <div className={styles.steps}>
            {h.steps.map((s, i) => (
              <div key={s.title} className={styles.step}>
                <span className={styles.stepNum}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepBody}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section" id="features">
        <div className="wrap">
          <div className={styles.sectionHead}>
            <span className="eyebrow">{h.featuresEyebrow}</span>
            <h2 className={styles.h2}>{h.featuresTitle}</h2>
          </div>
          <div className={styles.features}>
            {h.features.map((feat) => (
              <div key={feat.title} className={`panel ${styles.feature}`}>
                <h3 className={styles.featureTitle}>{feat.title}</h3>
                <p className={styles.featureBody}>{feat.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className={styles.metricsSection}>
        <div className={`wrap ${styles.metrics}`}>
          {h.metrics.map((m) => (
            <div key={m.label} className={styles.metric}>
              <span className={styles.metricValue}>{m.value}</span>
              <span className={styles.metricLabel}>{m.label}</span>
            </div>
          ))}
        </div>
        <p className={styles.metricsFootnote}>{h.metricsFootnote}</p>
      </section>

      {/* Pricing */}
      <section className="section" id="pricing">
        <div className="wrap">
          <div className={styles.sectionHead}>
            <span className="eyebrow">{h.pricingEyebrow}</span>
            <h2 className={styles.h2}>{h.pricingTitle}</h2>
          </div>
          <PricingCards
            lang={lang}
            currencyLabel={t.selectors.country}
            t={{ pricing: t.pricing, plans: t.plans }}
          />
          <p className={styles.pricingLink}>
            <Link
              href={localizedPath(lang, "/pricing")}
              className={styles.textLink}
            >
              {h.pricingCompare}
            </Link>
          </p>
        </div>
      </section>

      {/* Compliance teaser */}
      <section className="section">
        <div className={`wrap ${styles.trust}`}>
          <span className="eyebrow">{h.trustEyebrow}</span>
          <h2 className={styles.h2}>{h.trustTitle}</h2>
          <p className="lede">{h.trustLede}</p>
          <Link
            href={localizedPath(lang, "/compliance")}
            className="btn btn-quiet"
          >
            {h.trustCta}
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="section">
        <div className="wrap">
          <div className={styles.sectionHead}>
            <span className="eyebrow">{h.faqEyebrow}</span>
            <h2 className={styles.h2}>{h.faqTitle}</h2>
          </div>
          <Faq items={h.faq} />
          <p className={styles.pricingLink}>
            <Link href={localizedPath(lang, "/faq")} className={styles.textLink}>
              {h.faqMore}
            </Link>
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className={styles.cta}>
        <div className={`wrap ${styles.ctaInner}`}>
          <h2 className={styles.ctaTitle}>{h.ctaTitle}</h2>
          <p className="lede">{h.ctaLede}</p>
          <Link href={localizedPath(lang, "/contact")} className="btn btn-go">
            {t.common.getInTouch}
          </Link>
        </div>
      </section>
    </>
  );
}
