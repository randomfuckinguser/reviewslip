import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Faq from "@/components/marketing/Faq";
import JsonLd from "@/components/JsonLd";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/i18n/metadata";
import { localizedPath } from "@/lib/i18n/routing";
import { faqJsonLd } from "@/lib/seo/jsonLd";
import inner from "../inner.module.css";
import styles from "./faq.module.css";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/faq">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return buildPageMetadata(lang, "/faq", getDictionary(lang).seo.faq);
}

export default async function FaqPage({ params }: PageProps<"/[lang]/faq">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const t = getDictionary(lang);
  const f = t.faqPage;

  // One FAQPage entity covering every question on the page.
  const allItems = f.sections.flatMap((s) => s.items);

  return (
    <>
      <JsonLd data={faqJsonLd(allItems)} />

      <header className={inner.header}>
        <div className={`wrap ${inner.headerInner}`}>
          <span className="eyebrow">{f.eyebrow}</span>
          <h1 className={inner.h1}>{f.title}</h1>
          <p className="lede">{f.lede}</p>
        </div>
      </header>

      <section className="section">
        <div className="wrap">
          <div className={styles.warning} role="note">
            <span className={styles.warningIcon} aria-hidden="true">
              !
            </span>
            <p>
              <strong>{f.warningLead}</strong> {f.warning}
            </p>
          </div>

          {f.sections.map((section, i) => (
            <div key={section.title} className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionNum}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2 className={styles.sectionTitle}>{section.title}</h2>
                  <p className={styles.sectionBlurb}>{section.blurb}</p>
                </div>
              </div>
              <Faq items={section.items} />
            </div>
          ))}

          <p className={styles.disclaimer}>{f.disclaimer}</p>
        </div>
      </section>

      <section className={styles.cta}>
        <div className={`wrap ${styles.ctaInner}`}>
          <h2 className={styles.ctaTitle}>{f.ctaTitle}</h2>
          <p className="lede">{f.ctaLede}</p>
          <div className={styles.ctaActions}>
            <Link href={localizedPath(lang, "/contact")} className="btn btn-go">
              {t.common.getInTouch}
            </Link>
            <Link
              href={localizedPath(lang, "/compliance")}
              className="btn btn-quiet"
            >
              {t.footer.complianceTrust}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
