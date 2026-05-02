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
  const results = await Promise.all(targets.map((s) => syncShopOrders(s, { force })));

  const totalAdded = results.reduce((s, r) => s + r.added, 0);
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);

  return NextResponse.json({
    ok: true,
    mode: shop === ALL_SHOPS ? "all" : "single",
    durationMs: Date.now() - start,
    totalAdded,
    totalUpdated,
    results,
  });
}
