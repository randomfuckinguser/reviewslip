import { proxyPhoto } from "@/lib/photoProxy";

/**
 * A cleaning standard line's reference photograph, proxied (lib/photoProxy).
 *
 * Streamed rather than inlined into the Rooms page. A standard runs to two
 * dozen lines and each picture is up to 250kB; putting them in the payload
 * would make opening the page a six megabyte download, and most of those
 * pictures are never looked at in a given visit.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;

  // A path segment going into a URL. The review app checks it is a real id of
  // its own besides, but a segment that is not a number has no business being
  // built into a request at all.
  if (!/^\d+$/.test(id)) return new Response("No such item.", { status: 404 });

  return proxyPhoto(`/businesses/${encodeURIComponent(slug)}/checklist/${id}/photo`);
}
