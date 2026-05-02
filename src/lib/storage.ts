import { get, put, list } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import type { ShopData } from "./types";
import { defaultShopData } from "./types";
import { CONFIGURED_SHOPS } from "./config";

// =============================================================================
// Storage backend selection
// =============================================================================
// - If KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL +
//   UPSTASH_REDIS_REST_TOKEN) are set, use Upstash Redis.
// - Otherwise fall back to Vercel Blob.
//
// Switching backend = swap env vars and redeploy. The app picks the right one
// at runtime.
// =============================================================================

type Backend = "redis" | "blob" | "none";

function pickBackend(): Backend {
  const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (redisUrl && redisToken) return "redis";
  if (getBlobToken()) return "blob";
  return "none";
}

function getBlobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const blobEnvNames = Object.keys(process.env).filter(
    (k) => k.includes("BLOB") && k.includes("TOKEN")
  );
  return blobEnvNames.map((k) => process.env[k]).find((v) => v && v.startsWith("vercel_blob_"));
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  _redis = new Redis({ url, token });
  return _redis;
}

// =============================================================================
// Cache (in-memory, per-instance)
// =============================================================================
// Bumped from 30s → 5min: the dominant cost on cold-start requests is the
// remote read; changes are still pushed through saveShopData.

// Per-instance cache disabled (TTL=0). On Vercel, function instances each
// carry their own Map, so any positive TTL leaves stale snapshots floating
// around after a write — and reads land on whichever instance the router
// picks. Upstash Redis reads are ~10ms, so always-fresh is fine.
const cache = new Map<string, { data: ShopData; expires: number }>();
const CACHE_TTL = 0;

export function invalidateShopCache(shop?: string): void {
  if (shop) cache.delete(shop);
  else cache.clear();
}

// =============================================================================
// Key/path helpers
// =============================================================================

function shopSlug(shop: string): string {
  return shop.replace(".myshopify.com", "").toLowerCase();
}

function blobFilename(shop: string): string {
  return `shops/${shopSlug(shop)}.json`;
}

function redisKey(shop: string): string {
  return `shop:${shopSlug(shop)}`;
}

const REDIS_INDEX_KEY = "shops:index"; // Redis Set holding all installed shop domains

// =============================================================================
// Read
// =============================================================================

export async function getShopData(shop: string): Promise<ShopData | null> {
  const cached = cache.get(shop);
  if (cached && cached.expires > Date.now()) return cached.data;

  const backend = pickBackend();
  if (backend === "none") {
    console.warn("[storage] No backend configured (KV_REST_API_URL or BLOB_READ_WRITE_TOKEN required)");
    return null;
  }

  try {
    let data: ShopData | null = null;

    if (backend === "redis") {
      const raw = await redis().get<ShopData | string>(redisKey(shop));
      if (raw) {
        data = typeof raw === "string" ? (JSON.parse(raw) as ShopData) : raw;
      }
    } else {
      const blob = await get(blobFilename(shop), { access: "public", token: getBlobToken() });
      if (blob?.stream) {
        const text = await new Response(blob.stream).text();
        data = JSON.parse(text) as ShopData;
      }
    }

    if (data) cache.set(shop, { data, expires: Date.now() + CACHE_TTL });
    return data;
  } catch (e) {
    console.error("[storage] getShopData error:", e);
    return null;
  }
}

// =============================================================================
// Write
// =============================================================================

export async function saveShopData(data: ShopData): Promise<void> {
  const backend = pickBackend();
  if (backend === "none") {
    throw new Error(
      "No storage backend configured. Set KV_REST_API_URL + KV_REST_API_TOKEN (Upstash Redis) " +
        "or BLOB_READ_WRITE_TOKEN (Vercel Blob)."
    );
  }

  if (backend === "redis") {
    const r = redis();
    await Promise.all([
      r.set(redisKey(data.shop), JSON.stringify(data)),
      r.sadd(REDIS_INDEX_KEY, data.shop.toLowerCase()),
    ]);
  } else {
    await put(blobFilename(data.shop), JSON.stringify(data), {
      access: "public",
      contentType: "application/json",
      token: getBlobToken(),
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  }
  cache.set(data.shop, { data, expires: Date.now() + CACHE_TTL });
}

// =============================================================================
// Install / token helpers
// =============================================================================

export async function initShopData(shop: string, accessToken: string): Promise<ShopData> {
  const existing = await getShopData(shop);
  if (existing) {
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
  const all = await listActiveShops();
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

// =============================================================================
// Listing
// =============================================================================

/**
 * List all shops that have data (i.e. that completed an OAuth install).
 */
export async function listInstalledShops(): Promise<string[]> {
  const backend = pickBackend();
  if (backend === "none") return [];

  try {
    if (backend === "redis") {
      const members = await redis().smembers(REDIS_INDEX_KEY);
      return (members as string[]).map((s) => s.toLowerCase());
    }
    const { blobs } = await list({ prefix: "shops/", token: getBlobToken() });
    return blobs
      .map((b) => {
        const match = b.pathname.match(/^shops\/(.+)\.json$/);
        return match ? `${match[1]}.myshopify.com` : null;
      })
      .filter((s): s is string => s !== null);
  } catch (e) {
    console.error("[storage] listInstalledShops error:", e);
    return [];
  }
}

/**
 * Shops considered part of the current workspace.
 * Filters out shops not in CONFIGURED_SHOPS to prevent the aggregate view
 * from drifting if a stale test shop blob exists.
 */
export async function listActiveShops(): Promise<string[]> {
  const installed = await listInstalledShops();
  if (CONFIGURED_SHOPS.length === 0) return installed;
  const installedSet = new Set(installed.map((shop) => shop.toLowerCase()));
  const configuredInstalled = CONFIGURED_SHOPS.filter((shop) => installedSet.has(shop));
  return configuredInstalled.length > 0 ? configuredInstalled : installed;
}

// =============================================================================
// Orders snapshot
// =============================================================================
// Two backends, picked by `pickBackend()`:
//  - Redis (Upstash): chunked storage to fit within request-size limits.
//    Meta key: `orders:meta:${slug}` → { lastSyncedAt, totalOrders, chunkCount }
//    Chunk keys: `orders:chunk:${slug}:${i}` → JSON array of CHUNK_SIZE orders
//  - Blob: single JSON file at orders/${slug}.json (used if Redis unavailable).

export interface OrdersSnapshot {
  shop: string;
  lastSyncedAt: string; // ISO 8601
  totalOrders: number;
  orders: unknown[]; // Shopify Order shape, kept opaque here
}

interface OrdersMeta {
  shop: string;
  lastSyncedAt: string;
  totalOrders: number;
  chunkCount: number;
  chunkSize: number;
}

function ordersBlobFilename(shop: string): string {
  return `orders/${shopSlug(shop)}.json`;
}
function ordersMetaKey(shop: string): string {
  return `orders:meta:${shopSlug(shop)}`;
}
function ordersChunkKey(shop: string, i: number): string {
  return `orders:chunk:${shopSlug(shop)}:${i}`;
}

// Each chunk holds at most CHUNK_SIZE orders. ~200 × ~5KB = ~1MB, comfortably
// under Upstash request-size limits while keeping chunk count low for fast reads.
const CHUNK_SIZE = 200;

// Snapshots are large (5–15 MB). Reading them on every request is the whole
// point of the snapshot pattern — but inside a single Vercel function instance
// we can amortize storage reads. 60s in-memory cache absorbs burst reads from
// the same instance during one user session.
const snapshotCache = new Map<string, { data: OrdersSnapshot; expires: number }>();
const SNAPSHOT_CACHE_TTL = 60_000;

export function invalidateOrdersSnapshotCache(shop?: string): void {
  if (shop) snapshotCache.delete(shop);
  else snapshotCache.clear();
}

export async function getOrdersSnapshot(shop: string): Promise<OrdersSnapshot | null> {
  const hit = snapshotCache.get(shop);
  if (hit && hit.expires > Date.now()) return hit.data;

  const backend = pickBackend();
  if (backend === "none") {
    console.warn("[storage] No backend configured — orders snapshot unavailable");
    return null;
  }

  try {
    if (backend === "redis") {
      return await getOrdersSnapshotFromRedis(shop);
    }
    return await getOrdersSnapshotFromBlob(shop);
  } catch (e) {
    console.error("[storage] getOrdersSnapshot error:", e);
    return null;
  }
}

async function getOrdersSnapshotFromRedis(shop: string): Promise<OrdersSnapshot | null> {
  const r = redis();
  const metaRaw = await r.get<OrdersMeta | string>(ordersMetaKey(shop));
  if (!metaRaw) return null;
  const meta: OrdersMeta = typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw;

  if (meta.chunkCount === 0) {
    return { shop, lastSyncedAt: meta.lastSyncedAt, totalOrders: 0, orders: [] };
  }

  // Read all chunks in parallel. Upstash supports HTTP/2 multiplexing, so this
  // is roughly O(slowest chunk) wall-clock instead of O(chunkCount).
  const keys = Array.from({ length: meta.chunkCount }, (_, i) => ordersChunkKey(shop, i));
  const chunkData = await Promise.all(keys.map((k) => r.get<unknown[] | string>(k)));
  const orders: unknown[] = [];
  for (const chunk of chunkData) {
    if (!chunk) continue;
    const arr = typeof chunk === "string" ? (JSON.parse(chunk) as unknown[]) : chunk;
    orders.push(...arr);
  }

  const data: OrdersSnapshot = {
    shop,
    lastSyncedAt: meta.lastSyncedAt,
    totalOrders: orders.length,
    orders,
  };
  snapshotCache.set(shop, { data, expires: Date.now() + SNAPSHOT_CACHE_TTL });
  return data;
}

async function getOrdersSnapshotFromBlob(shop: string): Promise<OrdersSnapshot | null> {
  const token = getBlobToken();
  if (!token) return null;
  try {
    const blob = await get(ordersBlobFilename(shop), { access: "public", token });
    if (!blob?.stream) return null;
    const text = await new Response(blob.stream).text();
    const data = JSON.parse(text) as OrdersSnapshot;
    snapshotCache.set(shop, { data, expires: Date.now() + SNAPSHOT_CACHE_TTL });
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) return null;
    throw e;
  }
}

export async function saveOrdersSnapshot(snapshot: OrdersSnapshot): Promise<void> {
  const backend = pickBackend();
  if (backend === "none") {
    throw new Error("No storage backend configured for orders snapshot.");
  }
  if (backend === "redis") {
    await saveOrdersSnapshotToRedis(snapshot);
  } else {
    await saveOrdersSnapshotToBlob(snapshot);
  }
  snapshotCache.set(snapshot.shop, { data: snapshot, expires: Date.now() + SNAPSHOT_CACHE_TTL });
}

async function saveOrdersSnapshotToRedis(snapshot: OrdersSnapshot): Promise<void> {
  const r = redis();
  const orders = snapshot.orders;
  const chunkCount = Math.ceil(orders.length / CHUNK_SIZE);

  // Read previous chunkCount so we can delete leftover chunks if the new
  // snapshot is smaller (rare, but happens if orders are deleted).
  const prevMeta = await r.get<OrdersMeta | string>(ordersMetaKey(snapshot.shop));
  const prev = prevMeta ? (typeof prevMeta === "string" ? JSON.parse(prevMeta) : prevMeta) as OrdersMeta : null;

  // Write chunks in parallel
  const chunkOps: Promise<unknown>[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const slice = orders.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    chunkOps.push(r.set(ordersChunkKey(snapshot.shop, i), JSON.stringify(slice)));
  }
  // Delete leftover chunks from previous (smaller) snapshot
  if (prev && prev.chunkCount > chunkCount) {
    for (let i = chunkCount; i < prev.chunkCount; i++) {
      chunkOps.push(r.del(ordersChunkKey(snapshot.shop, i)));
    }
  }
  await Promise.all(chunkOps);

  // Write meta last — atomicity from the reader's POV (if meta exists, all chunks do)
  const meta: OrdersMeta = {
    shop: snapshot.shop,
    lastSyncedAt: snapshot.lastSyncedAt,
    totalOrders: orders.length,
    chunkCount,
    chunkSize: CHUNK_SIZE,
  };
  await r.set(ordersMetaKey(snapshot.shop), JSON.stringify(meta));
}

async function saveOrdersSnapshotToBlob(snapshot: OrdersSnapshot): Promise<void> {
  const token = getBlobToken();
  if (!token) throw new Error("Vercel Blob token required.");
  await put(ordersBlobFilename(snapshot.shop), JSON.stringify(snapshot), {
    access: "public",
    contentType: "application/json",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}
