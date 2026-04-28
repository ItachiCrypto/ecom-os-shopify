import { NextRequest, NextResponse } from "next/server";
import { getShopData, listActiveShops } from "@/lib/storage";

// GET /api/admin/dump-shop?secret=<MIGRATION_SECRET>&shop=<domain>
// Returns the shop's stored config (campaigns + dailyAds breakdown) so we
// can compare what's in storage against the source-of-truth spreadsheet.

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("secret");
  const required = process.env.MIGRATION_SECRET;
  if (!required) {
    return NextResponse.json({ error: "MIGRATION_SECRET not set" }, { status: 500 });
  }
  if (!providedSecret || providedSecret !== required) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shop = url.searchParams.get("shop");
  if (!shop) {
    const all = await listActiveShops();
    return NextResponse.json({ ok: true, hint: "Pass &shop=<domain>", installed: all });
  }

  const data = await getShopData(shop);
  if (!data) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    shop: data.shop,
    adCampaigns: data.config.adCampaigns || [],
    dailyAds: data.config.dailyAds || {},
    productCosts: data.config.productCosts || {},
    bundles: data.config.bundles || [],
    shippingCostByQty: data.config.shippingCostByQty || {},
    urssaf: data.config.urssaf,
    ir: data.config.ir,
    tva: data.config.tva,
    taxOnAdSpend: data.config.taxOnAdSpend,
    soldeInitial: data.config.soldeInitial,
    monthlySubscriptions: data.config.monthlySubscriptions || [],
  });
}
