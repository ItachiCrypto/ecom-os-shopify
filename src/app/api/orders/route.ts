import { NextRequest, NextResponse } from "next/server";
import { getAllOrders, getOrders } from "@/lib/shopify";
import { listActiveShops } from "@/lib/storage";
import { SHOP_COOKIE, ALL_SHOPS } from "@/lib/config";

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated — install app first" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || undefined;
  const all = searchParams.get("all") === "true";
  const first = Number(searchParams.get("first")) || 100;

  // ALL mode — fetch orders from every installed shop and merge them
  if (shop === ALL_SHOPS) {
    try {
      const shops = await listActiveShops();
      const perShop = await Promise.all(
        shops.map(async (s) => {
          const orders = await getAllOrders(s, 10);
          return (orders as unknown[]).map((o) => ({ ...(o as object), _shop: s }));
        })
      );
      const merged = perShop.flat();
      // Sort by createdAt desc
      merged.sort((a, b) => {
        const ac = (a as { createdAt?: string }).createdAt || "";
        const bc = (b as { createdAt?: string }).createdAt || "";
        return bc.localeCompare(ac);
      });
      return NextResponse.json({ orders: merged, count: merged.length, mode: "all" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

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
