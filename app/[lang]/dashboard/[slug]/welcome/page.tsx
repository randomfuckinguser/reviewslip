import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";

import PageHeader from "@/components/app-shell/PageHeader";
import WelcomeLinks from "@/components/dashboard/WelcomeLinks";
import WelcomeSignups from "@/components/dashboard/WelcomeSignups";
import {
  call,
  currentUser,
  sessionToken,
  venueName,
  type WelcomeData,
  type WelcomeLink,
} from "@/lib/customer";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";
import { qrCode } from "@/lib/qr";

export const metadata: Metadata = {
  title: "Guest App",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The guest app, from the venue's side.
 *
 * The app is the welcome page a guest puts on their phone: the venue's links
 * as tiles, in the venue's colours, under its name. Three things here: the QR
 * code and printed card that open it, the links a guest sees once they have
 * signed up, and the guests who did — with the mailing list of the ones who
 * agreed to be emailed.
 */
export default async function WelcomePage({
  params,
}: PageProps<"/[lang]/dashboard/[slug]/welcome">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));

  const token = await sessionToken();
  let data: WelcomeData;
  try {
    data = await call<WelcomeData>(`/businesses/${slug}/welcome`, { token });
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  const here = localizedPath(locale, `/dashboard/${slug}/welcome`);

  async function saveLinks(links: WelcomeLink[]) {
    "use server";
    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));
    try {
      const saved = await call<{ links: WelcomeLink[] }>(`/businesses/${slug}/welcome/links`, {
        method: "PUT",
        body: { links },
        token: t,
      });
      revalidatePath(here);
      return { links: saved.links };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not save the links." };
    }
  }

  async function removeSignup(id: number) {
    "use server";
    const t = await sessionToken();
    if (!t) redirect(localizedPath(locale, "/login"));
    try {
      await call(`/businesses/${slug}/welcome/signups/${id}`, { method: "DELETE", token: t });
      revalidatePath(here);
      return {};
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not delete that guest." };
    }
  }

  /*
   * The code, twice: drawn on the page, and as a file to download and send to
   * a printer. Black on white whatever the dashboard's theme — a code is read
   * by a camera, and an inverted one fails on half the phones that try it.
   */
  const code = qrCode(data.url);
  const side = code.count + 8;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${side} ${side}" width="1024" height="1024" shape-rendering="crispEdges"><rect x="-4" y="-4" width="${side}" height="${side}" fill="#fff"/><path d="${code.path}" fill="#000"/></svg>`;
  const download = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const venue = await venueName(slug);
  const agreed = data.signups.filter((s) => s.consent).length;

  return (
    <>
      <PageHeader tour="guest-app"
        title="Guest App"
        sub={`${venue} · ${data.signups.length} guest${data.signups.length === 1 ? "" : "s"} signed up · ${agreed} on the mailing list`}
        back={localizedPath(locale, `/dashboard/${slug}`)}
      >
        <a className="btn btn-quiet" href={data.url} target="_blank" rel="noreferrer">
          <ExternalLink size={15} aria-hidden="true" />
          Open Guest App
        </a>
      </PageHeader>

      {/* is-side: the code is a small card beside the links, not half the row
          stretched to the links' height. */}
      <div className="page-body cols is-side">
        <p className="lede">
          Your own app for guests, in your colours. They scan the code, give their name and email,
          and get your links as tiles — then put the app on their phone&apos;s home screen. No app
          store.
        </p>

        <section className="group-box" aria-labelledby="qr-title" data-tour="ga-qr">
          <h2 id="qr-title">QR Code</h2>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <svg
              viewBox={`-4 -4 ${side} ${side}`}
              width={140}
              height={140}
              shapeRendering="crispEdges"
              role="img"
              aria-label={`QR code for ${data.url}`}
              style={{ borderRadius: 4, flex: "none" }}
            >
              <rect x={-4} y={-4} width={side} height={side} fill="#fff" />
              <path d={code.path} fill="#000" />
            </svg>
            <div style={{ display: "grid", gap: "0.5rem", minWidth: 0 }}>
              <p style={{ margin: 0 }}>
                Print the welcome card for rooms and reception, or use the code on its own. It opens{" "}
                <a href={data.url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>
                  {data.url}
                </a>
                .
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <a className="btn btn-quiet" href={localizedPath(locale, `/dashboard/${slug}/poster?card=welcome`)}>
                  Print Welcome Card
                </a>
                <a className="btn btn-quiet" href={download} download={`welcome-qr-${slug}.svg`}>
                  Download QR Code
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="group-box" aria-labelledby="links-title" data-tour="ga-links">
          <h2 id="links-title">Links</h2>
          <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
            Tiles guests see after they sign up, in this order. An address can be a web page,
            tel:+66… or mailto:…, and each tile&apos;s picture comes from its label and address.
          </p>
          <WelcomeLinks
            initial={data.links}
            max={data.limits.links}
            maxLabel={data.limits.label}
            save={saveLinks}
          />
        </section>

        <section className="group-box wide" aria-labelledby="guests-title" data-tour="ga-guests">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
            <h2 id="guests-title">Guests</h2>
            {/* Only the guests who ticked the box. Everyone else gave an
                address to see the links, which is not agreeing to be emailed. */}
            <a className="btn btn-quiet" href={`/api/welcome/${encodeURIComponent(slug)}`}>
              Download Mailing List
            </a>
          </div>
          <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
            The mailing list holds only the {agreed} guest{agreed === 1 ? "" : "s"} who agreed to
            emails. Import it into your newsletter tool. If a guest asks you to delete their details,
            delete them here.
          </p>
          <WelcomeSignups initial={data.signups} remove={removeSignup} />
        </section>
      </div>
    </>
  );
}
