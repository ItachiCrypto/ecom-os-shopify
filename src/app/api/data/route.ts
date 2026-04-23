import { NextRequest, NextResponse } from "next/server";
import { getShopData, saveShopData } from "@/lib/storage";
import { SHOP_COOKIE } from "@/lib/config";
import type { ShopData } from "@/lib/types";

export async function GET(request: NextRequest) {
  const shop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!shop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  const existing = await getShopData(shop);
  if (!existing) {
    return NextResponse.json({ error: "Shop data not found" }, { status: 404 });
  }

  let body: Partial<ShopData>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Merge user updates with existing (never allow overwriting accessToken from client)
  const merged: ShopData = {
    ...existing,
    config: body.config ?? existing.config,
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
  return NextResponse.json({ ok: true });
}
