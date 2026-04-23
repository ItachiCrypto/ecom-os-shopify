import { NextRequest, NextResponse } from "next/server";
import { buildInstallUrl, generateNonce, validateShop } from "@/lib/oauth";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop || !validateShop(shop)) {
    return NextResponse.json(
      {
        error: "Invalid or missing shop parameter",
        hint: "Use: /api/auth?shop=yourstore.myshopify.com",
      },
      { status: 400 }
    );
  }

  const state = generateNonce();
  const installUrl = buildInstallUrl(shop, state);

  const response = NextResponse.redirect(installUrl);
  // Store state in a secure cookie for CSRF validation
  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10min
    path: "/",
  });
  response.cookies.set("shopify_oauth_shop", shop, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
