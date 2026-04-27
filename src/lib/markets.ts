import { getMarkets } from "./shopify";

export interface ShopifyMarketRegion {
  id: string;
  name: string;
  code: string;
  currency: { currencyCode: string };
}

export interface ShopifyMarketLite {
  id: string;
  name: string;
  handle: string;
  enabled: boolean;
  primary: boolean;
  regions: { edges: { node: ShopifyMarketRegion }[] };
}

// Lazy 1h cache. Markets rarely change, so this avoids hitting Shopify API
// on every /api/ad-spend GET.
const cache = new Map<string, { data: ShopifyMarketLite[]; expires: number }>();
const TTL_MS = 60 * 60 * 1000;

export async function getCachedMarkets(shop: string): Promise<ShopifyMarketLite[]> {
  const hit = cache.get(shop);
  if (hit && hit.expires > Date.now()) return hit.data;
  try {
    const data = (await getMarkets(shop)) as ShopifyMarketLite[];
    cache.set(shop, { data, expires: Date.now() + TTL_MS });
    return data;
  } catch {
    return [];
  }
}
