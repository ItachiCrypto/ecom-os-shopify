import { NextRequest, NextResponse } from "next/server";
import { getShopInfo, getMarkets } from "@/lib/shopify";
import { listActiveShops } from "@/lib/storage";
import { SHOP_COOKIE, ALL_SHOPS, MASTER_SHOP } from "@/lib/config";

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // ALL mode — return an aggregated synthetic shop info (currency from master)
  if (shop === ALL_SHOPS) {
    try {
      const installed = await listActiveShops();
      const infos = await Promise.all(
        installed.map(async (s) => {
          try { return await getShopInfo(s); } catch { return null; }
        })
      );
      const valid = infos.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getShopInfo>>>[];
      const master = valid.find((i) => i.myshopifyDomain === MASTER_SHOP) || valid[0];
      const info = {
        name: `Toutes les boutiques (${installed.length})`,
        email: master?.email || "",
        myshopifyDomain: ALL_SHOPS,
        primaryDomain: master?.primaryDomain || { url: "" },
        currencyCode: master?.currencyCode || "USD",
        ianaTimezone: master?.ianaTimezone || "UTC",
        plan: master?.plan || { displayName: "Aggregated" },
        billingAddress: master?.billingAddress || null,
      };
      return NextResponse.json({ shop: info, markets: [], mode: "all", shops: valid });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }
  try {
    const [info, markets] = await Promise.all([getShopInfo(shop), getMarkets(shop)]);
    return NextResponse.json({ shop: info, markets });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
