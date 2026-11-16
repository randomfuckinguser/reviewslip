import { call, sessionToken } from "@/lib/customer";

/**
 * One booking in full, with its guests.
 *
 * The calendar sends the panel a partial record — a room-night carries the
 * guest name and the dates and nothing else — so the panel paints from that at
 * once and asks here for the email, headcount, notes and what it was quoted.
 *
 * The alternative was to widen the calendar's own payload, which multiplies
 * every one of those fields by the length of every stay on screen: a month of
 * twenty rooms is several hundred room-nights, each carrying a copy of the same
 * booking. One request when somebody actually opens a stay is the cheaper half
 * of that trade by a wide margin.
 *
 * Both calls go together because the panel needs both to be useful, and two
 * round trips in sequence is the delay somebody notices.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });

  const venue = encodeURIComponent(slug);
  const booking = encodeURIComponent(id);

  try {
    const [detail, guests] = await Promise.all([
      call<{ booking: unknown }>(`/businesses/${venue}/bookings/${booking}`, {
        token,
      }),
      // A guest list that will not load must not cost somebody the booking
      // detail — the dates are what they opened this for.
      call<{ guests: unknown[]; canStorePassports: boolean }>(
        `/businesses/${venue}/bookings/${booking}/guests`,
        { token }
      ).catch(() => ({ guests: [], canStorePassports: true })),
    ]);

    return Response.json(
      { ...detail, ...guests },
      // Never cached: per-account data behind a session, and a shared cache
      // holding one property's guests is the kind of leak that is invisible
      // until it is not.
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not load that booking." },
      { status }
    );
  }
}
