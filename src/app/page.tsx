"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Shell from "@/components/Shell";
import { cachedFetch } from "@/lib/data-cache";
import { fmtMoney, getRealFees, hasRealFeeData } from "@/lib/order-utils";
import type { Transaction } from "@/lib/order-utils";
import { useDateRangeCtx } from "@/components/DateRangeContext";
import {
  addDaysIso,
  daysBetweenInclusive,
  formatDateTimeInTimeZone,
  inRange,
  isoInTimeZone,
} from "@/hooks/useDateRange";
import type { ProductCost, Bundle, MonthlySubscription } from "@/lib/types";

interface OrderMoney { shopMoney: { amount: string; currencyCode: string } }
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
  originalTotalSet: OrderMoney;
  discountedTotalSet: OrderMoney;
  customAttributes: { key: string; value: string }[];
}
interface Order {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  shippingAddress: { country?: string; countryCodeV2?: string } | null;
  currentTotalPriceSet: OrderMoney;
  totalRefundedSet: OrderMoney;
  totalDiscountsSet: OrderMoney;
  transactions: Transaction[];
  lineItems: { edges: { node: LineItem }[] };
}

interface ShopData {
  config: {
    urssaf: number;
    ir: number;
    tva: number;
    objectifCA: number;
    objectifProfit: number;
    soldeInitial: number;
    alerteRunway: number;
    taxOnAdSpend?: number;
    shopifyFixedFeePerOrder?: number;
    monthlySubscriptions?: MonthlySubscription[];
    productCosts?: Record<string, ProductCost>;
    bundles?: Bundle[];
    dailyAds?: Record<string, { spend: number; notes?: string }>;
    shippingCostByQty?: Record<string, number>;
  };
}

const USD_PER_EUR = 1.19;

function fmtEur(amountUsd: number): string {
  return fmtMoney(amountUsd / USD_PER_EUR, "EUR");
}

function MoneyStack({
  amount,
  currency,
  className,
  style,
  prefix = "",
}: {
  amount: number;
  currency: string;
  className?: string;
  style?: CSSProperties;
  prefix?: string;
}) {
  return (
    <>
      <div className={className} style={style}>{prefix}{fmtMoney(amount, currency)}</div>
      <div className="kpi-delta">EUR: {prefix}{fmtEur(amount)}</div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Shell>
      <Dashboard />
    </Shell>
  );
}

function Dashboard() {
  const [allOrders, setAllOrders] = useState<Order[] | null>(null);
  const [data, setData] = useState<ShopData | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { range, timeZone } = useDateRangeCtx();

  // Filter orders by active date range
  const orders = useMemo(() => {
    if (!allOrders) return null;
    return allOrders.filter((o) => inRange(o.createdAt, range, timeZone));
  }, [allOrders, range, timeZone]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [oJson, dJson, sJson] = await Promise.all([
          cachedFetch<{ orders: Order[] }>("/api/orders?all=true", {
            onUpdate: (d) => mounted && setAllOrders(d.orders),
          }),
          cachedFetch<{ data: ShopData }>("/api/data", {
            onUpdate: (d) => mounted && setData(d.data),
          }),
          cachedFetch<{ shop?: { currencyCode?: string } }>("/api/shop", {
            onUpdate: (d) => mounted && d.shop?.currencyCode && setCurrency(d.shop.currencyCode),
          }).catch(() => null),
        ]);
        if (!mounted) return;
        setAllOrders(oJson.orders);
        setData(dJson.data);
        if (sJson?.shop?.currencyCode) setCurrency(sJson.shop.currencyCode);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Load error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    if (!orders || !data) return null;
    const todayIso = isoInTimeZone(new Date(), timeZone);
    const weekFrom = addDaysIso(todayIso, -6);
    const monthFrom = addDaysIso(todayIso, -29);
    const orderDay = (o: Order) => isoInTimeZone(o.createdAt, timeZone);

    const gross = (o: Order) => parseFloat(o.currentTotalPriceSet.shopMoney.amount);
    const refund = (o: Order) => parseFloat(o.totalRefundedSet.shopMoney.amount);
    const realFee = (o: Order) => getRealFees(o);

    // ──────────────────────────────────────────────────────────────────
    // SAME LOGIC AS PROFIT JOURNALIER — keep the two pages in sync
    // ──────────────────────────────────────────────────────────────────
    const productCosts = data.config.productCosts || {};
    const bundles = (data.config.bundles || []).filter((b) => b.active);
    const dailyAds = data.config.dailyAds || {};
    const taxOnAdSpend = data.config.taxOnAdSpend ?? 5;
    const shopifyFixedFeePerOrder = data.config.shopifyFixedFeePerOrder ?? 0;
    const monthlySubscriptions = data.config.monthlySubscriptions || [];
    const activeMonthlySubscriptions = monthlySubscriptions
      .filter((s) => s.active)
      .reduce((sum, s) => sum + (Number(s.monthlyAmount) || 0), 0);
    const urssaf = data.config.urssaf || 0;
    const ir = data.config.ir || 0;
    const tva = data.config.tva || 0;
    const totalTaxOnSalesRate = urssaf + ir + tva;

    // Pre-compute bundle COGS per trigger variant
    const bundleExtraCogsPerTrigger: Record<string, number> = {};
    for (const b of bundles) {
      const bundleCogs = b.items.reduce((s, it) => {
        const pc = productCosts[it.variantId];
        return s + (pc?.cogs || 0) * it.quantity;
      }, 0);
      for (const tid of b.triggerVariantIds) {
        bundleExtraCogsPerTrigger[tid] = (bundleExtraCogsPerTrigger[tid] || 0) + bundleCogs;
      }
    }

    // Shipping brackets
    const shippingBrackets = Object.entries(data.config.shippingCostByQty || {})
      .map(([k, v]) => ({ qty: Number(k), cost: v }))
      .filter((b) => b.qty > 0 && b.cost > 0)
      .sort((a, b) => a.qty - b.qty);
    const getShippingCost = (orderQty: number): number => {
      if (shippingBrackets.length === 0 || orderQty <= 0) return 0;
      for (const b of shippingBrackets) {
        if (orderQty <= b.qty) return b.cost;
      }
      return shippingBrackets[shippingBrackets.length - 1].cost;
    };

    // Compute totals in the active range
    let totalSales = 0;
    let totalCogs = 0;
    for (const o of orders) {
      totalSales += gross(o);
      let orderQty = 0;
      for (const { node: li } of o.lineItems.edges) {
        orderQty += li.quantity;
        const variantId = li.variant?.id;
        if (!variantId) continue;
        const pc = productCosts[variantId];
        if (!pc || !pc.active) continue;
        totalCogs += li.quantity * pc.cogs;
        const bundleExtra = bundleExtraCogsPerTrigger[variantId] || 0;
        const isMoonBundleLine = (li.customAttributes || []).some((a) => a.key === "__moonbundle");
        if (bundleExtra > 0 && !isMoonBundleLine) {
          totalCogs += li.quantity * bundleExtra;
        }
      }
      totalCogs += getShippingCost(orderQty);
    }

    // Ads from dailyAds within the active range
    let totalAdsHT = 0;
    for (const [date, entry] of Object.entries(dailyAds)) {
      if (date >= range.from && date <= range.to) {
        totalAdsHT += entry.spend || 0;
      }
    }
    const totalAdsTTC = totalAdsHT * (1 + taxOnAdSpend / 100);

    // Taxes on sales
    const totalTaxes = (totalSales * totalTaxOnSalesRate) / 100;

    // Fixed costs
    const rangeDays = daysBetweenInclusive(range.from, range.to);
    const shopifyFixedFees = orders.length * shopifyFixedFeePerOrder;
    const subscriptionFees = (activeMonthlySubscriptions / 30.6) * rangeDays;
    const fixedCosts = shopifyFixedFees + subscriptionFees;

    // Profit calculation (matches Profit Journalier)
    const profitBrut = totalSales - totalAdsTTC - totalCogs;
    const profitNet = profitBrut - totalTaxes - fixedCosts;
    const profitNetPct = totalSales > 0 ? (profitNet / totalSales) * 100 : 0;
    const roas = totalAdsHT > 0 ? totalSales / totalAdsHT : 0;

    // Break-even ROAS — the average ratio Sales / AdsHT needed for Profit Net = 0.
    //
    // Profit Net = Sales - AdsHT*(1+taxAds) - cogsRatio*Sales - taxRate*Sales - fixedCosts = 0
    // With Sales = R * AdsHT and grossMargin = 1 - cogsRatio - taxRate:
    //   R = (1 + taxAds) / grossMargin                       (marginal — each extra ad € is profitable above this)
    //     + fixedCosts / (AdsHT * grossMargin)               (extra to cover the period's fixed costs)
    //
    // If grossMargin <= 0 (COGS + taxes already eat all sales), no ROAS will save the shop → mark as infinite.
    const cogsRatio = totalSales > 0 ? totalCogs / totalSales : 0;
    const taxRateDec = totalTaxOnSalesRate / 100;
    const taxAdsDec = taxOnAdSpend / 100;
    const grossMargin = 1 - cogsRatio - taxRateDec;
    const beRoasMarginal = grossMargin > 0 ? (1 + taxAdsDec) / grossMargin : Infinity;
    const beRoasNet =
      grossMargin > 0
        ? totalAdsHT > 0
          ? ((1 + taxAdsDec) * totalAdsHT + fixedCosts) / (grossMargin * totalAdsHT)
          : beRoasMarginal // No ads spent → fall back to the per-order break-even
        : Infinity;

    // Solde = solde initial + profit net on this period
    const solde = data.config.soldeInitial + profitNet;

    // Runway based on average daily burn in the range
    const dailyBurn = (totalAdsTTC + totalCogs + fixedCosts) / rangeDays;
    const runway = dailyBurn > 0 ? solde / dailyBurn : 999;

    // Today/Week/Month CA — computed within the filtered orders, relative to real today
    const today_orders = orders.filter((o) => orderDay(o) === todayIso);
    const week_orders = orders.filter((o) => orderDay(o) >= weekFrom && orderDay(o) <= todayIso);
    const month_orders = orders.filter((o) => orderDay(o) >= monthFrom && orderDay(o) <= todayIso);
    const caToday = today_orders.reduce((s, o) => s + gross(o), 0);
    const caWeek = week_orders.reduce((s, o) => s + gross(o), 0);
    const caMonth = month_orders.reduce((s, o) => s + gross(o), 0);

    const refundsTotal = orders.reduce((s, o) => s + refund(o), 0);
    const feesTotal = orders.reduce((s, o) => s + realFee(o), 0);
    const ordersWithFeeData = orders.filter((o) => hasRealFeeData(o)).length;
    const adsToday = dailyAds[todayIso]?.spend || 0;

    const objCaPct =
      data.config.objectifCA > 0 ? Math.min((caWeek / data.config.objectifCA) * 100, 100) : 0;
    const pendingFulfill = orders.filter((o) => o.displayFulfillmentStatus === "UNFULFILLED").length;

    return {
      caToday,
      caWeek,
      caMonth,
      totalSales,
      totalCogs,
      totalAdsHT,
      totalAdsTTC,
      totalTaxes,
      fixedCosts,
      shopifyFixedFees,
      subscriptionFees,
      activeMonthlySubscriptions,
      totalTaxOnSalesRate,
      taxOnAdSpend,
      profitBrut,
      profitNet,
      profitNetPct,
      roas,
      beRoasNet,
      beRoasMarginal,
      cogsRatio,
      solde,
      runway,
      objCaPct,
      refundsTotal,
      feesTotal,
      ordersWithFeeData,
      totalOrders: orders.length,
      ordersToday: today_orders.length,
      ordersWeek: week_orders.length,
      ordersMonth: month_orders.length,
      pendingFulfill,
      adsToday,
    };
  }, [orders, data, range, timeZone]);

  if (loading) {
    return <div style={{ color: "var(--text-dim)" }}>Chargement des données Shopify...</div>;
  }
  if (error) {
    return (
      <div className="card" style={{ borderColor: "var(--red)" }}>
        <div style={{ color: "var(--red)", fontWeight: 600 }}>Erreur</div>
        <div style={{ color: "var(--text-dim)", marginTop: "0.5rem" }}>{error}</div>
      </div>
    );
  }
  if (!stats || !orders) return null;

  const configNeeded = data!.config.objectifCA === 0 && data!.config.urssaf === 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Dashboard</h1>
          <div style={{ color: "var(--text-dim)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Période <span className="accent">{range.label}</span> · {stats.totalOrders} commandes · {currency} · EUR au taux 1 EUR = 1.19 USD · Heure boutique {timeZone}
            {stats.ordersWithFeeData > 0 && (
              <> · <span style={{ color: "var(--green)" }}>{stats.ordersWithFeeData} avec vrais frais Shopify</span></>
            )}
          </div>
        </div>
      </div>

      {configNeeded && (
        <div className="card" style={{ borderColor: "var(--accent)", marginBottom: "1rem", background: "rgba(200, 165, 90, 0.05)" }}>
          <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>⚙️ Configuration recommandée</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
            Va dans <a href="/parametres" style={{ color: "var(--accent)" }}>Paramètres</a> pour définir ton solde initial, taux URSSAF/IR, COGS et objectifs.
          </div>
        </div>
      )}

      {/* Top KPIs — aligned with Profit Journalier */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="kpi">
          <div className="kpi-label">Solde actuel</div>
          <MoneyStack amount={stats.solde} currency={currency} className={`kpi-value ${stats.solde > 0 ? "green" : "red"}`} />
          <div className="kpi-delta">
            Profit net: <span className={stats.profitNet >= 0 ? "green" : "red"}>{fmtMoney(stats.profitNet, currency)} / {fmtEur(stats.profitNet)}</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Total Sales</div>
          <MoneyStack amount={stats.totalSales} currency={currency} className="kpi-value accent" />
          <div className="kpi-delta">{stats.totalOrders} commandes</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">COGS</div>
          <MoneyStack amount={stats.totalCogs} currency={currency} className="kpi-value orange" />
          <div className="kpi-delta">incl. shipping + gifts</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Meta Ads TTC</div>
          <MoneyStack amount={stats.totalAdsTTC} currency={currency} className="kpi-value red" />
          <div className="kpi-delta">HT: {fmtMoney(stats.totalAdsHT, currency)} / {fmtEur(stats.totalAdsHT)} +{stats.taxOnAdSpend}% TVA</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Taxes</div>
          <MoneyStack amount={stats.totalTaxes} currency={currency} className="kpi-value" style={{ color: "var(--purple)" }} />
          <div className="kpi-delta">{stats.totalTaxOnSalesRate.toFixed(2)}% sur Sales</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Frais fixes</div>
          <MoneyStack amount={stats.fixedCosts} currency={currency} className="kpi-value red" />
          <div className="kpi-delta">
            Shopify: {fmtMoney(stats.shopifyFixedFees, currency)} / {fmtEur(stats.shopifyFixedFees)}
            <br />
            Abos: {fmtMoney(stats.subscriptionFees, currency)} / {fmtEur(stats.subscriptionFees)}
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Profit Net</div>
          <MoneyStack amount={stats.profitNet} currency={currency} className={`kpi-value ${stats.profitNet >= 0 ? "green" : "red"}`} />
          <div className="kpi-delta">{stats.profitNetPct.toFixed(1)}%</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">ROAS</div>
          <div className={`kpi-value ${stats.roas >= stats.beRoasNet ? "green" : stats.roas >= stats.beRoasMarginal ? "orange" : "red"}`}>
            {stats.roas.toFixed(2)}
          </div>
          <div className="kpi-delta">Sales / Ads HT</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">ROAS BE net</div>
          <div className={`kpi-value ${stats.roas >= stats.beRoasNet ? "green" : "orange"}`} style={{ color: undefined }}>
            {Number.isFinite(stats.beRoasNet) ? stats.beRoasNet.toFixed(2) : "∞"}
          </div>
          <div className="kpi-delta" style={{ lineHeight: 1.4 }}>
            Seuil pour Profit Net = 0
            <br />
            <span style={{ color: "var(--text-faint)" }}>
              marginal: {Number.isFinite(stats.beRoasMarginal) ? stats.beRoasMarginal.toFixed(2) : "∞"} · COGS {(stats.cogsRatio * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">À expédier</div>
          <div className={`kpi-value ${stats.pendingFulfill > 0 ? "orange" : "green"}`}>
            {stats.pendingFulfill}
          </div>
          <div className="kpi-delta">commandes unfulfilled</div>
        </div>
      </div>

      {/* Secondary KPIs: CA today / 7j / 30j / Runway */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="kpi">
          <div className="kpi-label">CA Aujourd&apos;hui</div>
          <MoneyStack amount={stats.caToday} currency={currency} className="kpi-value accent" />
          <div className="kpi-delta">{stats.ordersToday} commande{stats.ordersToday > 1 ? "s" : ""} · Ads: {fmtMoney(stats.adsToday, currency)} / {fmtEur(stats.adsToday)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">CA 7 jours</div>
          <MoneyStack amount={stats.caWeek} currency={currency} className="kpi-value blue" />
          <div className="kpi-delta">{stats.ordersWeek} commandes</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">CA 30 jours</div>
          <MoneyStack amount={stats.caMonth} currency={currency} className="kpi-value blue" />
          <div className="kpi-delta">{stats.ordersMonth} commandes</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Runway</div>
          <div className={`kpi-value ${stats.runway < 3 ? "red" : stats.runway < 7 ? "orange" : "green"}`}>
            {stats.runway > 365 ? "∞" : `${stats.runway.toFixed(0)}j`}
          </div>
          <div className="kpi-delta">Solde ÷ (ads + COGS / jour)</div>
        </div>
      </div>

      {/* Objectif CA / semaine progress bar */}
      {data!.config.objectifCA > 0 && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>Objectif CA / semaine</div>
            <div className="mono" style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
              <div>{fmtMoney(stats.caWeek, currency)} / {fmtMoney(data!.config.objectifCA, currency)}</div>
              <div style={{ color: "var(--text-faint)", fontSize: "0.75rem", marginTop: "0.15rem" }}>
                EUR: {fmtEur(stats.caWeek)} / {fmtEur(data!.config.objectifCA)}
              </div>
            </div>
          </div>
          <div className="progress">
            <div className={`progress-fill ${stats.objCaPct >= 100 ? "green" : ""}`} style={{ width: `${stats.objCaPct}%` }} />
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.35rem" }}>
            {stats.objCaPct.toFixed(1)}%
          </div>
        </div>
      )}

      {/* Recent orders */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>Commandes récentes</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Commande</th>
                <th>Date</th>
                <th>Pays</th>
                <th>Statut</th>
                <th>Fulfillment</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Frais Shopify</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 10).map((o) => {
                const fees = getRealFees(o);
                return (
                  <tr key={o.id}>
                    <td className="mono">{o.name}</td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                      {formatDateTimeInTimeZone(o.createdAt, timeZone)}
                    </td>
                    <td>{o.shippingAddress?.countryCodeV2 || "—"}</td>
                    <td>
                      <span className={`pill ${o.displayFinancialStatus === "PAID" ? "pill-green" : o.displayFinancialStatus === "PENDING" ? "pill-orange" : "pill-gray"}`}>
                        {o.displayFinancialStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${o.displayFulfillmentStatus === "FULFILLED" ? "pill-green" : o.displayFulfillmentStatus === "UNFULFILLED" ? "pill-orange" : "pill-gray"}`}>
                        {o.displayFulfillmentStatus}
                      </span>
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 500 }}>
                      <div>{fmtMoney(parseFloat(o.currentTotalPriceSet.shopMoney.amount), currency)}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontWeight: 400 }}>
                        {fmtEur(parseFloat(o.currentTotalPriceSet.shopMoney.amount))}
                      </div>
                    </td>
                    <td className="mono red" style={{ textAlign: "right", fontSize: "0.85rem" }}>
                      {fees > 0 ? (
                        <>
                          <div>-{fmtMoney(fees, currency)}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontWeight: 400 }}>
                            -{fmtEur(fees)}
                          </div>
                        </>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: "2rem", fontSize: "0.8rem", color: "var(--text-faint)", textAlign: "center" }}>
        EcomOS · Données 100% Shopify en temps réel · Même calcul que Profit Journalier
      </div>
    </div>
  );
}
