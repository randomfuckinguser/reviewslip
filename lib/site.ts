/**
 * Site-wide constants.
 *
 * NOTE: CONTACT_EMAIL is a PLACEHOLDER — swap it for your real address before
 * launch. It's used for every "Get in touch" call-to-action across the site.
 */

export const SITE_NAME = "Reviewslip";

/**
 * Production origin, used to build absolute canonical URLs, hreflang alternates,
 * the sitemap and Open Graph tags. Search engines require absolute URLs here.
 *
 * TODO: the real domain is not decided yet — this is a PLACEHOLDER. Change it in
 * this one place (or set NEXT_PUBLIC_SITE_URL at build time) and every canonical,
 * alternate and sitemap entry follows automatically. Must include the protocol
 * and no trailing slash.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://reviewslip.com";

export const CONTACT_EMAIL = "info@reviewslip.com";

/**
 * The review app's public address: call buttons load voice-call.js from it
 * and ring through it. (The phone itself answers on this site's own address,
 * /phone/, beside the dashboard.) NEXT_PUBLIC_ because the browser loads the
 * script; set NEXT_PUBLIC_VOICE_URL at build time if the review app answers
 * elsewhere.
 */
export const VOICE_URL =
  process.env.NEXT_PUBLIC_VOICE_URL?.replace(/\/$/, "") ||
  (process.env.NODE_ENV === "production" ? "https://api.reviewslip.com" : "http://localhost:3000");


export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "Reviewslip enquiry"
)}`;

/**
 * The shared relay the contact form posts to.
 *
 * One endpoint serves many sites. There is no per-site registration: each
 * submission carries who it is from (`site`) and who should receive it
 * (`recipient`), and the relay's operator forwards it. So everything about this
 * integration lives in these four values and the form component.
 *
 * All four come from the environment rather than being written here, because
 * three of them differ between a preview deploy and production, and because the
 * relay URL is not ours to hard-code into a repository.
 *
 * NEXT_PUBLIC_ on purpose, and worth understanding rather than copying. This
 * posts from the browser, which is what the relay's own guide describes — so
 * the relay address and the recipient address are both readable in the page
 * source by anyone who looks. That is the relay's design: it accepts a
 * recipient per request. If that address must not be public, the fix is not a
 * different variable name but a route on this site that forwards to the relay
 * server-side.
 */
export const CONTACT_RELAY_URL = process.env.NEXT_PUBLIC_CONTACT_RELAY_URL ?? "";

/**
 * Where this site's submissions go. Empty falls back to CONTACT_EMAIL, which
 * is the address already published on every page of the site.
 *
 * The relay may require an address to be approved before it can deliver to it —
 * that depends on how its sending is configured, and is a question for whoever
 * operates it rather than something this side can check.
 */
export const CONTACT_RECIPIENT =
  process.env.NEXT_PUBLIC_CONTACT_RECIPIENT || CONTACT_EMAIL;

/** What the relay calls this site in the email subject. */
export const CONTACT_SITE_NAME =
  process.env.NEXT_PUBLIC_CONTACT_SITE_NAME ||
  SITE_URL.replace(/^https?:\/\//, "");

/**
 * Cloudflare Turnstile, if the relay has verification switched on.
 *
 * A site key is public by design — it identifies the widget, and the secret
 * that validates a token never leaves the relay. Empty means no widget is
 * rendered and no token is sent, which the relay's guide says it handles.
 */
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/**
 * Where the login / sign-up forms POST. Leave empty until there is a real auth
 * backend: the forms then validate as normal but stop at an "accounts aren't
 * open yet" notice, and the password never leaves the browser.
 *
 * There is deliberately NO mailto fallback here (unlike the contact form) —
 * credentials must never be handed to an email client. When you do set this,
 * it must be an HTTPS endpoint that accepts a JSON POST of
 * { mode: "login" | "signup", email, password, name?, business? }.
 */
/**
 * Where the auth form posts. Handled by app/api/auth/route.ts, which talks to
 * the review app and sets the session cookie.
 */
export const AUTH_ENDPOINT = "/api/auth";
