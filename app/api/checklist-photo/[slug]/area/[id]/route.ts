import { proxyPhoto } from "@/lib/photoProxy";

/** An area's picture of how it should be left — Bedroom, Bathroom — proxied. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  if (!/^\d+$/.test(id)) return new Response("No such area.", { status: 404 });

  return proxyPhoto(
    `/businesses/${encodeURIComponent(slug)}/checklist/areas/${id}/photo`
  );
}
