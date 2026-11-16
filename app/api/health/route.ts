import { REVIEW_API } from "@/lib/customer";

/**
 * Whether the website can do its job: up, and able to reach the review app it
 * gets every account, venue and booking from. For the monitor and any outside
 * uptime checker; says nothing a stranger could use.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const at = Date.now();
  let api = false;
  try {
    const res = await fetch(`${REVIEW_API}/healthz`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    api = res.ok;
  } catch {
    api = false;
  }
  return Response.json(
    { status: api ? "ok" : "down", reviewApp: api, ms: Date.now() - at },
    { status: api ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
