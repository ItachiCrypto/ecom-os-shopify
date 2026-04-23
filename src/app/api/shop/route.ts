import { NextRequest, NextResponse } from "next/server";
import { getShopInfo, getMarkets } from "@/lib/shopify";
import { SHOP_COOKIE } from "@/lib/config";

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const [info, markets] = await Promise.all([getShopInfo(shop), getMarkets(shop)]);
    return NextResponse.json({ shop: info, markets });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
