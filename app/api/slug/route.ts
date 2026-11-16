import { call, sessionToken } from "@/lib/customer";

/**
 * Address availability, for the picker to call as someone types.
 *
 * This exists because the session token is in an httpOnly cookie the browser
 * cannot read, so the check cannot go straight to the review app from the
 * client. The handler reads the cookie server-side and forwards it.
 */
export async function GET(request: Request) {
  const token = await sessionToken();
  if (!token) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  if (!slug) {
    return Response.json({ slug: "", valid: false, available: false });
  }

  try {
    const result = await call<unknown>(`/slug/${encodeURIComponent(slug)}`, {
      token,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Check failed." },
      { status: (err as { status?: number }).status ?? 500 }
    );
  }
}
