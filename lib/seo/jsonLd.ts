import type { Locale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries/en";
import { localizedUrl } from "../i18n/routing";
import { SITE_NAME, SITE_URL, CONTACT_EMAIL } from "../site";

/**
 * Structured data (schema.org). Emitted per page and per language so each
 * localized page describes itself in its own language.
 *
 * Note: we deliberately do NOT emit Offer/price structured data while pricing
 * is still placeholder — publishing provisional prices as machine-readable
 * offers would put wrong numbers into search results.
 */

export function organizationJsonLd(lang: Locale, t: Dictionary) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: localizedUrl(lang, "/"),
    description: t.seo.home.description,
    contactPoint: {
      "@type": "ContactPoint",
      email: CONTACT_EMAIL,
      contactType: "customer support",
      availableLanguage: ["en", "es", "fr", "de", "pt", "it", "nl", "th", "zh", "ja", "ko"],
    },
  };
}

export function webSiteJsonLd(lang: Locale, t: Dictionary) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: localizedUrl(lang, "/"),
    description: t.seo.home.description,
    inLanguage: lang,
  };
}

export function softwareAppJsonLd(lang: Locale, t: Dictionary) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: localizedUrl(lang, "/"),
    description: t.seo.home.description,
    inLanguage: lang,
  };
}

export function faqJsonLd(items: readonly { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

export function breadcrumbJsonLd(
  lang: Locale,
  trail: { name: string; route: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: localizedUrl(lang, crumb.route),
    })),
  };
}

export { SITE_URL };
