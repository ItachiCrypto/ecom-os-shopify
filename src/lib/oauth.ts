import crypto from "crypto";
import { SHOPIFY_SCOPES, SHOPIFY_APP_URL, getAppForShop } from "./config";

export function validateShop(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildInstallUrl(shop: string, state: string): string {
  if (!validateShop(shop)) throw new Error("Invalid shop domain");
  const app = getAppForShop(shop);
  const redirectUri = `${SHOPIFY_APP_URL}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: app.clientId,
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
    "grant_options[]": "",
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyHmac(shop: string, query: Record<string, string>): boolean {
  const { hmac, signature, ...rest } = query;
  void signature;
  if (!hmac) return false;

  const app = getAppForShop(shop);
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");

  const computed = crypto
    .createHmac("sha256", app.clientSecret)
    .update(message)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(computed));
  } catch {
    return false;
  }
}

export async function exchangeCodeForToken(shop: string, code: string): Promise<string> {
  const app = getAppForShop(shop);
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; scope: string };
  return data.access_token;
}
