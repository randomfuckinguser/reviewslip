import { callText, sessionToken } from "@/lib/customer";

/**
 * The TM30 file, proxied.
 *
 * The browser cannot ask the review app for this directly: it lives on
 * loopback, and the session is an httpOnly cookie that only the server can
 * read. So the download comes from here, with the token attached on this side.
 *
 * This is the only response the product serves that contains passport numbers.
 * `no-store` because a browser cache or a corporate proxy holding a copy of
 * that file is exactly the thing the encryption in the database is there to
 * prevent — it would be a plaintext copy sitting somewhere nobody is thinking
 * about.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = await sessionToken();
  if (!token) {
    return new Response("Sign in first.", { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response("Give a from and to date.", { status: 400 });
  }

  try {
    const csv = await callText(
      `/businesses/${encodeURIComponent(slug)}/tm30.csv?from=${from}&to=${to}`,
      { token }
    );

    /*
     * Put the byte-order mark back.
     *
     * tm30.js writes one, and it does not survive this hop: callText decodes
     * the response into a string, and decoding UTF-8 consumes the BOM. Re-
     * encoding here produces a file that starts with "Family name" and no mark
     * — which Excel then reads as its own local codepage, turning every Thai
     * and accented name into mojibake.
     *
     * Caught by reading the bytes off the response rather than the text, which
     * also strips it. The unit test on the generator passes either way, so this
     * is the only place the loss is visible.
     */
    const withBom = csv.charCodeAt(0) === 0xfeff ? csv : '﻿' + csv;

    return new Response(withBom, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Content-Disposition": `attachment; filename="tm30-${slug}-${from}.csv"`,
      },
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return new Response(
      err instanceof Error ? err.message : "Could not build the file.",
      { status }
    );
  }
}
