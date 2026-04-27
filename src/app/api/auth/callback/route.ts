import { NextRequest, NextResponse } from "next/server";
import { verifyHmac, exchangeCodeForToken, validateShop } from "@/lib/oauth";
import { getAccessToken, initShopData } from "@/lib/storage";
import { SHOP_COOKIE } from "@/lib/config";

function shopCookieRedirect(originUrl: URL, shop: string) {
  const response = NextResponse.redirect(new URL("/", originUrl.origin));
  response.cookies.set(SHOP_COOKIE, shop, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  response.cookies.delete("shopify_oauth_state");
  response.cookies.delete("shopify_oauth_shop");
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (query[k] = v));

  const { shop, code, state } = query;

  if (!shop || !code || !state || !validateShop(shop)) {
    return NextResponse.json({ error: "Missing required OAuth params" }, { status: 400 });
  }

  // Verify HMAC using the app credentials mapped to this shop
  if (!verifyHmac(shop, query)) {
    return NextResponse.json({ error: "HMAC verification failed" }, { status: 401 });
  }

  // Verify state cookie (CSRF)
  const stateCookie = request.cookies.get("shopify_oauth_state")?.value;
  const shopCookie = request.cookies.get("shopify_oauth_shop")?.value;
  if (!stateCookie || stateCookie !== state || shopCookie !== shop) {
    return NextResponse.json({ error: "Invalid state (CSRF)" }, { status: 401 });
  }

  // Exchange code for permanent access token. Shopify codes are single-use,
  // so a duplicate callback (browser pre-fetch, double-tap, etc.) hits a 400
  // "code already used". If the shop already has a token from the first
  // successful exchange, treat the duplicate as benign and redirect.
  let accessToken: string;
  try {
    accessToken = await exchangeCodeForToken(shop, code);
  } catch (e) {
    const existing = await getAccessToken(shop);
    if (existing) return shopCookieRedirect(url, shop);
    return NextResponse.json(
      {
        error: "Token exchange failed",
        detail: e instanceof Error ? e.message : "unknown",
        hint: "Le code d'autorisation Shopify a expiré ou a déjà été utilisé. Relance l'installation depuis Shopify Admin.",
      },
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

  return shopCookieRedirect(url, shop);
}
