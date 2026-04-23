import { NextRequest, NextResponse } from "next/server";
import { listInstalledShops, getShopData } from "@/lib/storage";
import { getShopInfo } from "@/lib/shopify";
import { SHOP_COOKIE } from "@/lib/config";

export async function GET(request: NextRequest) {
  const activeShop = request.cookies.get(SHOP_COOKIE)?.value;
  const shops = await listInstalledShops();

  // Enrich with display name from Shopify (cached via getShopInfo if fast)
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

  return NextResponse.json({ shops: enriched, activeShop });
}
