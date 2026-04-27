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
  const { maxAge = 30, swr = 300, status = 200 } = options;
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": `private, max-age=${maxAge}, stale-while-revalidate=${swr}`,
      // Critical: every cached endpoint depends on the active-shop cookie.
      // Without `Vary: Cookie`, the browser would happily serve a previous
      // shop's response after the user switches shops (same URL).
      Vary: "Cookie",
    },
  });
}
