"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { fmtMoney, getRealFees, hasRealFeeData } from "@/lib/order-utils";
import type { Transaction } from "@/lib/order-utils";
import { useDateRangeCtx } from "@/components/DateRangeContext";
import { inRange } from "@/hooks/useDateRange";

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
  transactions: Transaction[];
}

interface ShopData {
  config: {
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
  const [allOrders, setAllOrders] = useState<Order[] | null>(null);
  const [data, setData] = useState<ShopData | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { range } = useDateRangeCtx();

  // Filter orders by active date range
  const orders = useMemo(() => {
    if (!allOrders) return null;
    return allOrders.filter((o) => inRange(o.createdAt, range));
  }, [allOrders, range]);

  useEffect(() => {
    const load = async () => {
      try {
        const [oRes, dRes, sRes] = await Promise.all([
          fetch("/api/orders?all=true"),
          fetch("/api/data"),
          fetch("/api/shop"),
        ]);
        if (!oRes.ok) throw new Error((await oRes.json()).error || "orders failed");
        if (!dRes.ok) throw new Error((await dRes.json()).error || "data failed");
        const oJson = await oRes.json();
        const dJson = await dRes.json();
        setAllOrders(oJson.orders);
        setData(dJson.data);
        if (sRes.ok) {
          const sJson = await sRes.json();
          if (sJson.shop?.currencyCode) setCurrency(sJson.shop.currencyCode);
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

    const gross = (o: Order) => parseFloat(o.currentTotalPriceSet.shopMoney.amount);
    const refund = (o: Order) => parseFloat(o.totalRefundedSet.shopMoney.amount);
    const realFee = (o: Order) => getRealFees(o);

    // "Today/Week/Month" are relative to TODAY, independent of the active range filter
    // (they show intra-period info within whatever the user has filtered)
    const today_orders = orders.filter((o) => new Date(o.createdAt) >= today);
    const week_orders = orders.filter((o) => new Date(o.createdAt) >= weekAgo);
    const month_orders = orders.filter((o) => new Date(o.createdAt) >= monthAgo);

    const caToday = today_orders.reduce((s, o) => s + gross(o), 0);
    const caWeek = week_orders.reduce((s, o) => s + gross(o), 0);
    const caMonth = month_orders.reduce((s, o) => s + gross(o), 0);
    const caTotal = orders.reduce((s, o) => s + gross(o), 0);
    const refundsTotal = orders.reduce((s, o) => s + refund(o), 0);
    const feesTotal = orders.reduce((s, o) => s + realFee(o), 0);
    const netTotal = caTotal - refundsTotal - feesTotal;
    const ordersWithFeeData = orders.filter((o) => hasRealFeeData(o)).length;

    const totalAds = data.tresorerie.reduce((s, t) => s + t.adsDepenses, 0);
    const totalFournisseur = data.tresorerie.reduce((s, t) => s + t.fournisseurPaye, 0);
    const abosMensuel = data.abonnements
      .filter((a) => a.active)
      .reduce((s, a) => s + (a.montant * 30) / a.cycleJours, 0);

    const provisions = (netTotal * (data.config.urssaf + data.config.ir)) / 100;
    const benef = netTotal - totalAds - totalFournisseur - provisions - abosMensuel;
    const solde = data.config.soldeInitial + benef;

    const dailyBurn = totalAds / 30 + abosMensuel / 30 + totalFournisseur / 30;
    const runway = dailyBurn > 0 ? solde / dailyBurn : 999;

    const objCaPct =
      data.config.objectifCA > 0 ? Math.min((caWeek / data.config.objectifCA) * 100, 100) : 0;
    const pendingFulfill = orders.filter((o) => o.displayFulfillmentStatus === "UNFULFILLED").length;

    return {
      caToday,
      caWeek,
      caMonth,
      caTotal,
      refundsTotal,
      feesTotal,
      netTotal,
      ordersWithFeeData,
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

  const configNeeded = data!.config.objectifCA === 0 && data!.config.urssaf === 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Dashboard</h1>
          <div style={{ color: "var(--text-dim)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Période <span className="accent">{range.label}</span> · {stats.totalOrders} commandes · {currency}
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
            Va dans <a href="/parametres" style={{ color: "var(--accent)" }}>Paramètres</a> pour définir ton solde initial, taux URSSAF/IR, et objectifs CA.
            Les autres données (commandes, frais, marchés) viennent directement de Shopify.
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="kpi">
          <div className="kpi-label">Solde actuel</div>
          <div className={`kpi-value ${stats.solde > 0 ? "green" : "red"}`}>
            {fmtMoney(stats.solde, currency)}
          </div>
          <div className="kpi-delta">
            Bénéfice: <span className={stats.benef >= 0 ? "green" : "red"}>{fmtMoney(stats.benef, currency)}</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">CA Total</div>
          <div className="kpi-value accent">{fmtMoney(stats.caTotal, currency)}</div>
          <div className="kpi-delta">{stats.totalOrders} commandes</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Net reçu (après frais)</div>
          <div className="kpi-value blue">{fmtMoney(stats.netTotal, currency)}</div>
          <div className="kpi-delta">
            Frais: <span className="red">{fmtMoney(stats.feesTotal, currency)}</span>
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">CA Aujourd&apos;hui</div>
          <div className="kpi-value accent">{fmtMoney(stats.caToday, currency)}</div>
          <div className="kpi-delta">{stats.ordersToday} commande{stats.ordersToday > 1 ? "s" : ""}</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">CA 7 jours</div>
          <div className="kpi-value blue">{fmtMoney(stats.caWeek, currency)}</div>
          <div className="kpi-delta">{stats.ordersWeek} commandes</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">CA 30 jours</div>
          <div className="kpi-value blue">{fmtMoney(stats.caMonth, currency)}</div>
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

      {/* Objectif + Dépenses */}
      {(data!.config.objectifCA > 0 || stats.totalAds > 0 || stats.abosMensuel > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
          {data!.config.objectifCA > 0 && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>Objectif CA / semaine</div>
                <div className="mono" style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                  {fmtMoney(stats.caWeek, currency)} / {fmtMoney(data!.config.objectifCA, currency)}
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

          <div className="card">
            <div style={{ fontSize: "0.9rem", fontWeight: 500, marginBottom: "0.5rem" }}>
              Dépenses (saisies dans Trésorerie)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.85rem" }}>
              <div>
                <div style={{ color: "var(--text-dim)" }}>Ads</div>
                <div className="mono red">{fmtMoney(stats.totalAds, currency)}</div>
              </div>
              <div>
                <div style={{ color: "var(--text-dim)" }}>Fournisseur</div>
                <div className="mono orange">{fmtMoney(stats.totalFournisseur, currency)}</div>
              </div>
              <div>
                <div style={{ color: "var(--text-dim)" }}>Abonnements /mois</div>
                <div className="mono">{fmtMoney(stats.abosMensuel, currency)}</div>
              </div>
              <div>
                <div style={{ color: "var(--text-dim)" }}>Provisions URSSAF+IR</div>
                <div className="mono accent">{fmtMoney(stats.provisions, currency)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                      {new Date(o.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
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
                      {fmtMoney(parseFloat(o.currentTotalPriceSet.shopMoney.amount), currency)}
                    </td>
                    <td className="mono red" style={{ textAlign: "right", fontSize: "0.85rem" }}>
                      {fees > 0 ? `-${fmtMoney(fees, currency)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: "2rem", fontSize: "0.8rem", color: "var(--text-faint)", textAlign: "center" }}>
        EcomOS · Données 100% Shopify en temps réel
      </div>
    </div>
  );
}
