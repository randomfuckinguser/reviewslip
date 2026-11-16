import Link from "next/link";
import { ArrowLeft, CircleHelp } from "lucide-react";

import TourButton from "@/components/help/TourButton";
import { SITE_URL } from "@/lib/site";

/**
 * The header every screen in the app gets (app standards, Page header).
 *
 * Back, then two title lines — always two, so the header is the same 56px on
 * every screen and moving between them never shifts the page. The second line
 * says what the screen is showing: the venue on a dashboard, a summary of the
 * record on an Edit View.
 *
 * `children` is the action toolbar on the right. A screen puts at most one
 * filled button there. Help is always the last button on the right; it opens
 * the guide on the public site, which the staff host does not serve itself.
 */
export default function PageHeader({
  title,
  sub,
  back,
  tour,
  children,
}: {
  title: string;
  /** The second line. Required: a blank one would collapse the header's height. */
  sub: string;
  /** Where Back goes. A List View's Back goes to the dashboard above it. */
  back?: string;
  /** This screen's tour (components/help/tours.ts): adds Take the Tour. */
  tour?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      {back ? (
        <Link href={back} className="icon-btn" aria-label="Back" title="Back">
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
      ) : null}

      <div className="page-title">
        <h1>{title}</h1>
        <span className="page-sub" title={sub}>
          {sub}
        </span>
      </div>

      <div className="page-actions">
        {children}
        {tour ? <TourButton tour={tour} /> : null}
        <a
          className="icon-btn page-help"
          href={`${SITE_URL}/faq`}
          target="_blank"
          rel="noopener"
          aria-label="Help (opens in a new tab)"
          data-tip="Help"
        >
          <CircleHelp size={16} aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}
