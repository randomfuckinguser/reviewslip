"use client";

import { useEffect, useRef, useState, useTransition } from "react";

// From lib/theme, not lib/customer: this is a client component, and
// lib/customer is server-only. See the note at the top of lib/theme.ts.
import {
  DISPLAY_FONTS,
  PALETTE_SLOTS,
  THEME_NOTE_MAX,
  THEME_SUGGESTIONS,
  UI_FONTS,
  type Derived,
  type BackgroundSummary,
  type FontSummary,
  type MeasuredColour,
  type Palette,
  fileSize,
  forSlot,
} from "@/lib/theme";

/**
 * The theme tab: four colours, and an honest preview of what they become.
 *
 * The preview is drawn from the *derived* palette rather than the four chosen
 * colours, and the derivation is asked for over the wire rather than repeated
 * here. That is the whole design decision in this file. A brand palette is not
 * an interface palette — a pale gold that works in a logo is unreadable as body
 * text — so the review app nudges any colour that cannot carry text until it
 * can. Showing the raw four would promise a page the guest is not going to get,
 * and a second copy of that arithmetic in TypeScript would eventually disagree
 * with the first.
 */
/**
 * An image by its address, for when reading the site did not find one.
 *
 * Which is common, and was previously the end of the road: a logo set as a
 * stylesheet background, a hero behind a slideshow, a site that will not be
 * read at all. The address the reader *did* settle on — even one whose
 * download failed — is offered as the starting point, because "no logo: that
 * file is 4MB" is only actionable if you can see which file it meant.
 *
 * The outcome stays in this box rather than going to the banner at the top of
 * the form. That banner carries the draft's own notes, and a second message
 * up there about a different image reads as being about the same one.
 */
function ImageByUrl({
  kind,
  label,
  suggestion,
  busy,
  onFetch,
}: {
  kind: "logo" | "background";
  label: string;
  suggestion: string | null;
  busy: boolean;
  onFetch: (
    kind: "logo" | "background",
    url: string
  ) => Promise<{ ok: boolean; note?: string; error?: string }>;
}) {
  const [url, setUrl] = useState("");
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startFetch] = useTransition();

  // What the reader found, once it is known, as a starting point — and only
  // while the box is untouched, so it cannot overwrite somebody's typing.
  const [seen, setSeen] = useState<string | null>(null);
  if (suggestion !== seen) {
    setSeen(suggestion);
    if (suggestion && !url) setUrl(suggestion);
  }

  function go() {
    const address = url.trim();
    if (!address) return;
    setSaid(null);
    startFetch(async () => {
      const result = await onFetch(kind, address).catch(
        (): { ok: boolean; note?: string; error?: string } => ({
          ok: false,
          error: "That could not be fetched.",
        })
      );
      setSaid({
        ok: result.ok,
        text: result.ok ? result.note ?? "Got it." : result.error ?? "That could not be used.",
      });
    });
  }

  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <label style={hint} htmlFor={`image-${kind}`}>
        {label}
      </label>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          id={`image-${kind}`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            // Enter in a box inside a form submits the form, which here means
            // saving the whole venue with a half-finished theme.
            if (e.key === "Enter") {
              e.preventDefault();
              go();
            }
          }}
          placeholder="https://yoursite.com/logo.png"
          style={urlBox}
        />
        <button
          type="button"
          className="btn btn-quiet"
          disabled={busy || pending || !url.trim()}
          onClick={go}
        >
          {pending ? "Fetching…" : "Fetch"}
        </button>
      </div>
      {said && (
        <span
          role="status"
          style={{
            ...hint,
            color: said.ok ? "var(--success)" : "var(--warning)",
          }}
        >
          {said.text}
        </span>
      )}
    </div>
  );
}

export default function ThemeEditor({
  value,
  derived,
  adjusted,
  sources,
  busy,
  reading,
  fonts,
  background,
  rightsConfirmed,
  onChange,
  onDropBackground,
  onDropFont,
  onRights,
  onGenerate,
  onAdjust,
  found,
  measured,
  note,
  onNote,
  onImage,
  preview,
}: {
  value: Palette;
  derived: Derived;
  adjusted: string[];
  /** Where each colour came from on the website, once it has been drafted. */
  sources: Partial<Record<keyof Palette, string>>;
  busy: boolean;
  reading: boolean;
  /** The typefaces actually taken off the site, if any. */
  fonts: { display: FontSummary | null; ui: FontSummary | null };
  /** The hero photograph taken off the site, described. */
  background: BackgroundSummary | null;
  rightsConfirmed: boolean;
  onChange: (patch: Partial<Palette>) => void;
  onDropFont: (slot: "display" | "ui") => void;
  onDropBackground: () => void;
  onRights: (confirmed: boolean) => void;
  onGenerate: () => void;
  /** Changes the colours that are there, from the note, without reading. */
  onAdjust: () => void;
  /** The addresses reading the site settled on, whether or not they worked. */
  found: { logoUrl: string | null; backgroundUrl: string | null };
  /** The site's own colours, measured off its stylesheets. */
  measured: MeasuredColour[];
  /** What the owner wants from the look, in their own words. Optional. */
  note: string;
  onNote: (note: string) => void;
  /** Fetches one from an address the customer gives. */
  onImage: (
    kind: "logo" | "background",
    url: string
  ) => Promise<{ ok: boolean; note?: string; error?: string }>;
  /** Asks the review app what these four derive to. No model call. */
  preview: (
    theme: Palette,
    background?: boolean
  ) => Promise<{ derived?: Derived; adjusted?: string[] }>;
}) {
  const [live, setLive] = useState<{ derived: Derived; adjusted: string[] }>({
    derived,
    adjusted,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startPreview] = useTransition();

  // Debounced: dragging a colour picker fires continuously, and this is a
  // round trip even if a cheap one.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startPreview(async () => {
        // Annotated, or the fallback narrows the union and the success fields
        // vanish from the type.
        const result = await preview(value, Boolean(background)).catch(
          (): { derived?: Derived; adjusted?: string[] } => ({})
        );
        if (result.derived) {
          setLive({ derived: result.derived, adjusted: result.adjusted ?? [] });
        }
      });
    }, 250);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `preview` is a server action and stable enough; re-running on it would
    // fire a request per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.ground, value.paper, value.accent, value.highlight, background]);

  const v = (name: string) => live.derived[name] ?? "";

  const themed = Boolean(fonts.display || fonts.ui || value.logo || background);

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {/* First, like every other tab: this is the thing to do here, and the
          swatches below are what it produced. */}
      {/*
        Two buttons, because they are two different things and the difference
        matters to whoever presses one.

        Reading the website is several requests to their own server and a
        model call with a page attached — the better part of a minute, and it
        decides the whole palette again. Adjusting takes the four colours that
        are on screen and moves the one that was named. Once a palette exists
        the second is what almost every press actually means, so it leads.
      */}
      <div style={topAction}>
        {themed && (
          <button
            type="button"
            className="btn btn-quiet"
            // Nothing to go on without an instruction: this is the note doing
            // the work, and the button would be a no-op without one.
            disabled={busy || !note.trim()}
            onClick={onAdjust}
            title={
              note.trim()
                ? undefined
                : "Say what you want changed in the box below first"
            }
          >
            {reading ? "Working…" : "Adjust These Colours"}
          </button>
        )}
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={onGenerate}>
          {reading
            ? "Reading…"
            : themed
              ? "Read the Website Again"
              : "Generate from Website"}
        </button>
      </div>

      {/*
        What the owner wants, alongside what the website says.
        Reading the site measures what it is painted with, which is not always
        what the business wants to be seen in: a site everybody is embarrassed
        by measures perfectly accurately. This is where they say so, and it is
        weighed above the measurements.
      */}
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <label htmlFor="theme-note" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
          Anything We Should Know?
        </label>
        <div style={hint}>
          Optional. It steers the colours and the type, and the table card is
          drawn from the same four colours, so it steers that too — say which
          you mean and it will be followed: &ldquo;the table card is too
          dark&rdquo;, &ldquo;warmer on the review page&rdquo;.
          {themed && " Adjust uses this without re-reading your site."}
        </div>

        {/*
          Suggestions, because an empty box is a hard question. Each one lands
          as text that can be edited or deleted — a starting phrase, not a
          setting, which is why they do not look like toggles and nothing
          stays lit after a click.
        */}
        <div style={swatchRow}>
          {THEME_SUGGESTIONS.map((phrase) => (
            <button
              key={phrase}
              type="button"
              className="btn btn-quiet"
              style={chip}
              disabled={busy}
              onClick={() => {
                // Added to what is there rather than replacing it: two of these
                // together is a perfectly good instruction, and somebody who
                // clicked one and then typed should not lose either.
                const joined = note.trim() ? `${note.trim()}, ${phrase.toLowerCase()}` : phrase;
                onNote(joined.slice(0, THEME_NOTE_MAX));
              }}
            >
              {phrase}
            </button>
          ))}
        </div>

        <textarea
          id="theme-note"
          value={note}
          onChange={(e) => onNote(e.target.value)}
          // Stopped at the limit rather than refused after the fact: the review
          // app enforces the same number, and finding out from an error that a
          // paragraph was too long is the worse way to learn it.
          maxLength={THEME_NOTE_MAX}
          rows={2}
          placeholder="Warmer, and use the green from our sign rather than the blue on the site."
          style={noteBox}
        />
        <div style={{ ...hint, textAlign: "right" }}>
          {note.length}/{THEME_NOTE_MAX}
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {PALETTE_SLOTS.map((slot) => (
          <div key={slot.key} style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
            <input
              type="color"
              value={value[slot.key]}
              onChange={(e) => onChange({ [slot.key]: e.target.value })}
              aria-label={slot.label}
              style={swatch}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 500 }} htmlFor={`theme-${slot.key}`}>
                {slot.label}
              </label>
              <div style={{ ...hint, marginTop: "0.1rem" }}>
                {sources[slot.key] || slot.hint}
              </div>
              {/*
                Your site's own colours, the likeliest for this slot first.
                One click, because the alternative to this row is opening the
                website in another tab with an eyedropper — and these are the
                values the site actually paints with, which is a stronger
                claim than anything the picker beside them can offer.
              */}
              {measured.length > 0 && (
                <div style={swatchRow}>
                  {forSlot(measured, slot.key).map((c) => {
                    const chosen = c.hex.toLowerCase() === value[slot.key].toLowerCase();
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => onChange({ [slot.key]: c.hex })}
                        // Both, because the roles are the reason this one is
                        // near the front of the row and a tooltip is not
                        // available to somebody using a keyboard.
                        title={c.roles.length ? `${c.hex} — ${c.roles.join(", ")}` : c.hex}
                        aria-label={`Use ${c.hex} for ${slot.label}${
                          c.roles.length ? `, found on your ${c.roles.join(" and ")}` : ""
                        }`}
                        aria-pressed={chosen}
                        style={{
                          ...fromSite,
                          background: c.hex,
                          // The one in use gets the ring. Without it a row of
                          // swatches says nothing about which was taken.
                          outline: chosen ? "2px solid var(--ring)" : "none",
                          outlineOffset: 1,
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
            <input
              id={`theme-${slot.key}`}
              // Submitted as four flat fields and reassembled server-side, since
              // a form cannot post an object.
              name={`theme-${slot.key}`}
              value={value[slot.key]}
              onChange={(e) => onChange({ [slot.key]: e.target.value })}
              spellCheck={false}
              autoCapitalize="none"
              style={{ ...hexInput }}
              maxLength={7}
              aria-label={`${slot.label} hex value`}
            />
          </div>
        ))}
      </div>

      {/* --------------------------------------------------------- fonts */}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {[
          { key: "display" as const, label: "Review text", fonts: DISPLAY_FONTS },
          { key: "ui" as const, label: "Everything else", fonts: UI_FONTS },
        ].map((row) => {
          const grabbed = fonts[row.key];
          return (
            <div key={row.key} style={{ display: "grid", gap: "0.25rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 500 }} htmlFor={`theme-${row.key}`}>
                {row.label}
              </label>

              {grabbed ? (
                // Your own file is in use, so the dropdown is not what is
                // rendering — showing it as an active control would be a lie.
                <div style={grabbedBox}>
                  <div>
                    <strong style={{ fontWeight: 500 }}>{grabbed.family}</strong>{" "}
                    <span style={hint}>
                      — your own file, {fileSize(grabbed.bytes)} {grabbed.format}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => onDropFont(row.key)}
                  >
                    Use a Standard Font Instead
                  </button>
                </div>
              ) : (
                <select
                  id={`theme-${row.key}`}
                  name={`theme-${row.key}`}
                  value={value[row.key]}
                  onChange={(e) => onChange({ [row.key]: e.target.value })}
                  style={select}
                >
                  {row.fonts.map((font) => (
                    <option key={font.id} value={font.id} style={option}>
                      {font.name} — {font.note}
                    </option>
                  ))}
                </select>
              )}

              {/* The dropdown is the fallback even when a file is in use, so it
                  still has to be submitted — as a hidden field when the visible
                  control is gone. */}
              {grabbed && (
                <input type="hidden" name={`theme-${row.key}`} value={value[row.key]} />
              )}

              {sources[row.key] && <div style={hint}>On your site: {sources[row.key]}</div>}
            </div>
          );
        })}

        <span style={hint}>
          Generating takes the real font files off your site where it can. Where
          it cannot — some foundries license per website and their files cannot
          be served from here — it falls back to the closest match from the list.
          Either way this covers Latin text: a review written in Thai, Chinese,
          Japanese or Korean falls back to the reader&rsquo;s own device font,
          which is the only way it renders at all.
        </span>

        {(fonts.display || fonts.ui) && (
          <label style={rightsBox}>
            <input
              type="checkbox"
              name="fontRights"
              checked={rightsConfirmed}
              onChange={(e) => onRights(e.target.checked)}
              style={{ marginTop: "0.15rem" }}
            />
            <span>
              <strong style={{ fontWeight: 500 }}>
                I have the right to use these fonts on this page.
              </strong>{" "}
              Your review page is on our domain, so your font is being served
              from ours. Most paid typefaces are licensed per website and do not
              allow that. If you are not sure, untick this and use a standard
              font — nobody will notice, and it cannot come back on you.
            </span>
          </label>
        )}
      </div>

      {/* ---------------------------------------------------------- logo */}

      <div style={{ display: "grid", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Logo</span>
        {/* Carried through the form as a hidden field: it is a stored image, not
            something to type, and it has to survive a save made from any tab. */}
        <input type="hidden" name="theme-logo" value={value.logo} />

        {value.logo ? (
          <div style={{ display: "grid", gap: "0.6rem" }}>
          <div style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.logo}
              alt="Your logo"
              style={{
                maxHeight: "3rem",
                maxWidth: "10rem",
                objectFit: "contain",
                // On the paper colour, since that is the lighter of the two and
                // shows a dark mark; the guest page puts it on the ground.
                background: v("--paper"),
                borderRadius: 8,
                padding: "0.4rem 0.6rem",
              }}
            />
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => onChange({ logo: "" })}
            >
              Remove
            </button>
          </div>

          {/*
            Most logos are a wordmark, so the name goes off by default the
            moment there is one — printing it twice is the first thing
            anybody notices on a card the size of a postcard. A venue whose
            mark is a symbol rather than a word puts it back here.
          */}
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", ...hint }}>
            <input
              type="checkbox"
              checked={value.showName === true}
              onChange={(e) => onChange({ showName: e.target.checked })}
            />
            Print the Name Under the Logo as Well
          </label>
          <input
            type="hidden"
            name="theme-show-name"
            value={value.showName === true ? "1" : ""}
          />
          </div>
        ) : (
          <span style={hint}>None yet — generating from your website looks for one.</span>
        )}

        <ImageByUrl
          kind="logo"
          label="Or paste the address of your logo"
          suggestion={found.logoUrl}
          busy={busy}
          onFetch={onImage}
        />
      </div>

      {/* ---------------------------------------------------- background */}

      <div style={{ display: "grid", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Background photo</span>

        {background ? (
          <div style={grabbedBox}>
            <div>
              <strong style={{ fontWeight: 500 }}>
                {background.from === "you"
                  ? "The one you gave"
                  : background.from === "site"
                    ? "From your site"
                    : "Saved photo"}
              </strong>{" "}
              <span style={hint}>
                — {fileSize(background.bytes)} {background.type.replace("image/", "")}
              </span>
            </div>
            <button type="button" className="btn btn-quiet" onClick={onDropBackground}>
              Remove
            </button>
          </div>
        ) : (
          <span style={hint}>
            None — generating looks for the photo at the top of your site.
          </span>
        )}

        <ImageByUrl
          kind="background"
          label="Or paste the address of a photo"
          suggestion={found.backgroundUrl}
          busy={busy}
          onFetch={onImage}
        />

        <span style={hint}>
          It sits behind the whole page, heavily dimmed. That is not a style
          choice: every colour above is held to a contrast ratio against your
          background colour, and a photograph behind the text would make those
          numbers meaningless. The wash over it is set strong enough that the
          text still passes over a pure white photo and a pure black one, so the
          photo reads as texture rather than as a picture. The preview below
          shows it exactly as a customer will see it.
        </span>
      </div>

      {/* ------------------------------------------------------- preview */}

      <div>
        <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Preview</span>
        <div style={{ ...hint, margin: "0.2rem 0 0.6rem" }}>
          The guest page and the table card, in these colours.
        </div>

        <div
          className="venue-look"
          style={{
            ...previewFrame,
            // Layered the same way body is in the guest page's stylesheet: the
            // scrim over the photo over the ground. Anything else here would be
            // a preview of a page nobody gets.
            background: v("--shade"),
            backgroundImage: v("--scrim")
              ? `linear-gradient(${v("--scrim")}, ${v("--scrim")}), ${v("--backdrop")}`
              : undefined,
            backgroundSize: "auto, cover",
            backgroundPosition: "center",
          }}
        >
          {value.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.logo}
              alt=""
              style={{
                display: "block",
                maxHeight: "2rem",
                maxWidth: "8rem",
                objectFit: "contain",
                objectPosition: "left center",
                marginBottom: "0.5rem",
              }}
            />
          )}
          {/* The colour the page actually sets secondary text in. It was
              --jade-dim, the accent at half alpha, which composites to about
              2.3:1 over the ground — the preview has to show what the guest
              gets, not a softer version of it. */}
          <div style={{ color: v("--jade-soft"), ...eyebrow }}>YOUR BUSINESS</div>
          {/* Text on the page, not the card's own colour. On a light theme
              the page is the pale one, and this was white on white. */}
          <div style={{ color: v("--on-shade"), fontSize: "1.4rem", lineHeight: 1.1 }}>
            Thanks for visiting<span style={{ color: v("--marigold") }}>.</span>
          </div>

          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", margin: "0.9rem 0 0.7rem" }}>
            {["Staff", "The Welcome"].map((chip, i) => (
              <span
                key={chip}
                style={{
                  ...chipStyle,
                  border: `1px solid ${i === 0 ? v("--paper") : v("--jade-line")}`,
                  background: i === 0 ? v("--paper") : "transparent",
                  color: i === 0 ? v("--ink") : v("--jade"),
                }}
              >
                {chip}
              </span>
            ))}
          </div>

          {/* The hairline is what finds the card on a light page, where it
              may be the same shade as the page behind it. Transparent on a
              dark theme, so nothing there changes. */}
          <div
            style={{
              background: v("--paper"),
              border: `1px solid ${v("--paper-edge") || "transparent"}`,
              borderRadius: 3,
              padding: "0.8rem 0.75rem",
            }}
          >
            <div style={{ color: v("--ink"), fontSize: "0.95rem", lineHeight: 1.5 }}>
              Popped in on the way past and they sorted it in ten minutes. No fuss.
            </div>
            <div style={{ color: v("--ink-soft"), fontSize: "0.72rem", marginTop: "0.45rem" }}>
              Your review — yours to change
            </div>
          </div>

          <div
            style={{
              ...button,
              background: v("--marigold"),
              color: v("--on-marigold"),
              border: `1px solid ${v("--marigold")}`,
            }}
          >
            Proceed to Google
          </div>
        </div>
      </div>

      {live.adjusted.length > 0 && (
        <div style={adjustedBox} role="note">
          <strong style={{ display: "block", marginBottom: "0.3rem", fontWeight: 500 }}>
            {live.adjusted.length === 1
              ? "One of your colours was adjusted for readability."
              : `${live.adjusted.length} of your colours were adjusted for readability.`}
          </strong>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {live.adjusted.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <span style={{ ...hint, display: "block", marginTop: "0.4rem" }}>
            A guest reads this outdoors on a phone. Colours that could not carry
            text at that size are nudged until they can — the preview above is
            what will actually be served.
          </span>
        </div>
      )}
    </div>
  );
}

const hint: React.CSSProperties = { fontSize: "0.8rem", color: "var(--ink-soft)" };

/** Wide, because an image address is long and truncation hides the useful end. */
const urlBox: React.CSSProperties = {
  font: "inherit",
  fontSize: "0.82rem",
  flex: "1 1 20rem",
  minWidth: 0,
  padding: "0.4rem 0.55rem",
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--cream) 22%, transparent)",
  background: "color-mix(in srgb, var(--cream) 6%, transparent)",
  color: "inherit",
};

/*
 * One of the site's own colours, offered against a slot.
 *
 * Small and square, in a row that has to sit under a line of hint text without
 * becoming the loudest thing in the panel: this is evidence to reach for, not
 * the control. The real picker is the 2.6rem well to its left.
 */
const swatchRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.3rem",
  marginTop: "0.35rem",
};

const fromSite: React.CSSProperties = {
  width: "1.15rem",
  height: "1.15rem",
  padding: 0,
  borderRadius: 4,
  // A hairline, so a swatch the colour of the panel behind it is still a
  // swatch. Half the colours a site is painted with are near-black.
  border: "1px solid color-mix(in srgb, var(--cream) 35%, transparent)",
  cursor: "pointer",
};

/** A starting phrase. Quieter than the Generate button it sits under. */
const chip: React.CSSProperties = {
  fontSize: "0.78rem",
  padding: "0.25rem 0.6rem",
  borderRadius: 999,
};

const noteBox: React.CSSProperties = {
  font: "inherit",
  fontSize: "0.88rem",
  lineHeight: 1.5,
  padding: "0.55rem 0.7rem",
  borderRadius: 10,
  border: "1px solid var(--jade-line)",
  background: "color-mix(in srgb, var(--cream) 6%, transparent)",
  color: "var(--cream)",
  resize: "vertical",
  minHeight: "3.4rem",
};

const swatch: React.CSSProperties = {
  flex: "0 0 auto",
  width: "2.6rem",
  height: "2.6rem",
  padding: 0,
  border: "1px solid var(--jade-line)",
  borderRadius: 10,
  background: "transparent",
  cursor: "pointer",
};

/** Matches the header on the other tabs — see TopAction in SettingsForm. */
const topAction: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  flexWrap: "wrap",
  alignItems: "center",
  paddingBottom: "1.1rem",
  borderBottom: "1px solid var(--jade-line)",
};

const grabbedBox: React.CSSProperties = {
  display: "flex",
  gap: "0.8rem",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  padding: "0.6rem 0.75rem",
  borderRadius: 10,
  border: "1px solid var(--jade-line)",
  fontSize: "0.88rem",
};

const rightsBox: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  alignItems: "flex-start",
  padding: "0.85rem 1rem",
  borderRadius: 10,
  border: "1px solid var(--jade-line)",
  fontSize: "0.82rem",
  color: "var(--ink-soft)",
  lineHeight: 1.5,
  cursor: "pointer",
};

const select: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  borderRadius: 10,
  border: "1px solid var(--jade-line)",
  background: "color-mix(in srgb, var(--cream) 6%, transparent)",
  color: "var(--cream)",
  font: "inherit",
  fontSize: "0.85rem",
  // The dropdown list is drawn by the operating system, not by this page, and
  // it defaults to a white popup — which the cream `color` above then renders
  // almost invisibly on. This tells the UA to draw a dark control instead, so
  // the popup matches the page and the inherited colour is right for it.
  colorScheme: "dark",
};

/**
 * Belt and braces for the same problem.
 *
 * `color-scheme` is the modern fix and is what does the work in current
 * browsers; some still ignore it for the popup and take these instead. The
 * marketing selects solve it this way in LocaleControls.module.css — same
 * colours, so the two look alike.
 */
const option: React.CSSProperties = {
  background: "var(--shade-soft)",
  color: "var(--cream)",
};

const hexInput: React.CSSProperties = {
  flex: "0 0 6.5rem",
  padding: "0.5rem 0.6rem",
  borderRadius: 10,
  border: "1px solid var(--jade-line)",
  background: "color-mix(in srgb, var(--cream) 6%, transparent)",
  color: "var(--cream)",
  font: "inherit",
  fontSize: "0.85rem",
};

const previewFrame: React.CSSProperties = {
  padding: "1.1rem",
  borderRadius: 12,
  border: "1px solid var(--jade-line)",
};

const eyebrow: React.CSSProperties = {
  fontSize: "0.6rem",
  letterSpacing: "0.2em",
  fontWeight: 600,
  marginBottom: "0.35rem",
};

const chipStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  padding: "0.35rem 0.7rem",
  borderRadius: 999,
  lineHeight: 1,
};

const button: React.CSSProperties = {
  marginTop: "0.8rem",
  padding: "0.6rem 0.9rem",
  borderRadius: 999,
  textAlign: "center",
  fontSize: "0.85rem",
  fontWeight: 500,
};

const adjustedBox: React.CSSProperties = {
  padding: "0.9rem 1rem",
  borderRadius: 10,
  border: "1px solid var(--jade-line)",
  fontSize: "0.82rem",
  color: "var(--ink-soft)",
};
