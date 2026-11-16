import type { NextConfig } from "next";

const REVIEW_API = process.env.REVIEW_API_URL ?? "http://127.0.0.1:3000";

const nextConfig: NextConfig = {
  /**
   * The softphone lives in the review app but answers on this site's address,
   * beside the dashboard, so it shares the dashboard's sign-in. On the server
   * nginx sends /phone/ and /api/voice/ straight to the review app; these
   * rewrites do the same for anything that reaches Next (a local dev server).
   * beforeFiles, so no page of this site can shadow them.
   */
  async rewrites() {
    return {
      beforeFiles: [
        // Next drops a trailing slash before rewriting, and the review app adds
        // it back with a redirect: name each phone's page outright, or the two
        // bounce the browser between them.
        { source: "/phone", destination: `${REVIEW_API}/phone/` },
        { source: "/phone/reviewslip", destination: `${REVIEW_API}/phone/reviewslip/` },
        { source: "/phone/:path*", destination: `${REVIEW_API}/phone/:path*` },
        { source: "/api/voice/:path*", destination: `${REVIEW_API}/api/voice/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
