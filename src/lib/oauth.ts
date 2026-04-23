import crypto from "crypto";
import { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, SHOPIFY_APP_URL } from "./config";

export function validateShop(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildInstallUrl(shop: string, state: string): string {
  if (!validateShop(shop)) throw new Error("Invalid shop domain");
  const redirectUri = `${SHOPIFY_APP_URL}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
    "grant_options[]": "",
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyHmac(query: Record<string, string>): boolean {
  const { hmac, signature, ...rest } = query;
  void signature;
  if (!hmac) return false;

  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");

  const computed = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(computed));
  } catch {
    return false;
  }
}

export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; scope: string };
  return data.access_token;
}
