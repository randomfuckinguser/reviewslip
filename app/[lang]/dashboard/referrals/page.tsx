import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import InviteForm, { type InviteState } from "@/components/dashboard/InviteForm";
import ReferralList from "@/components/dashboard/ReferralList";
import { call, currentUser, sessionToken, type Referrals } from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refer a business",
  robots: { index: false, follow: false },
};

/**
 * The referrals page.
 *
 * Worth being straight about what this does and does not do, because the copy
 * on it makes a promise. It counts invitations that turned into accounts, and
 * at five it says the account has earned 20% off. It does not apply a discount
 * — there is no payment step in the product yet, so there is nothing to apply
 * one to. Honouring it is a manual act until that changes.
 */
export default async function ReferralsPage({
  params,
}: PageProps<"/[lang]/dashboard/referrals">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  // The isLocale narrowing does not survive into a server action's closure, so
  // the narrowed value is captured once, here.
  const locale: Locale = lang;

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  const token = await sessionToken();
  const data = await call<Referrals>("/referrals", { token });
  const { referrals, progress } = data;

  // Absent means an older review app, which certainly could not send.
  const canEmail = data.mail?.enabled ?? false;

  const here = localizedPath(locale, "/dashboard/referrals");

  /**
   * Returns the refusal rather than swallowing it.
   *
   * The review app owns the rules and its messages are the accurate ones — a
   * malformed address, your own, one already invited, one that already belongs
   * to a customer. Every one of those used to be logged and dropped, which on
   * screen was indistinguishable from the button doing nothing.
   */
  async function invite(
    _prev: InviteState,
    formData: FormData
  ): Promise<InviteState> {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    const email = String(formData.get("email") ?? "").trim();
    if (!email) return { error: "Enter an email address." };

    try {
      await call("/referrals", { method: "POST", body: { email }, token: t });
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? err.message
            : "Could not create the invitation.",
        // Returned so the box can be refilled — see InviteForm.
        email,
      };
    }

    revalidatePath(here);
    return { ok: true };
  }

  async function revoke(formData: FormData) {
    "use server";

    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));

    const id = Number(formData.get("id"));
    if (!Number.isSafeInteger(id) || id <= 0) return;

    try {
      await call(`/referrals/${id}`, { method: "DELETE", token: t });
    } catch (err) {
      console.error("Withdraw failed:", err);
    }

    revalidatePath(here);
  }

  const signupUrl = `${SITE_URL}${localizedPath(locale, "/signup")}`;

  return (
    <>
      <PageHeader
        title="Refer a Business"
        sub={`${progress.qualified} of ${progress.needed} joined`}
        back={localizedPath(lang, "/dashboard")}
      />
      <div className="page-body cols">
        <p className="lede" style={{ marginBottom: "1rem" }}>
          Invite {progress.needed} businesses. When they have signed up and
          signed in, you get {progress.worth}% off your plan.
        </p>

        {/* ---------------------------------------------------- the progress */}

        <section className="container" aria-label="Progress" style={{ marginBottom: "1.25rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "1rem",
            }}
          >
            <strong style={{ fontSize: "1.6rem", fontVariantNumeric: "tabular-nums" }}>
              {progress.qualified} of {progress.needed}
            </strong>
            <span
              style={{
                fontSize: "0.9rem",
                color: progress.earned ? "var(--success)" : "var(--ink-soft)",
              }}
            >
              {progress.earned
                ? `You have earned ${progress.percent}% off`
                : `${progress.remaining} to go`}
            </span>
          </div>

          {/* Five segments rather than a bar, because the offer is counted in
              whole people and a part-filled fifth would suggest otherwise. */}
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {Array.from({ length: progress.needed }, (_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 999,
                  background:
                    i < progress.qualified
                      ? "var(--primary)"
                      : progress.earned
                        ? "color-mix(in srgb, var(--cream) 15%, transparent)"
                        : "color-mix(in srgb, var(--ink) 12%, transparent)",
                }}
              />
            ))}
          </div>

          {progress.earned ? (
            <div style={{ marginTop: "1.2rem" }}>
              <p style={{ margin: "0 0 0.9rem", fontSize: "0.9rem" }}>
                Get in touch and we will put it on your account.
              </p>
              {/* A button, not the inline link this was. The site's anchors
                  inherit the body colour with no underline and no weight
                  change, so on this card the only thing to do about an earned
                  discount was indistinguishable from the sentence around it. */}
              <Link className="btn btn-quiet" href={localizedPath(lang, "/contact")}>
                Claim It
              </Link>
            </div>
          ) : null}
        </section>

        {/* ------------------------------------------------------ the invite */}

        <section className="container" aria-labelledby="invite-h" style={{ marginBottom: "1.25rem" }}>
          <div className="container-head" style={{ marginBottom: "0.25rem" }}>
            <h2 id="invite-h">Invite Someone</h2>
          </div>
          <InviteForm action={invite} canEmail={canEmail} />
        </section>

        {/* -------------------------------------------------------- the list */}

        <section className="container wide" aria-labelledby="list-h">
          <div className="container-head" style={{ marginBottom: "0.25rem" }}>
            <h2 id="list-h">
              Your Invitations{" "}
              <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>({referrals.length})</span>
            </h2>
          </div>
          <ReferralList
            referrals={referrals}
            signupUrl={signupUrl}
            revoke={revoke}
          />
        </section>
      </div>
    </>
  );
}
