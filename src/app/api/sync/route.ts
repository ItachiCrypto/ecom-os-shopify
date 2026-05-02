import { NextRequest, NextResponse } from "next/server";
import { listActiveShops, getOrdersSnapshot } from "@/lib/storage";
import { SHOP_COOKIE, ALL_SHOPS } from "@/lib/config";
import { syncShopOrders } from "@/lib/sync";

// Initial sync of 2500 orders × 2 shops easily exceeds the default 10s
// serverless timeout. Cap is 60s on Hobby, 300s on Pro.
export const maxDuration = 60;

/**
 * GET → status: lastSyncedAt per shop, totalOrders.
 * POST → trigger sync for active shop (or all shops in __all__ mode).
 *        Body: `{ force?: boolean }` to bypass the snapshot and re-fetch from scratch.
 */

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const targets = shop === ALL_SHOPS ? await listActiveShops() : [shop];
  const status = await Promise.all(
    targets.map(async (s) => {
      const snap = await getOrdersSnapshot(s);
      return {
        shop: s,
        lastSyncedAt: snap?.lastSyncedAt || null,
        totalOrders: snap?.totalOrders || 0,
        hasSnapshot: snap !== null,
      };
    })
  );
  // Combined lastSyncedAt = earliest across shops (safest "we're up to date until X" claim)
  const earliest = status.reduce<string | null>((acc, s) => {
    if (!s.lastSyncedAt) return acc;
    if (!acc) return s.lastSyncedAt;
    return s.lastSyncedAt < acc ? s.lastSyncedAt : acc;
  }, null);

  return NextResponse.json({
    mode: shop === ALL_SHOPS ? "all" : "single",
    lastSyncedAt: earliest,
    shops: status,
  });
}

export async function POST(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let force = false;
  try {
    const body = await request.json();
    force = body?.force === true;
  } catch {
    // empty body — that's fine
  }

  const targets = shop === ALL_SHOPS ? await listActiveShops() : [shop];
  const start = Date.now();

  // Run shops sequentially so a failure in one shop is reported clearly,
  // and so we don't overrun Shopify's rate limit when both stores have
  // hundreds of orders to fetch in parallel.
  const results: Array<Awaited<ReturnType<typeof syncShopOrders>> | { shop: string; error: string }> = [];
  for (const s of targets) {
    try {
      const r = await syncShopOrders(s, { force });
      results.push(r);
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error(`[sync] ${s} failed:`, e);
      results.push({ shop: s, error: msg });
    }
  }

  const successes = results.filter((r): r is Awaited<ReturnType<typeof syncShopOrders>> => !("error" in r));
  const failures = results.filter((r): r is { shop: string; error: string } => "error" in r);

  const totalAdded = successes.reduce((s, r) => s + r.added, 0);
  const totalUpdated = successes.reduce((s, r) => s + r.updated, 0);

  return NextResponse.json(
    {
      ok: failures.length === 0,
      mode: shop === ALL_SHOPS ? "all" : "single",
      durationMs: Date.now() - start,
      totalAdded,
      totalUpdated,
      results,
      failures,
    },
    { status: failures.length === 0 ? 200 : 207 } // 207 Multi-Status if partial failure
  );
}
