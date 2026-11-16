import { call, sessionToken } from "@/lib/customer";

/**
 * Guests on one booking, for the panel.
 *
 * A route handler rather than props, because the panel opens one booking at a
 * time out of a screen that may list fifty. Loading every booking's guests to
 * render a calendar would be fifty queries to answer a question nobody asked.
 *
 * The review app never returns a passport number here — only the last four
 * characters. The whole number exists in one response in the product, and it is
 * the file download, not this.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });

  try {
    const data = await call(
      `/businesses/${encodeURIComponent(slug)}/bookings/${encodeURIComponent(id)}/guests`,
      { token }
    );
    // Never cached: it is per-account data behind a session, and a shared cache
    // holding one property's guest list is the kind of leak that is invisible
    // until it is not.
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not load guests." },
      { status }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    const data = await call(
      `/businesses/${encodeURIComponent(slug)}/bookings/${encodeURIComponent(id)}/guests`,
      { method: "POST", body, token }
    );
    return Response.json(data, { status: 201 });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not add that guest." },
      { status }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });

  // The guest's own id, not the booking's — the review app scopes deletion by
  // venue, so the booking is not part of the address.
  const guestId = new URL(request.url).searchParams.get("guestId") ?? "";
  if (!/^\d+$/.test(guestId)) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    await call(`/businesses/${encodeURIComponent(slug)}/guests/${guestId}`, {
      method: "DELETE",
      token,
    });
    return new Response(null, { status: 204 });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not remove that guest." },
      { status }
    );
  }
}

/**
 * Correct one guest.
 *
 * Addressed by `?guestId=` like DELETE, for the same reason: the review app
 * scopes a guest by venue, so the booking in the path is not part of where it
 * lives. Whatever is in the body is forwarded as sent — `tm30Required: null` is
 * a real value here, meaning "go back to deciding from nationality", and
 * dropping it would make that impossible to express.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Sign in first." }, { status: 401 });

  const guestId = new URL(request.url).searchParams.get("guestId") ?? "";
  if (!/^\d+$/.test(guestId)) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    const data = await call(
      `/businesses/${encodeURIComponent(slug)}/guests/${guestId}`,
      { method: "PATCH", body, token }
    );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not save that guest." },
      { status }
    );
  }
}
