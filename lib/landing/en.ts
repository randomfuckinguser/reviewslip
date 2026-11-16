// Content for the brief, search-findable "Get started" landing page.
// English is canonical; other locales mirror this shape and fall back to
// English when absent (see ./index.ts), so the build never breaks on a gap.
// The sign-up form fields themselves come from the shared contact.form
// dictionary — only this page's marketing copy lives here.

export interface Landing {
  seo: { title: string; description: string };
  eyebrow: string;
  title: string;
  subtitle: string;
  points: string[];
  formHeading: string;
  formSubmit: string;
}

const en: Landing = {
  seo: {
    // The site title template appends " · Reviewslip", so don't repeat the brand.
    title: "Sign up & get more Google reviews",
    description:
      "Sign up for Reviewslip and turn your happy customers into genuine Google reviews. A branded QR code, an AI-assisted draft, one tap to post.",
  },
  eyebrow: "Get started",
  title: "Turn happy customers into 5-star Google reviews.",
  subtitle:
    "Reviewslip gives your genuine customers the easiest way to leave a real review — they scan a QR code, get a tailored draft, edit it, and post in seconds. Sign up and we'll get you set up.",
  points: [
    "A branded QR code for each of your locations",
    "AI-assisted drafts your customers edit and post themselves",
    "Google reviews, done the honest way — no fakes, no gating",
  ],
  formHeading: "Sign up",
  formSubmit: "Sign up",
};

export default en;
