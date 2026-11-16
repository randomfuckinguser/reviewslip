"use client";

/**
 * Prints the card.
 *
 * A client component for one line, because `window.print()` is the browser's
 * own dialog and there is no server-rendered equivalent — and because the
 * button itself must not appear on the paper, which the print stylesheet
 * handles by class.
 */
export default function PrintButton() {
  return (
    <button type="button" className="btn btn-go" onClick={() => window.print()}>
      Print
    </button>
  );
}
