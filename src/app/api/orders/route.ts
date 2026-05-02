import { NextRequest, NextResponse } from "next/server";
import { getOrders } from "@/lib/shopify";
import { listActiveShops, getOrdersSnapshot } from "@/lib/storage";
import { SHOP_COOKIE, ALL_SHOPS, MASTER_SHOP } from "@/lib/config";
import { convertAmount, getShopCurrency } from "@/lib/currency";
import { jsonSWR } from "@/lib/http";
import { ensureSnapshotExists, syncShopOrders } from "@/lib/sync";

// How long a snapshot can sit before /api/orders triggers an automatic sync.
// Manual syncs (Sync button) bypass this. Below the threshold we serve the
// snapshot as-is — no Shopify roundtrip on page load.
const STALE_AFTER_MS = 15 * 60_000; // 15 minutes

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
      const perShop = await Promise.all(shops.map((s) => loadShopOrders(s, masterCurrency)));
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
        { maxAge: 30, swr: 300 }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    if (all) {
      const snapshot = await ensureSnapshotExists(shop);
      // Background sync if stale (don't await — let it run, return current snapshot now)
      if (Date.now() - new Date(snapshot.lastSyncedAt).getTime() > STALE_AFTER_MS) {
        syncShopOrders(shop).catch((e) => console.error("[orders] background sync failed:", e));
      }
      return jsonSWR(
        {
          orders: snapshot.orders,
          count: snapshot.orders.length,
          lastSyncedAt: snapshot.lastSyncedAt,
        },
        { maxAge: 30, swr: 300 }
      );
    }
    // Single-page (cursor-paginated, live from Shopify) — used when caller wants pagination
    const { orders, pageInfo } = await getOrders(shop, { first, query });
    return jsonSWR({ orders, pageInfo }, { maxAge: 30, swr: 300 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/orders]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function loadShopOrders(shop: string, masterCurrency: string): Promise<unknown[]> {
  const snapshot = await ensureSnapshotExists(shop);
  // Background sync if stale — don't block this request
  if (Date.now() - new Date(snapshot.lastSyncedAt).getTime() > STALE_AFTER_MS) {
    syncShopOrders(shop).catch((e) => console.error("[orders] background sync failed:", e));
  }
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
