import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";
import { listActiveShops, getOrdersSnapshot } from "@/lib/storage";
import { SHOP_COOKIE, ALL_SHOPS, MASTER_SHOP } from "@/lib/config";
import { convertAmount, getShopCurrency } from "@/lib/currency";
import { jsonSWR } from "@/lib/http";
import { ensureSnapshotExists, syncShopOrders } from "@/lib/sync";

// How long a snapshot can sit before /api/orders triggers a foreground sync.
// Below this threshold we serve the snapshot as-is (fast). Above, we run an
// incremental sync inline so a hard refresh always reflects new sales / refunds.
//
// 30s strikes a balance:
//  - back-to-back navigations (Dashboard → Profit) reuse the snapshot
//  - any F5 after ~30s catches changes made on Shopify side
//  - incremental sync is ~1s, acceptable for an explicit refresh
const SYNC_ON_LOAD_AFTER_MS = 30_000;

// Bigger threshold for the lighter "background" sync — used when serving cached
// snapshot and we just want to opportunistically refresh in the background so
// the next call is fresher.
const BACKGROUND_SYNC_AFTER_MS = 5 * 60_000;

// Allow up to 60s for the first request after install (initial full snapshot)
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated — install app first" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || undefined;
  const all = searchParams.get("all") === "true";
  const first = Number(searchParams.get("first")) || 100;

  // ALL mode — read each shop's snapshot from Blob (instant) and merge.
  if (shop === ALL_SHOPS) {
    try {
      const shops = await listActiveShops();
      const masterCurrency = await getShopCurrency(MASTER_SHOP);
      // Run sync in parallel for all shops so a 2-shop F5 still completes in ~1.5s
      // (one shop's GraphQL doesn't block the other).
      const perShop = await Promise.all(
        shops.map(async (s) => {
          await maybeSyncBeforeServing(s);
          return loadShopOrders(s, masterCurrency);
        })
      );
      const merged = perShop.flat();
      // Sort by createdAt desc
      merged.sort((a, b) => {
        const ac = (a as { createdAt?: string }).createdAt || "";
        const bc = (b as { createdAt?: string }).createdAt || "";
        return bc.localeCompare(ac);
      });
      const lastSyncedAt = await getCombinedLastSyncedAt(shops);
      return jsonSWR(
        {
          orders: merged,
          count: merged.length,
          mode: "all",
          normalizedCurrency: masterCurrency,
          lastSyncedAt,
        },
        // No CDN cache: we already serve from Redis (~100ms) and need fresh
        // data right after a Sync click. Without this the CDN would hide a
        // freshly-synced snapshot for up to 30s.
        { maxAge: 0, swr: 0 }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    if (all) {
      await maybeSyncBeforeServing(shop);
      const snapshot = await ensureSnapshotExists(shop);
      return jsonSWR(
        {
          orders: snapshot.orders,
          count: snapshot.orders.length,
          lastSyncedAt: snapshot.lastSyncedAt,
        },
        // No CDN cache (see ALL mode comment above)
        { maxAge: 0, swr: 0 }
      );
    }
    // Single-page (cursor-paginated, live from Shopify) — used when caller wants pagination
    const { orders, pageInfo } = await getOrders(shop, { first, query });
    return jsonSWR({ orders, pageInfo }, { maxAge: 0, swr: 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/orders]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Run a foreground incremental sync if the snapshot is older than the
 * SYNC_ON_LOAD threshold; trigger a background sync if older than the
 * BACKGROUND threshold; otherwise no-op.
 *
 * `ensureSnapshotExists` is called inside `loadShopOrders`/the single-shop
 * path *after* this so the foreground sync writes its result before we read.
 */
async function maybeSyncBeforeServing(shop: string): Promise<void> {
  const snapshot = await getOrdersSnapshot(shop);
  if (!snapshot) {
    // No snapshot yet — initial sync handled by ensureSnapshotExists later.
    return;
  }
  const ageMs = Date.now() - new Date(snapshot.lastSyncedAt).getTime();
  if (ageMs > SYNC_ON_LOAD_AFTER_MS) {
    // Foreground: caller awaits, fresh data is in Redis before we serve.
    try {
      await syncShopOrders(shop);
    } catch (e) {
      console.error("[orders] foreground sync failed for", shop, e);
    }
  } else if (ageMs > BACKGROUND_SYNC_AFTER_MS) {
    // Background: serve current snapshot now, refresh for next caller.
    syncShopOrders(shop).catch((e) =>
      console.error("[orders] background sync failed for", shop, e)
    );
  }
}

async function loadShopOrders(shop: string, masterCurrency: string): Promise<unknown[]> {
  const snapshot = await ensureSnapshotExists(shop);
  const shopCurrency = await getShopCurrency(shop);
  // Convert money to master currency so the aggregate dashboard sums apples to apples
  const normalized = normalizeOrders(snapshot.orders, shopCurrency, masterCurrency);
  return normalized.map((o) => ({
    ...(o as object),
    _shop: shop,
    _shopCurrency: shopCurrency,
  }));
}

async function getCombinedLastSyncedAt(shops: string[]): Promise<string | null> {
  // Earliest watermark across shops — that's the freshness guarantee for the merged view.
  let earliest: string | null = null;
  for (const s of shops) {
    const snap = await getOrdersSnapshot(s);
    if (!snap) continue;
    if (!earliest || snap.lastSyncedAt < earliest) earliest = snap.lastSyncedAt;
  }
  return earliest;
}

// Recursively walk an arbitrary object/array and rewrite every Shopify Money
// shape (`{amount, currencyCode}`, including those nested under `shopMoney`)
// so its amount is expressed in `to` currency. Returns a deep copy.
function normalizeOrders(orders: unknown[], from: string, to: string): unknown[] {
  if (from === to) return orders;
  const isMoney = (v: unknown): v is { amount: string | number; currencyCode?: string } =>
    !!v &&
    typeof v === "object" &&
    "amount" in (v as Record<string, unknown>) &&
    (typeof (v as Record<string, unknown>).amount === "string" ||
      typeof (v as Record<string, unknown>).amount === "number");

  const convertMoney = (m: { amount: string | number; currencyCode?: string }) => {
    const num = typeof m.amount === "string" ? parseFloat(m.amount) : m.amount;
    const converted = convertAmount(Number.isFinite(num) ? num : 0, from, to);
    return { ...m, amount: converted.toString(), currencyCode: to };
  };

  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (node && typeof node === "object") {
      // Money leaf — `currencyCode` + numeric `amount` and no other meaningful keys
      if (isMoney(node) && "currencyCode" in (node as Record<string, unknown>)) {
        return convertMoney(node);
      }
      const obj = node as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        next[key] = visit(val);
      }
      return next;
    }
    return node;
  };
  return orders.map(visit) as unknown[];
}
