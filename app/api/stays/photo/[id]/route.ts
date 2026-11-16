import { REVIEW_API } from "@/lib/customer";

/**
 * A listed venue's photo, for the marketplace pages.
 *
 * Proxied because the review app listens on loopback and a guest's browser
 * cannot reach it. A photo id names its bytes for ever — photos are added and
 * removed, never edited — so it is cached as immutable.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) return new Response(null, { status: 404 });

  let res: Response;
  try {
    res = await fetch(`${REVIEW_API}/api/market/photos/${id}`, { cache: "no-store" });
  } catch {
    return new Response(null, { status: 503 });
  }
  if (!res.ok) return new Response(null, { status: res.status === 404 ? 404 : 502 });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
