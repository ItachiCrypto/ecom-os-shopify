import { NextResponse } from "next/server";

/**
 * JSON response with browser-side stale-while-revalidate caching.
 * `private` because the payload depends on the user's active-shop cookie —
 * never cache it on shared CDN tiers.
 */
export function jsonSWR<T>(
  payload: T,
  options: { maxAge?: number; swr?: number; status?: number } = {}
): NextResponse {
  const { maxAge = 0, swr = 60, status = 200 } = options;
  return NextResponse.json(payload, {
    status,
    headers: {
      // max-age=0 + must-revalidate forces the browser to revalidate every
      // request; SWR allows serving stale during the revalidation. This
      // avoids minutes-long stale windows after a save while still cheap
      // for typical navigation.
      "Cache-Control": `private, max-age=${maxAge}, must-revalidate, stale-while-revalidate=${swr}`,
      // Critical: every cached endpoint depends on the active-shop cookie.
      // Without `Vary: Cookie`, the browser would happily serve a previous
      // shop's response after the user switches shops (same URL).
      Vary: "Cookie",
    },
  });
}
