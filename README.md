# Reviewslip

Marketing site and (upcoming) full SaaS product for **Reviewslip** — an app that helps
real customers write and post a genuine Google review in seconds.

Built with **Next.js (App Router)** + TypeScript, hand-written CSS using the app's
"paper receipt slip" design system (dark teal canvas, cream slip cards, jade + marigold
accents, Trirong + Bai Jamjuree fonts).

> Positioning: Reviewslip only ever assists **genuine customers** with **their own** reviews.
> No fabricated, bulk, or fake reviews — by design. See `/compliance`.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

```bash
npm run build   # production build (typechecks + lints)
npm run start   # serve the production build
```

## Project structure

```
proxy.ts                # locale routing (Next 16's renamed middleware)
app/
  globals.css           # design system (tokens + component classes)
  sitemap.ts            # every page × every language, with hreflang alternates
  robots.ts             # robots.txt + sitemap pointer
  [lang]/               # every page is server-rendered per language
    layout.tsx          # root layout: <html lang>, fonts, Nav/Footer, base metadata
    page.tsx            # landing page
    pricing/            # pricing + FAQ
    how-it-works/       # step-by-step walkthrough
    compliance/         # FTC / platform compliance stance
    get-started/        # brief, search-findable sign-up landing page
    demo/               # public interactive slip demo
    faq/                # guide: correct setup, risks, red flags to avoid
    contact/            # contact form
    legal/              # privacy + terms (template stubs)
components/
  JsonLd.tsx            # schema.org structured-data block
  marketing/            # Nav, Footer, DemoSlip, PricingCards, Faq, ContactForm
lib/
  site.ts               # SITE_URL, contact email, form endpoint
  plans.ts              # plan/pricing config (PLACEHOLDER prices)
  currency.ts           # countries + PLACEHOLDER exchange rates
  CurrencyProvider.tsx  # client currency state (language is URL-driven)
  i18n/
    config.ts           # supported locales
    routing.ts          # URL scheme, canonical + hreflang helpers
    metadata.ts         # per-page metadata builder
    dictionaries/       # en.ts is the source of truth; 9 translations
  seo/jsonLd.ts         # Organization / WebSite / SoftwareApplication / FAQ / HowTo
```

## Status

Scope: **marketing site only** — no sign-up, dashboard, auth, or billing. The primary
call-to-action is "Get in touch" (email).

- [x] **Phase 0** — Foundation: Next.js scaffold, design system, shared components
- [x] **Phase 1** — Marketing site: landing, pricing, how-it-works, compliance, demo, contact, legal
- [ ] **Phase 2** — Polish & launch: real content/assets, final pricing, analytics, custom domain

See [PLAN.md](PLAN.md) for the full context.

## Internationalisation & currency

- **Language selector** — 10 languages (English, Spanish, French, German, Portuguese,
  Italian, Thai, Chinese, Japanese, Korean). All site copy lives in
  `lib/i18n/dictionaries/<code>.ts`; `en.ts` is the source of truth and its type
  (`Dictionary`) enforces that every language has the same keys. Add a language by adding
  it to `lib/i18n/config.ts` and dropping in a matching dictionary file.
  - Non-English translations were machine-generated and should be reviewed by native
    speakers before launch (legal pages especially).
- **Country selector → currency** — converts all pricing via `Intl.NumberFormat`.
  Countries/currencies and **placeholder** exchange rates live in `lib/currency.ts`
  (base currency is USD; swap the rates for real ones before launch).
- **Language lives in the URL**, currency does not:
  - Language is a route segment (`app/[lang]/…`), so every translation is server-rendered
    and independently indexable. Server components read it via `getDictionary(lang)`;
    client components receive only the dictionary slices they need as props.
  - Currency is client state (`lib/CurrencyProvider.tsx`, persisted to `localStorage`)
    because it has no SEO impact. Read it with `useCurrency().money(usd)`.

## SEO

- **URL scheme** — English at the root (`/pricing`), other languages prefixed
  (`/es/pricing`). `proxy.ts` rewrites unprefixed paths onto `[lang]` internally and
  308-redirects the `/en/…` form back to the clean one, so each page has exactly one
  canonical URL per language. Only the bare `/` negotiates `Accept-Language` (honouring an
  `rs_lang` cookie first) — every explicit locale URL is served directly so crawlers reach
  all translations without redirects.
- **Per-page metadata** — titles and descriptions are translated (`seo` block in each
  dictionary) and applied via `generateMetadata`. Each page emits a self-referencing
  canonical plus the full hreflang set (10 languages + `x-default`).
- **Sitemap & robots** — `app/sitemap.ts` lists every page with `xhtml:link` alternates;
  `app/robots.ts` allows all and points to it.
- **Structured data** — Organization, WebSite, SoftwareApplication and FAQPage on the home
  page, FAQPage on pricing, HowTo on how-it-works. Offer/price markup is deliberately
  omitted while pricing is placeholder.
- **Set the real domain** in `SITE_URL` (`lib/site.ts`) or via `NEXT_PUBLIC_SITE_URL` —
  it drives every canonical, alternate and sitemap URL. It is currently a placeholder.
- Fonts load the `thai` subset so Thai renders in the brand typeface; CJK intentionally
  falls back to the system UI font.

## Notes

- **Marketing only** — no sign-up. All CTAs link to `/contact` (contact form).
- **Contact email** is `info@reviewslip.com` (set in `lib/site.ts`).
- **Contact form** (`components/marketing/ContactForm.tsx`) posts to
  `CONTACT_FORM_ENDPOINT` in `lib/site.ts`. Left empty, it falls back to opening the
  visitor's email client with the message pre-filled (works with no backend). Set it to a
  Formspree endpoint or your own handler (accepts JSON `{ name, email, business, locations,
  message }`) to collect submissions server-side. Form labels are translated in all locales.
- **First-visit terms modal** (`components/TermsGate.tsx`) — a required disclaimer shown
  once per visitor (persisted in `localStorage`; bump `version` in
  `lib/disclaimer/en.ts` to re-prompt everyone). It states the risks and a broad liability
  waiver. The text lives in `lib/disclaimer/<locale>.ts`, isolated from the general UI
  dictionary so the legal wording is easy to audit; a missing locale falls back to English.
  Caveats worth heeding before launch: (a) it is not legal advice; (b) a blanket "no
  liability whatsoever" waiver is limited or unenforceable in many jurisdictions — have a
  lawyer set the real terms; (c) the non-English versions are machine-translated and a
  mistranslated waiver is a genuine risk, so get them reviewed.
- **`/faq` is the operator guide** — how to place the QR code, what pace to keep, and the
  patterns that get review campaigns filtered or penalised (velocity spikes, single-IP
  clustering, shared devices, incentives, review gating). It is the most legally sensitive
  copy on the site: it cites the FTC's 2024 rule and Google's policies, and it deliberately
  gives no invented statistics or thresholds. Have it reviewed before launch, and re-check
  it whenever platform policy changes.
- **Pricing is placeholder** (`lib/plans.ts`) until finalised.
- **Platforms**: Google, TripAdvisor, LINE, Facebook, Xiaohongshu and Wongnai. The list
  lives in `lib/platforms.ts` (brand names — never translated); the "Works with" strip
  (`components/marketing/PlatformStrip.tsx`) shows them on the home and get-started pages.
  Note: the hero/features copy still leads with Google as the flagship example, and the
  compliance/FAQ guidance is written mainly around Google + the FTC rule — broaden that
  copy and add each platform's own review policies before launch.
- The demo uses canned drafts and never calls an AI model.
