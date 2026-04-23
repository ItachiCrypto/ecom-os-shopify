import { NextRequest, NextResponse } from "next/server";
import { getShopInfo } from "@/lib/shopify";
import { SHOP_COOKIE } from "@/lib/config";

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const info = await getShopInfo(shop);
    return NextResponse.json({ shop: info });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
