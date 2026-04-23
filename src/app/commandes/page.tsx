"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { fmtMoney, getRealFees, hasRealFeeData } from "@/lib/order-utils";
import type { Transaction } from "@/lib/order-utils";
import { formatDateTime } from "@/lib/format";

interface Money { shopMoney: { amount: string; currencyCode: string } }
interface Order {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  customer: { firstName?: string; lastName?: string; email?: string } | null;
  shippingAddress: { country?: string; countryCodeV2?: string } | null;
  currentTotalPriceSet: Money;
  subtotalPriceSet: Money;
  totalRefundedSet: Money;
  totalShippingPriceSet: Money;
  totalTaxSet: Money;
  totalDiscountsSet: Money;
  paymentGatewayNames: string[];
  transactions: Transaction[];
}

interface ShopData {
  config: { urssaf: number; ir: number };
}

export default function CommandesPage() {
  return <Shell><Commandes /></Shell>;
}

function Commandes() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [data, setData] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    const load = async () => {
      try {
        const [o, d, s] = await Promise.all([
          fetch("/api/orders?all=true"),
          fetch("/api/data"),
          fetch("/api/shop"),
        ]);
        const oj = await o.json();
        const dj = await d.json();
        setOrders(oj.orders);
        setData(dj.data);
        if (s.ok) {
          const sj = await s.json();
          if (sj.shop?.currencyCode) setCurrency(sj.shop.currencyCode);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => {
      const searchStr =
        o.name + " " +
        (o.customer?.firstName || "") + " " +
        (o.customer?.lastName || "") + " " +
        (o.customer?.email || "");
      if (filter && !searchStr.toLowerCase().includes(filter.toLowerCase())) return false;
      if (country && o.shippingAddress?.countryCodeV2 !== country) return false;
      return true;
    });
  }, [orders, filter, country]);

  const countries = useMemo(() => {
    if (!orders) return [];
    const set = new Set<string>();
    orders.forEach((o) => o.shippingAddress?.countryCodeV2 && set.add(o.shippingAddress.countryCodeV2));
    return Array.from(set).sort();
  }, [orders]);

  const totals = useMemo(() => {
    if (!data) return { ca: 0, frais: 0, net: 0, profit: 0, refund: 0, withFeeData: 0 };
    const ca = filtered.reduce((s, o) => s + parseFloat(o.currentTotalPriceSet.shopMoney.amount), 0);
    const refund = filtered.reduce((s, o) => s + parseFloat(o.totalRefundedSet.shopMoney.amount), 0);
    const frais = filtered.reduce((s, o) => s + getRealFees(o), 0);
    const withFeeData = filtered.filter(hasRealFeeData).length;
    const net = ca - refund - frais;
    const provisions = (net * (data.config.urssaf + data.config.ir)) / 100;
    const profit = net - provisions;
    return { ca, frais, net, profit, refund, withFeeData };
  }, [filtered, data]);

  if (loading) return <div style={{ color: "var(--text-dim)" }}>Chargement...</div>;
  if (!orders || !data) return null;

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Commandes</h1>
        <div style={{ color: "var(--text-dim)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          {filtered.length} commandes · {totals.withFeeData} avec vrais frais Shopify{country ? ` · Pays: ${country}` : ""}
        </div>
      </div>

      {/* Totals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="kpi"><div className="kpi-label">CA total</div><div className="kpi-value accent">{fmtMoney(totals.ca, currency)}</div></div>
        <div className="kpi"><div className="kpi-label">Frais Shopify</div><div className="kpi-value red">{fmtMoney(totals.frais, currency)}</div></div>
        <div className="kpi"><div className="kpi-label">Net reçu</div><div className="kpi-value blue">{fmtMoney(totals.net, currency)}</div></div>
        <div className="kpi"><div className="kpi-label">Remboursé</div><div className="kpi-value orange">{fmtMoney(totals.refund, currency)}</div></div>
        <div className="kpi"><div className="kpi-label">Profit estimé</div><div className={`kpi-value ${totals.profit >= 0 ? "green" : "red"}`}>{fmtMoney(totals.profit, currency)}</div></div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
        <input
          className="input"
          placeholder="Rechercher (n° commande, client, email)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1 }}
        />
        <select className="select" value={country} onChange={(e) => setCountry(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="">Tous pays</option>
          {countries.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: "70vh" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Commande</th>
                <th>Date</th>
                <th>Client</th>
                <th>Pays</th>
                <th>Paiement</th>
                <th>Statut</th>
                <th style={{ textAlign: "right" }}>CA brut</th>
                <th style={{ textAlign: "right" }}>Frais</th>
                <th style={{ textAlign: "right" }}>Net</th>
                <th style={{ textAlign: "right" }}>Remb.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const amt = parseFloat(o.currentTotalPriceSet.shopMoney.amount);
                const refund = parseFloat(o.totalRefundedSet.shopMoney.amount);
                const frais = getRealFees(o);
                const net = amt - refund - frais;
                const gateway = o.paymentGatewayNames[0] || "—";
                return (
                  <tr key={o.id}>
                    <td className="mono">{o.name}</td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{formatDateTime(o.createdAt)}</td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {o.customer ? `${o.customer.firstName || ""} ${o.customer.lastName || ""}`.trim() || o.customer.email : "—"}
                    </td>
                    <td>{o.shippingAddress?.countryCodeV2 || "—"}</td>
                    <td style={{ fontSize: "0.8rem" }}>{gateway}</td>
                    <td>
                      <span className={`pill ${o.displayFinancialStatus === "PAID" ? "pill-green" : "pill-orange"}`}>
                        {o.displayFinancialStatus}
                      </span>
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtMoney(amt, currency)}</td>
                    <td className="mono red" style={{ textAlign: "right", fontSize: "0.85rem" }}>
                      {frais > 0 ? `-${fmtMoney(frais, currency)}` : "—"}
                    </td>
                    <td className="mono blue" style={{ textAlign: "right" }}>{fmtMoney(net, currency)}</td>
                    <td className="mono orange" style={{ textAlign: "right", fontSize: "0.85rem" }}>
                      {refund > 0 ? `-${fmtMoney(refund, currency)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
