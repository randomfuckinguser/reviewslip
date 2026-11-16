import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DemoSlip from "@/components/marketing/DemoSlip";
import ContactForm from "@/components/marketing/ContactForm";
import VoiceCall from "@/components/VoiceCall";
import { Phone } from "lucide-react";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/i18n/metadata";
import inner from "../inner.module.css";
import styles from "./contact.module.css";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/contact">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return buildPageMetadata(lang, "/contact", getDictionary(lang).seo.contact);
}

export default async function ContactPage({
  params,
}: PageProps<"/[lang]/contact">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const t = getDictionary(lang);
  const c = t.contact;

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
        <div className={`wrap ${styles.grid}`}>
          <div className={styles.formCol}>
            <ContactForm f={c.form} />
          </div>

          <aside className={styles.aside}>
            {/* An in-browser call to Sales. Hidden until the softphone says
                someone can answer or take a message, so it never promises a
                call that cannot happen. */}
            <VoiceCall
              line="reviewslip"
              team="sales"
              label="Call Sales"
              className="btn btn-go"
              icon={<Phone size={16} aria-hidden />}
            />
            <div className={inner.callout} style={{ marginTop: 0 }}>
              <strong>{c.calloutLead}</strong> {c.callout}
            </div>
            <div className={styles.slipWrap}>
              <DemoSlip
                t={{ slip: t.slip, demoReviews: t.demoReviews }}
                venue={c.demoVenue}
              />
              <p className={inner.demoNote}>{c.demoNote}</p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
