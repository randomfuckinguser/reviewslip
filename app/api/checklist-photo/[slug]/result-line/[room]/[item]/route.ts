import { proxyPhoto } from "@/lib/photoProxy";

/**
 * A housekeeper's photograph of one line — the towels, the bath plug — taken
 * as its tick, proxied for the Rooms page. `?date=YYYY-MM-DD` picks the day.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; room: string; item: string }> }
) {
  const { slug, room, item } = await params;
  const date = new URL(request.url).searchParams.get("date") ?? "";

  if (!/^\d+$/.test(room) || !/^\d+$/.test(item) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response("No such photo.", { status: 404 });
  }

  return proxyPhoto(
    `/businesses/${encodeURIComponent(slug)}/checklist/results/${room}/items/${item}/photo?date=${date}`
  );
}
