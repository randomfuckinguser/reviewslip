import type { Metadata } from "next";
import type { Locale } from "./config";
import { alternateLanguages, localizedUrl } from "./routing";
import { SITE_NAME } from "../site";

/**
 * Standard per-page metadata: a self-referencing canonical, the full hreflang
 * set (so search engines can find every translation of this page), and matching
 * Open Graph / Twitter tags.
 */
export function buildPageMetadata(
  lang: Locale,
  route: string,
  seo: { title: string; description: string }
): Metadata {
  const url = localizedUrl(lang, route);

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: url,
      languages: alternateLanguages(route),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: lang,
      url,
      title: `${seo.title} · ${SITE_NAME}`,
      description: seo.description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${seo.title} · ${SITE_NAME}`,
      description: seo.description,
    },
  };
}
