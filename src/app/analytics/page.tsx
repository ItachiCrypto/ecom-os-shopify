"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { formatCurrency, formatPct } from "@/lib/format";
import { useDateRangeCtx } from "@/components/DateRangeContext";
import { inRange } from "@/hooks/useDateRange";

interface Money { shopMoney: { amount: string; currencyCode: string } }
interface Order {
  id: string;
  name: string;
  createdAt: string;
  shippingAddress: { countryCodeV2?: string } | null;
  currentTotalPriceSet: Money;
  totalRefundedSet: Money;
  lineItems: { edges: { node: { title: string; quantity: number; variant: { title: string; price: string } | null; originalTotalSet: Money } }[] };
}

export default function AnalyticsPage() {
  return <Shell><Analytics /></Shell>;
}

function Analytics() {
  const [allOrders, setAllOrders] = useState<Order[] | null>(null);
  const [currency, setCurrency] = useState("EUR");
  const { range } = useDateRangeCtx();

  useEffect(() => {
    fetch("/api/orders?all=true").then(r => r.json()).then(j => {
      setAllOrders(j.orders);
      if (j.orders?.[0]?.currentTotalPriceSet?.shopMoney?.currencyCode) setCurrency(j.orders[0].currentTotalPriceSet.shopMoney.currencyCode);
    });
  }, []);

  // Filter by active date range
  const orders = useMemo(() => {
    if (!allOrders) return null;
    return allOrders.filter((o) => inRange(o.createdAt, range));
  }, [allOrders, range]);

  const byCountry = useMemo(() => {
    if (!orders) return [];
    const map = new Map<string, { nb: number; ca: number; refund: number }>();
    orders.forEach(o => {
      const c = o.shippingAddress?.countryCodeV2 || "—";
      const m = map.get(c) || { nb: 0, ca: 0, refund: 0 };
      m.nb += 1;
      m.ca += parseFloat(o.currentTotalPriceSet.shopMoney.amount);
      m.refund += parseFloat(o.totalRefundedSet.shopMoney.amount);
      map.set(c, m);
    });
    return Array.from(map.entries()).map(([c, v]) => ({ country: c, ...v })).sort((a, b) => b.ca - a.ca);
  }, [orders]);

  const byProduct = useMemo(() => {
    if (!orders) return [];
    const map = new Map<string, { qty: number; ca: number }>();
    orders.forEach(o => {
      o.lineItems.edges.forEach(({ node }) => {
        const key = node.title + (node.variant?.title && node.variant.title !== "Default Title" ? ` — ${node.variant.title}` : "");
        const m = map.get(key) || { qty: 0, ca: 0 };
        m.qty += node.quantity;
        m.ca += parseFloat(node.originalTotalSet.shopMoney.amount);
        map.set(key, m);
      });
    });
    return Array.from(map.entries()).map(([p, v]) => ({ product: p, ...v })).sort((a, b) => b.ca - a.ca);
  }, [orders]);

  const byMonth = useMemo(() => {
    if (!orders) return [];
    const map = new Map<string, { nb: number; ca: number }>();
    orders.forEach(o => {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const m = map.get(key) || { nb: 0, ca: 0 };
      m.nb += 1;
      m.ca += parseFloat(o.currentTotalPriceSet.shopMoney.amount);
      map.set(key, m);
    });
    return Array.from(map.entries()).map(([month, v]) => ({ month, ...v })).sort((a, b) => b.month.localeCompare(a.month));
  }, [orders]);

  const caTotal = orders?.reduce((s, o) => s + parseFloat(o.currentTotalPriceSet.shopMoney.amount), 0) || 0;

  if (!orders) return <div>Chargement...</div>;

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Analytics</h1>
        <div style={{ color: "var(--text-dim)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          Période <span className="accent">{range.label}</span> · {orders.length} commandes
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="card">
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.75rem" }}>Par pays</div>
          <table className="table">
            <thead><tr><th>Pays</th><th>Commandes</th><th style={{ textAlign: "right" }}>CA</th><th style={{ textAlign: "right" }}>% total</th><th style={{ textAlign: "right" }}>Remb.</th></tr></thead>
            <tbody>
              {byCountry.map(c => (
                <tr key={c.country}>
                  <td>{c.country}</td>
                  <td className="mono">{c.nb}</td>
                  <td className="mono accent" style={{ textAlign: "right" }}>{formatCurrency(c.ca, currency)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{formatPct((c.ca / caTotal) * 100)}</td>
                  <td className="mono orange" style={{ textAlign: "right" }}>{formatCurrency(c.refund, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.75rem" }}>Par mois</div>
          <table className="table">
            <thead><tr><th>Mois</th><th>Commandes</th><th style={{ textAlign: "right" }}>CA</th></tr></thead>
            <tbody>
              {byMonth.map(m => (
                <tr key={m.month}>
                  <td className="mono">{m.month}</td>
                  <td className="mono">{m.nb}</td>
                  <td className="mono accent" style={{ textAlign: "right" }}>{formatCurrency(m.ca, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.75rem" }}>Par produit / variante</div>
          <table className="table">
            <thead><tr><th>Produit</th><th>Quantité</th><th style={{ textAlign: "right" }}>CA</th><th style={{ textAlign: "right" }}>% total</th></tr></thead>
            <tbody>
              {byProduct.slice(0, 30).map(p => (
                <tr key={p.product}>
                  <td style={{ fontSize: "0.85rem" }}>{p.product}</td>
                  <td className="mono">{p.qty}</td>
                  <td className="mono accent" style={{ textAlign: "right" }}>{formatCurrency(p.ca, currency)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{formatPct((p.ca / caTotal) * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
