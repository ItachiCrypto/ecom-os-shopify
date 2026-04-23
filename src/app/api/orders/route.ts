import { NextRequest, NextResponse } from "next/server";
import { getAllOrders, getOrders } from "@/lib/shopify";
import { SHOP_COOKIE } from "@/lib/config";

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated — install app first" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || undefined;
  const all = searchParams.get("all") === "true";
  const first = Number(searchParams.get("first")) || 100;

  try {
    if (all) {
      const orders = await getAllOrders(shop, 10);
      return NextResponse.json({ orders, count: orders.length });
    }
    const { orders, pageInfo } = await getOrders(shop, { first, query });
    return NextResponse.json({ orders, pageInfo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/orders]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
