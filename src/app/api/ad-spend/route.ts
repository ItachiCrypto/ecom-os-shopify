import { NextRequest, NextResponse } from "next/server";
import { ALL_SHOPS, MASTER_SHOP, SHOP_COOKIE } from "@/lib/config";
import { getShopData, listActiveShops, saveShopData } from "@/lib/storage";

interface DailyAdEntry {
  spend: number;
  notes?: string;
}

function normalizeDailyAds(dailyAds: Record<string, DailyAdEntry> | undefined) {
  return dailyAds || {};
}

export async function GET(request: NextRequest) {
  const activeShop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!activeShop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const installed = await listActiveShops();
  const shops = activeShop === ALL_SHOPS ? installed : [activeShop];
  const dailyAdsByShop: Record<string, Record<string, DailyAdEntry>> = {};

  for (const shop of shops) {
    const data = await getShopData(shop);
    dailyAdsByShop[shop] = normalizeDailyAds(data?.config.dailyAds);
  }

  return NextResponse.json({
    activeShop,
    editableShop: activeShop === ALL_SHOPS && installed.includes(MASTER_SHOP) ? MASTER_SHOP : shops[0],
    shops: shops.map((shop) => ({
      shop,
      name: shop.replace(".myshopify.com", ""),
    })),
    dailyAdsByShop,
  });
}

export async function POST(request: NextRequest) {
  const activeShop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!activeShop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { shop?: string; date?: string; spend?: number; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const date = body.date || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const spend = Number(body.spend || 0);
  if (!Number.isFinite(spend) || spend < 0) {
    return NextResponse.json({ error: "Invalid spend" }, { status: 400 });
  }

  const installed = await listActiveShops();
  const targetShop = activeShop === ALL_SHOPS ? body.shop : activeShop;
  if (!targetShop || targetShop === ALL_SHOPS || !installed.includes(targetShop)) {
    return NextResponse.json({ error: "Invalid shop" }, { status: 400 });
  }

  const data = await getShopData(targetShop);
  if (!data) {
    return NextResponse.json({ error: "Shop data not found" }, { status: 404 });
  }

  const dailyAds = { ...(data.config.dailyAds || {}) };
  const notes = body.notes?.trim();
  if (spend === 0) {
    delete dailyAds[date];
  } else {
    dailyAds[date] = { spend, ...(notes ? { notes } : {}) };
  }

  await saveShopData({
    ...data,
    config: {
      ...data.config,
      dailyAds,
    },
  });

  return NextResponse.json({ ok: true, shop: targetShop, date, entry: dailyAds[date] || null });
}
