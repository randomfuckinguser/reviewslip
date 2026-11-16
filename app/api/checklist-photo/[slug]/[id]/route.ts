import { callFile, sessionToken } from "@/lib/customer";

/**
 * A cleaning standard's reference photograph, proxied.
 *
 * The browser cannot ask the review app for this directly: it lives on
 * loopback, and the session is an httpOnly cookie only the server can read.
 * So the bytes come from here with the token attached on this side, the same
 * way the TM30 file does.
 *
 * Streamed rather than inlined into the settings page. A standard runs to two
 * dozen lines and each picture is up to 250kB; putting them in the payload
 * would make opening Settings a six megabyte download, and most of those
 * pictures are never looked at in a given visit.
 *
 * The review app sets the headers that matter — nosniff, a locked-down CSP,
 * `private` — because two routes serve these bytes and the headers are the
 * part that must not drift. They are copied across rather than re-stated.
 */
const COPIED = [
  "content-type",
  "content-length",
  "cache-control",
  "x-content-type-options",
  "content-security-policy",
  "content-disposition",
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;

  // A path segment going into a URL. The review app checks it is a real id of
  // its own besides, but a segment that is not a number has no business being
  // built into a request at all.
  if (!/^\d+$/.test(id)) return new Response("No such item.", { status: 404 });

  const token = await sessionToken();
  if (!token) return new Response("Sign in first.", { status: 401 });

  let upstream: Response;
  try {
    upstream = await callFile(
      `/businesses/${encodeURIComponent(slug)}/checklist/${id}/photo`,
      { token }
    );
  } catch {
    return new Response("Could not reach the service.", { status: 503 });
  }

  if (!upstream.ok) {
    return new Response("No photo on that item.", { status: upstream.status });
  }

  const headers = new Headers();
  for (const name of COPIED) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, { headers });
}
