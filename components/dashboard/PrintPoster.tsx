"use client";

/**
 * Hands the page to the browser's print dialog, where "Save as PDF" is.
 *
 * The PDF is produced by the browser rather than assembled here, because the
 * poster carries the business's own name — and a name in Thai, Chinese or Korean
 * needs real font shaping to come out right. The browser already has the fonts
 * and the shaper; a PDF written by hand would need both embedded, and would
 * quietly print boxes for most of this customer base if it got them wrong.
 */
export default function PrintPoster() {
  return (
    <button type="button" className="btn btn-go" onClick={() => window.print()}>
      Download PDF
    </button>
  );
}
