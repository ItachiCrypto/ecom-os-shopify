// Incremental order sync.
//
// Strategy:
//  1. Persist a snapshot of all orders per shop in Vercel Blob (orders/${slug}.json).
//  2. On each sync, fetch only orders updated since `snapshot.lastSyncedAt` using
//     Shopify's `updated_at:>${ISO}` search filter.
//  3. Merge by order ID (newer record replaces older one). New orders are added.
//  4. Update lastSyncedAt to the newest order's updatedAt (or wall-clock now if zero results).
//
// Why this matters:
//  - Cold-start /api/orders went from "fetch 2500 orders, 10 GraphQL queries, 5–15s"
//    to "read snapshot from blob (~150ms) → 0 GraphQL queries".
//  - Refunds and order edits update `updated_at` on Shopify's side, so they're
//    detected by the next incremental sync without re-downloading the full history.
//
// The first sync is still a full crawl — capped at 5000 orders (20 pages × 250).
// Above that, increase maxPages or run on a longer schedule.

import { getAllOrders } from "./shopify";
import {
  getOrdersSnapshot,
  saveOrdersSnapshot,
  invalidateOrdersSnapshotCache,
  type OrdersSnapshot,
} from "./storage";

interface OrderShape {
  id: string;
  updatedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface SyncResult {
  shop: string;
  mode: "initial" | "incremental";
  added: number;
  updated: number;
  unchanged: number;
  totalOrders: number;
  lastSyncedAt: string;
  durationMs: number;
}

/**
 * Sync one shop's orders. If no snapshot exists yet, runs a full sync.
 * Otherwise runs an incremental fetch using `updated_at:>${snapshot.lastSyncedAt}`.
 *
 * `force=true` ignores the existing snapshot and runs a full sync regardless.
 */
export async function syncShopOrders(
  shop: string,
  options: { force?: boolean } = {}
): Promise<SyncResult> {
  const start = Date.now();
  const existing = options.force ? null : await getOrdersSnapshot(shop);
  const mode: "initial" | "incremental" = existing ? "incremental" : "initial";

  // Pad the lastSyncedAt by 1 minute to avoid missing concurrent edits because
  // Shopify's `updated_at` precision can lag behind our wall clock by a few seconds.
  const since = existing
    ? new Date(new Date(existing.lastSyncedAt).getTime() - 60_000).toISOString()
    : undefined;

  const fetched = (await getAllOrders(shop, {
    maxPages: existing ? 10 : 20,
    since,
  })) as OrderShape[];

  // Merge: build a Map<id, order> from existing, then upsert with fetched.
  const merged = new Map<string, OrderShape>();
  if (existing) {
    for (const o of existing.orders as OrderShape[]) {
      if (o?.id) merged.set(o.id, o);
    }
  }

  let added = 0;
  let updated = 0;
  for (const o of fetched) {
    if (!o?.id) continue;
    if (merged.has(o.id)) {
      updated += 1;
    } else {
      added += 1;
    }
    merged.set(o.id, o);
  }

  const orders = Array.from(merged.values());

  // Pick the latest updatedAt as the new sync watermark (fall back to now if
  // no orders have updatedAt — shouldn't happen, but safe).
  const watermark =
    orders.reduce<string>((latest, o) => {
      const t = o.updatedAt || o.createdAt || "";
      return t > latest ? t : latest;
    }, "") || new Date().toISOString();

  const snapshot: OrdersSnapshot = {
    shop,
    lastSyncedAt: watermark,
    totalOrders: orders.length,
    orders,
  };

  await saveOrdersSnapshot(snapshot);
  invalidateOrdersSnapshotCache(shop); // ensure next read sees the new write

  return {
    shop,
    mode,
    added,
    updated,
    unchanged: orders.length - added - updated,
    totalOrders: orders.length,
    lastSyncedAt: watermark,
    durationMs: Date.now() - start,
  };
}

/**
 * Make sure a shop has at least an initial snapshot. Used by /api/orders so
 * the first request after install isn't a cold-fetch from Shopify.
 */
export async function ensureSnapshotExists(shop: string): Promise<OrdersSnapshot> {
  const existing = await getOrdersSnapshot(shop);
  if (existing) return existing;
  await syncShopOrders(shop, { force: true });
  const fresh = await getOrdersSnapshot(shop);
  if (!fresh) throw new Error(`Failed to create initial snapshot for ${shop}`);
  return fresh;
}
