import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/shopify";
import { listInstalledShops } from "@/lib/storage";
import { SHOP_COOKIE, ALL_SHOPS } from "@/lib/config";

// Cache products for 5min (they don't change often)
let cached: { data: unknown; expires: number; shop: string } | null = null;
const TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (cached && cached.shop === shop && cached.expires > Date.now()) {
    return NextResponse.json({ products: cached.data, cached: true });
  }

  // ALL mode — merge products from every installed shop (each tagged with _shop)
  if (shop === ALL_SHOPS) {
    try {
      const installed = await listInstalledShops();
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
      cached = { data: merged, expires: Date.now() + TTL, shop };
      return NextResponse.json({ products: merged, mode: "all" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    const products = await getProducts(shop, 250);
    cached = { data: products, expires: Date.now() + TTL, shop };
    return NextResponse.json({ products });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
