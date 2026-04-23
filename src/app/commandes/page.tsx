"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { formatCurrency, formatDateTime, normalizePaymentMethod, computeFees } from "@/lib/format";

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
}

interface ShopData {
  config: {
    shopifyPct: number;
    shopifyFixe: number;
    urssaf: number;
    ir: number;
    fraisParMethode: Record<string, Record<string, { pct: number; fixe: number }>>;
  };
}

export default function CommandesPage() {
  return (
    <Shell>
      <Commandes />
    </Shell>
  );
}

function Commandes() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [data, setData] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("EUR");

  useEffect(() => {
    const load = async () => {
      try {
        const [o, d] = await Promise.all([fetch("/api/orders?all=true"), fetch("/api/data")]);
        const oj = await o.json();
        const dj = await d.json();
        setOrders(oj.orders);
        setData(dj.data);
        if (oj.orders?.[0]?.currentTotalPriceSet?.shopMoney?.currencyCode) {
          setCurrency(oj.orders[0].currentTotalPriceSet.shopMoney.currencyCode);
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
    if (!data) return { ca: 0, frais: 0, net: 0, profit: 0, refund: 0 };
    const sumAmt = (arr: Order[], f: (o: Order) => number) => arr.reduce((s, o) => s + f(o), 0);
    const ca = sumAmt(filtered, (o) => parseFloat(o.currentTotalPriceSet.shopMoney.amount));
    const refund = sumAmt(filtered, (o) => parseFloat(o.totalRefundedSet.shopMoney.amount));
    let frais = 0;
    filtered.forEach((o) => {
      const m = o.shippingAddress?.countryCodeV2 || "FR";
      const p = normalizePaymentMethod(o.paymentGatewayNames[0] || "VISA");
      const amt = parseFloat(o.currentTotalPriceSet.shopMoney.amount);
      frais += computeFees(amt, m, p, data.config.fraisParMethode);
    });
    const net = ca - frais;
    const provisions = (net * (data.config.urssaf + data.config.ir)) / 100;
    const profit = net - provisions - refund;
    return { ca, frais, net, profit, refund };
  }, [filtered, data]);

  if (loading) return <div style={{ color: "var(--text-dim)" }}>Chargement...</div>;
  if (!orders || !data) return null;

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Commandes</h1>
        <div style={{ color: "var(--text-dim)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          {filtered.length} commandes{country ? ` · Pays: ${country}` : ""}
        </div>
      </div>

      {/* Totals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="kpi"><div className="kpi-label">CA total</div><div className="kpi-value accent">{formatCurrency(totals.ca, currency)}</div></div>
        <div className="kpi"><div className="kpi-label">Frais paiement</div><div className="kpi-value red">{formatCurrency(totals.frais, currency)}</div></div>
        <div className="kpi"><div className="kpi-label">Net reçu</div><div className="kpi-value blue">{formatCurrency(totals.net, currency)}</div></div>
        <div className="kpi"><div className="kpi-label">Remboursé</div><div className="kpi-value orange">{formatCurrency(totals.refund, currency)}</div></div>
        <div className="kpi"><div className="kpi-label">Profit estimé</div><div className={`kpi-value ${totals.profit >= 0 ? "green" : "red"}`}>{formatCurrency(totals.profit, currency)}</div></div>
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
                const m = o.shippingAddress?.countryCodeV2 || "FR";
                const p = normalizePaymentMethod(o.paymentGatewayNames[0] || "VISA");
                const amt = parseFloat(o.currentTotalPriceSet.shopMoney.amount);
                const refund = parseFloat(o.totalRefundedSet.shopMoney.amount);
                const frais = computeFees(amt, m, p, data.config.fraisParMethode);
                const net = amt - frais;
                return (
                  <tr key={o.id}>
                    <td className="mono">{o.name}</td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{formatDateTime(o.createdAt)}</td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {o.customer ? `${o.customer.firstName || ""} ${o.customer.lastName || ""}`.trim() || o.customer.email : "—"}
                    </td>
                    <td>{m}</td>
                    <td style={{ fontSize: "0.8rem" }}>{p}</td>
                    <td>
                      <span className={`pill ${o.displayFinancialStatus === "PAID" ? "pill-green" : "pill-orange"}`}>
                        {o.displayFinancialStatus}
                      </span>
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>{formatCurrency(amt, currency)}</td>
                    <td className="mono red" style={{ textAlign: "right", fontSize: "0.85rem" }}>-{formatCurrency(frais, currency)}</td>
                    <td className="mono blue" style={{ textAlign: "right" }}>{formatCurrency(net, currency)}</td>
                    <td className="mono orange" style={{ textAlign: "right", fontSize: "0.85rem" }}>
                      {refund > 0 ? `-${formatCurrency(refund, currency)}` : "—"}
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
