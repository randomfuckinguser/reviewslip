/**
 * Plan configuration.
 *
 * NOTE: prices and limits are PLACEHOLDERS — not finalised. The tier structure
 * and gating machinery are real; swap the numbers here (and later the Stripe
 * price IDs) when pricing is decided. This is the single source of truth for
 * what the marketing site and dashboard display.
 */

export type PlanId = "starter" | "pro" | "business";

export type BillingCycle = "monthly" | "yearly";

export interface Plan {
  id: PlanId;
  name: string;
  /** Placeholder monthly price in USD. `null` = "contact us". */
  priceMonthly: number | null;
  /** Placeholder total annual price in USD. `null` = "contact us". */
  priceYearly: number | null;
  tagline: string;
  /** Marketing bullet list. */
  features: string[];
  /** Machine-readable limits used later for in-app gating. */
  limits: {
    venues: number | "unlimited";
    generationsPerMonth: number | "unlimited";
    teamSeats: number;
    whiteLabel: boolean;
    customPrompt: boolean;
    analytics: boolean;
  };
  /** Highlighted as the recommended tier on the pricing page. */
  recommended?: boolean;
  cta: string;
}

export const PLACEHOLDER_PRICING = true;

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 9,
    priceYearly: 90,
    tagline: "For a single location getting started.",
    features: [
      "1 venue",
      "QR code + shareable review link",
      "AI-assisted review drafts",
      "Copy & post to Google in one tap",
      "Reviewslip branding on the slip",
    ],
    limits: {
      venues: 1,
      generationsPerMonth: 100,
      teamSeats: 1,
      whiteLabel: false,
      customPrompt: false,
      analytics: false,
    },
    cta: "Get in touch",
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 29,
    priceYearly: 290,
    tagline: "For growing businesses with a few locations.",
    features: [
      "Up to 3 venues",
      "QR code + shareable review link",
      "AI-assisted review drafts",
      "Copy & post to Google in one tap",
      "Reviewslip branding on the slip",
    ],
    limits: {
      venues: 3,
      generationsPerMonth: 100,
      teamSeats: 1,
      whiteLabel: false,
      customPrompt: false,
      analytics: false,
    },
    recommended: true,
    cta: "Get in touch",
  },
  {
    id: "business",
    name: "Business",
    priceMonthly: 79,
    priceYearly: 790,
    tagline: "For multi-location businesses.",
    features: [
      "Up to 10 venues",
      "QR code + shareable review link",
      "AI-assisted review drafts",
      "Copy & post to Google in one tap",
      "Reviewslip branding on the slip",
    ],
    limits: {
      venues: 10,
      generationsPerMonth: 100,
      teamSeats: 1,
      whiteLabel: false,
      customPrompt: false,
      analytics: false,
    },
    cta: "Get in touch",
  },
];

/**
 * Display strings for prices (currency symbol, "/mo" vs "/yr", "Free",
 * "Custom", the savings label) all come from the active dictionary so they are
 * translated, and the amount is converted by `useCurrency().money()`. See
 * `components/marketing/PricingCards.tsx`.
 */
