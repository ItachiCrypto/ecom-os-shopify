import { NextRequest, NextResponse } from "next/server";
import { ALL_SHOPS, MASTER_SHOP, SHOP_COOKIE } from "@/lib/config";
import { jsonSWR } from "@/lib/http";
import { getCachedMarkets, type ShopifyMarketLite } from "@/lib/markets";
import { getShopData, listActiveShops, saveShopData } from "@/lib/storage";
import type { DailyAdEntry } from "@/lib/types";

interface BatchEntry {
  shop?: string;
  date: string;
  spend: number;
  notes?: string;
  // When set, the spend is recorded under that campaign rather than as a flat
  // single-value entry. The flat `spend` field of the date entry becomes the
  // sum across all campaigns.
  campaignId?: string;
}

// Per-shop mutex to serialize concurrent read-modify-write on the same blob.
// Without this, two parallel POSTs on the same shop race and one write is lost.
const shopLocks = new Map<string, Promise<unknown>>();

function withShopLock<T>(shop: string, fn: () => Promise<T>): Promise<T> {
  const prev = shopLocks.get(shop) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  shopLocks.set(
    shop,
    next.finally(() => {
      if (shopLocks.get(shop) === next) shopLocks.delete(shop);
    })
  );
  return next;
}

function normalizeDailyAds(dailyAds: Record<string, DailyAdEntry> | undefined) {
  return dailyAds || {};
}

export async function GET(request: NextRequest) {
  const activeShop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!activeShop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const installed = await listActiveShops();
  const shops = activeShop === ALL_SHOPS ? installed : [activeShop];
  const dailyAdsByShop: Record<string, Record<string, DailyAdEntry>> = {};
  const campaignsByShop: Record<string, NonNullable<Awaited<ReturnType<typeof getShopData>>>["config"]["adCampaigns"]> = {};
  const marketsByShop: Record<string, ShopifyMarketLite[]> = {};

  // Fetch shop blob + Shopify Markets in parallel per shop. Markets are
  // cached for 1h so repeat calls are cheap.
  await Promise.all(
    shops.map(async (shop) => {
      const [data, markets] = await Promise.all([getShopData(shop), getCachedMarkets(shop)]);
      dailyAdsByShop[shop] = normalizeDailyAds(data?.config.dailyAds);
      campaignsByShop[shop] = data?.config.adCampaigns || [];
      marketsByShop[shop] = markets;
    })
  );

  return jsonSWR(
    {
      activeShop,
      editableShop:
        activeShop === ALL_SHOPS && installed.includes(MASTER_SHOP) ? MASTER_SHOP : shops[0],
      shops: shops.map((shop) => ({
        shop,
        name: shop.replace(".myshopify.com", ""),
      })),
      dailyAdsByShop,
      campaignsByShop,
      marketsByShop,
    },
    { maxAge: 30, swr: 300 }
  );
}

function validateEntry(
  raw: BatchEntry,
  fallbackShop: string | undefined,
  installed: string[]
):
  | {
      ok: true;
      shop: string;
      date: string;
      spend: number;
      notes?: string;
      campaignId?: string;
    }
  | { ok: false; error: string } {
  const date = raw.date || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Invalid date" };

  const spend = Number(raw.spend ?? 0);
  if (!Number.isFinite(spend) || spend < 0) return { ok: false, error: "Invalid spend" };

  const targetShop = raw.shop || fallbackShop;
  if (!targetShop || targetShop === ALL_SHOPS || !installed.includes(targetShop)) {
    return { ok: false, error: `Invalid shop: ${targetShop ?? "(none)"}` };
  }

  const campaignId = raw.campaignId?.trim() || undefined;

  return {
    ok: true,
    shop: targetShop,
    date,
    spend,
    notes: raw.notes?.trim() || undefined,
    campaignId,
  };
}

/** Recompute the flat `spend` of a date entry from its byCampaign breakdown. */
function recomputeTotal(entry: DailyAdEntry): DailyAdEntry {
  if (!entry.byCampaign) return entry;
  const sum = Object.values(entry.byCampaign).reduce((s, c) => s + (c.spend || 0), 0);
  return { ...entry, spend: sum };
}

export async function POST(request: NextRequest) {
  const activeShop = request.cookies.get(SHOP_COOKIE)?.value;
  if (!activeShop) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: BatchEntry & { entries?: BatchEntry[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const installed = await listActiveShops();
  const fallbackShop = activeShop === ALL_SHOPS ? undefined : activeShop;

  // Accept single entry (backward-compat) or batch
  const rawEntries: BatchEntry[] = Array.isArray(body.entries)
    ? body.entries
    : [
        {
          shop: body.shop,
          date: body.date,
          spend: body.spend ?? 0,
          notes: body.notes,
          campaignId: body.campaignId,
        },
      ];

  type Validated = {
    shop: string;
    date: string;
    spend: number;
    notes?: string;
    campaignId?: string;
  };
  const validated: Validated[] = [];
  for (const raw of rawEntries) {
    const v = validateEntry(raw, fallbackShop, installed);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    validated.push(v);
  }

  // Group by shop so each shop's blob is read+written exactly once
  const byShop = new Map<string, Validated[]>();
  for (const e of validated) {
    const arr = byShop.get(e.shop) ?? [];
    arr.push(e);
    byShop.set(e.shop, arr);
  }

  const results: { shop: string; updated: string[]; deleted: string[] }[] = [];
  const errors: { shop: string; error: string }[] = [];

  // Apply all shops in parallel — but each shop's write is serialized via withShopLock
  await Promise.all(
    Array.from(byShop.entries()).map(([shop, entries]) =>
      withShopLock(shop, async () => {
        const data = await getShopData(shop);
        if (!data) {
          errors.push({ shop, error: "Shop data not found" });
          return;
        }
        const dailyAds = { ...(data.config.dailyAds || {}) };
        const updated: string[] = [];
        const deleted: string[] = [];
        for (const e of entries) {
          const current: DailyAdEntry = dailyAds[e.date]
            ? { ...dailyAds[e.date], byCampaign: { ...(dailyAds[e.date].byCampaign || {}) } }
            : { spend: 0 };

          if (e.campaignId) {
            // Per-campaign edit — update that campaign slot, recompute total
            const byCampaign = current.byCampaign ?? {};
            if (e.spend === 0) {
              delete byCampaign[e.campaignId];
            } else {
              byCampaign[e.campaignId] = {
                spend: e.spend,
                ...(e.notes ? { notes: e.notes } : {}),
              };
            }
            current.byCampaign = byCampaign;
            const next = recomputeTotal(current);
            if (next.spend === 0 && Object.keys(byCampaign).length === 0) {
              delete dailyAds[e.date];
              deleted.push(e.date);
            } else {
              if (Object.keys(byCampaign).length === 0) delete next.byCampaign;
              dailyAds[e.date] = next;
              updated.push(e.date);
            }
          } else {
            // Flat edit (legacy): replace top-level spend, drop any byCampaign
            // breakdown so the two modes don't desync.
            if (e.spend === 0) {
              delete dailyAds[e.date];
              deleted.push(e.date);
            } else {
              dailyAds[e.date] = {
                spend: e.spend,
                ...(e.notes ? { notes: e.notes } : {}),
              };
              updated.push(e.date);
            }
          }
        }
        await saveShopData({
          ...data,
          config: { ...data.config, dailyAds },
        });
        results.push({ shop, updated, deleted });
      }).catch((err) => {
        errors.push({ shop, error: err instanceof Error ? err.message : "Unknown error" });
      })
    )
  );

  if (errors.length > 0 && results.length === 0) {
    return NextResponse.json({ error: "All saves failed", errors }, { status: 500 });
  }

  return NextResponse.json({ ok: true, results, ...(errors.length ? { errors } : {}) });
}
