import { NextRequest, NextResponse } from "next/server";
import { listActiveShops, getShopData } from "@/lib/storage";
import { getShopInfo } from "@/lib/shopify";
import { SHOP_COOKIE, ALL_SHOPS } from "@/lib/config";

const SHOPS_CACHE_TTL = 2 * 60_000;
const shopsCache = new Map<string, { body: unknown; expires: number }>();

export async function GET(request: NextRequest) {
  const activeShop = request.cookies.get(SHOP_COOKIE)?.value;
  const cacheKey = `shops:${activeShop || "none"}`;
  const cached = shopsCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.body, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        Vary: "Cookie",
        "X-EcomOS-Cache": "HIT",
      },
    });
  }

  const shops = await listActiveShops();

  // Enrich with display name from Shopify
  const enriched = await Promise.all(
    shops.map(async (shop) => {
      let name = shop.replace(".myshopify.com", "");
      let currencyCode: string | undefined;
      try {
        const data = await getShopData(shop);
        if (!data?.accessToken) return { shop, name, currencyCode, active: shop === activeShop };
        const info = await getShopInfo(shop);
        name = info.name;
        currencyCode = info.currencyCode;
      } catch {
        // Fall back to just the domain
      }
      return { shop, name, currencyCode, active: shop === activeShop };
    })
  );

  // Include "all shops" pseudo-entry if more than 1 shop
  const withAll =
    shops.length > 1
      ? [
          {
            shop: ALL_SHOPS,
            name: "Toutes les boutiques",
            currencyCode: undefined,
            active: activeShop === ALL_SHOPS,
          },
          ...enriched,
        ]
      : enriched;

  const body = { shops: withAll, activeShop };
  shopsCache.set(cacheKey, { body, expires: Date.now() + SHOPS_CACHE_TTL });
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      Vary: "Cookie",
      "X-EcomOS-Cache": "MISS",
    },
  });
}
