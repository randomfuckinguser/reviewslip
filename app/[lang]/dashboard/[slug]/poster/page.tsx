import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import CardLogo from "@/components/dashboard/CardLogo";
import PrintPoster from "@/components/dashboard/PrintPoster";
import {
  call,
  sessionToken,
  type BusinessDetail,
  type Derived,
} from "@/lib/customer";
import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { cardLanguages, cardText, DEFAULT_SECOND } from "@/lib/card-text";
import { qrCode } from "@/lib/qr";

import styles from "./poster.module.css";

/**
 * The card's themed properties, as an inline style.
 *
 * Only the `--card-*` ones. Most are derived against white rather than against
 * the theme's own paper, so a business whose brand colour is pale still gets a
 * legible card. The three panel properties are the exception — they are derived
 * against the venue's own ground colour, because that is what they sit on. All
 * of it is theme.js's arithmetic, not ours.
 */
const pick: React.CSSProperties = {
  font: "inherit",
  fontSize: "0.85rem",
  padding: "0.3rem 0.45rem",
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--cream) 22%, transparent)",
  background: "color-mix(in srgb, var(--cream) 6%, transparent)",
  color: "inherit",
};

function cardVars(derived: Derived): React.CSSProperties {
  const vars: Record<string, string> = {};
  for (const name of [
    "--card-ink",
    "--card-frame",
    "--card-rule",
    "--card-muted",
    "--card-brand",
    "--card-panel",
    "--card-on-panel",
    "--card-panel-rule",
  ]) {
    if (derived[name]) vars[name] = derived[name];
  }
  return vars as React.CSSProperties;
}

export const metadata: Metadata = {
  title: "Table card",
  robots: { index: false, follow: false },
};

/**
 * The two cards a venue prints.
 *
 * The same sheet with a different code and different words: the review card
 * goes on the table at the end of a meal or by the door at checkout, the
 * welcome card in the room or at reception on arrival. One page with a choice
 * rather than two pages, so a change to the sheet is made once.
 */
const TEMPLATES = {
  review: { label: "Review Card", opens: "the review page", open: "Open the Review Page" },
  welcome: { label: "Welcome Card", opens: "the guest app", open: "Open the Guest App" },
} as const;

type Template = keyof typeof TEMPLATES;

export default async function PosterPage({
  params,
  searchParams,
}: PageProps<"/[lang]/dashboard/[slug]/poster">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  /*
   * The guest's language, alongside the dashboard's English.
   *
   * In the address rather than stored against the venue: a card is printed
   * once and pinned to a table, and a setting somebody has to find, change and
   * change back is more machinery than a link with `?with=th` on it.
   */
  const query = (await searchParams) ?? {};
  const asked = String(query.with ?? DEFAULT_SECOND);
  const second = asked === "none" || asked === "en" ? null : cardText(asked);
  const template: Template = query.card === "welcome" ? "welcome" : "review";
  const english = cardText("en");

  const token = await sessionToken();
  if (!token) redirect(localizedPath(lang, "/login"));

  let data: BusinessDetail;
  try {
    data = await call<BusinessDetail>(`/businesses/${slug}`, { token });
  } catch (err) {
    // 404 covers "someone else's business" as well as "no such business", the
    // same way it does on the business page.
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const { business } = data;
  // The guest app lives beside the review page on the venue's own address.
  const target =
    template === "welcome" ? `${business.url.replace(/\/$/, "")}/welcome` : business.url;
  const code = qrCode(target);

  /*
   * Whether the name is printed under the mark.
   *
   * The review app decides it — theme.js — so the card, the guest page and
   * the settings preview cannot answer it three different ways. Defaulting to
   * true here covers a review app that has not been deployed with the field
   * yet, which is a card that looks exactly as it did before.
   *
   * The setting only means anything when there is a mark to carry the name.
   * Without one, honouring it prints a card with no name on it at all, and the
   * guest who scanned the wrong table has nothing to check against.
   */
  const showsName =
    !data.settings.theme.value.logo || (data.settings.theme.showName ?? true);

  // The scheme is noise on a printed card — nobody types it, and it costs a line
  // of width that a long slug needs more.
  const printedUrl = target.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const words =
    template === "welcome"
      ? { scan: english.welcome, hint: english.welcomeHint, secondScan: second?.welcome, secondHint: second?.welcomeHint }
      : { scan: english.scan, hint: english.minute, secondScan: second?.scan, secondHint: second?.minute };

  return (
    <>
      <PageHeader
        title="Table Card"
        sub={`${business.name} · ${TEMPLATES[template].label}`}
        back={localizedPath(lang, `/dashboard/${business.slug}`)}
      />
      <section className={`page-body ${styles.page}`}>
        <div>
          <p className="lede">
            An A5 card with the QR code for {business.name}. Guests scan it and land
            on {TEMPLATES[template].opens}.
          </p>

          <form method="get" className={styles.actions} style={{ marginBottom: "0.4rem" }}>
            <label style={{ fontSize: "0.85rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
              Card
              <select name="card" defaultValue={template} style={pick}>
                {(Object.keys(TEMPLATES) as Template[]).map((key) => (
                  <option key={key} value={key}>{TEMPLATES[key].label}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: "0.85rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
              Second Language
              <select name="with" defaultValue={asked} style={pick}>
                <option value="none">None — English Only</option>
                {cardLanguages().filter((l) => l.code !== "en").map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-quiet">Apply</button>
          </form>

          <div className={styles.actions}>
            <PrintPoster />
            <a
              href={target}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--jade)", fontSize: "0.9rem" }}
            >
              {TEMPLATES[template].open}
            </a>
          </div>

          <p className={styles.note}>
            Choose <strong>Save as PDF</strong> in the print dialog for a file, or
            print it straight away. The card is already A5 — set paper size to A5
            and scale to 100%, and pick borderless if your printer offers it.
          </p>

          {second && (
            <p className={styles.note}>
              The second line is written plainly and literally rather than
              cleverly. Have somebody who speaks it read the card once before
              you print a boxful — it is a few words, and it is the line half
              your guests will actually be reading.
            </p>
          )}
        </div>
      </section>

      {/* The business's palette, scoped to the sheet. Only the card properties
          are set: the stock stays white and the QR stays pure black, both for
          reasons in poster.module.css that a theme does not get to override.
          Falling back to the shipped values when there is no theme is the
          module's own job — every rule carries them as var() fallbacks. */}
      <div
        className={`venue-look ${styles.sheet}`}
        style={cardVars(data.settings.theme.derived)}
      >
        <div className={styles.frame}>
          {/* Four corner marks, sitting across both rules of the frame. Empty
              spans because they are drawn with their own borders — two sides
              each — and there is nothing to read here. */}
          <div className={styles.corners} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>

          {/* The mark, the name and the divider, on a block of the venue's own
              ground colour. Everything below it stays on white — see the
              masthead notes in poster.module.css for why the colour stops
              here and not at the edge of the paper. */}
          <div className={styles.masthead}>
            {/* Above the name, not instead of it: a mark alone leaves a guest
                who scanned the wrong card with no way to tell. A stored data
                URI, so printing does not depend on the customer's server being
                up. eslint-disable because next/image cannot optimise a data
                URI and this is print output, not a page to score. */}
            {data.settings.theme.value.logo && (
              /*
               * The white plate behind the mark is decided by looking at the
               * mark, not assumed. A logo that already carries its own white
               * background was being plated twice — a white slab inside the
               * block, with the real mark floating in the middle of it.
               *
               * The alt carries the name when the name is not printed under
               * the mark. Empty otherwise, because saying it twice to a
               * screen reader is noise rather than access.
               */
              <CardLogo
                src={data.settings.theme.value.logo}
                alt={showsName ? "" : business.name}
                plateClass={styles.logoWindow}
                logoClass={styles.logo}
              />
            )}
            {/*
              Most logos are a wordmark. Printing the name under one says it
              twice, on a card the size of a postcard, and it is the first
              thing anybody notices. A venue whose mark is a symbol turns the
              name back on from Settings.
            */}
            {showsName && <h2 className={styles.name}>{business.name}</h2>}
            <div className={styles.rule} aria-hidden="true">
              <span className={styles.lozenge} />
            </div>
          </div>

          <p className={styles.headline}>{words.scan}</p>
          {second && (
            <p className={styles.second} lang={asked}>
              {words.secondScan}
            </p>
          )}

          <div className={styles.qr}>
            {/* Ticks at the four corners of the code. Decoration that does a
                job — on a table card "point here" is the one instruction that
                matters — and outside the code's own quiet zone, so a scanner
                never sees them. */}
            <div className={styles.ticks} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            {/* The quiet zone is four modules of the code itself, inside the
                viewBox — so it scales with the card instead of being a padding
                value that stops being four modules the moment the code grows a
                version. Without it, scanners struggle. */}
            <svg
              viewBox={`-4 -4 ${code.count + 8} ${code.count + 8}`}
              role="img"
              aria-label={`QR code for ${printedUrl}`}
            >
              <rect
                x={-4}
                y={-4}
                width={code.count + 8}
                height={code.count + 8}
                fill="#fff"
              />
              <path d={code.path} fill="#000" />
            </svg>
          </div>

          <p className={styles.url}>{printedUrl}</p>
          <p className={styles.hint}>{words.hint}</p>
          {second && (
            <p className={styles.secondHint} lang={asked}>
              {words.secondHint}
            </p>
          )}
          <p className={styles.brand}>Reviewslip</p>
        </div>
      </div>
    </>
  );
}
