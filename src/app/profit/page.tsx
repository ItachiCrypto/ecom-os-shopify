"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { cachedFetch, invalidate } from "@/lib/data-cache";
import { fmtMoney } from "@/lib/order-utils";
import { useDateRangeCtx } from "@/components/DateRangeContext";
import { addDaysIso, formatIsoDate, inRange, isoInTimeZone } from "@/hooks/useDateRange";
import type { ProductCost, Bundle, MonthlySubscription, AdCampaign, DailyAdEntry } from "@/lib/types";

interface Money { shopMoney: { amount: string; currencyCode: string } }
interface Variant {
  id: string;
  title: string;
  price: string;
  sku?: string | null;
  product?: { id: string; title: string } | null;
}
interface LineItem {
  title: string;
  quantity: number;
  variant: Variant | null;
  originalTotalSet: Money;
  discountedTotalSet: Money;
  customAttributes: { key: string; value: string }[];
}
interface UtmParameters {
  campaign?: string | null;
  source?: string | null;
  medium?: string | null;
  content?: string | null;
  term?: string | null;
}
interface Visit {
  source?: string | null;
  sourceType?: string | null;
  referrerUrl?: string | null;
  landingPage?: string | null;
  utmParameters?: UtmParameters | null;
}
interface Order {
  id: string;
  name: string;
  createdAt: string;
  currentTotalPriceSet: Money;
  totalRefundedSet: Money;
  shippingAddress: { countryCodeV2?: string } | null;
  customerJourneySummary?: { firstVisit?: Visit | null; lastVisit?: Visit | null } | null;
  lineItems: { edges: { node: LineItem }[] };
  customAttributes?: { key: string; value: string }[];
}

interface ShopData {
  config: {
    urssaf: number;
    ir: number;
    tva: number;
    taxOnAdSpend?: number;
    shopifyFixedFeePerOrder?: number;
    monthlySubscriptions?: MonthlySubscription[];
    productCosts?: Record<string, ProductCost>;
    bundles?: Bundle[];
    dailyAds?: Record<string, DailyAdEntry>;
    adCampaigns?: AdCampaign[];
    shippingCostByQty?: Record<string, number>;
  };
}

interface ShopOption {
  shop: string;
  name: string;
}

type DailyAds = Record<string, DailyAdEntry>;
type DailyAdsByShop = Record<string, DailyAds>;
type CampaignsByShop = Record<string, AdCampaign[]>;

interface MarketRegion { node: { code: string; name: string } }
interface ShopifyMarketLite {
  id: string;
  name: string;
  handle: string;
  enabled: boolean;
  primary: boolean;
  regions: { edges: MarketRegion[] };
}
type MarketsByShop = Record<string, ShopifyMarketLite[]>;

// Sentinel filter values
const CAMPAIGN_ALL = "__all_campaigns__";
const CAMPAIGN_FLAT = "__flat__"; // legacy entries (no breakdown)

export default function ProfitPage() { return <Shell><Profit /></Shell>; }

function Profit() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [data, setData] = useState<ShopData | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [dirty, setDirty] = useState(false);
  const [isAllMode, setIsAllMode] = useState(false);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [editableShop, setEditableShop] = useState("");
  const [dailyAdsByShop, setDailyAdsByShop] = useState<DailyAdsByShop>({});
  const [campaignsByShop, setCampaignsByShop] = useState<CampaignsByShop>({});
  const [marketsByShop, setMarketsByShop] = useState<MarketsByShop>({});
  const [campaignFilter, setCampaignFilter] = useState<string>(CAMPAIGN_ALL);
  const [pendingAdSaves, setPendingAdSaves] = useState<
    Record<string, { shop?: string; date: string; spend: number; notes?: string; campaignId?: string }>
  >({});
  const { range, timeZone } = useDateRangeCtx();

  useEffect(() => {
    let mounted = true;
    const apply = (
      o: { orders: Order[] } | null,
      d: { data: ShopData } | null,
      s: { shop?: { currencyCode?: string; myshopifyDomain?: string }; mode?: string } | null,
      ads:
        | {
            shops?: ShopOption[];
            dailyAdsByShop?: DailyAdsByShop;
            editableShop?: string;
            campaignsByShop?: CampaignsByShop;
            marketsByShop?: MarketsByShop;
          }
        | null
    ) => {
      if (!mounted) return;
      if (o?.orders) setOrders(o.orders);
      if (d?.data) setData(d.data);
      if (s?.shop?.currencyCode) setCurrency(s.shop.currencyCode);
      if (s?.mode === "all" || s?.shop?.myshopifyDomain === "__all__") setIsAllMode(true);
      if (ads?.shops) setShops(ads.shops);
      if (ads?.dailyAdsByShop) setDailyAdsByShop(ads.dailyAdsByShop);
      if (ads?.editableShop) setEditableShop(ads.editableShop);
      if (ads?.campaignsByShop) setCampaignsByShop(ads.campaignsByShop);
      if (ads?.marketsByShop) setMarketsByShop(ads.marketsByShop);
    };

    Promise.all([
      cachedFetch<{ orders: Order[] }>("/api/orders?all=true", {
        onUpdate: (d) => apply(d, null, null, null),
      }),
      cachedFetch<{ data: ShopData }>("/api/data", {
        onUpdate: (d) => apply(null, d, null, null),
      }),
      cachedFetch<{ shop?: { currencyCode?: string; myshopifyDomain?: string }; mode?: string }>(
        "/api/shop",
        { onUpdate: (d) => apply(null, null, d, null) }
      ).catch(() => null),
      cachedFetch<{
        shops?: ShopOption[];
        dailyAdsByShop?: DailyAdsByShop;
        editableShop?: string;
        campaignsByShop?: CampaignsByShop;
        marketsByShop?: MarketsByShop;
      }>("/api/ad-spend", { onUpdate: (d) => apply(null, null, null, d) }).catch(() => null),
    ]).then(([o, d, s, ads]) => apply(o, d, s, ads));

    return () => {
      mounted = false;
    };
  }, []);

  // Sum the per-shop daily entries down to a single date map. If `campaignId`
  // is provided, only that campaign's spend per date contributes — the legacy
  // flat (non-breakdown) entries contribute only when the filter is "All" or
  // the special FLAT bucket.
  const mergeDailyAds = (
    byShop: DailyAdsByShop,
    campaignId: string = CAMPAIGN_ALL
  ): DailyAds => {
    const merged: DailyAds = {};
    for (const entries of Object.values(byShop)) {
      for (const [date, entry] of Object.entries(entries || {})) {
        let spend = 0;
        let notes: string | undefined;
        if (campaignId === CAMPAIGN_ALL) {
          spend = entry.spend || 0;
          notes = entry.notes;
        } else if (campaignId === CAMPAIGN_FLAT) {
          // Only the residual flat amount that isn't already attributed to a campaign
          const breakdownSum = entry.byCampaign
            ? Object.values(entry.byCampaign).reduce((s, c) => s + (c.spend || 0), 0)
            : 0;
          spend = Math.max(0, (entry.spend || 0) - breakdownSum);
          notes = entry.notes;
        } else {
          const c = entry.byCampaign?.[campaignId];
          spend = c?.spend || 0;
          notes = c?.notes;
        }
        if (spend === 0 && !notes) continue;
        const cur = merged[date] ?? { spend: 0 };
        cur.spend = (cur.spend || 0) + spend;
        cur.notes =
          cur.notes && notes ? `${cur.notes} | ${notes}` : cur.notes || notes;
        merged[date] = cur;
      }
    }
    return merged;
  };

  // Synthesize an AdCampaign from a Shopify Market — its filter "countries"
  // are the market's regions. id = "mkt:<handle>" so it doesn't collide with
  // manually-created campaigns. In ALL mode, prefix with shop so each market
  // becomes uniquely scoped.
  const marketAsCampaign = (
    m: ShopifyMarketLite,
    shopPrefix: string | null
  ): AdCampaign => {
    const countries = (m.regions?.edges || [])
      .map((e) => e.node?.code)
      .filter((c): c is string => !!c);
    const baseId = `mkt:${m.handle || m.id}`;
    return {
      id: shopPrefix ? `${shopPrefix}:${baseId}` : baseId,
      name: shopPrefix
        ? `${m.name} · ${shopPrefix.replace(".myshopify.com", "")}`
        : m.name,
      active: m.enabled !== false,
      countries,
    };
  };

  // Each shop's markets are kept distinct in ALL mode — main's "US" and
  // Hispanic's "Estados Unidos" are different markets even though both
  // target the US country. The dropdown shows them with a shop suffix so
  // the user can pick the right one.
  const marketCampaigns: AdCampaign[] = useMemo(() => {
    if (isAllMode) {
      const list: AdCampaign[] = [];
      for (const [shop, ms] of Object.entries(marketsByShop)) {
        for (const m of ms || []) {
          if (m.enabled === false) continue;
          list.push(marketAsCampaign(m, shop));
        }
      }
      return list;
    }
    const myShop = shops[0]?.shop || "";
    return (marketsByShop[myShop] || [])
      .filter((m) => m.enabled !== false)
      .map((m) => marketAsCampaign(m, null));
  }, [isAllMode, marketsByShop, shops]);

  // Manual campaigns (user-defined, with UTM matching). Hidden in ALL mode —
  // the user wants to manage spend purely via Shopify Markets at the
  // aggregated level. Manual campaigns remain available in single-shop mode
  // for users who do their own UTM-based attribution.
  const manualCampaigns: AdCampaign[] = useMemo(() => {
    if (isAllMode) return [];
    return (data?.config.adCampaigns || []).filter((c) => c.active);
  }, [isAllMode, data]);

  // All filterable scopes — markets first, then manual. Used by the cell
  // editor and the order matcher.
  const activeCampaigns: AdCampaign[] = useMemo(
    () => [...marketCampaigns, ...manualCampaigns],
    [marketCampaigns, manualCampaigns]
  );

  // Debounced save on daily ad spend edits — sent as a single batch so the server
  // can read+write each shop's blob exactly once (avoids the lost-write race).
  useEffect(() => {
    const saves = Object.values(pendingAdSaves);
    if (!dirty || saves.length === 0) return;
    const t = setTimeout(async () => {
      await fetch("/api/ad-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: saves }),
      });
      // Drop server caches so the next render reflects the new spend.
      invalidate("/api/data", "/api/ad-spend");
      setDirty(false);
      setPendingAdSaves({});
    }, 300);
    return () => clearTimeout(t);
  }, [dirty, pendingAdSaves]);

  // Compute daily rows within the selected range
  const { days, total, activeVariants } = useMemo(() => {
    if (!orders || !data) return { days: [], total: null, activeVariants: [] };

    const productCosts = data.config.productCosts || {};
    const bundles = (data.config.bundles || []).filter((b) => b.active);
    const dailyAds = data.config.dailyAds || {};
    const taxPct = data.config.taxOnAdSpend ?? 5;
    const shopifyFixedFeePerOrder = data.config.shopifyFixedFeePerOrder ?? 0;
    const monthlySubscriptions = data.config.monthlySubscriptions || [];
    const activeMonthlySubscriptions = monthlySubscriptions
      .filter((s) => s.active)
      .reduce((sum, s) => sum + (Number(s.monthlyAmount) || 0), 0);
    const dailySubscriptionCost = activeMonthlySubscriptions / 30.6;
    const urssaf = data.config.urssaf || 0;
    const ir = data.config.ir || 0;
    const tva = data.config.tva || 0;
    const totalTaxRate = urssaf + ir + tva; // Total % taxes applied on sales

    // Shipping cost brackets: { "1": 3.5, "3": 5, ... }
    // For an order of N items, use SMALLEST bracket where N <= bracket.
    const shippingBrackets = Object.entries(data.config.shippingCostByQty || {})
      .map(([k, v]) => ({ qty: Number(k), cost: v }))
      .filter((b) => b.qty > 0 && b.cost > 0)
      .sort((a, b) => a.qty - b.qty);
    const getShippingCost = (orderQty: number): number => {
      if (shippingBrackets.length === 0 || orderQty <= 0) return 0;
      for (const b of shippingBrackets) {
        if (orderQty <= b.qty) return b.cost;
      }
      // qty exceeds the largest bracket → use largest bracket cost
      return shippingBrackets[shippingBrackets.length - 1].cost;
    };

    // Pre-compute bundle COGS per trigger SKU (sum across bundles)
    const bundleExtraCogsPerTriggerSku: Record<string, number> = {};
    for (const b of bundles) {
      const bundleCogs = b.items.reduce((s, it) => {
        const pc = productCosts[it.sku];
        return s + (pc?.cogs || 0) * it.quantity;
      }, 0);
      for (const sku of b.triggerSkus) {
        bundleExtraCogsPerTriggerSku[sku] = (bundleExtraCogsPerTriggerSku[sku] || 0) + bundleCogs;
      }
    }

    // Active SKUs list (for dynamic columns). The map key is the SKU; the
    // entry already carries it so we just spread.
    const activeVariants = Object.entries(productCosts)
      .filter(([, pc]) => pc.active)
      .map(([sku, pc]) => ({ ...pc, sku: pc.sku || sku }));

    // Filter orders by date range AND (when applicable) by the selected
    // campaign's attribution rules. Priority: UTM matching > country fallback.
    const selectedCampaign =
      campaignFilter === CAMPAIGN_ALL || campaignFilter === CAMPAIGN_FLAT
        ? null
        : activeCampaigns.find((x) => x.id === campaignFilter) || null;

    const utmCampaigns: Set<string> | null = selectedCampaign?.utmCampaigns?.length
      ? new Set(selectedCampaign.utmCampaigns.map((x) => x.toLowerCase()))
      : null;
    const utmSources: Set<string> | null = selectedCampaign?.utmSources?.length
      ? new Set(selectedCampaign.utmSources.map((x) => x.toLowerCase()))
      : null;
    const campaignCountries: Set<string> | null = selectedCampaign?.countries?.length
      ? new Set(selectedCampaign.countries.map((x) => x.toUpperCase()))
      : null;
    const useUtmMatch = !!(utmCampaigns || utmSources);

    const matchOrderToCampaign = (o: Order): boolean => {
      if (!selectedCampaign) return true;

      if (useUtmMatch) {
        // Match if EITHER first-visit OR last-visit UTM hits one of the
        // configured patterns. Both fields are checked so we don't miss
        // orders attributed via either the entry or the conversion touch.
        const visits = [o.customerJourneySummary?.firstVisit, o.customerJourneySummary?.lastVisit];
        for (const v of visits) {
          const utm = v?.utmParameters;
          if (!utm) continue;
          const c = utm.campaign?.toLowerCase() || "";
          const s = utm.source?.toLowerCase() || "";
          const campaignHit = utmCampaigns ? utmCampaigns.has(c) : false;
          const sourceHit = utmSources ? utmSources.has(s) : false;
          // OR: any configured pattern matches.
          if (campaignHit || sourceHit) return true;
        }
        // No UTM match — fall back to country if configured, otherwise reject.
        if (!campaignCountries) return false;
      }

      if (campaignCountries) {
        const code = o.shippingAddress?.countryCodeV2?.toUpperCase();
        return code ? campaignCountries.has(code) : false;
      }

      // Campaign with no UTM and no country = matches all orders (campaign
      // only filters its own spend, not the order set).
      return true;
    };

    const filteredOrders = orders.filter((o) => {
      if (!inRange(o.createdAt, range, timeZone)) return false;
      return matchOrderToCampaign(o);
    });

    // Resolve the spend that matches the active campaign filter for a given
    // date entry. CAMPAIGN_ALL = global sum, CAMPAIGN_FLAT = residual not
    // attributed to a campaign, otherwise = that campaign's slot.
    const spendForScope = (entry: typeof dailyAds[string] | undefined): number => {
      if (!entry) return 0;
      if (campaignFilter === CAMPAIGN_ALL) return entry.spend || 0;
      if (campaignFilter === CAMPAIGN_FLAT) {
        const breakdownSum = entry.byCampaign
          ? Object.values(entry.byCampaign).reduce((s, c) => s + (c.spend || 0), 0)
          : 0;
        return Math.max(0, (entry.spend || 0) - breakdownSum);
      }
      return entry.byCampaign?.[campaignFilter]?.spend || 0;
    };

    // Build day buckets
    const dayMap = new Map<string, {
      date: string;
      orders: number;
      qtyByVariant: Record<string, number>;
      sales: number;
      cogs: number;
    }>();

    // Init all days in range with 0s — use LOCAL date (iso) so "today" is included
    // even when the user's timezone differs from UTC.
    for (let key = range.from; key <= range.to; key = addDaysIso(key, 1)) {
      dayMap.set(key, { date: key, orders: 0, qtyByVariant: {}, sales: 0, cogs: 0 });
    }

    for (const o of filteredOrders) {
      // Use LOCAL date of the order (not UTC) so orders placed late evening
      // don't get bucketed into the next day.
      const dayKey = isoInTimeZone(o.createdAt, timeZone);
      const day = dayMap.get(dayKey);
      if (!day) continue;
      day.orders += 1;
      // Sales = exactly what Shopify says the order is worth (once per order)
      // Already accounts for discounts, bundle gifts priced at $0, etc.
      day.sales += parseFloat(o.currentTotalPriceSet.shopMoney.amount);

      // Total items in this order (used for shipping bracket)
      let orderTotalQty = 0;

      for (const { node: li } of o.lineItems.edges) {
        orderTotalQty += li.quantity;

        // Try SKU first (shared across shops), fall back to variantId
        // (per-shop, for variants without SKU).
        const sku = li.variant?.sku || "";
        const variantId = li.variant?.id || "";
        const key = sku || variantId;
        if (!key) continue;
        const pc = productCosts[key];
        if (!pc || !pc.active) continue;

        day.qtyByVariant[key] = (day.qtyByVariant[key] || 0) + li.quantity;
        day.cogs += li.quantity * pc.cogs;

        // Bundles are SKU-keyed only — no fallback for variants without SKU.
        const bundleExtra = sku ? (bundleExtraCogsPerTriggerSku[sku] || 0) : 0;
        const isMoonBundleLine = (li.customAttributes || []).some((a) => a.key === "__moonbundle");
        if (bundleExtra > 0 && !isMoonBundleLine) {
          day.cogs += li.quantity * bundleExtra;
        }
      }

      // Add shipping cost for this order (bracket based on total quantity)
      day.cogs += getShippingCost(orderTotalQty);
    }

    // Build rows
    const days = Array.from(dayMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => {
        const adsRaw = spendForScope(dailyAds[d.date]);
        const adsWithTax = adsRaw * (1 + taxPct / 100); // Ads TTC (what it really costs you)
        const profitBrut = d.sales - adsWithTax - d.cogs;
        const profitBrutPct = d.sales > 0 ? (profitBrut / d.sales) * 100 : 0;
        // Taxes on sales: URSSAF + IR + TVA (from Fiscalité section)
        const taxes = (d.sales * totalTaxRate) / 100;
        const shopifyFixedFees = d.orders * shopifyFixedFeePerOrder;
        const subscriptionFees = dailySubscriptionCost;
        const fixedCosts = shopifyFixedFees + subscriptionFees;
        const profitNet = profitBrut - taxes - fixedCosts;
        const profitNetPct = d.sales > 0 ? (profitNet / d.sales) * 100 : 0;
        const roas = adsRaw > 0 ? d.sales / adsRaw : 0;
        return {
          ...d,
          adsRaw,
          adsWithTax,
          taxes,
          fixedCosts,
          shopifyFixedFees,
          subscriptionFees,
          profitBrut,
          profitBrutPct,
          profitNet,
          profitNetPct,
          roas,
          notes: dailyAds[d.date]?.notes || "",
        };
      });

    const total = days.reduce(
      (acc, d) => {
        acc.orders += d.orders;
        acc.sales += d.sales;
        acc.cogs += d.cogs;
        acc.adsRaw += d.adsRaw;
        acc.adsWithTax += d.adsWithTax;
        acc.taxes += d.taxes;
        acc.fixedCosts += d.fixedCosts;
        acc.shopifyFixedFees += d.shopifyFixedFees;
        acc.subscriptionFees += d.subscriptionFees;
        acc.profitBrut += d.profitBrut;
        acc.profitNet += d.profitNet;
        activeVariants.forEach((v) => {
          acc.qtyByVariant[v.sku] = (acc.qtyByVariant[v.sku] || 0) + (d.qtyByVariant[v.sku] || 0);
        });
        return acc;
      },
      {
        orders: 0,
        sales: 0,
        cogs: 0,
        adsRaw: 0,
        adsWithTax: 0,
        taxes: 0,
        fixedCosts: 0,
        shopifyFixedFees: 0,
        subscriptionFees: 0,
        profitBrut: 0,
        profitNet: 0,
        qtyByVariant: {} as Record<string, number>,
      }
    );
    const totalProfitBrutPct = total.sales > 0 ? (total.profitBrut / total.sales) * 100 : 0;
    const totalProfitNetPct = total.sales > 0 ? (total.profitNet / total.sales) * 100 : 0;
    const totalRoas = total.adsRaw > 0 ? total.sales / total.adsRaw : 0;

    return {
      days,
      total: { ...total, profitBrutPct: totalProfitBrutPct, profitNetPct: totalProfitNetPct, roas: totalRoas },
      activeVariants,
    };
  }, [orders, data, range, timeZone, campaignFilter, activeCampaigns]);

  if (!orders || !data) return <div>Chargement...</div>;

  // Apply a single edit to a date entry, scoped to a campaign id (or flat).
  // Returns the updated entry; null means "delete this date".
  const applyEntryEdit = (
    current: DailyAdEntry | undefined,
    spend: number,
    notes: string | undefined,
    scope: string
  ): DailyAdEntry | null => {
    const next: DailyAdEntry = current
      ? { ...current, byCampaign: current.byCampaign ? { ...current.byCampaign } : undefined }
      : { spend: 0 };

    if (scope === CAMPAIGN_FLAT || scope === CAMPAIGN_ALL) {
      // Flat edit — overwrite top-level spend, drop any breakdown.
      delete next.byCampaign;
      if (spend === 0 && !notes) return null;
      next.spend = spend;
      next.notes = notes;
      return next;
    }

    // Per-campaign edit
    const byCampaign = next.byCampaign ?? {};
    if (spend === 0) {
      delete byCampaign[scope];
    } else {
      byCampaign[scope] = { spend, ...(notes ? { notes } : {}) };
    }
    if (Object.keys(byCampaign).length === 0) {
      delete next.byCampaign;
    } else {
      next.byCampaign = byCampaign;
    }
    next.spend = next.byCampaign
      ? Object.values(next.byCampaign).reduce((s, c) => s + (c.spend || 0), 0)
      : next.spend;
    if (!next.byCampaign && !next.notes && next.spend === 0) return null;
    return next;
  };

  const updateAdSpend = (date: string, spend: number, notes?: string) => {
    if (!data) return;
    const cleanNotes = notes?.trim() || undefined;
    // The shop whose blob actually receives the write. In ALL mode, the
    // campaign filter id is `${shop}:${campaignId}` so we can recover the shop.
    let targetShop = editableShop || shops[0]?.shop;
    let scope: string = campaignFilter;
    if (isAllMode && campaignFilter !== CAMPAIGN_ALL && campaignFilter !== CAMPAIGN_FLAT) {
      const sep = campaignFilter.indexOf(":");
      if (sep > 0) {
        targetShop = campaignFilter.slice(0, sep);
        scope = campaignFilter.slice(sep + 1);
      }
    }

    if (isAllMode && targetShop) {
      const currentForShop = dailyAdsByShop[targetShop] || {};
      const updated = applyEntryEdit(currentForShop[date], spend, cleanNotes, scope);
      const nextForShop = { ...currentForShop };
      if (updated === null) delete nextForShop[date];
      else nextForShop[date] = updated;

      const nextByShop = { ...dailyAdsByShop, [targetShop]: nextForShop };
      setDailyAdsByShop(nextByShop);
      setData({ ...data, config: { ...data.config, dailyAds: mergeDailyAds(nextByShop, CAMPAIGN_ALL) } });
      setPendingAdSaves((prev) => ({
        ...prev,
        [`${targetShop}:${date}:${scope}`]: {
          shop: targetShop,
          date,
          spend,
          notes: cleanNotes,
          ...(scope !== CAMPAIGN_ALL && scope !== CAMPAIGN_FLAT ? { campaignId: scope } : {}),
        },
      }));
      setDirty(true);
      return;
    }

    // Single-shop mode
    const current = data.config.dailyAds || {};
    const updated = applyEntryEdit(current[date], spend, cleanNotes, scope);
    const next = { ...current };
    if (updated === null) delete next[date];
    else next[date] = updated;
    setData({ ...data, config: { ...data.config, dailyAds: next } });
    setPendingAdSaves((prev) => ({
      ...prev,
      [`${date}:${scope}`]: {
        date,
        spend,
        notes: cleanNotes,
        ...(scope !== CAMPAIGN_ALL && scope !== CAMPAIGN_FLAT ? { campaignId: scope } : {}),
      },
    }));
    setDirty(true);
  };

  /** Force-flush any pending ad-spend edits immediately ("Push tout"). */
  const pushAllPending = async () => {
    const saves = Object.values(pendingAdSaves);
    if (saves.length === 0) return;
    await fetch("/api/ad-spend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: saves }),
    });
    invalidate("/api/data", "/api/ad-spend");
    setDirty(false);
    setPendingAdSaves({});
  };

  const cellColor = (value: number, threshold1: number, threshold2: number): string => {
    if (value >= threshold2) return "var(--green)";
    if (value >= threshold1) return "var(--orange)";
    return "var(--red)";
  };

  const rowBgForProfit = (profit: number): string => {
    if (profit > 0) return "rgba(52, 211, 153, 0.05)";
    if (profit < 0) return "rgba(248, 113, 113, 0.08)";
    return "transparent";
  };

  const formatDay = (iso: string) => {
    return formatIsoDate(iso, { day: "2-digit", month: "short" });
  };

  const hasAnyProducts = activeVariants.length > 0;

  // Read tax rates from config for header display
  const taxOnAdSpendPct = (data?.config?.taxOnAdSpend ?? 5).toFixed(data?.config?.taxOnAdSpend && !Number.isInteger(data.config.taxOnAdSpend) ? 2 : 0);
  const totalTaxOnSalesPct = (
    (data?.config?.urssaf || 0) +
    (data?.config?.ir || 0) +
    (data?.config?.tva || 0)
  ).toFixed(2);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Profit Journalier</h1>
          <div style={{ color: "var(--text-dim)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Période <span className="accent">{range.label}</span> · {days.length} jours · {total?.orders || 0} commandes · Heure boutique {timeZone}
            {(() => {
              if (campaignFilter === CAMPAIGN_ALL || campaignFilter === CAMPAIGN_FLAT) return null;
              const c = activeCampaigns.find((x) => x.id === campaignFilter);
              if (!c) return null;
              const parts: string[] = [];
              if (c.utmCampaigns?.length) parts.push(`UTM: ${c.utmCampaigns.join(", ")}`);
              if (c.utmSources?.length) parts.push(`src: ${c.utmSources.join(", ")}`);
              if (c.countries?.length) parts.push(`pays: ${c.countries.join(", ")}`);
              if (parts.length === 0) return null;
              return (
                <span style={{ marginLeft: "0.6rem", color: "var(--accent)" }}>
                  · Filtré · {parts.join(" · ")}
                </span>
              );
            })()}
            {dirty && <span style={{ marginLeft: "0.75rem", color: "var(--blue)" }}>Sauvegarde...</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            Campagne
            <select
              className="select"
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              style={{ minWidth: 240 }}
            >
              <option value={CAMPAIGN_ALL}>Toutes les campagnes</option>
              {activeCampaigns.length > 0 && <option value={CAMPAIGN_FLAT}>Sans campagne (saisie globale)</option>}
              {marketCampaigns.length > 0 && (
                <optgroup label="🌍 Marchés Shopify">
                  {marketCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
              {manualCampaigns.length > 0 && (
                <optgroup label="📢 Campagnes manuelles">
                  {manualCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <button
            className="btn btn-primary"
            onClick={pushAllPending}
            disabled={Object.keys(pendingAdSaves).length === 0}
            title="Envoie immédiatement toutes les modifications en attente"
          >
            Push tout
            {Object.keys(pendingAdSaves).length > 0 && (
              <span style={{ marginLeft: "0.4rem", fontSize: "0.75rem", opacity: 0.85 }}>
                ({Object.keys(pendingAdSaves).length})
              </span>
            )}
          </button>
        </div>
      </div>

      {!hasAnyProducts && (
        <div className="card" style={{ borderColor: "var(--accent)", background: "rgba(200, 165, 90, 0.05)", marginBottom: "1rem" }}>
          <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>⚙️ Aucun produit configuré</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
            Va dans <a href="/parametres" style={{ color: "var(--accent)" }}>Paramètres</a> section &quot;💰 Coûts produits&quot; pour
            sélectionner les produits à inclure dans ce P&amp;L et saisir leur coût unitaire.
          </div>
        </div>
      )}

      {isAllMode && (
        <div className="card" style={{ borderColor: "var(--blue)", background: "rgba(96, 165, 250, 0.05)", marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: "0.25rem", color: "var(--blue)" }}>
                Mode &quot;Toutes les boutiques&quot;
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
                Les calculs utilisent la somme exacte des boutiques (converties en {currency}). En mode &quot;Toutes les campagnes&quot;, la cellule de spend est en lecture seule — choisis une campagne (ou &quot;Sans campagne&quot; + boutique à éditer) pour saisir un montant.
              </div>
            </div>
            <label style={{ minWidth: 240, fontSize: "0.75rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Boutique a editer
              <select
                className="select"
                value={editableShop}
                onChange={(event) => setEditableShop(event.target.value)}
                style={{ marginTop: "0.35rem" }}
              >
                {shops.map((shop) => (
                  <option key={shop.shop} value={shop.shop}>{shop.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {/* Summary KPIs */}
      {total && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
          <div className="kpi">
            <div className="kpi-label">Total Sales</div>
            <div className="kpi-value accent">{fmtMoney(total.sales, currency)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">COGS</div>
            <div className="kpi-value orange">{fmtMoney(total.cogs, currency)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Meta Ads TTC</div>
            <div className="kpi-value red">{fmtMoney(total.adsWithTax, currency)}</div>
            <div className="kpi-delta">HT: {fmtMoney(total.adsRaw, currency)} +{taxOnAdSpendPct}% TVA</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Taxes</div>
            <div className="kpi-value" style={{ color: "var(--purple)" }}>
              {fmtMoney(total.taxes, currency)}
            </div>
            <div className="kpi-delta">{totalTaxOnSalesPct}% sur Sales</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Frais fixes</div>
            <div className="kpi-value red">{fmtMoney(total.fixedCosts, currency)}</div>
            <div className="kpi-delta">
              Shopify: {fmtMoney(total.shopifyFixedFees, currency)} / Abos: {fmtMoney(total.subscriptionFees, currency)}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Profit Brut</div>
            <div className={`kpi-value ${total.profitBrut >= 0 ? "green" : "red"}`}>
              {fmtMoney(total.profitBrut, currency)}
            </div>
            <div className="kpi-delta">{total.profitBrutPct.toFixed(1)}%</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Profit Net</div>
            <div className={`kpi-value ${total.profitNet >= 0 ? "green" : "red"}`}>
              {fmtMoney(total.profitNet, currency)}
            </div>
            <div className="kpi-delta">{total.profitNetPct.toFixed(1)}%</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">ROAS</div>
            <div className={`kpi-value ${total.roas > 1.5 ? "green" : total.roas > 1 ? "orange" : "red"}`}>
              {total.roas.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Main table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ fontSize: "0.8rem" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "var(--bg-elevated)", zIndex: 1 }}>Date</th>
                <th style={{ textAlign: "center" }}>Orders</th>
                <th style={{ textAlign: "right", background: "rgba(248, 113, 113, 0.15)", color: "var(--red)" }}>
                  <div>Meta Ads (HT)</div>
                  <div style={{ fontSize: "0.65rem", opacity: 0.8, fontWeight: 400 }}>
                    +{taxOnAdSpendPct}% TVA
                  </div>
                </th>
                <th style={{ textAlign: "right", background: "rgba(251, 191, 36, 0.15)" }}>COGS</th>
                <th style={{ textAlign: "right", background: "rgba(200, 165, 90, 0.15)" }}>Total Sales</th>
                <th style={{ textAlign: "right", background: "rgba(167, 139, 250, 0.15)", color: "var(--purple)" }}>
                  <div>Taxes</div>
                  <div style={{ fontSize: "0.65rem", opacity: 0.8, fontWeight: 400 }}>
                    {totalTaxOnSalesPct}% sur Sales
                  </div>
                </th>
                <th style={{ textAlign: "right", background: "rgba(248, 113, 113, 0.12)", color: "var(--red)" }}>Frais fixes</th>
                <th style={{ textAlign: "right", background: "rgba(52, 211, 153, 0.10)" }}>Profit Brut</th>
                <th style={{ textAlign: "right", background: "rgba(52, 211, 153, 0.10)" }}>%</th>
                <th style={{ textAlign: "right", background: "rgba(52, 211, 153, 0.15)" }}>Profit Net</th>
                <th style={{ textAlign: "right", background: "rgba(52, 211, 153, 0.15)" }}>%</th>
                <th style={{ textAlign: "right", background: "rgba(200, 165, 90, 0.20)" }}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                // Resolve which entry the input cell edits, given the active
                // campaign filter and (in ALL mode) the editable shop.
                let scopeShop = isAllMode ? editableShop : "";
                let scope: string = campaignFilter;
                if (
                  isAllMode &&
                  campaignFilter !== CAMPAIGN_ALL &&
                  campaignFilter !== CAMPAIGN_FLAT
                ) {
                  const sep = campaignFilter.indexOf(":");
                  if (sep > 0) {
                    scopeShop = campaignFilter.slice(0, sep);
                    scope = campaignFilter.slice(sep + 1);
                  }
                }
                const fullEntry = isAllMode
                  ? dailyAdsByShop[scopeShop]?.[d.date]
                  : data?.config.dailyAds?.[d.date];

                let editableSpend: number | undefined;
                let editableNotes: string | undefined;
                if (scope === CAMPAIGN_ALL) {
                  editableSpend = fullEntry?.spend;
                  editableNotes = fullEntry?.notes;
                } else if (scope === CAMPAIGN_FLAT) {
                  const breakdownSum = fullEntry?.byCampaign
                    ? Object.values(fullEntry.byCampaign).reduce((s, c) => s + (c.spend || 0), 0)
                    : 0;
                  editableSpend = (fullEntry?.spend || 0) - breakdownSum;
                  if (editableSpend < 0) editableSpend = 0;
                  editableNotes = fullEntry?.notes;
                } else {
                  const c = fullEntry?.byCampaign?.[scope];
                  editableSpend = c?.spend;
                  editableNotes = c?.notes;
                }
                const editingPerCampaign = scope !== CAMPAIGN_ALL && scope !== CAMPAIGN_FLAT;
                return (
                <tr key={d.date} style={{ background: rowBgForProfit(d.profitNet) }}>
                  <td style={{ position: "sticky", left: 0, background: "var(--bg-card)", fontWeight: 500 }}>
                    {formatDay(d.date)}
                  </td>
                  <td style={{ textAlign: "center", color: "var(--text-dim)" }}>{d.orders || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      {/* In ALL mode + "Toutes les campagnes", showing one shop's
                          value while the total below shows the sum is misleading.
                          Disable the input here — to edit, the user picks a specific
                          campaign (or "Sans campagne" + a target shop). */}
                      {isAllMode && scope === CAMPAIGN_ALL ? (
                        <div
                          className="mono"
                          style={{
                            maxWidth: 100,
                            textAlign: "right",
                            fontSize: "0.8rem",
                            padding: "0.4rem 0.55rem",
                            color: "var(--text-faint)",
                            border: "1px dashed var(--border)",
                            borderRadius: 4,
                            background: "transparent",
                            width: "100%",
                          }}
                          title="Filtre par campagne (ou Sans campagne) pour éditer"
                        >
                          —
                        </div>
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          className="input mono"
                          value={editableSpend || ""}
                          onChange={(e) => updateAdSpend(d.date, parseFloat(e.target.value) || 0, editableNotes)}
                          placeholder="0 (HT)"
                          style={{ maxWidth: 100, textAlign: "right", fontSize: "0.8rem" }}
                          title={
                            editingPerCampaign
                              ? "Spend HT pour la campagne sélectionnée"
                              : "Saisis le montant HT - le TTC est calculé automatiquement"
                          }
                        />
                      )}
                      {editingPerCampaign && (fullEntry?.spend || 0) > (editableSpend || 0) && (
                        <div className="mono" style={{ fontSize: "0.65rem", marginTop: "0.15rem", color: "var(--text-dim)" }}>
                          Autres campagnes: {fmtMoney((fullEntry?.spend || 0) - (editableSpend || 0), currency)}
                        </div>
                      )}
                      {isAllMode && d.adsRaw > 0 && (
                        <div className="mono" style={{ fontSize: "0.65rem", marginTop: "0.15rem", color: "var(--text-dim)" }}>
                          Total boutiques: {fmtMoney(d.adsRaw, currency)}
                        </div>
                      )}
                      {d.adsRaw > 0 && (
                        <div className="mono red" style={{ fontSize: "0.65rem", marginTop: "0.15rem", opacity: 0.8 }}>
                          TTC: {fmtMoney(d.adsWithTax, currency)}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="mono orange" style={{ textAlign: "right" }}>
                    {d.cogs > 0 ? fmtMoney(d.cogs, currency) : "—"}
                  </td>
                  <td className="mono accent" style={{ textAlign: "right", fontWeight: 500 }}>
                    {d.sales > 0 ? fmtMoney(d.sales, currency) : "—"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--purple)" }}>
                    {d.sales > 0 ? `-${fmtMoney(d.taxes, currency)}` : "—"}
                  </td>
                  <td className="mono red" style={{ textAlign: "right" }}>
                    {d.fixedCosts > 0 ? `-${fmtMoney(d.fixedCosts, currency)}` : "—"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: cellColor(d.profitBrut, 0, 100) }}>
                    {d.sales > 0 || d.adsRaw > 0 ? fmtMoney(d.profitBrut, currency) : "—"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: cellColor(d.profitBrutPct, 20, 35) }}>
                    {d.sales > 0 ? `${d.profitBrutPct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: cellColor(d.profitNet, 0, 100), fontWeight: 500 }}>
                    {d.sales > 0 || d.adsRaw > 0 ? fmtMoney(d.profitNet, currency) : "—"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: cellColor(d.profitNetPct, 15, 30) }}>
                    {d.sales > 0 ? `${d.profitNetPct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: cellColor(d.roas, 1, 1.5) }}>
                    {d.roas > 0 ? d.roas.toFixed(2) : "—"}
                  </td>
                </tr>
                );
              })}
              {total && (
                <tr style={{ background: "rgba(200, 165, 90, 0.15)", fontWeight: 600, borderTop: "2px solid var(--accent)" }}>
                  <td style={{ position: "sticky", left: 0, background: "rgba(200, 165, 90, 0.15)", color: "var(--accent)" }}>TOTAL</td>
                  <td className="mono" style={{ textAlign: "center" }}>{total.orders}</td>
                  <td className="mono red" style={{ textAlign: "right" }}>
                    <div>{fmtMoney(total.adsRaw, currency)}</div>
                    {total.adsRaw > 0 && (
                      <div style={{ fontSize: "0.65rem", opacity: 0.8, fontWeight: 400 }}>
                        TTC: {fmtMoney(total.adsWithTax, currency)}
                      </div>
                    )}
                  </td>
                  <td className="mono orange" style={{ textAlign: "right" }}>{fmtMoney(total.cogs, currency)}</td>
                  <td className="mono accent" style={{ textAlign: "right" }}>{fmtMoney(total.sales, currency)}</td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--purple)" }}>
                    -{fmtMoney(total.taxes, currency)}
                  </td>
                  <td className="mono red" style={{ textAlign: "right" }}>
                    -{fmtMoney(total.fixedCosts, currency)}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: cellColor(total.profitBrut, 0, 100) }}>
                    {fmtMoney(total.profitBrut, currency)}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: cellColor(total.profitBrutPct, 20, 35) }}>
                    {total.profitBrutPct.toFixed(1)}%
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: cellColor(total.profitNet, 0, 100) }}>
                    {fmtMoney(total.profitNet, currency)}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: cellColor(total.profitNetPct, 15, 30) }}>
                    {total.profitNetPct.toFixed(1)}%
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: cellColor(total.roas, 1, 1.5) }}>
                    {total.roas.toFixed(2)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", marginTop: "0.75rem", lineHeight: 1.6 }}>
        <div><b>Sales</b> = total exact des commandes Shopify du jour (ce que le client a payé).</div>
        <div><b>COGS</b> = Σ (quantité vendue × COGS par variante) + coût shipping par commande (selon palier 1/3/5/10 items) — gifts inclus.</div>
        <div><b>Meta Ads (TTC)</b> = Ads HT × (1 + {taxOnAdSpendPct}% TVA sur dépenses pub).</div>
        <div><b>Taxes</b> = Sales × {totalTaxOnSalesPct}% (URSSAF {data.config.urssaf || 0}% + IR {data.config.ir || 0}% + TVA {data.config.tva || 0}%).</div>
        <div><b>Profit Brut</b> = Sales − Meta Ads TTC − COGS</div>
        <div><b>Profit Net</b> = Profit Brut − Taxes − Frais fixes</div>
        <div><b>ROAS</b> = Sales / Ads (HT)</div>
      </div>
    </div>
  );
}
