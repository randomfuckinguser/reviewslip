import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/i18n/metadata";
import { localizedPath } from "@/lib/i18n/routing";
import inner from "../inner.module.css";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/compliance">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return buildPageMetadata(
    lang,
    "/compliance",
    getDictionary(lang).seo.compliance
  );
}

export default async function CompliancePage({
  params,
}: PageProps<"/[lang]/compliance">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const t = getDictionary(lang);
  const c = t.compliance;

  return (
    <>
      <header className={inner.header}>
        <div className={`wrap ${inner.headerInner}`}>
          <span className="eyebrow">{c.eyebrow}</span>
          <h1 className={inner.h1}>{c.title}</h1>
          <p className="lede">{c.lede}</p>
        </div>
      </header>

      <section className="section">
        <div className={`wrap ${inner.prose}`}>
          <div className={inner.callout}>
            <strong>{c.calloutLead}</strong> {c.callout}
          </div>

          <h2>{c.h1}</h2>
          <p>{c.p1}</p>

          <h2>{c.h2}</h2>
          <ul>
            {c.list.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2>{c.h3}</h2>
          <p>{c.p3}</p>

          <h2>{c.h4}</h2>
          <p>
            {c.p4Lead}
            <Link href={localizedPath(lang, "/legal/terms")}>{c.p4Link}</Link>
            {c.p4End}
          </p>

          <p className={inner.small}>{c.disclaimer}</p>
        </div>
      </section>
    </>
  );
}
