import { call, sessionToken } from "@/lib/customer";

/**
 * Whether a stay is paid — not paid, a deposit, paid, refunded — from the
 * booking panel's status bar. Answers with the booking as it now is.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { status?: string };
  try {
    const result = await call<{ booking: unknown }>(
      `/businesses/${encodeURIComponent(slug)}/bookings/${encodeURIComponent(id)}/payment`,
      { method: "POST", body: { status: String(body.status ?? "") }, token }
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not change that." },
      { status }
    );
  }
}
