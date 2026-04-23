import { NextRequest, NextResponse } from "next/server";
import {
  getShopData,
  saveShopData,
  listInstalledShops,
  mirrorConfigToAllShops,
} from "@/lib/storage";
import { SHOP_COOKIE, ALL_SHOPS, MASTER_SHOP, SHARED_CONFIG_FIELDS } from "@/lib/config";
import type { ShopData } from "@/lib/types";

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // ALL mode — aggregate: config from master shop, dailyAds merged from all shops
  if (shop === ALL_SHOPS) {
    const all = await listInstalledShops();
    const master = await getShopData(MASTER_SHOP);
    if (!master) {
      return NextResponse.json(
        { error: `Master shop ${MASTER_SHOP} not installed` },
        { status: 404 }
      );
    }
    // Merge dailyAds from all shops (sum spend per date)
    const mergedDailyAds: Record<string, { spend: number; notes?: string }> = {};
    for (const s of all) {
      const data = await getShopData(s);
      const entries = data?.config?.dailyAds || {};
      for (const [date, entry] of Object.entries(entries)) {
        mergedDailyAds[date] = {
          spend: (mergedDailyAds[date]?.spend || 0) + (entry.spend || 0),
          notes:
            mergedDailyAds[date]?.notes && entry.notes
              ? `${mergedDailyAds[date]?.notes} | ${entry.notes}`
              : mergedDailyAds[date]?.notes || entry.notes,
        };
      }
    }
    const aggregated: ShopData = {
      ...master,
      shop: ALL_SHOPS,
      config: { ...master.config, dailyAds: mergedDailyAds },
    };
    const { accessToken: _t, ...safe } = aggregated;
    void _t;
    return NextResponse.json({ data: safe, mode: "all" });
  }

  const data = await getShopData(shop);
  if (!data) {
    return NextResponse.json({ error: "Shop data not found — reinstall the app" }, { status: 404 });
  }

  // Never return the access token to the client
  const { accessToken: _t, ...safe } = data;
  void _t;
  return NextResponse.json({ data: safe });
}

export async function POST(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // In ALL mode, writes target the master shop + mirror shared fields to all
  const targetShop = shop === ALL_SHOPS ? MASTER_SHOP : shop;

  const existing = await getShopData(targetShop);
  if (!existing) {
    return NextResponse.json({ error: "Shop data not found" }, { status: 404 });
  }

  let body: Partial<ShopData>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // In ALL mode, the dailyAds coming from the client are the MERGED values (sum of all shops).
  // Saving them back to master would cause double-counting on next merge. Preserve master's own
  // dailyAds untouched in this case. The user can only edit dailyAds per-shop.
  let nextConfig = body.config ?? existing.config;
  if (shop === ALL_SHOPS && body.config) {
    nextConfig = {
      ...body.config,
      dailyAds: existing.config.dailyAds,
    };
  }

  // Merge user updates with existing (never allow overwriting accessToken from client)
  const merged: ShopData = {
    ...existing,
    config: nextConfig,
    testings: body.testings ?? existing.testings,
    scenarios: body.scenarios ?? existing.scenarios,
    abonnements: body.abonnements ?? existing.abonnements,
    tresorerie: body.tresorerie ?? existing.tresorerie,
    journal: body.journal ?? existing.journal,
    fournisseur: body.fournisseur ?? existing.fournisseur,
    favoris: body.favoris ?? existing.favoris,
    historique: body.historique ?? existing.historique,
  };

  await saveShopData(merged);

  // Mirror shared config fields to all other installed shops (keeps settings in sync)
  let mirrored: string[] = [];
  if (body.config) {
    const shared: Record<string, unknown> = {};
    const cfg = body.config as unknown as Record<string, unknown>;
    for (const key of SHARED_CONFIG_FIELDS) {
      const value = cfg[key];
      if (value !== undefined) shared[key] = value;
    }
    if (Object.keys(shared).length > 0) {
      const result = await mirrorConfigToAllShops(targetShop, shared);
      mirrored = result.mirrored;
    }
  }

  return NextResponse.json({ ok: true, mirroredTo: mirrored });
}
