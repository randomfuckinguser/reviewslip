import { call, sessionToken } from "@/lib/customer";

/**
 * A returning guest's party, carried over from their last stay into this one:
 * the same people and passports, without the old trip's entry date.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });

  try {
    const result = await call<{ copied: number; from: string | null }>(
      `/businesses/${encodeURIComponent(slug)}/bookings/${encodeURIComponent(id)}/guests/copy`,
      { method: "POST", body: {}, token }
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not copy the guests." },
      { status }
    );
  }
}
