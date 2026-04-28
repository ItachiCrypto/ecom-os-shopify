import { NextRequest, NextResponse } from "next/server";
import { getShopData, saveShopData } from "@/lib/storage";
import type { AdCampaign, DailyAdEntry } from "@/lib/types";

// One-shot admin endpoint to bulk-seed campaigns + per-day ad spend across
// shops. Designed to backfill data after a storage incident.
//
// POST /api/admin/seed-ad-spend?secret=<MIGRATION_SECRET>
// Body:
// {
//   "shops": [
//     {
//       "shop": "w6daqz-3k.myshopify.com",
//       "campaigns": [
//         { "name": "Ring - Testing US", "color": "#60a5fa", "countries": ["US"] }
//       ],
//       "spend": {
//         "Ring - Testing US": { "2026-03-29": 109.59, "2026-03-30": 94.69 }
//       }
//     }
//   ]
// }
//
// - If a campaign with the same name exists on the shop, it's reused (id kept).
// - Otherwise a new AdCampaign is appended with a deterministic slug-id.
// - dailyAds entries gain a byCampaign[campaignId] slot; the flat `spend`
//   field is recomputed as the sum across all byCampaign values.
// - Idempotent: re-running with the same payload overwrites the same slots.

interface ShopSeed {
  shop: string;
  campaigns?: { name: string; color?: string; countries?: string[]; utmCampaigns?: string[]; utmSources?: string[] }[];
  spend?: Record<string, Record<string, number>>;
  // Direct byCampaign key writes (skip the campaign-creation slugify path).
  // Use this for market scopes like `mkt:<handle>`.
  // { "mkt:united-stated": { "2026-04-15": 561.48, ... } }
  rawSpend?: Record<string, Record<string, number>>;
  // Names of campaigns to delete from this shop's adCampaigns list. Their
  // byCampaign entries should already have been zeroed via `spend`; this
  // just removes the now-empty campaign definition so it stops cluttering
  // the dropdown.
  removeCampaigns?: string[];
  // Wipe every dailyAds entry in this shop before applying the rest of the
  // seed. Use to clean up after experiments / failed migrations.
  wipeDailyAds?: boolean;
}

function slugify(name: string): string {
  return (
    "camp_" +
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
  );
}

function recomputeTotal(entry: DailyAdEntry): DailyAdEntry {
  if (!entry.byCampaign) return entry;
  const sum = Object.values(entry.byCampaign).reduce((s, c) => s + (c.spend || 0), 0);
  return { ...entry, spend: sum };
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("secret");
  const required = process.env.MIGRATION_SECRET;
  if (!required) {
    return NextResponse.json({ error: "MIGRATION_SECRET not set" }, { status: 500 });
  }
  if (!providedSecret || providedSecret !== required) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { shops?: ShopSeed[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const seeds = body.shops || [];
  if (seeds.length === 0) {
    return NextResponse.json({ error: "Empty shops array" }, { status: 400 });
  }

  const results: {
    shop: string;
    campaignsCreated: string[];
    campaignsReused: string[];
    campaignsRemoved?: string[];
    daysWritten: number;
    error?: string;
  }[] = [];

  for (const seed of seeds) {
    try {
      const data = await getShopData(seed.shop);
      if (!data) {
        results.push({
          shop: seed.shop,
          campaignsCreated: [],
          campaignsReused: [],
          daysWritten: 0,
          error: "Shop not installed in storage",
        });
        continue;
      }

      const existingCampaigns: AdCampaign[] = data.config.adCampaigns || [];
      const nameToId = new Map<string, string>();
      for (const c of existingCampaigns) nameToId.set(c.name.toLowerCase(), c.id);

      const created: string[] = [];
      const reused: string[] = [];
      for (const c of seed.campaigns || []) {
        const key = c.name.toLowerCase();
        if (nameToId.has(key)) {
          reused.push(c.name);
          continue;
        }
        const id = slugify(c.name);
        existingCampaigns.push({
          id,
          name: c.name,
          color: c.color,
          active: true,
          countries: c.countries,
          utmCampaigns: c.utmCampaigns,
          utmSources: c.utmSources,
        });
        nameToId.set(key, id);
        created.push(c.name);
      }

      let dailyAds = { ...(data.config.dailyAds || {}) };
      if (seed.wipeDailyAds) dailyAds = {};
      let daysWritten = 0;

      const writeKeyedSpend = (cid: string, dateMap: Record<string, number>) => {
        for (const [date, rawSpend] of Object.entries(dateMap)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          const spend = Number(rawSpend) || 0;
          const cur: DailyAdEntry = dailyAds[date]
            ? {
                ...dailyAds[date],
                byCampaign: { ...(dailyAds[date].byCampaign || {}) },
              }
            : { spend: 0 };
          const byCampaign = cur.byCampaign ?? {};
          if (spend === 0) {
            delete byCampaign[cid];
          } else {
            byCampaign[cid] = { spend };
          }
          // Always recompute the flat total from the breakdown so deleting
          // the last campaign correctly resets it to 0.
          cur.byCampaign = byCampaign;
          const next = recomputeTotal(cur);
          if (Object.keys(byCampaign).length === 0) delete next.byCampaign;
          if (!next.byCampaign && next.spend === 0 && !next.notes) {
            delete dailyAds[date];
          } else {
            dailyAds[date] = next;
          }
          daysWritten++;
        }
      };

      for (const [campaignName, dateMap] of Object.entries(seed.spend || {})) {
        const cid = nameToId.get(campaignName.toLowerCase());
        if (!cid) continue;
        writeKeyedSpend(cid, dateMap);
      }
      for (const [rawKey, dateMap] of Object.entries(seed.rawSpend || {})) {
        if (!rawKey) continue;
        writeKeyedSpend(rawKey, dateMap);
      }

      // Remove any campaigns the caller asked us to drop (after spends were
      // zeroed). Filtering by name keeps it user-friendly.
      const removedNames = (seed.removeCampaigns || []).map((n) => n.toLowerCase());
      let finalCampaigns = existingCampaigns;
      const removed: string[] = [];
      if (removedNames.length > 0) {
        finalCampaigns = existingCampaigns.filter((c) => {
          if (removedNames.includes(c.name.toLowerCase())) {
            removed.push(c.name);
            return false;
          }
          return true;
        });
      }

      await saveShopData({
        ...data,
        config: {
          ...data.config,
          adCampaigns: finalCampaigns,
          dailyAds,
        },
      });

      results.push({
        shop: seed.shop,
        campaignsCreated: created,
        campaignsReused: reused,
        ...(removed.length ? { campaignsRemoved: removed } : {}),
        daysWritten,
      });
    } catch (e) {
      results.push({
        shop: seed.shop,
        campaignsCreated: [],
        campaignsReused: [],
        daysWritten: 0,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
