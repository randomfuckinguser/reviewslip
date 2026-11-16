import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import DemoSlip from "@/components/marketing/DemoSlip";
import JsonLd from "@/components/JsonLd";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/i18n/metadata";
import { localizedPath } from "@/lib/i18n/routing";
import inner from "../inner.module.css";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/how-it-works">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return buildPageMetadata(
    lang,
    "/how-it-works",
    getDictionary(lang).seo.howItWorks
  );
}

export default async function HowItWorksPage({
  params,
}: PageProps<"/[lang]/how-it-works">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const t = getDictionary(lang);

  // HowTo structured data: the steps are a genuine ordered procedure.
  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: t.how.title,
    description: t.how.lede,
    inLanguage: lang,
    step: t.how.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.body,
    })),
  };

  return (
    <>
      <JsonLd data={howToJsonLd} />

      <header className={inner.header}>
        <div className={`wrap ${inner.headerInner}`}>
          <span className="eyebrow">{t.how.eyebrow}</span>
          <h1 className={inner.h1}>{t.how.title}</h1>
          <p className="lede">{t.how.lede}</p>
        </div>
      </header>

      <section className="section">
        <div
          className="wrap"
          style={{
            display: "grid",
            gap: "3rem",
            gridTemplateColumns: "1fr",
            alignItems: "start",
          }}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            {t.how.steps.map((s, i) => (
              <div
                key={s.title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "1.25rem",
                  alignItems: "start",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: "2rem",
                    color: "var(--jade)",
                    opacity: 0.7,
                    minWidth: "2.5rem",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2
                    style={{
                      fontFamily: "var(--ui)",
                      fontWeight: 600,
                      fontSize: "1.15rem",
                      color: "var(--cream)",
                      marginBottom: "0.35rem",
                    }}
                  >
                    {s.title}
                  </h2>
                  <p style={{ color: "var(--cream-soft)" }}>{s.body}</p>
                </div>
              </div>
            ))}
            <Link
              href={localizedPath(lang, "/contact")}
              className="btn btn-go"
              style={{ alignSelf: "flex-start", marginTop: "0.5rem" }}
            >
              {t.common.getInTouch}
            </Link>
          </div>

          <div className={inner.demoWrap}>
            <DemoSlip
              t={{ slip: t.slip, demoReviews: t.demoReviews }}
              autoStart
            />
            <p className={inner.demoNote}>{t.how.demoNote}</p>
          </div>
        </div>
      </section>
    </>
  );
}
