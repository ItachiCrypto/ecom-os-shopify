import { NextRequest, NextResponse } from "next/server";
import { listActiveShops } from "@/lib/storage";
import { getCachedMarkets } from "@/lib/markets";

// GET /api/admin/dump-markets?secret=<MIGRATION_SECRET>
// Returns Shopify Markets for every installed shop. Used to figure out
// the right handles when seeding ad spend by market.

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("secret");
  const required = process.env.MIGRATION_SECRET;
  if (!required) return NextResponse.json({ error: "MIGRATION_SECRET not set" }, { status: 500 });
  if (!providedSecret || providedSecret !== required) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const shops = await listActiveShops();
  const result: Record<string, unknown> = {};
  for (const shop of shops) {
    const markets = await getCachedMarkets(shop);
    result[shop] = markets.map((m) => ({
      id: m.id,
      handle: m.handle,
      name: m.name,
      enabled: m.enabled,
      primary: m.primary,
      regions: m.regions?.edges?.map((e) => ({ code: e.node.code, name: e.node.name })) || [],
    }));
  }
  return NextResponse.json({ ok: true, marketsByShop: result });
}
