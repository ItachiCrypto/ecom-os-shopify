import { NextRequest, NextResponse } from "next/server";
import { getShopData } from "@/lib/storage";
import { SHOP_COOKIE, ALL_SHOPS } from "@/lib/config";
import { validateShop } from "@/lib/oauth";

export async function POST(request: NextRequest) {
  let shop: string;
  try {
    const body = await request.json();
    shop = body.shop;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!shop) {
    return NextResponse.json({ error: "Missing shop" }, { status: 400 });
  }

  // Special "all shops" mode — just set the cookie, no validation needed
  if (shop === ALL_SHOPS) {
    const response = NextResponse.json({ ok: true, shop: ALL_SHOPS, mode: "all" });
    response.cookies.set(SHOP_COOKIE, ALL_SHOPS, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      // none + secure required so the cookie survives Shopify Admin iframe
      // contexts; lax in dev because http://localhost rejects secure cookies.
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return response;
  }

  if (!validateShop(shop)) {
    return NextResponse.json({ error: "Invalid shop domain" }, { status: 400 });
  }

  // Ensure the shop has actually been installed (data exists in Blob)
  const data = await getShopData(shop);
  if (!data) {
    return NextResponse.json(
      {
        error: "Shop not installed",
        hint: `Install it first at /api/auth?shop=${encodeURIComponent(shop)}`,
      },
      { status: 404 }
    );
  }

  const response = NextResponse.json({ ok: true, shop });
  response.cookies.set(SHOP_COOKIE, shop, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
