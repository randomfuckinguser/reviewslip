# Reviewslip — Website Plan

A **marketing website** for **Reviewslip**: an app that helps real customers write and post genuine
reviews in seconds (scan QR → AI drafts a review → edit → post to Google).

> **Scope (updated):** marketing site only — **no sign-up, dashboard, auth, or billing.** The primary
> call-to-action is "Get in touch" (email). The full-SaaS sections below (dashboard §9, billing §10,
> multi-tenant guest app §8) are retained as **future context / out of current scope**, in case the
> product side is built later in a separate effort. What's actually being built here is the marketing
> site plus the canned interactive demo.

The site adopts the app's existing "paper receipt slip" visual identity.

---

## 1. Positioning & Compliance (read first)

**What we sell:** a *review assistant* that removes the friction stopping happy customers from
leaving a review. The customer had a real experience; the app just helps them phrase it and post it.
We **never** fabricate reviews or generate them without a real customer present.

**Why this matters:** the FTC Fake Review Rule (effective Oct 2024) and every major platform ban
AI-fabricated or incentivized reviews. "We only assist genuine customers" is both the honest framing
and a trust differentiator — surfaced as a visible Compliance page and baked into product guardrails
(no bulk generation, one draft per real session, no fabricated specifics in prompts).

**Taglines:** "Turn great stays into 5-star reviews." · "Help happy customers say it in seconds."

---

## 2. The Three Surfaces

The product is one codebase serving three audiences:

1. **Marketing site** (public, static) — sells the product, drives signups.
2. **Guest review app** (public, per-venue) — the slip a customer uses after scanning a QR code.
   Multi-tenant: each venue has its own URL/slug, branding, categories, and prompt.
3. **Dashboard** (authenticated) — where venue owners/agencies configure venues, generate QR codes,
   tune prompts, manage billing, and view review analytics.

---

## 3. Users & Roles

- **Visitor** — browses marketing site.
- **Guest** — end customer using the review slip (no account).
- **Venue owner** — signs up, manages one or more venues, billing.
- **Team member** — invited to an owner's account with limited access (Pro+).
- **Agency admin** — manages many client venues under one org, white-label (Agency tier).

Multi-tenancy: **Organization → Venues → Guest slips**. Clerk Organizations model this directly.

---

## 4. Tech Stack (decided)

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router)** | One app for marketing (SSG) + guest app + dashboard + API routes. Native to Vercel. |
| Hosting | **Vercel** | Zero-config Next.js, edge, HTTPS (needed for clipboard), preview deploys. |
| Database | **Postgres via Neon** | Serverless Postgres, generous free tier, branches for previews. |
| ORM | **Drizzle** | Type-safe, lightweight, SQL-first, great with serverless. |
| Auth | **Clerk** (Organizations) | Fast to ship, teams/orgs built-in → maps to Pro/Agency multi-venue + white-label. |
| Billing | **Stripe** (Checkout + Billing + Customer Portal + webhooks) | Subscriptions, plan gating, self-serve management. |
| AI | **OpenRouter, server-side** | Same provider as the app; keys stay server-side, usage metered per plan. |
| QR codes | `qrcode` lib, generated server-side per venue | Each links to that venue's guest slip URL. |
| Styling | Hand-written CSS with the app's tokens | Preserves the exact aesthetic across all three surfaces. |
| Fonts | Google Fonts: Trirong + Bai Jamjuree | Same as the app. |
| Site analytics | Plausible / Umami | Privacy-friendly, on-brand with the trust positioning. |
| Product analytics | Review events stored in Postgres | Powers the dashboard charts. |
| Transactional email | Resend | Signup, invites, receipts. |

*Note:* this replaces the repo's bring-your-own-key, single-venue, `settings.json` model with a
managed multi-tenant SaaS. The guest-app UI is ported; its backend is rebuilt for multi-tenancy.

---

## 5. Data Model (first pass)

- **organizations** — id, name, plan, stripe_customer_id, subscription_status, branding (logo, colors), white_label bool
- **users** — via Clerk; linked to orgs through Clerk memberships
- **venues** — id, org_id, slug, display_name, google_review_url, theme_color, active bool
- **venue_config** — venue_id, category_chips (json), ai_prompt, model, tone settings
- **review_events** — id, venue_id, created_at, status (generated / edited / copied / posted), rating, category_selected, chars, model_used
- **subscriptions** — org_id, stripe_subscription_id, plan, current_period_end, seats/venue_limits
- **api_usage** — org_id, month, generations_count (for metering/limits)

---

## 6. Design System (ported from the app)

```css
:root {
  --shade: #0c1f19;         /* canvas / dark teal */
  --shade-deep: #06110e;
  --paper: #f3ecdc;         /* card / "slip" */
  --paper-shadow: #ded3bc;
  --ink: #1b2a23;           /* text on paper */
  --ink-soft: #5d6b62;
  --jade: #82b49b;          /* accent */
  --jade-line: rgba(130,180,155,0.24);
  --marigold: #e9a03b;      /* primary CTA */
  --display: 'Trirong', Georgia, serif;   /* headings, weight 300 */
  --ui: 'Bai Jamjuree', system-ui, sans-serif;
  --ease: cubic-bezier(0.2, 0.7, 0.3, 1);
}
```

**Reused motifs across all surfaces:** the torn-edge **slip card** (hero, pricing, guest app),
**pill chips** (999px), `.btn-go` (marigold primary) / `.btn-quiet` (jade-outline secondary), light
serif display headings with fluid `clamp()`, soft shadows, gentle animations, `prefers-reduced-motion`.

---

## 7. Marketing Site (pages & landing sections)

Pages: Home, Pricing, How it works, Compliance & Trust, Live demo, Legal (Privacy/Terms).

Landing sections: sticky nav → hero with **animated slip** generating a review → social proof strip →
problem/solution (Scan → Draft → Post) → features grid (paper cards) → interactive demo → results
metrics → pricing (slip cards, recommended highlighted) → compliance/trust → FAQ accordion → final
CTA band → footer.

---

## 8. Guest Review App (multi-tenant)

- Route: `/v/[slug]` — loads that venue's config, branding, chips, prompt, Google link.
- Flow: pick category chips → AI drafts a short 5-star review (skeleton → settle animation) →
  edit → copy → "Proceed to Google" deep link. "Regenerate" for fresh phrasing.
- Server-side generation via OpenRouter; rate-limited; logs a `review_event`.
- Guardrails: one draft per session, no fabricated specifics, plan usage limits enforced.
- HTTPS required for clipboard.

---

## 9. Dashboard (authenticated)

- **Onboarding:** create org → create first venue → set Google review URL, categories, prompt →
  get QR code + shareable slip link → pick plan.
- **Venues:** list, create/edit, per-venue config editor (live slip preview), toggle active.
- **QR & links:** downloadable QR (PNG/SVG), copyable URL, print-ready card.
- **Analytics:** generations, copies, posts, rating distribution, category breakdown, trend over time.
- **Team:** invite members, roles (Pro+).
- **Billing:** plan, usage vs. limit, upgrade/downgrade via Stripe Customer Portal, invoices.
- **Branding / white-label:** logo + colors on guest slip (Agency tier).
- **Settings:** account, prompt defaults, model choice (gated by plan).

---

## 10. Billing & Plans (structure only — numbers TBD)

Prices and exact limits are **not decided yet**. Build the tier *structure* and gating machinery now;
plug in real numbers before launch. Use placeholder prices/limits in the UI, clearly marked.

Plan gating enforced in-app (venue count, monthly generations, team seats, white-label).

- **Starter** — 1 venue, capped monthly generations, Reviewslip branding.
- **Pro** (recommended) — multiple venues, higher limits, team seats, analytics, custom prompts/model.
- **Agency / White-label** — many venues, white-label branding, org admin, priority support.

Placeholder values live in one config (e.g. `plans.ts`) so swapping in real pricing is a one-file edit.

Stripe: Checkout for signup, Billing for subscriptions + metered/limit tracking, Customer Portal for
self-serve changes, webhooks to sync `subscription_status` and enforce limits.

---

## 11. Build Phases

**Phase 0 — Foundation** ✅ *done*
Next.js (App Router) + TS scaffold, design tokens + fonts, base layout, shared UI (nav, footer,
slip, chips, buttons, pricing cards, FAQ). *(DB/Drizzle + Clerk deferred to Phases 2–3 when needed.)*

**Phase 1 — Marketing site** ✅ *done*
Home with animated slip hero, social proof, how-it-works, features, metrics, pricing, compliance,
FAQ, final CTA. Plus /pricing, /how-it-works, /compliance, /demo (interactive), /legal/*. Static,
SEO + OG metadata. Builds clean; all pages prerender static.

**Phase 2 — Polish & launch** (current remaining scope)
Real content/copy, logos & testimonials, finalised pricing, contact email swapped, site analytics,
SEO/OG images, favicon, responsive + a11y QA, Lighthouse, custom domain, deploy to Vercel.

---

### Out of current scope (future, if the product side is built separately)

- **Guest review app** — multi-tenant `/v/[slug]`, server-side OpenRouter generation, event logging.
- **Dashboard** — auth, org/venue CRUD, QR generation, onboarding.
- **Billing** — Stripe subscriptions, plan gating, usage limits.
- **Analytics & teams** — review dashboards, org invites/roles, white-label.

These are documented in §8–§10 for reference but are **not** part of the current marketing-site build.

---

## 12. Decisions & Open Questions

**Decided:**
- **Platforms:** Google only for v1. Data model and guest flow assume a single `google_review_url`
  per venue; no platform switching needed yet. (Multi-platform is a future extension.)
- **Pricing:** placeholders for now; tier *structure* built, numbers slotted in later via `plans.ts`.

**Still open (have sensible defaults — will proceed unless you say otherwise):**
1. **Auth vendor:** default **Clerk** (fast, orgs built-in). Auth.js is the free-but-more-wiring alt.
2. **AI model:** need a default OpenRouter model; and is model choice a paid (Pro+) feature? Default: yes.
3. **Accounts:** do Domain / Stripe / Clerk / Neon accounts exist, or set up fresh?
4. **Assets:** real logo, testimonials, venue examples — or placeholders for now? Default: placeholders.
5. **Legal:** existing Privacy/Terms copy, or start from a template? Default: template stubs.
