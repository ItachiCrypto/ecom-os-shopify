import { NextRequest, NextResponse } from "next/server";
import { getAllOrders, getOrders } from "@/lib/shopify";
import { listActiveShops } from "@/lib/storage";
import { SHOP_COOKIE, ALL_SHOPS, MASTER_SHOP } from "@/lib/config";
import { convertAmount, getShopCurrency } from "@/lib/currency";
import { jsonSWR } from "@/lib/http";

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
      const masterCurrency = await getShopCurrency(MASTER_SHOP);
      const perShop = await Promise.all(
        shops.map(async (s) => {
          const [orders, shopCurrency] = await Promise.all([
            getAllOrders(s, 10),
            getShopCurrency(s),
          ]);
          // Walk every `shopMoney` field and convert to master currency so the
          // aggregate dashboard sums apples to apples.
          const normalized = normalizeOrders(orders, shopCurrency, masterCurrency);
          return normalized.map((o) => ({
            ...(o as object),
            _shop: s,
            _shopCurrency: shopCurrency,
          }));
        })
      );
      const merged = perShop.flat();
      // Sort by createdAt desc
      merged.sort((a, b) => {
        const ac = (a as { createdAt?: string }).createdAt || "";
        const bc = (b as { createdAt?: string }).createdAt || "";
        return bc.localeCompare(ac);
      });
      return jsonSWR(
        {
          orders: merged,
          count: merged.length,
          mode: "all",
          normalizedCurrency: masterCurrency,
        },
        { maxAge: 30, swr: 300 }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    if (all) {
      const orders = await getAllOrders(shop, 10);
      return jsonSWR({ orders, count: orders.length }, { maxAge: 30, swr: 300 });
    }
    const { orders, pageInfo } = await getOrders(shop, { first, query });
    return jsonSWR({ orders, pageInfo }, { maxAge: 30, swr: 300 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/orders]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Recursively walk an arbitrary object/array and rewrite every Shopify Money
// shape (`{amount, currencyCode}`, including those nested under `shopMoney`)
// so its amount is expressed in `to` currency. Returns a deep copy.
function normalizeOrders(orders: unknown[], from: string, to: string): unknown[] {
  if (from === to) return orders;
  const isMoney = (v: unknown): v is { amount: string | number; currencyCode?: string } =>
    !!v &&
    typeof v === "object" &&
    "amount" in (v as Record<string, unknown>) &&
    (typeof (v as Record<string, unknown>).amount === "string" ||
      typeof (v as Record<string, unknown>).amount === "number");

  const convertMoney = (m: { amount: string | number; currencyCode?: string }) => {
    const num = typeof m.amount === "string" ? parseFloat(m.amount) : m.amount;
    const converted = convertAmount(Number.isFinite(num) ? num : 0, from, to);
    return { ...m, amount: converted.toString(), currencyCode: to };
  };

  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (node && typeof node === "object") {
      // Money leaf — `currencyCode` + numeric `amount` and no other meaningful keys
      if (isMoney(node) && "currencyCode" in (node as Record<string, unknown>)) {
        return convertMoney(node);
      }
      const obj = node as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        next[key] = visit(val);
      }
      return next;
    }
    return node;
  };
  return orders.map(visit) as unknown[];
}
