import { proxyPhoto } from "@/lib/photoProxy";

/**
 * A housekeeper's photograph of an area as they left it, proxied: the result
 * the owner looks at on the Rooms page. `?date=YYYY-MM-DD` picks the day.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; room: string; area: string }> }
) {
  const { slug, room, area } = await params;
  const date = new URL(request.url).searchParams.get("date") ?? "";

  if (!/^\d+$/.test(room) || !/^\d+$/.test(area) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response("No such photo.", { status: 404 });
  }

  return proxyPhoto(
    `/businesses/${encodeURIComponent(slug)}/checklist/results/${room}/${area}/photo?date=${date}`
  );
}
