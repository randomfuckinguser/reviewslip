import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/app-shell/PageHeader";
import { TOURS } from "@/components/help/tours";
import { currentUser, venueName } from "@/lib/customer";
import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Tutorials",
  robots: { index: false, follow: false },
};

/**
 * Every guided tour, with what it covers and its steps. Start opens the
 * screen the tour begins on and runs it there: the page dims, one part of it
 * lights up, and a card says what to do.
 */
export default async function TutorialsPage({ params }: PageProps<"/[lang]/dashboard/[slug]/tutorials">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  const me = await currentUser();
  if (!me) redirect(localizedPath(lang, "/login"));
  if (!me.businesses.some((b) => b.slug === slug)) notFound();

  const venue = await venueName(slug);
  const base = localizedPath(lang, `/dashboard/${slug}`);

  return (
    <>
      <PageHeader title="Tutorials" sub={`${venue} · ${TOURS.length} tours`} back={base} />
      <div className="page-body cols">
        <p className="lede">
          A short tour of each screen: everything else dims, one part lights up, and a card says what it
          is for. Every screen with a tour also has Take the Tour in its header.
        </p>

        {TOURS.map((tour) => (
          <section key={tour.id} className="container" aria-labelledby={`tour-${tour.id}`}>
            <div className="container-head">
              <div>
                <h2 id={`tour-${tour.id}`}>{tour.title}</h2>
                <p className="container-desc">
                  {tour.summary} {tour.steps.length} steps.
                </p>
              </div>
              <div className="container-actions">
                {tour.screen !== null ? (
                  <Link className="btn btn-quiet" href={`${base}${tour.screen}?tour=${tour.id}`}>
                    Start
                  </Link>
                ) : null}
              </div>
            </div>
            {tour.from ? <p className="container-desc" style={{ margin: "-0.25rem 0 0.5rem" }}>From {tour.from}.</p> : null}
            <ol className="tour-steps">
              {tour.steps.map((step) => (
                <li key={step.id}>{step.title}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
