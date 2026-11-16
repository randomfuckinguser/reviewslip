import type { MetadataRoute } from "next";
import { ROUTES, localizedUrl, alternateLanguages } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

/**
 * One entry per page, each carrying the full set of language alternates so
 * search engines discover all ten translations from a single crawl.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return ROUTES.map((route) => ({
    url: localizedUrl(DEFAULT_LOCALE, route),
    lastModified,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/pricing" ? 0.9 : 0.7,
    alternates: {
      languages: alternateLanguages(route),
    },
  }));
}
