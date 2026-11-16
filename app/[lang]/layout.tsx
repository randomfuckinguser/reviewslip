import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Trirong, Bai_Jamjuree } from "next/font/google";
import { LOCALE_CODES, isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { alternateLanguages, localizedUrl } from "@/lib/i18n/routing";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { CurrencyProvider } from "@/lib/CurrencyProvider";
import { staysText } from "@/lib/stays-text";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import Theme from "@/components/Theme";
import "../globals.css";

/*
 * The venue's typefaces, not the site's.
 *
 * The site and the app are set in the system font and load no webfont
 * (05-frontend.md). These two are what the guest page ships with, so they are
 * still needed by the pictures of it — the demo slip, the table card, the theme
 * preview — and by nothing else. `preload: false` keeps them off every page's
 * critical path: a browser only fetches a face something on the page uses.
 *
 * `thai` is included so a Thai venue name renders in the venue's face rather
 * than a fallback. CJK has no subset here and falls back to the system font,
 * which ships proper CJK glyphs.
 */
const trirong = Trirong({
  variable: "--font-display",
  subsets: ["latin", "thai"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

const baiJamjuree = Bai_Jamjuree({
  variable: "--font-ui",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});

/** Prerender every language at build time. */
export function generateStaticParams() {
  return LOCALE_CODES.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t.seo.home.title,
      template: `%s · ${SITE_NAME}`,
    },
    description: t.seo.home.description,
    alternates: {
      canonical: localizedUrl(lang, "/"),
      languages: alternateLanguages("/"),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: lang,
      url: localizedUrl(lang, "/"),
      title: t.seo.home.title,
      description: t.seo.home.description,
    },
    twitter: {
      card: "summary_large_image",
      title: t.seo.home.title,
      description: t.seo.home.description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
  ],
};

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const t = getDictionary(lang);

  return (
    // suppressHydrationWarning: the theme (next-themes) writes `dark` onto this
    // element before React hydrates, which is what prevents a flash of the
    // wrong theme. It covers this element's own attributes only.
    <html
      lang={lang}
      className={`${trirong.variable} ${baiJamjuree.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <Theme>
        <CurrencyProvider>
          <Nav
            lang={lang}
            nav={t.nav}
            ctaLabel={t.common.getInTouch}
            selectors={t.selectors}
            staysLabel={staysText(lang).navStays}
          />
          <main>{children}</main>
          <Footer lang={lang} t={t} />
        </CurrencyProvider>
        </Theme>
      </body>
    </html>
  );
}
