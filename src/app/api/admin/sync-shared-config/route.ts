import { NextRequest, NextResponse } from "next/server";
import { getShopData, listActiveShops, mirrorConfigToAllShops } from "@/lib/storage";
import { MASTER_SHOP, SHARED_CONFIG_FIELDS } from "@/lib/config";

// POST /api/admin/sync-shared-config?secret=<MIGRATION_SECRET>
//   &source=<shop_domain>   (optional, defaults to MASTER_SHOP, falls back
//                            to first installed shop if MASTER_SHOP missing)
//
// Reads the source shop's SHARED_CONFIG_FIELDS values and mirrors them to
// every other installed shop, so all shops share the exact same values for
// things like URSSAF / IR / TVA / objectifs / shippingCostByQty / etc.
//
// Idempotent. Use after a storage incident or when shops have drifted.

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("secret");
  const required = process.env.MIGRATION_SECRET;
  if (!required) {
    return NextResponse.json({ error: "MIGRATION_SECRET not set" }, { status: 500 });
  }
  if (!providedSecret || providedSecret !== required) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const all = await listActiveShops();
  if (all.length === 0) {
    return NextResponse.json({ error: "No shops installed" }, { status: 404 });
  }

  const requestedSource = url.searchParams.get("source");
  const sourceShop = requestedSource && all.includes(requestedSource) ? requestedSource : MASTER_SHOP;

  let source = await getShopData(sourceShop);
  let resolvedSource = sourceShop;
  if (!source) {
    resolvedSource = all[0];
    source = await getShopData(resolvedSource);
    if (!source) {
      return NextResponse.json({ error: "No installed shop has data" }, { status: 404 });
    }
  }

  const shared: Record<string, unknown> = {};
  const cfg = source.config as unknown as Record<string, unknown>;
  for (const key of SHARED_CONFIG_FIELDS) {
    const value = cfg[key];
    if (value !== undefined) shared[key] = value;
  }

  const result = await mirrorConfigToAllShops(resolvedSource, shared);

  return NextResponse.json({
    ok: true,
    source: resolvedSource,
    fieldsCopied: Object.keys(shared),
    mirroredTo: result.mirrored,
  });
}
