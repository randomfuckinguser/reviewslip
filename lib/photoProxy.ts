import { callFile, sessionToken } from "@/lib/customer";

/**
 * A photograph the review app serves behind the dashboard's session, passed
 * through to the browser.
 *
 * The browser cannot ask the review app directly: it lives on loopback, and
 * the session is an httpOnly cookie only this server can read. So the bytes
 * come from here with the token attached on this side.
 *
 * The review app sets the headers that matter — nosniff, a locked-down CSP,
 * `private` — because several routes serve these bytes and the headers are
 * the part that must not drift. They are copied across rather than re-stated.
 */
const COPIED = [
  "content-type",
  "content-length",
  "cache-control",
  "x-content-type-options",
  "content-security-policy",
  "content-disposition",
];

/** @param path - under /api/customer, already checked and encoded */
export async function proxyPhoto(path: string): Promise<Response> {
  const token = await sessionToken();
  if (!token) return new Response("Sign in first.", { status: 401 });

  let upstream: Response;
  try {
    upstream = await callFile(path, { token });
  } catch {
    return new Response("Could not reach the service.", { status: 503 });
  }

  if (!upstream.ok) {
    return new Response("No such photo.", { status: upstream.status });
  }

  const headers = new Headers();
  for (const name of COPIED) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, { headers });
}
