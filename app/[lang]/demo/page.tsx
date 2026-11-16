import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import DemoSlip from "@/components/marketing/DemoSlip";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/i18n/metadata";
import { localizedPath } from "@/lib/i18n/routing";
import inner from "../inner.module.css";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/demo">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return buildPageMetadata(lang, "/demo", getDictionary(lang).seo.demo);
}

export default async function DemoPage({ params }: PageProps<"/[lang]/demo">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const t = getDictionary(lang);

  return (
    <>
      <header className={inner.header}>
        <div className={`wrap ${inner.headerInner}`}>
          <span className="eyebrow">{t.demo.eyebrow}</span>
          <h1 className={inner.h1}>{t.demo.title}</h1>
          <p className="lede">{t.demo.lede}</p>
        </div>
      </header>

      <section className="section">
        <div className={`wrap ${inner.demoWrap}`}>
          <DemoSlip
            t={{ slip: t.slip, demoReviews: t.demoReviews }}
            venue="The Riverside Café"
          />
          <p className={inner.demoNote}>{t.demo.note}</p>
          <Link href={localizedPath(lang, "/contact")} className="btn btn-go">
            {t.demo.cta}
          </Link>
        </div>
      </section>
    </>
  );
}
