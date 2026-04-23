"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { formatCurrency, formatPct } from "@/lib/format";

interface TestingDay {
  id: string;
  day: string;
  totalOrders: number;
  fbAdsCosts: number;
  cogs: number;
  totalSales: number;
  cpm: number;
  ctr: number;
  cpc: number;
  visitors: number;
  atc: number;
  paymentInitiated: number;
  sales: number;
}
interface Testing {
  id: string;
  name: string;
  createdAt: string;
  days: TestingDay[];
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function TestingsPage() {
  return <Shell><Testings /></Shell>;
}

function Testings() {
  const [testings, setTestings] = useState<Testing[] | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/data").then(r => r.json()).then(j => setTestings(j.data.testings || []));
  }, []);

  useEffect(() => {
    if (!dirty || !testings) return;
    const t = setTimeout(() => {
      fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ testings }) }).then(() => setDirty(false));
    }, 300);
    return () => clearTimeout(t);
  }, [testings, dirty]);

  const update = (u: (t: Testing[]) => Testing[]) => {
    setTestings(prev => prev ? u(prev) : prev);
    setDirty(true);
  };

  if (!testings) return <div>Chargement...</div>;

  const addTesting = () => update(arr => [...arr, { id: uid(), name: "Nouveau test", createdAt: new Date().toISOString(), days: [] }]);
  const addDay = (tid: string) => update(arr => arr.map(t => t.id === tid ? {
    ...t,
    days: [...t.days, { id: uid(), day: `J${t.days.length + 1}`, totalOrders: 0, fbAdsCosts: 0, cogs: 0, totalSales: 0, cpm: 0, ctr: 0, cpc: 0, visitors: 0, atc: 0, paymentInitiated: 0, sales: 0 }]
  } : t));

  const updateDay = (tid: string, did: string, patch: Partial<TestingDay>) =>
    update(arr => arr.map(t => t.id === tid ? { ...t, days: t.days.map(d => d.id === did ? { ...d, ...patch } : d) } : t));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Testings</h1>
          <div style={{ color: "var(--text-dim)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Tests d&apos;ads et performance par jour
          </div>
        </div>
        <button className="btn btn-primary" onClick={addTesting}>+ Nouveau test</button>
      </div>

      {testings.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-dim)" }}>
          Aucun test. Crée un nouveau test pour commencer.
        </div>
      )}

      {testings.map(t => {
        const totalCa = t.days.reduce((s, d) => s + d.totalSales, 0);
        const totalAds = t.days.reduce((s, d) => s + d.fbAdsCosts, 0);
        const totalCogs = t.days.reduce((s, d) => s + d.cogs, 0);
        const profit = totalCa - totalAds - totalCogs;
        const roas = totalAds > 0 ? totalCa / totalAds : 0;
        return (
          <div key={t.id} className="card" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <input className="input" value={t.name} style={{ maxWidth: 300, fontSize: "1.05rem", fontWeight: 500 }}
                onChange={e => update(arr => arr.map(x => x.id === t.id ? { ...x, name: e.target.value } : x))} />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn" onClick={() => addDay(t.id)}>+ Jour</button>
                <button className="btn btn-danger" onClick={() => update(arr => arr.filter(x => x.id !== t.id))}>✕</button>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ padding: "0.75rem", background: "var(--bg-elevated)", borderRadius: 6 }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>CA total</div>
                <div className="mono accent" style={{ fontSize: "1.1rem", fontWeight: 600 }}>{formatCurrency(totalCa, "EUR")}</div>
              </div>
              <div style={{ padding: "0.75rem", background: "var(--bg-elevated)", borderRadius: 6 }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Ads</div>
                <div className="mono red" style={{ fontSize: "1.1rem", fontWeight: 600 }}>{formatCurrency(totalAds, "EUR")}</div>
              </div>
              <div style={{ padding: "0.75rem", background: "var(--bg-elevated)", borderRadius: 6 }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Profit</div>
                <div className={`mono ${profit >= 0 ? "green" : "red"}`} style={{ fontSize: "1.1rem", fontWeight: 600 }}>{formatCurrency(profit, "EUR")}</div>
              </div>
              <div style={{ padding: "0.75rem", background: "var(--bg-elevated)", borderRadius: 6 }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>ROAS</div>
                <div className={`mono ${roas > 1.5 ? "green" : roas > 1 ? "orange" : "red"}`} style={{ fontSize: "1.1rem", fontWeight: 600 }}>{roas.toFixed(2)}</div>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Jour</th>
                    <th>Orders</th>
                    <th>Ads €</th>
                    <th>COGS</th>
                    <th>CA €</th>
                    <th>CPM</th>
                    <th>CTR%</th>
                    <th>CPC</th>
                    <th>Visits</th>
                    <th>ATC</th>
                    <th>Init</th>
                    <th>Sales</th>
                    <th>ROAS</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {t.days.map(d => {
                    const roasD = d.fbAdsCosts > 0 ? d.totalSales / d.fbAdsCosts : 0;
                    const profitD = d.totalSales - d.fbAdsCosts - d.cogs;
                    return (
                      <tr key={d.id}>
                        <td><input className="input mono" style={{ maxWidth: 70 }} value={d.day} onChange={e => updateDay(t.id, d.id, { day: e.target.value })} /></td>
                        <td><input className="input mono" style={{ maxWidth: 70 }} type="number" value={d.totalOrders} onChange={e => updateDay(t.id, d.id, { totalOrders: parseFloat(e.target.value) || 0 })} /></td>
                        <td><input className="input mono" style={{ maxWidth: 80 }} type="number" step="0.01" value={d.fbAdsCosts} onChange={e => updateDay(t.id, d.id, { fbAdsCosts: parseFloat(e.target.value) || 0 })} /></td>
                        <td><input className="input mono" style={{ maxWidth: 80 }} type="number" step="0.01" value={d.cogs} onChange={e => updateDay(t.id, d.id, { cogs: parseFloat(e.target.value) || 0 })} /></td>
                        <td><input className="input mono" style={{ maxWidth: 80 }} type="number" step="0.01" value={d.totalSales} onChange={e => updateDay(t.id, d.id, { totalSales: parseFloat(e.target.value) || 0 })} /></td>
                        <td><input className="input mono" style={{ maxWidth: 70 }} type="number" step="0.01" value={d.cpm} onChange={e => updateDay(t.id, d.id, { cpm: parseFloat(e.target.value) || 0 })} /></td>
                        <td><input className="input mono" style={{ maxWidth: 60 }} type="number" step="0.01" value={d.ctr} onChange={e => updateDay(t.id, d.id, { ctr: parseFloat(e.target.value) || 0 })} /></td>
                        <td><input className="input mono" style={{ maxWidth: 60 }} type="number" step="0.01" value={d.cpc} onChange={e => updateDay(t.id, d.id, { cpc: parseFloat(e.target.value) || 0 })} /></td>
                        <td><input className="input mono" style={{ maxWidth: 70 }} type="number" value={d.visitors} onChange={e => updateDay(t.id, d.id, { visitors: parseFloat(e.target.value) || 0 })} /></td>
                        <td><input className="input mono" style={{ maxWidth: 60 }} type="number" value={d.atc} onChange={e => updateDay(t.id, d.id, { atc: parseFloat(e.target.value) || 0 })} /></td>
                        <td><input className="input mono" style={{ maxWidth: 60 }} type="number" value={d.paymentInitiated} onChange={e => updateDay(t.id, d.id, { paymentInitiated: parseFloat(e.target.value) || 0 })} /></td>
                        <td><input className="input mono" style={{ maxWidth: 60 }} type="number" value={d.sales} onChange={e => updateDay(t.id, d.id, { sales: parseFloat(e.target.value) || 0 })} /></td>
                        <td className={`mono ${roasD > 1.5 ? "green" : roasD > 1 ? "orange" : "red"}`}>{roasD.toFixed(2)}</td>
                        <td className={`mono ${profitD >= 0 ? "green" : "red"}`}>{formatCurrency(profitD, "EUR")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
