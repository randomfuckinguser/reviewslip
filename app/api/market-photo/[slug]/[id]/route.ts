import { REVIEW_API, sessionToken } from "@/lib/customer";

/**
 * A venue's marketplace photo for its own dashboard — listed or not, so a
 * venue can see its photos before it switches listing on. Behind the session.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const token = await sessionToken();
  if (!token) return new Response(null, { status: 401 });
  if (!/^\d{1,10}$/.test(id)) return new Response(null, { status: 404 });

  let res: Response;
  try {
    res = await fetch(
      `${REVIEW_API}/api/customer/businesses/${encodeURIComponent(slug)}/market/photos/${id}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
  } catch {
    return new Response(null, { status: 503 });
  }
  if (!res.ok) return new Response(null, { status: res.status });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
