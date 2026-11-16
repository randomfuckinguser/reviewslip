import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PricingCards from "@/components/marketing/PricingCards";
import Faq from "@/components/marketing/Faq";
import JsonLd from "@/components/JsonLd";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/i18n/metadata";
import { faqJsonLd } from "@/lib/seo/jsonLd";
import inner from "../inner.module.css";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/pricing">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return buildPageMetadata(lang, "/pricing", getDictionary(lang).seo.pricing);
}

export default async function PricingPage({
  params,
}: PageProps<"/[lang]/pricing">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const t = getDictionary(lang);

  return (
    <>
      <JsonLd data={faqJsonLd(t.pricing.faq)} />

      <header className={inner.header}>
        <div className={`wrap ${inner.headerInner}`}>
          <span className="eyebrow">{t.pricing.eyebrow}</span>
          <h1 className={inner.h1}>{t.pricing.title}</h1>
          <p className="lede">{t.pricing.lede}</p>
        </div>
      </header>

      <section className="section">
        <div className="wrap">
          <PricingCards
            lang={lang}
            currencyLabel={t.selectors.country}
            t={{ pricing: t.pricing, plans: t.plans }}
          />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2
            style={{
              textAlign: "center",
              marginBottom: "2.5rem",
              fontSize: "clamp(1.9rem, 4.5vw, 2.5rem)",
            }}
          >
            {t.pricing.faqTitle}
          </h2>
          <Faq items={t.pricing.faq} />
        </div>
      </section>
    </>
  );
}
