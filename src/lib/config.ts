// Shopify app config — values come from env vars
export const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || "";
export const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";
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
].join(",");

// Cookie used to track the active shop in the admin UI
export const SHOP_COOKIE = "ecomos_shop";
