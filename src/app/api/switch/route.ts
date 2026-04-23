import { NextRequest, NextResponse } from "next/server";
import { getShopData } from "@/lib/storage";
import { SHOP_COOKIE } from "@/lib/config";
import { validateShop } from "@/lib/oauth";

export async function POST(request: NextRequest) {
  let shop: string;
  try {
    const body = await request.json();
    shop = body.shop;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!shop || !validateShop(shop)) {
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
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
