/**
 * The theme's shape, shared by the server and the browser.
 *
 * Separate from `lib/customer.ts` because that module is `server-only` — it
 * reads cookies — and the theme editor is a client component that needs
 * `PALETTE_SLOTS` at runtime. Types erase at compile time, so importing those
 * from a server-only module is harmless; importing a *value* from one pulls the
 * whole thing into the client bundle, which fails the build with an error about
 * `next/headers` that says nothing about the real cause.
 *
 * Nothing here computes a colour. The derivation lives in the review app's
 * theme.js, which is also what serves the guest page — one implementation, so a
 * preview cannot promise a palette the guest will not get.
 */

/**
 * What a business chooses: four colours, two typefaces and a mark.
 *
 * `display` and `ui` are ids from a fixed list in the review app's theme.js —
 * never font names. A name would have to become part of a Google Fonts URL, and
 * a URL built from something that arrived over the wire is not something to put
 * in a page. `logo` is a stored data URI, never a link to the customer's server:
 * hotlinking would put a request to a third party on every guest's phone.
 */
export interface Palette {
  ground: string;
  paper: string;
  accent: string;
  highlight: string;
  display: string;
  ui: string;
  logo: string;
  /**
   * Print the venue's name under its logo as well.
   *
   * "As well", not "instead": the default with a logo is the mark on its own,
   * because most logos are a wordmark and setting the name underneath one says
   * it twice. A venue whose mark is a symbol turns this on. theme.js in the
   * review app owns the rule — see showsName there.
   */
  showName?: boolean;
}

/**
 * The typefaces on offer, mirroring theme.js.
 *
 * Duplicated deliberately and kept deliberately dumb: this is a label for a
 * dropdown, not a source of truth. The review app resolves an unknown id to the
 * shipped face, so the worst a stale entry here can do is offer a name that
 * quietly lands on the default — not break a page.
 */
export const DISPLAY_FONTS = [
  { id: "trirong", name: "Trirong", note: "the shipped face, also carries Thai" },
  { id: "lora", name: "Lora", note: "a warm contemporary serif" },
  { id: "playfair", name: "Playfair Display", note: "high contrast, editorial" },
  { id: "baskerville", name: "Libre Baskerville", note: "a classic book serif" },
  { id: "source-serif", name: "Source Serif 4", note: "clean and neutral" },
  { id: "garamond", name: "EB Garamond", note: "old style, understated" },
  { id: "fraunces", name: "Fraunces", note: "characterful, a little quirky" },
  { id: "bitter", name: "Bitter", note: "a sturdy slab serif" },
  { id: "dm-serif", name: "DM Serif Display", note: "a confident display serif" },
];

export const UI_FONTS = [
  { id: "bai-jamjuree", name: "Bai Jamjuree", note: "the shipped face, also carries Thai" },
  { id: "inter", name: "Inter", note: "a neutral interface sans" },
  { id: "work-sans", name: "Work Sans", note: "friendly and open" },
  { id: "manrope", name: "Manrope", note: "geometric and modern" },
  { id: "dm-sans", name: "DM Sans", note: "geometric and soft" },
  { id: "poppins", name: "Poppins", note: "circular geometric, informal" },
  { id: "source-sans", name: "Source Sans 3", note: "humanist and very legible" },
  { id: "karla", name: "Karla", note: "grotesque with character" },
  { id: "nunito-sans", name: "Nunito Sans", note: "rounded and approachable" },
];

/** The custom properties the review app derives, keyed as they appear in CSS. */
export type Derived = Record<string, string>;

/**
 * A typeface taken off the business's own site, whole — the file included.
 *
 * Carried through the dashboard rather than re-derived because it is a stored
 * field: the review app downloads and checks it during drafting, and Save has to
 * hand the same bytes back. `data` is base64 and can be a couple of hundred
 * kilobytes, which is why the settings payload describes rather than includes.
 */
export interface StoredFont {
  family: string;
  format: string;
  source: string;
  data: string;
}

/**
 * A file size a person can read.
 *
 * Bytes below a kilobyte, because Math.round(366 / 1024) is 0 and "0kB" reads
 * as a file that failed to arrive. Plenty of real logos are a few hundred
 * bytes of SVG. Mirrors assets.size in the review app.
 */
export function fileSize(bytes: number): string {
  const n = Number(bytes) || 0;
  return n < 1024 ? `${n}B` : `${Math.round(n / 1024)}kB`;
}

/** What the settings payload says about a grabbed font, minus the file. */
export interface FontSummary {
  family: string;
  format: string;
  source: string;
  bytes: number;
}

/**
 * The four that are colours.
 *
 * Named rather than `keyof Palette`, because Palette also carries the logo and
 * whether the name is printed with it — and the moment one of those stopped
 * being a string, every colour input typed against `keyof Palette` stopped
 * compiling. The slots were always the four colours; the type just said
 * otherwise.
 */
export type ColourSlot = "ground" | "paper" | "accent" | "highlight";

export const PALETTE_SLOTS: {
  key: ColourSlot;
  label: string;
  hint: string;
}[] = [
  { key: "ground", label: "Background", hint: "the deep colour behind the page" },
  { key: "paper", label: "Paper", hint: "the card the review is written on" },
  { key: "accent", label: "Accent", hint: "labels, borders and topic buttons" },
  { key: "highlight", label: "Highlight", hint: "the button that opens your listing" },
];

/**
 * How long a line of direction may be.
 *
 * Mirrors themenote.js in the review app, which is what actually enforces it.
 * Held here too so the box stops at the limit rather than letting somebody
 * write a paragraph and then telling them it was too long.
 */
export const THEME_NOTE_MAX = 300;

/**
 * Directions we offer, because an empty box is a hard question.
 *
 * "Tell us how you want it to look" gets nothing from most people. These are
 * the four things a venue has actually wanted after seeing a draft: the site's
 * colours are right but tired, the wrong one of two brand colours was picked,
 * the page is too dark, or the printed card is louder than they want on a
 * table. Each one is a starting phrase, not a setting — they land in the box
 * as text and can be edited or thrown away.
 */
export const THEME_SUGGESTIONS = [
  "Warmer",
  "Calmer, less contrast",
  "Use the colour from our sign",
  "Keep the table card quieter than the website",
];

/**
 * A colour read straight out of the site's own stylesheets.
 *
 * Measured, not decided: these are the values the site paints with, before the
 * model saw anything. The roles come from the variable names and selectors the
 * colour was found on — `ground` off `body`, `highlight` off a button — and are
 * coarse on purpose. They order the evidence; they do not make the choice.
 */
export interface MeasuredColour {
  hex: string;
  roles: string[];
}

/**
 * Which measured colours to offer against a slot, best first.
 *
 * The site's palette was already being read, sent over the wire and thrown
 * away into a sentence saying how many there were. It is the answer to the
 * only question somebody has when the drafted colours are not quite right —
 * "what are my actual colours?" — and without it the alternative is opening
 * the site in another tab and an eyedropper.
 *
 * Sorted rather than filtered. A colour found on a button is the likeliest
 * highlight, but the venue is looking at their own website and knows what they
 * want better than a regular expression does, so everything stays on offer.
 */
const WANTS: Record<ColourSlot, string[]> = {
  ground: ["ground", "header", "footer"],
  paper: ["surface", "ground"],
  accent: ["heading", "highlight", "text"],
  highlight: ["highlight", "heading"],
};

export function forSlot(
  measured: MeasuredColour[],
  slot: ColourSlot,
  limit = 7
): MeasuredColour[] {
  const wants = WANTS[slot] ?? [];

  const rank = (c: MeasuredColour) => {
    const best = c.roles
      .map((r) => wants.indexOf(r))
      .filter((i) => i !== -1)
      .sort((a, b) => a - b)[0];
    return best ?? wants.length;
  };

  return measured
    // Index carried through so equal ranks keep the order they were read in,
    // which is the order of how much of the site is painted with them.
    .map((c, i) => ({ c, i, rank: rank(c) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

/** The hero photograph taken off the site, whole. Carried by the form on save. */
export interface StoredBackground {
  type: string;
  dataUri: string;
  source: string;
}

/** What the settings payload says about it, minus the file. */
export interface BackgroundSummary {
  type: string;
  source: string;
  bytes: number;
  /**
   * Where it came from: read off the site, handed over, or already saved.
   *
   * The panel used to say "From your site" for all of them, which is wrong the
   * moment somebody pastes an address — and wrong in the direction that
   * matters, because it credits the reader with something it failed to find.
   * A stored photo says "saved" rather than guessing, since which of the two
   * routes put it there is not recorded.
   */
  from: "site" | "you" | "stored";
}
