import { getShopInfo } from "./shopify";

// Static FX table (pivot = USD). Override via env (e.g. FX_USD_PER_EUR=1.08).
// Used to normalize amounts in ALL-shops mode where each shop reports in its own currency.
const FX: Record<string, number> = {
  USD: 1,
  // Default 1.19 matches the front-end USD_PER_EUR constant in app/page.tsx.
  EUR: Number(process.env.FX_USD_PER_EUR) || 1.19,
  GBP: Number(process.env.FX_USD_PER_GBP) || 1.27,
  CAD: Number(process.env.FX_USD_PER_CAD) || 0.74,
  AUD: Number(process.env.FX_USD_PER_AUD) || 0.66,
};

export function convertAmount(amount: number, from: string, to: string): number {
  if (!amount || from === to) return amount;
  const fromUsd = FX[from] ?? 1;
  const toUsd = FX[to] ?? 1;
  return (amount * fromUsd) / toUsd;
}

// Lazy in-memory cache of shop currencies (per server instance).
// Avoids hammering Shopify API for shop metadata on every aggregate request.
const currencyCache = new Map<string, { code: string; expires: number }>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getShopCurrency(shop: string): Promise<string> {
  const cached = currencyCache.get(shop);
  if (cached && cached.expires > Date.now()) return cached.code;
  try {
    const info = await getShopInfo(shop);
    const code = info?.currencyCode || "USD";
    currencyCache.set(shop, { code, expires: Date.now() + TTL_MS });
    return code;
  } catch {
    return "USD";
  }
}
