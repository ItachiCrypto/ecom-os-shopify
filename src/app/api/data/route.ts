import { NextRequest, NextResponse } from "next/server";
import {
  getShopData,
  saveShopData,
  listActiveShops,
  mirrorConfigToAllShops,
} from "@/lib/storage";
import { SHOP_COOKIE, ALL_SHOPS, MASTER_SHOP, SHARED_CONFIG_FIELDS } from "@/lib/config";
import { convertAmount, getShopCurrency } from "@/lib/currency";
import { jsonSWR } from "@/lib/http";
import type { EcomConfig, ShopData } from "@/lib/types";

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // ALL mode — aggregate: config from master shop, dailyAds merged from all shops
  if (shop === ALL_SHOPS) {
    const all = await listActiveShops();
    if (all.length === 0) {
      return NextResponse.json(
        { error: "No shops installed yet" },
        { status: 404 }
      );
    }
    // Resolve the master shop. If MASTER_SHOP isn't installed (uninstalled,
    // env var mismatch, etc.), fall back to the first installed shop so the
    // ALL view keeps working instead of returning 404.
    let masterShop = MASTER_SHOP;
    let master = await getShopData(MASTER_SHOP);
    if (!master) {
      masterShop = all[0];
      master = await getShopData(masterShop);
      if (!master) {
        return NextResponse.json(
          { error: "No installed shop has data yet" },
          { status: 404 }
        );
      }
    }
    const shopDatas = (await Promise.all(all.map((s) => getShopData(s)))).filter(
      (data): data is ShopData => Boolean(data)
    );

    // Currency normalization: convert each shop's amounts to the master's currency
    // before summing, so EUR + USD entries stop being added as if they were the same unit.
    const masterCurrency = await getShopCurrency(masterShop);
    const shopCurrencies = new Map<string, string>();
    await Promise.all(
      shopDatas.map(async (d) => shopCurrencies.set(d.shop, await getShopCurrency(d.shop)))
    );

    // Merge shop-specific calculation inputs so the ALL view equals the sum of shop views.
    const mergedDailyAds: NonNullable<EcomConfig["dailyAds"]> = {};
    const mergedProductCosts: NonNullable<EcomConfig["productCosts"]> = {};
    const mergedBundles: NonNullable<EcomConfig["bundles"]> = [];
    const mergedMonthlySubscriptions: NonNullable<EcomConfig["monthlySubscriptions"]> = [];
    const mergedAdCampaigns: NonNullable<EcomConfig["adCampaigns"]> = [];
    const mergedSoldeInitial = shopDatas.reduce((sum, data) => {
      const cur = shopCurrencies.get(data.shop) || masterCurrency;
      return sum + convertAmount(data.config.soldeInitial || 0, cur, masterCurrency);
    }, 0);

    for (const data of shopDatas) {
      const shopCurrency = shopCurrencies.get(data.shop) || masterCurrency;
      const entries = data.config.dailyAds || {};
      for (const [date, entry] of Object.entries(entries)) {
        const spendInMaster = convertAmount(entry.spend || 0, shopCurrency, masterCurrency);
        const existing = mergedDailyAds[date] ?? { spend: 0 };
        existing.spend = (existing.spend || 0) + spendInMaster;
        existing.notes =
          existing.notes && entry.notes
            ? `${existing.notes} | ${entry.notes}`
            : existing.notes || entry.notes;
        // Per-campaign rollup — prefix each campaign id with its shop so two
        // shops can have campaigns named the same without colliding.
        if (entry.byCampaign) {
          existing.byCampaign = existing.byCampaign || {};
          for (const [cid, c] of Object.entries(entry.byCampaign)) {
            const key = `${data.shop}:${cid}`;
            existing.byCampaign[key] = {
              spend: convertAmount(c.spend || 0, shopCurrency, masterCurrency),
              ...(c.notes ? { notes: c.notes } : {}),
            };
          }
        }
        mergedDailyAds[date] = existing;
      }

      Object.assign(mergedProductCosts, data.config.productCosts || {});
      mergedBundles.push(
        ...(data.config.bundles || []).map((bundle) => ({
          ...bundle,
          id: `${data.shop}:${bundle.id}`,
        }))
      );
      mergedMonthlySubscriptions.push(
        ...(data.config.monthlySubscriptions || []).map((subscription) => ({
          ...subscription,
          id: `${data.shop}:${subscription.id}`,
          monthlyAmount: convertAmount(
            Number(subscription.monthlyAmount) || 0,
            shopCurrency,
            masterCurrency
          ),
        }))
      );
      mergedAdCampaigns.push(
        ...(data.config.adCampaigns || []).map((c) => ({
          ...c,
          id: `${data.shop}:${c.id}`,
          name: `${c.name} · ${data.shop.replace(".myshopify.com", "")}`,
        }))
      );
    }
    const aggregated: ShopData = {
      ...master,
      shop: ALL_SHOPS,
      config: {
        ...master.config,
        soldeInitial: mergedSoldeInitial,
        dailyAds: mergedDailyAds,
        productCosts: mergedProductCosts,
        bundles: mergedBundles,
        monthlySubscriptions: mergedMonthlySubscriptions,
        adCampaigns: mergedAdCampaigns,
      },
    };
    const { accessToken: _t, ...safe } = aggregated;
    void _t;
    return jsonSWR({ data: safe, mode: "all" }, { maxAge: 30, swr: 300 });
  }

  const data = await getShopData(shop);
  if (!data) {
    return NextResponse.json({ error: "Shop data not found — reinstall the app" }, { status: 404 });
  }

  // Never return the access token to the client
  const { accessToken: _t, ...safe } = data;
  void _t;
  return jsonSWR({ data: safe }, { maxAge: 30, swr: 300 });
}

export async function POST(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // In ALL mode, writes target the master shop + mirror shared fields to all.
  // If the configured MASTER_SHOP isn't installed, fall back to the first
  // installed shop so the request doesn't 404.
  let targetShop = shop;
  if (shop === ALL_SHOPS) {
    targetShop = MASTER_SHOP;
    const masterCheck = await getShopData(MASTER_SHOP);
    if (!masterCheck) {
      const all = await listActiveShops();
      if (all.length === 0) {
        return NextResponse.json({ error: "No shops installed yet" }, { status: 404 });
      }
      targetShop = all[0];
    }
  }

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

  // In ALL mode, several config fields returned by the client are AGGREGATES across all shops
  // (dailyAds = sum, productCosts/bundles/monthlySubscriptions = union with prefixed ids).
  // Writing them back to the master would corrupt master's own data and double-count on the next
  // merge. Preserve master's per-shop fields untouched here — they must be edited per-shop.
  let nextConfig = body.config ?? existing.config;
  if (shop === ALL_SHOPS && body.config) {
    nextConfig = {
      ...body.config,
      dailyAds: existing.config.dailyAds,
      productCosts: existing.config.productCosts,
      bundles: existing.config.bundles,
      monthlySubscriptions: existing.config.monthlySubscriptions,
      adCampaigns: existing.config.adCampaigns,
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
