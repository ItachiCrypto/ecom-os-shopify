import { NextRequest, NextResponse } from "next/server";
import { listActiveShops, getShopData } from "@/lib/storage";
import { getShopInfo } from "@/lib/shopify";
import { SHOP_COOKIE, ALL_SHOPS } from "@/lib/config";

export async function GET(request: NextRequest) {
  const activeShop = request.cookies.get(SHOP_COOKIE)?.value;
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

  return NextResponse.json({ shops: withAll, activeShop });
}
