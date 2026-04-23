"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { fmtMoney } from "@/lib/order-utils";
import { useDateRangeCtx } from "@/components/DateRangeContext";
import { inRange } from "@/hooks/useDateRange";
import type { ProductCost, Bundle } from "@/lib/types";

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
interface Order {
  id: string;
  name: string;
  createdAt: string;
  currentTotalPriceSet: Money;
  totalRefundedSet: Money;
  shippingAddress: { countryCodeV2?: string } | null;
  lineItems: { edges: { node: LineItem }[] };
  customAttributes?: { key: string; value: string }[];
}

interface ShopData {
  config: {
    urssaf: number;
    ir: number;
    taxOnAdSpend?: number;
    productCosts?: Record<string, ProductCost>;
    bundles?: Bundle[];
    dailyAds?: Record<string, { spend: number; notes?: string }>;
  };
}

export default function ProfitPage() { return <Shell><Profit /></Shell>; }

function Profit() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [data, setData] = useState<ShopData | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { range } = useDateRangeCtx();

  useEffect(() => {
    Promise.all([
      fetch("/api/orders?all=true").then(r => r.json()),
      fetch("/api/data").then(r => r.json()),
      fetch("/api/shop").then(r => r.ok ? r.json() : null),
    ]).then(([o, d, s]) => {
      setOrders(o.orders);
      setData(d.data);
      if (s?.shop?.currencyCode) setCurrency(s.shop.currencyCode);
    });
  }, []);

  // Debounced save on dirty
  useEffect(() => {
    if (!dirty || !data) return;
    setSaving(true);
    const t = setTimeout(async () => {
      await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: data.config }),
      });
      setDirty(false);
      setSaving(false);
    }, 300);
    return () => clearTimeout(t);
  }, [dirty, data]);

  // Compute daily rows within the selected range
  const { days, total, activeVariants } = useMemo(() => {
    if (!orders || !data) return { days: [], total: null, activeVariants: [] };

    const productCosts = data.config.productCosts || {};
    const bundles = (data.config.bundles || []).filter((b) => b.active);
    const dailyAds = data.config.dailyAds || {};
    const taxPct = data.config.taxOnAdSpend ?? 5;
    const urssaf = data.config.urssaf || 0;
    const ir = data.config.ir || 0;

    // Pre-compute bundle COGS per trigger variant (sum across bundles)
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

    // Active variants list (for dynamic columns)
    const activeVariants = Object.entries(productCosts)
      .filter(([, pc]) => pc.active)
      .map(([variantId, pc]) => ({ variantId, ...pc }));

    // Filter orders in range
    const filteredOrders = orders.filter((o) => inRange(o.createdAt, range));

    // Build day buckets
    const dayMap = new Map<string, {
      date: string;
      orders: number;
      qtyByVariant: Record<string, number>;
      sales: number;
      cogs: number;
    }>();

    // Init all days in range with 0s
    const fromDate = new Date(range.from + "T00:00:00");
    const toDate = new Date(range.to + "T00:00:00");
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { date: key, orders: 0, qtyByVariant: {}, sales: 0, cogs: 0 });
    }

    for (const o of filteredOrders) {
      const dayKey = o.createdAt.slice(0, 10);
      const day = dayMap.get(dayKey);
      if (!day) continue;
      day.orders += 1;
      // Sales = exactly what Shopify says the order is worth (once per order)
      // Already accounts for discounts, bundle gifts priced at $0, etc.
      day.sales += parseFloat(o.currentTotalPriceSet.shopMoney.amount);

      for (const { node: li } of o.lineItems.edges) {
        const variantId = li.variant?.id;
        if (!variantId) continue;
        const pc = productCosts[variantId];
        // Only count if variant is tracked AND active
        if (!pc || !pc.active) continue;

        day.qtyByVariant[variantId] = (day.qtyByVariant[variantId] || 0) + li.quantity;
        // COGS = what the product costs us (even if customer got it free)
        day.cogs += li.quantity * pc.cogs;

        // Add bundle extras from manual config (ignored if Moon Bundles already handles it)
        const bundleExtra = bundleExtraCogsPerTrigger[variantId] || 0;
        const isMoonBundleLine = (li.customAttributes || []).some((a) => a.key === "__moonbundle");
        if (bundleExtra > 0 && !isMoonBundleLine) {
          day.cogs += li.quantity * bundleExtra;
        }
      }
    }

    // Build rows
    const days = Array.from(dayMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => {
        const adsRaw = dailyAds[d.date]?.spend || 0;
        const adsWithTax = adsRaw * (1 + taxPct / 100);
        const profitBrut = d.sales - adsWithTax - d.cogs;
        const profitBrutPct = d.sales > 0 ? (profitBrut / d.sales) * 100 : 0;
        // Net after URSSAF + IR on sales
        const provisions = (d.sales * (urssaf + ir)) / 100;
        const profitNet = profitBrut - provisions;
        const profitNetPct = d.sales > 0 ? (profitNet / d.sales) * 100 : 0;
        const roas = adsRaw > 0 ? d.sales / adsRaw : 0;
        return {
          ...d,
          adsRaw,
          adsWithTax,
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
        acc.profitBrut += d.profitBrut;
        acc.profitNet += d.profitNet;
        activeVariants.forEach((v) => {
          acc.qtyByVariant[v.variantId] = (acc.qtyByVariant[v.variantId] || 0) + (d.qtyByVariant[v.variantId] || 0);
        });
        return acc;
      },
      {
        orders: 0,
        sales: 0,
        cogs: 0,
        adsRaw: 0,
        adsWithTax: 0,
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
  }, [orders, data, range]);

  if (!orders || !data) return <div>Chargement...</div>;

  const updateAdSpend = (date: string, spend: number, notes?: string) => {
    if (!data) return;
    const current = data.config.dailyAds || {};
    const next = { ...current };
    if (spend === 0 && !notes) {
      delete next[date];
    } else {
      next[date] = { spend, ...(notes !== undefined ? { notes } : {}) };
    }
    setData({ ...data, config: { ...data.config, dailyAds: next } });
    setDirty(true);
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
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  };

  const hasAnyProducts = activeVariants.length > 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Profit Journalier</h1>
          <div style={{ color: "var(--text-dim)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Période <span className="accent">{range.label}</span> · {days.length} jours · {total?.orders || 0} commandes
            {saving && <span style={{ marginLeft: "0.75rem", color: "var(--blue)" }}>💾 Sauvegarde...</span>}
          </div>
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

      {/* Summary KPIs */}
      {total && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
          <div className="kpi">
            <div className="kpi-label">Total Sales</div>
            <div className="kpi-value accent">{fmtMoney(total.sales, currency)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">COGS</div>
            <div className="kpi-value orange">{fmtMoney(total.cogs, currency)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Meta Ads (HT)</div>
            <div className="kpi-value red">{fmtMoney(total.adsRaw, currency)}</div>
            <div className="kpi-delta">+TVA: {fmtMoney(total.adsWithTax, currency)}</div>
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
                {activeVariants.map((v) => (
                  <th key={v.variantId} style={{ textAlign: "center", background: "rgba(96, 165, 250, 0.15)", color: "var(--blue)" }}>
                    <div style={{ fontSize: "0.7rem" }}>{v.productTitle}</div>
                    {v.variantTitle !== "Default Title" && (
                      <div style={{ fontSize: "0.65rem", opacity: 0.7 }}>{v.variantTitle}</div>
                    )}
                    <div style={{ fontSize: "0.65rem", opacity: 0.8 }}>({fmtMoney(v.price, currency)})</div>
                  </th>
                ))}
                <th style={{ textAlign: "right", background: "rgba(248, 113, 113, 0.15)", color: "var(--red)" }}>
                  Meta Ads
                </th>
                <th style={{ textAlign: "right", background: "rgba(251, 191, 36, 0.15)" }}>COGS</th>
                <th style={{ textAlign: "right", background: "rgba(200, 165, 90, 0.15)" }}>Total Sales</th>
                <th style={{ textAlign: "right", background: "rgba(52, 211, 153, 0.10)" }}>Profit Brut</th>
                <th style={{ textAlign: "right", background: "rgba(52, 211, 153, 0.10)" }}>%</th>
                <th style={{ textAlign: "right", background: "rgba(52, 211, 153, 0.15)" }}>Profit Net</th>
                <th style={{ textAlign: "right", background: "rgba(52, 211, 153, 0.15)" }}>%</th>
                <th style={{ textAlign: "right", background: "rgba(200, 165, 90, 0.20)" }}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} style={{ background: rowBgForProfit(d.profitNet) }}>
                  <td style={{ position: "sticky", left: 0, background: "var(--bg-card)", fontWeight: 500 }}>
                    {formatDay(d.date)}
                  </td>
                  <td style={{ textAlign: "center", color: "var(--text-dim)" }}>{d.orders || "—"}</td>
                  {activeVariants.map((v) => (
                    <td key={v.variantId} className="mono" style={{ textAlign: "center" }}>
                      {d.qtyByVariant[v.variantId] || "—"}
                    </td>
                  ))}
                  <td style={{ textAlign: "right" }}>
                    <input
                      type="number"
                      step="0.01"
                      className="input mono"
                      value={d.adsRaw || ""}
                      onChange={(e) => updateAdSpend(d.date, parseFloat(e.target.value) || 0, d.notes)}
                      placeholder="0"
                      style={{ maxWidth: 90, textAlign: "right", fontSize: "0.8rem", marginLeft: "auto" }}
                    />
                  </td>
                  <td className="mono orange" style={{ textAlign: "right" }}>
                    {d.cogs > 0 ? fmtMoney(d.cogs, currency) : "—"}
                  </td>
                  <td className="mono accent" style={{ textAlign: "right", fontWeight: 500 }}>
                    {d.sales > 0 ? fmtMoney(d.sales, currency) : "—"}
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
              ))}
              {total && (
                <tr style={{ background: "rgba(200, 165, 90, 0.15)", fontWeight: 600, borderTop: "2px solid var(--accent)" }}>
                  <td style={{ position: "sticky", left: 0, background: "rgba(200, 165, 90, 0.15)", color: "var(--accent)" }}>TOTAL</td>
                  <td className="mono" style={{ textAlign: "center" }}>{total.orders}</td>
                  {activeVariants.map((v) => (
                    <td key={v.variantId} className="mono" style={{ textAlign: "center" }}>
                      {total.qtyByVariant[v.variantId] || 0}
                    </td>
                  ))}
                  <td className="mono red" style={{ textAlign: "right" }}>{fmtMoney(total.adsRaw, currency)}</td>
                  <td className="mono orange" style={{ textAlign: "right" }}>{fmtMoney(total.cogs, currency)}</td>
                  <td className="mono accent" style={{ textAlign: "right" }}>{fmtMoney(total.sales, currency)}</td>
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
        <div><b>COGS</b> = Σ (quantité vendue × COGS par variante) — gifts inclus (tu paies même ce qui est offert).</div>
        <div><b>Profit Brut</b> = Sales − (Ads × {(1 + (data.config.taxOnAdSpend ?? 5) / 100).toFixed(2)}) − COGS</div>
        <div><b>Profit Net</b> = Profit Brut − Sales × {((data.config.urssaf || 0) + (data.config.ir || 0)).toFixed(2)}% (URSSAF+IR)</div>
        <div><b>ROAS</b> = Sales / Ads (HT)</div>
      </div>
    </div>
  );
}
