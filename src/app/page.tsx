"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { formatCurrency, formatNumber, formatPct } from "@/lib/format";

interface OrderMoney { shopMoney: { amount: string; currencyCode: string } }
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
}

interface ShopData {
  config: {
    shopifyPct: number;
    shopifyFixe: number;
    urssaf: number;
    ir: number;
    objectifCA: number;
    objectifProfit: number;
    soldeInitial: number;
    alerteRunway: number;
  };
  abonnements: { montant: number; cycleJours: number; active: boolean; name: string; dateDebut: string; id: string }[];
  tresorerie: { caBrut: number; adsDepenses: number; fournisseurPaye: number; date: string }[];
}

export default function DashboardPage() {
  return (
    <Shell>
      <Dashboard />
    </Shell>
  );
}

function Dashboard() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [data, setData] = useState<ShopData | null>(null);
  const [currency, setCurrency] = useState("EUR");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [oRes, dRes] = await Promise.all([
          fetch("/api/orders?all=true"),
          fetch("/api/data"),
        ]);
        if (!oRes.ok) throw new Error((await oRes.json()).error || "orders failed");
        if (!dRes.ok) throw new Error((await dRes.json()).error || "data failed");
        const oJson = await oRes.json();
        const dJson = await dRes.json();
        setOrders(oJson.orders);
        setData(dJson.data);
        if (oJson.orders?.[0]?.currentTotalPriceSet?.shopMoney?.currencyCode) {
          setCurrency(oJson.orders[0].currentTotalPriceSet.shopMoney.currencyCode);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const stats = useMemo(() => {
    if (!orders || !data) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 86400_000);
    const monthAgo = new Date(today.getTime() - 30 * 86400_000);

    const sum = (arr: Order[], field: (o: Order) => number) =>
      arr.reduce((s, o) => s + field(o), 0);
    const gross = (o: Order) => parseFloat(o.currentTotalPriceSet.shopMoney.amount);
    const refund = (o: Order) => parseFloat(o.totalRefundedSet.shopMoney.amount);

    const today_orders = orders.filter((o) => new Date(o.createdAt) >= today);
    const week_orders = orders.filter((o) => new Date(o.createdAt) >= weekAgo);
    const month_orders = orders.filter((o) => new Date(o.createdAt) >= monthAgo);

    const caToday = sum(today_orders, gross);
    const caWeek = sum(week_orders, gross);
    const caMonth = sum(month_orders, gross);
    const caTotal = sum(orders, gross);
    const refundsTotal = sum(orders, refund);

    const totalAds = data.tresorerie.reduce((s, t) => s + t.adsDepenses, 0);
    const totalFournisseur = data.tresorerie.reduce((s, t) => s + t.fournisseurPaye, 0);
    const abosMensuel = data.abonnements
      .filter((a) => a.active)
      .reduce((s, a) => s + (a.montant * 30) / a.cycleJours, 0);

    const provisions = (caTotal * (data.config.urssaf + data.config.ir)) / 100;
    const benef = caTotal - refundsTotal - totalAds - totalFournisseur - provisions - abosMensuel;
    const solde = data.config.soldeInitial + benef;

    // Runway: days until solde hits 0 at current burn rate
    const dailyBurn = totalAds / 30 + abosMensuel / 30 + totalFournisseur / 30;
    const runway = dailyBurn > 0 ? solde / dailyBurn : 999;

    const objCaPct = Math.min((caWeek / data.config.objectifCA) * 100, 100);
    const pendingFulfill = orders.filter(
      (o) => o.displayFulfillmentStatus === "UNFULFILLED"
    ).length;

    return {
      caToday,
      caWeek,
      caMonth,
      caTotal,
      refundsTotal,
      totalAds,
      totalFournisseur,
      abosMensuel,
      provisions,
      benef,
      solde,
      runway,
      objCaPct,
      totalOrders: orders.length,
      ordersToday: today_orders.length,
      ordersWeek: week_orders.length,
      ordersMonth: month_orders.length,
      pendingFulfill,
    };
  }, [orders, data]);

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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Dashboard</h1>
          <div style={{ color: "var(--text-dim)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Données Shopify en temps réel — {stats.totalOrders} commandes
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="kpi">
          <div className="kpi-label">Solde actuel</div>
          <div className={`kpi-value ${stats.solde > 0 ? "green" : "red"}`}>
            {formatCurrency(stats.solde, currency)}
          </div>
          <div className="kpi-delta">
            Bénéfice: <span className={stats.benef >= 0 ? "green" : "red"}>{formatCurrency(stats.benef, currency)}</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">CA Aujourd&apos;hui</div>
          <div className="kpi-value accent">{formatCurrency(stats.caToday, currency)}</div>
          <div className="kpi-delta">{stats.ordersToday} commande{stats.ordersToday > 1 ? "s" : ""}</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">CA 7 jours</div>
          <div className="kpi-value blue">{formatCurrency(stats.caWeek, currency)}</div>
          <div className="kpi-delta">{stats.ordersWeek} commandes</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">CA 30 jours</div>
          <div className="kpi-value blue">{formatCurrency(stats.caMonth, currency)}</div>
          <div className="kpi-delta">{stats.ordersMonth} commandes</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Runway</div>
          <div className={`kpi-value ${stats.runway < 3 ? "red" : stats.runway < 7 ? "orange" : "green"}`}>
            {stats.runway > 365 ? "∞" : `${stats.runway.toFixed(0)}j`}
          </div>
          <div className="kpi-delta">À consommation actuelle</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">À expédier</div>
          <div className={`kpi-value ${stats.pendingFulfill > 0 ? "orange" : "green"}`}>
            {stats.pendingFulfill}
          </div>
          <div className="kpi-delta">Commandes non fulfilled</div>
        </div>
      </div>

      {/* Progress bars */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>Objectif CA / semaine</div>
            <div className="mono" style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
              {formatCurrency(stats.caWeek, currency)} / {formatCurrency(data!.config.objectifCA, currency)}
            </div>
          </div>
          <div className="progress">
            <div
              className={`progress-fill ${stats.objCaPct >= 100 ? "green" : ""}`}
              style={{ width: `${stats.objCaPct}%` }}
            />
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.35rem" }}>
            {formatPct(stats.objCaPct)}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: "0.9rem", fontWeight: 500, marginBottom: "0.5rem" }}>
            Dépenses totales
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.85rem" }}>
            <div>
              <div style={{ color: "var(--text-dim)" }}>Ads</div>
              <div className="mono red">{formatCurrency(stats.totalAds, currency)}</div>
            </div>
            <div>
              <div style={{ color: "var(--text-dim)" }}>Fournisseur</div>
              <div className="mono orange">{formatCurrency(stats.totalFournisseur, currency)}</div>
            </div>
            <div>
              <div style={{ color: "var(--text-dim)" }}>Abonnements /mois</div>
              <div className="mono">{formatCurrency(stats.abosMensuel, currency)}</div>
            </div>
            <div>
              <div style={{ color: "var(--text-dim)" }}>Provisions URSSAF+IR</div>
              <div className="mono accent">{formatCurrency(stats.provisions, currency)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>Commandes récentes</div>
          <a href="/commandes" style={{ fontSize: "0.85rem", color: "var(--accent)" }}>
            Voir toutes →
          </a>
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
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 10).map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.name}</td>
                  <td style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                    {new Date(o.createdAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>{o.shippingAddress?.countryCodeV2 || "—"}</td>
                  <td>
                    <span
                      className={`pill ${
                        o.displayFinancialStatus === "PAID"
                          ? "pill-green"
                          : o.displayFinancialStatus === "PENDING"
                          ? "pill-orange"
                          : "pill-gray"
                      }`}
                    >
                      {o.displayFinancialStatus}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`pill ${
                        o.displayFulfillmentStatus === "FULFILLED"
                          ? "pill-green"
                          : o.displayFulfillmentStatus === "UNFULFILLED"
                          ? "pill-orange"
                          : "pill-gray"
                      }`}
                    >
                      {o.displayFulfillmentStatus}
                    </span>
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 500 }}>
                    {formatCurrency(parseFloat(o.currentTotalPriceSet.shopMoney.amount), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: "2rem", fontSize: "0.8rem", color: "var(--text-faint)", textAlign: "center" }}>
        EcomOS · Dashboard connecté à Shopify · Données mises à jour en temps réel
      </div>
    </div>
  );
}
