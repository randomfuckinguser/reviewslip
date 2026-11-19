import { call, sessionToken } from "@/lib/customer";

/**
 * Customers matching what is being typed into the booking form's guest
 * fields: a returning guest's name, email or phone, so the desk can pick them
 * rather than type them in again.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const result = await call<{ customers: unknown[] }>(
      `/businesses/${encodeURIComponent(slug)}/customers?q=${encodeURIComponent(q)}&limit=6`,
      { token }
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not search customers." },
      { status }
    );
  }
}
