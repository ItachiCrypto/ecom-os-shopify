import { NextRequest, NextResponse } from "next/server";
import { list, get } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import type { ShopData } from "@/lib/types";

// One-shot admin endpoint. Reads every shop blob from Vercel Blob and writes
// it into Vercel KV (Upstash Redis) using the same key shape the runtime
// storage layer expects.
//
// Usage:
//   GET /api/admin/migrate-blob-to-kv?secret=<MIGRATION_SECRET>
//   GET /api/admin/migrate-blob-to-kv?secret=...&overwrite=true   # also overwrites
//                                                                   existing Redis keys
//   GET /api/admin/migrate-blob-to-kv?secret=...&blobToken=...    # explicit Blob token
//                                                                   (only needed if the
//                                                                   default token is no
//                                                                   longer valid)
//
// Notes:
// - Requires MIGRATION_SECRET env var set to a non-empty value.
// - Requires Redis env (KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_*).
// - Reads Blob with BLOB_READ_WRITE_TOKEN (auto-detected like in storage.ts)
//   unless you pass `&blobToken=...`.
// - Skips shops that already exist in Redis unless `overwrite=true`.
// - Idempotent: safe to re-run.

const REDIS_INDEX_KEY = "shops:index";

function getBlobToken(override?: string | null): string | undefined {
  if (override) return override;
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const blobEnvNames = Object.keys(process.env).filter(
    (k) => k.includes("BLOB") && k.includes("TOKEN")
  );
  return blobEnvNames.map((k) => process.env[k]).find((v) => v && v.startsWith("vercel_blob_"));
}

function shopFromPathname(pathname: string): string | null {
  const match = pathname.match(/^shops\/(.+)\.json$/);
  return match ? `${match[1]}.myshopify.com` : null;
}

function shopSlug(shop: string): string {
  return shop.replace(".myshopify.com", "").toLowerCase();
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("secret");
  const overwrite = url.searchParams.get("overwrite") === "true";
  const blobTokenOverride = url.searchParams.get("blobToken");

  const required = process.env.MIGRATION_SECRET;
  if (!required) {
    return NextResponse.json(
      { error: "MIGRATION_SECRET env var must be set on the server before using this endpoint" },
      { status: 500 }
    );
  }
  if (!providedSecret || providedSecret !== required) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blobToken = getBlobToken(blobTokenOverride);
  if (!blobToken) {
    return NextResponse.json(
      { error: "No Blob token available. Pass ?blobToken=... or set BLOB_READ_WRITE_TOKEN." },
      { status: 500 }
    );
  }

  const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return NextResponse.json(
      { error: "Redis env not configured (KV_REST_API_URL + KV_REST_API_TOKEN)" },
      { status: 500 }
    );
  }
  const redis = new Redis({ url: redisUrl, token: redisToken });

  // 1. List blob entries
  let blobs: { pathname: string }[];
  try {
    const result = await list({ prefix: "shops/", token: blobToken });
    blobs = result.blobs;
  } catch (e) {
    return NextResponse.json(
      {
        error: "Could not list Blob entries (store may be suspended or token invalid)",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 }
    );
  }

  if (blobs.length === 0) {
    return NextResponse.json({ ok: true, migrated: [], skipped: [], errors: [], note: "No shop blobs found" });
  }

  const migrated: { shop: string; bytes: number }[] = [];
  const skipped: { shop: string; reason: string }[] = [];
  const errors: { shop: string; error: string }[] = [];

  // 2. For each blob, read JSON, write to Redis
  for (const b of blobs) {
    const shop = shopFromPathname(b.pathname);
    if (!shop) {
      skipped.push({ shop: b.pathname, reason: "Unrecognized pathname format" });
      continue;
    }

    try {
      const slug = shopSlug(shop);
      const redisKey = `shop:${slug}`;

      // If a Redis key already exists, skip unless overwrite=true
      if (!overwrite) {
        const existing = await redis.exists(redisKey);
        if (existing) {
          skipped.push({ shop, reason: "Already exists in Redis (use overwrite=true to force)" });
          continue;
        }
      }

      // Read blob
      const blob = await get(b.pathname, { access: "public", token: blobToken });
      if (!blob?.stream) {
        errors.push({ shop, error: "Blob has no stream (deleted?)" });
        continue;
      }
      const text = await new Response(blob.stream).text();
      const data = JSON.parse(text) as ShopData;

      // Write to Redis: data + index membership
      await Promise.all([
        redis.set(redisKey, JSON.stringify(data)),
        redis.sadd(REDIS_INDEX_KEY, shop.toLowerCase()),
      ]);

      migrated.push({ shop, bytes: text.length });
    } catch (e) {
      errors.push({ shop, error: e instanceof Error ? e.message : "unknown" });
    }
  }

  return NextResponse.json({
    ok: true,
    migrated,
    skipped,
    errors,
    summary: {
      total: blobs.length,
      migrated: migrated.length,
      skipped: skipped.length,
      errors: errors.length,
    },
  });
}
