import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import DeleteBusiness from "@/components/dashboard/DeleteBusiness";
import SettingsForm, {
  type BusinessState,
  type Suggestion,
  type FetchedImage,
  type ThemeDraft,
} from "@/components/dashboard/SettingsForm";
import {
  call,
  callText,
  sessionToken,
  type BusinessDetail,
  type Derived,
  type Palette,
} from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Business settings",
  robots: { index: false, follow: false },
};

/**
 * One grabbed font field, ready to spread into the patch body.
 *
 * Three states, and all three are meaningful. A field that is not in the form at
 * all leaves what is stored alone — the settings payload does not carry the
 * bytes, so a save that did not re-draft has nothing to send. An empty string
 * clears it. Anything else is JSON the review app produced during drafting, and
 * it validates the shape again on the way in regardless of what happens here.
 */
function font(field: string, formData: FormData): Record<string, unknown> {
  if (!formData.has(field)) return {};

  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) return { [field]: null };

  try {
    return { [field]: JSON.parse(raw) };
  } catch {
    // A mangled value is dropped rather than forwarded as a string, which the
    // review app would refuse anyway — this just makes the intent local.
    return {};
  }
}

export default async function BusinessSettingsPage({
  params,
}: PageProps<"/[lang]/dashboard/[slug]/settings">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  // TypeScript drops the isLocale narrowing inside the action's closure.
  const locale: Locale = lang;

  const token = await sessionToken();
  if (!token) redirect(localizedPath(lang, "/login"));

  let data: BusinessDetail;
  try {
    data = await call<BusinessDetail>(`/businesses/${slug}`, { token });
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  /**
   * Validation lives in the review app — it is the thing that has to be right,
   * and a copy here would eventually disagree with it. Note that apiKey and
   * model are absent: the platform key and the fixed model are not a customer's
   * to change, and the API ignores them even if sent.
   */
  async function save(
    _prev: BusinessState,
    formData: FormData
  ): Promise<BusinessState> {
    "use server";

    const current = await sessionToken();
    if (!current) return { error: "Your session expired. Sign in again." };

    const text = (key: string) => String(formData.get(key) ?? "").trim();

    try {
      const result = await call<{ warning?: string }>(`/businesses/${slug}`, {
        method: "PATCH",
        token: current,
        body: {
          name: text("name"),
          googleUrl: text("googleUrl"),
          tripadvisorUrl: text("tripadvisorUrl"),
          facebookUrl: text("facebookUrl"),
          wongnaiUrl: text("wongnaiUrl"),
          websiteUrl: text("websiteUrl"),
          // One field carrying a list, because a cleared checkbox posts
          // nothing — four named boxes would make "unticked" and "not on the
          // form at all" the same value, which is the distinction this whole
          // field exists to record. The review app drops ids it does not know.
          platformsOff: text("platformsOff")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
          // Blanks dropped. Labels, descriptions and locks arrive as three
          // same-length lists, one field each per row, so they zip by index —
          // which is why the lock is a hidden input rather than a checkbox: an
          // unchecked checkbox sends nothing, and one gap would hand every row
          // below it somebody else's lock. A row with no label is one the
          // person emptied and the server drops it; an empty list is a business
          // with no topics rather than one inheriting anybody else's.
          categories: formData
            .getAll("catLabel")
            .map((value, index) => ({
              label: String(value).trim(),
              focus: String(formData.getAll("catFocus")[index] ?? "").trim(),
              locked: Boolean(formData.getAll("catLocked")[index]),
            }))
            .filter((cat) => cat.label),
          // A form cannot post an object, so the four colours arrive as four
          // fields and are put back together here. The review app validates the
          // hex values and refuses a pair too close to tell apart.
          theme: {
            ground: text("theme-ground"),
            paper: text("theme-paper"),
            accent: text("theme-accent"),
            highlight: text("theme-highlight"),
            display: text("theme-display"),
            ui: text("theme-ui"),
            // Already a stored data URI when it is anything at all — the review
            // app downloaded and checked it during drafting and refuses
            // anything else here, so this cannot become a link to elsewhere.
            logo: text("theme-logo"),
            // Print the name under the mark as well. A hidden field rather
            // than a checkbox name, because an unchecked checkbox posts
            // nothing at all and "nothing" already means "no logo, show the
            // name" further down — two different absences on one save.
            showName: text("theme-show-name") === "1",
          },
          // The grabbed font files. Absent means "leave what is stored alone",
          // an empty string means "drop it", and a JSON body is a new file the
          // review app has already downloaded and checked. Parsed here so a
          // mangled value is dropped rather than sent on as a string.
          ...font("fontDisplay", formData),
          ...font("fontUi", formData),
          // The hero photograph, on the same three-state contract.
          ...font("background", formData),
        },
      });

      revalidatePath(localizedPath(locale, `/dashboard/${slug}`));
      revalidatePath(localizedPath(locale, "/dashboard"));

      return { ok: true, warning: result?.warning };
    } catch (err) {
      return {
        error:
          err instanceof Error ? err.message : "Could not save the settings.",
      };
    }
  }

  /**
   * Writes one topic's description, leaving the other forty-nine alone.
   *
   * `hint` is whatever is already in that row's box — a keyword, a fragment, a
   * note to self. It is passed through because it is the strongest signal there
   * is about what the owner wants said, and losing it would make the button a
   * worse option than typing.
   */
  async function describeTopic(
    label: string,
    hint: string
  ): Promise<{ description?: string; error?: string }> {
    "use server";

    const current = await sessionToken();
    if (!current) return { error: "Sign in again." };

    try {
      return await call<{ description: string }>(
        `/businesses/${slug}/topics/describe`,
        { method: "POST", token: current, body: { label, hint } }
      );
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not write it.",
      };
    }
  }

    /** Proposes the topics. Fills the editor only — Save still stores them. */
  async function suggest(): Promise<{
    categories?: Suggestion[];
    error?: string;
  }> {
    "use server";

    const current = await sessionToken();
    if (!current) return { error: "Sign in again." };

    try {
      return await call<{ categories: Suggestion[] }>(
        `/businesses/${slug}/topics/suggest`,
        { method: "POST", token: current }
      );
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not read it.",
      };
    }
  }

    /**
   * The rulebook: everything the writer is told about this business.
   *
   * Returned as text rather than streamed as a file, because a server action
   * cannot set a Content-Disposition header — the client makes the download out
   * of what comes back. Temporary, and the document says so itself.
   */
  async function rulebook(): Promise<{ markdown?: string; error?: string }> {
    "use server";

    const current = await sessionToken();
    if (!current) return { error: "Sign in again." };

    try {
      return {
        markdown: await callText(`/businesses/${slug}/rulebook`, { token: current }),
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not build it.",
      };
    }
  }

  /**
   * Picks four colours off the website. Fills the swatches; saves nothing.
   *
   * `note` is what the owner asked for in their own words, and it is optional.
   * Reading a site measures what it is painted with, which is not always what
   * the business wants to be seen in — the review app's themenote.js has the
   * long version, and is what checks and enforces it.
   *
   * `adjust` asks to change the colours that are already there and read
   * nothing: seconds instead of a minute, and a result where only the colour
   * somebody mentioned has moved. It needs a note and an existing palette,
   * and the review app refuses it without either.
   */
  async function draftTheme(note?: string, adjust = false): Promise<ThemeDraft> {
    "use server";

    const current = await sessionToken();
    if (!current) return { error: "Sign in again." };

    try {
      return await call<ThemeDraft>(`/businesses/${slug}/theme/draft`, {
        method: "POST",
        token: current,
        body: { note: note ?? "", adjust },
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not read it.",
      };
    }
  }

  /**
   * A logo or a background the customer points at themselves.
   *
   * Reading the site finds these when they are findable, and often they are
   * not — a logo set as a stylesheet background, a hero behind a slideshow, a
   * site that will not be read at all. Without this the draft said "no logo
   * found" and that was the end of it.
   *
   * The review app does the fetching, because the checks that make it safe to
   * fetch an address somebody typed already live there: https only, the host
   * resolved and private addresses refused, a byte cap and a type check.
   */
  async function fetchThemeImage(
    kind: "logo" | "background",
    url: string
  ): Promise<{ image?: FetchedImage; error?: string }> {
    "use server";

    const current = await sessionToken();
    if (!current) return { error: "Sign in again." };

    try {
      const image = await call<FetchedImage>(`/businesses/${slug}/theme/image`, {
        method: "POST",
        token: current,
        body: { kind, url },
      });
      return { image };
    } catch (err) {
      // The review app's own words: every refusal it gives is something the
      // customer can act on — a different file, a smaller one, a real address.
      return {
        error: err instanceof Error ? err.message : "That image could not be used.",
      };
    }
  }

  /**
   * What four colours actually become once the contrast checks have run.
   *
   * Server-side so the derivation has exactly one implementation — the review
   * app's theme.js, which is also what serves the guest page. No model call, so
   * it is cheap enough to ask on every change to a swatch.
   */
  async function previewTheme(
    theme: Palette,
    background = false
  ): Promise<{ derived?: Derived; adjusted?: string[] }> {
    "use server";

    const current = await sessionToken();
    if (!current) return {};

    try {
      return await call<{ derived: Derived; adjusted: string[] }>(
        `/businesses/${slug}/theme/preview`,
        { method: "POST", token: current, body: { theme, background } }
      );
    } catch {
      // A bad intermediate value while someone is typing a hex code is normal,
      // not an error worth showing. The preview simply keeps its last good one.
      return {};
    }
  }

  /**
   * Deletes it. The typed confirmation lives in the component; this is the call
   * that cannot be taken back, so it does nothing clever — the API cascades the
   * review history and frees the address.
   */
  async function destroy(): Promise<{ error?: string }> {
    "use server";

    const current = await sessionToken();
    if (!current) return { error: "Your session expired. Sign in again." };

    try {
      await call(`/businesses/${slug}`, { method: "DELETE", token: current });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not delete it.",
      };
    }

    revalidatePath(localizedPath(locale, "/dashboard"));

    // Outside the try: redirect works by throwing, and there is no page left to
    // return to anyway.
    redirect(localizedPath(locale, "/dashboard"));
  }

  return (
    <>
      <PageHeader tour="settings"
        title="Settings"
        sub={data.business.name}
        back={localizedPath(lang, `/dashboard/${slug}`)}
      />
      <div className="page-body">
        <p className="lede">
          Your business details, the review sites guests are sent to, what reviews talk about, and
          your colours.
        </p>

        {/* Deleting is passed in rather than rendered after: it lives on the
            General tab, which only the form knows which one is showing. */}
        <SettingsForm
          action={save}
          suggest={suggest}
          describeTopic={describeTopic}
          draftTheme={draftTheme}
          rulebook={rulebook}
          previewTheme={previewTheme}
          fetchThemeImage={fetchThemeImage}
          name={data.business.name}
          settings={data.settings}
        >
          {/* Only the owner deletes a business; it is shared with the rest. */}
          {data.access.role === "owner" ? <DeleteBusiness slug={slug} destroy={destroy} /> : null}
        </SettingsForm>
      </div>
    </>
  );
}
