import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ContactForm from "@/components/marketing/ContactForm";
import PlatformStrip from "@/components/marketing/PlatformStrip";
import JsonLd from "@/components/JsonLd";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getLanding } from "@/lib/landing";
import { buildPageMetadata } from "@/lib/i18n/metadata";
import { softwareAppJsonLd } from "@/lib/seo/jsonLd";
import styles from "./get-started.module.css";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/get-started">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return buildPageMetadata(lang, "/get-started", getLanding(lang).seo);
}

export default async function GetStartedPage({
  params,
}: PageProps<"/[lang]/get-started">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const t = getDictionary(lang);
  const l = getLanding(lang);

  return (
    <>
      <JsonLd data={softwareAppJsonLd(lang, t)} />

      <section className={styles.wrapSection}>
        <div className={`wrap ${styles.grid}`}>
          <div className={styles.copy}>
            <span className="eyebrow">{l.eyebrow}</span>
            <h1 className={styles.title}>{l.title}</h1>
            <p className="lede">{l.subtitle}</p>
            <ul className={styles.points}>
              {l.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <div className={styles.platforms}>
              <PlatformStrip lang={lang} />
            </div>
          </div>

          <div className={styles.formCol}>
            <ContactForm f={t.contact.form} />
          </div>
        </div>
      </section>
    </>
  );
}
