import { callText, sessionToken } from "@/lib/customer";

/**
 * A venue's welcome-page mailing list, as a CSV download.
 *
 * Through this route rather than linked to the review app directly, because
 * the session lives in an httpOnly cookie on this site and the review app
 * wants it as a bearer.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = await sessionToken();
  if (!token) return new Response("Sign in first.", { status: 401 });

  try {
    const csv = await callText(
      `/businesses/${encodeURIComponent(slug)}/welcome/mailing-list.csv`,
      { token }
    );

    // The byte-order mark does not survive callText's decode — the TM30
    // route says why — and without it Excel misreads Thai names.
    const withBom = csv.charCodeAt(0) === 0xfeff ? csv : "﻿" + csv;

    return new Response(withBom, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Content-Disposition": `attachment; filename="mailing-list-${slug}.csv"`,
      },
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return new Response(err instanceof Error ? err.message : "Could not build the file.", { status });
  }
}
