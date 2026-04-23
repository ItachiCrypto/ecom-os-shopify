// Shopify multi-app config.
// A single EcomOS app can only be installed on shops within the same Shopify organization.
// To support multiple orgs (e.g. Sedgeia main + Sedgeia Hispanic), we register multiple
// app credentials and route each shop to the correct one.

export interface ShopifyAppCreds {
  clientId: string;
  clientSecret: string;
  label: string;
  shops: string[]; // explicit list of shop domains that belong to this app's org (case-insensitive)
}

function parseShops(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

// Primary app (first org)
const APP_1: ShopifyAppCreds = {
  clientId: process.env.SHOPIFY_API_KEY || "",
  clientSecret: process.env.SHOPIFY_API_SECRET || "",
  label: "Sedgeia Hispanic",
  shops: parseShops(process.env.SHOPIFY_SHOPS || "56aqy8-pd.myshopify.com"),
};

// Secondary app (second org — e.g. Sedgeia main)
const APP_2: ShopifyAppCreds = {
  clientId: process.env.SHOPIFY_API_KEY_2 || "",
  clientSecret: process.env.SHOPIFY_API_SECRET_2 || "",
  label: "Sedgeia",
  shops: parseShops(process.env.SHOPIFY_SHOPS_2 || "w6daqz-3k.myshopify.com"),
};

export const APPS: ShopifyAppCreds[] = [APP_1, APP_2].filter((a) => a.clientId && a.clientSecret);

/**
 * Pick the right Shopify app credentials for a given shop domain.
 * 1. If the shop is in an app's explicit `shops` list → use that app.
 * 2. Otherwise, fall back to the first configured app.
 */
export function getAppForShop(shop: string): ShopifyAppCreds {
  const normalized = shop.toLowerCase();
  const match = APPS.find((a) => a.shops.includes(normalized));
  if (match) return match;
  if (APPS.length === 0) {
    throw new Error("No Shopify app credentials configured (SHOPIFY_API_KEY / SHOPIFY_API_SECRET missing).");
  }
  return APPS[0];
}

// Back-compat exports — default to first app (used when shop context is not available)
export const SHOPIFY_API_KEY = APP_1.clientId;
export const SHOPIFY_API_SECRET = APP_1.clientSecret;

export const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL || process.env.VERCEL_URL
  ? (process.env.SHOPIFY_APP_URL || `https://${process.env.VERCEL_URL}`)
  : "http://localhost:3000";

export const SHOPIFY_SCOPES = [
  "read_orders",
  "read_all_orders",
  "read_products",
  "read_inventory",
  "read_customers",
  "read_fulfillments",
  "read_shipping",
  "read_price_rules",
  "read_discounts",
  "read_draft_orders",
  "read_reports",
  "read_analytics",
  "read_locations",
  "read_markets",
].join(",");

// Cookie used to track the active shop in the admin UI
export const SHOP_COOKIE = "ecomos_shop";
