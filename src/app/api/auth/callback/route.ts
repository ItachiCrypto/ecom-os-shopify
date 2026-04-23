import { NextRequest, NextResponse } from "next/server";
import { verifyHmac, exchangeCodeForToken, validateShop } from "@/lib/oauth";
import { initShopData } from "@/lib/storage";
import { SHOP_COOKIE } from "@/lib/config";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (query[k] = v));

  const { shop, code, state } = query;

  if (!shop || !code || !state || !validateShop(shop)) {
    return NextResponse.json({ error: "Missing required OAuth params" }, { status: 400 });
  }

  // Verify HMAC
  if (!verifyHmac(query)) {
    return NextResponse.json({ error: "HMAC verification failed" }, { status: 401 });
  }

  // Verify state cookie (CSRF)
  const stateCookie = request.cookies.get("shopify_oauth_state")?.value;
  const shopCookie = request.cookies.get("shopify_oauth_shop")?.value;
  if (!stateCookie || stateCookie !== state || shopCookie !== shop) {
    return NextResponse.json({ error: "Invalid state (CSRF)" }, { status: 401 });
  }

  // Exchange code for permanent access token
  let accessToken: string;
  try {
    accessToken = await exchangeCodeForToken(shop, code);
  } catch (e) {
    return NextResponse.json(
      { error: "Token exchange failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }

  // Save to Blob storage (merges with existing data if shop already installed)
  try {
    await initShopData(shop, accessToken);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to save shop data", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }

  // Redirect to app dashboard
  const appUrl = new URL("/", url.origin);
  const response = NextResponse.redirect(appUrl);
  response.cookies.set(SHOP_COOKIE, shop, {
    httpOnly: false, // client-side can read to display
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  // Clear OAuth cookies
  response.cookies.delete("shopify_oauth_state");
  response.cookies.delete("shopify_oauth_shop");
  return response;
}
