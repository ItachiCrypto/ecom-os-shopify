import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/shopify";
import { listActiveShops } from "@/lib/storage";
import { SHOP_COOKIE, ALL_SHOPS } from "@/lib/config";
import { jsonSWR } from "@/lib/http";

// Per-shop cache (Map, not a single global slot — concurrent requests on
// different shops were stomping each other's entries before).
const productCache = new Map<string, { data: unknown; expires: number }>();
const TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // ?all=true forces aggregation across every installed shop, even when the
  // active cookie is a single shop. Used by Paramètres so the COGS / bundles
  // editor can see SKUs from every store.
  const url = new URL(request.url);
  const forceAll = url.searchParams.get("all") === "true";
  const effectiveShop = forceAll ? ALL_SHOPS : shop;

  const hit = productCache.get(effectiveShop);
  if (hit && hit.expires > Date.now()) {
    return jsonSWR({ products: hit.data, cached: true }, { maxAge: 60, swr: 600 });
  }

  // ALL mode — merge products from every installed shop (each tagged with _shop)
  if (effectiveShop === ALL_SHOPS) {
    try {
      const installed = await listActiveShops();
      const perShop = await Promise.all(
        installed.map(async (s) => {
          try {
            const list = await getProducts(s, 250);
            return (list as unknown[]).map((p) => ({ ...(p as object), _shop: s }));
          } catch {
            return [];
          }
        })
      );
      const merged = perShop.flat();
      productCache.set(effectiveShop, { data: merged, expires: Date.now() + TTL });
      return jsonSWR({ products: merged, mode: "all" }, { maxAge: 60, swr: 600 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    const products = await getProducts(shop, 250);
    productCache.set(effectiveShop, { data: products, expires: Date.now() + TTL });
    return jsonSWR({ products }, { maxAge: 60, swr: 600 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
