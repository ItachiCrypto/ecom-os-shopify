import { put, list } from "@vercel/blob";
import type { ShopData } from "./types";
import { defaultShopData } from "./types";

// Auto-detect blob token from any env var containing BLOB+TOKEN
function getBlobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const blobEnvNames = Object.keys(process.env).filter(
    (k) => k.includes("BLOB") && k.includes("TOKEN")
  );
  return blobEnvNames.map((k) => process.env[k]).find((v) => v && v.startsWith("vercel_blob_"));
}

// Cache to avoid re-reading blob on every request (TTL 30s)
const cache = new Map<string, { data: ShopData; expires: number }>();
const CACHE_TTL = 30_000;

function filename(shop: string): string {
  // shop ex: "everpept-new.myshopify.com" -> "shops/everpept-new.json"
  const slug = shop.replace(".myshopify.com", "").toLowerCase();
  return `shops/${slug}.json`;
}

export async function getShopData(shop: string): Promise<ShopData | null> {
  const cached = cache.get(shop);
  if (cached && cached.expires > Date.now()) return cached.data;

  const token = getBlobToken();
  if (!token) {
    console.warn("[storage] No Vercel Blob token — running in memory only");
    return null;
  }

  try {
    const { blobs } = await list({ prefix: filename(shop), token });
    if (blobs.length === 0) return null;
    const blob = blobs[0];
    const sourceUrl = blob.downloadUrl || blob.url;
    const freshUrl = `${sourceUrl}${sourceUrl.includes("?") ? "&" : "?"}_=${Date.now()}`;
    const res = await fetch(freshUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as ShopData;
    cache.set(shop, { data, expires: Date.now() + CACHE_TTL });
    return data;
  } catch (e) {
    console.error("[storage] getShopData error:", e);
    return null;
  }
}

export async function saveShopData(data: ShopData): Promise<void> {
  const token = getBlobToken();
  if (!token) {
    throw new Error(
      "Vercel Blob not configured. Add BLOB_READ_WRITE_TOKEN env var."
    );
  }

  await put(filename(data.shop), JSON.stringify(data), {
    access: "public",
    contentType: "application/json",
    token,
    addRandomSuffix: false, // Overwrite same file
    allowOverwrite: true,
  });
  cache.set(data.shop, { data, expires: Date.now() + CACHE_TTL });
}

export async function initShopData(shop: string, accessToken: string): Promise<ShopData> {
  const existing = await getShopData(shop);
  if (existing) {
    // Update token only
    existing.accessToken = accessToken;
    await saveShopData(existing);
    return existing;
  }
  const fresh = defaultShopData(shop, accessToken);
  await saveShopData(fresh);
  return fresh;
}

export async function getAccessToken(shop: string): Promise<string | null> {
  const data = await getShopData(shop);
  return data?.accessToken || null;
}

/**
 * Mirror a subset of config fields from one shop to all other installed shops.
 * Shop-specific fields (accessToken, dailyAds, productCosts) are left alone.
 * Used to keep global settings (taxes, objectives, shipping brackets) in sync.
 */
export async function mirrorConfigToAllShops(
  sourceShop: string,
  partial: Record<string, unknown>
): Promise<{ mirrored: string[] }> {
  const all = await listInstalledShops();
  const others = all.filter((s) => s !== sourceShop);
  const mirrored: string[] = [];
  for (const shop of others) {
    const existing = await getShopData(shop);
    if (!existing) continue;
    existing.config = { ...existing.config, ...partial } as typeof existing.config;
    await saveShopData(existing);
    mirrored.push(shop);
  }
  return { mirrored };
}

/**
 * List all shops that have been installed (i.e. have data in the Blob store).
 * Returns shop domains like ["56aqy8-pd.myshopify.com", "w6daqz-3k.myshopify.com"].
 */
export async function listInstalledShops(): Promise<string[]> {
  const token = getBlobToken();
  if (!token) return [];
  try {
    const { blobs } = await list({ prefix: "shops/", token });
    return blobs
      .map((b) => {
        // Pathname looks like "shops/<slug>.json"
        const match = b.pathname.match(/^shops\/(.+)\.json$/);
        return match ? `${match[1]}.myshopify.com` : null;
      })
      .filter((s): s is string => s !== null);
  } catch (e) {
    console.error("[storage] listInstalledShops error:", e);
    return [];
  }
}
