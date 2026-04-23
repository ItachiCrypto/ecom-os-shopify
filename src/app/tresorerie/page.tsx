"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { formatCurrency, formatDate } from "@/lib/format";

interface Entry { id: string; date: string; caBrut: number; nbCommandes: number; adsDepenses: number; fournisseurPaye: number; virementShopify: number; notes: string; }
interface Sub { id: string; name: string; montant: number; cycleJours: number; dateDebut: string; active: boolean; }

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function TresoreriePage() {
  return <Shell><Tresorerie /></Shell>;
}

function Tresorerie() {
  const [data, setData] = useState<{ tresorerie: Entry[]; abonnements: Sub[] } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/data").then(r => r.json()).then(j => setData({ tresorerie: j.data.tresorerie || [], abonnements: j.data.abonnements || [] }));
  }, []);

  useEffect(() => {
    if (!dirty || !data) return;
    const t = setTimeout(() => {
      fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(() => setDirty(false));
    }, 300);
    return () => clearTimeout(t);
  }, [data, dirty]);

  if (!data) return <div>Chargement...</div>;

  const addEntry = () => {
    const today = new Date().toISOString().slice(0, 10);
    setData({ ...data, tresorerie: [{ id: uid(), date: today, caBrut: 0, nbCommandes: 0, adsDepenses: 0, fournisseurPaye: 0, virementShopify: 0, notes: "" }, ...data.tresorerie] });
    setDirty(true);
  };
  const addSub = () => {
    setData({ ...data, abonnements: [...data.abonnements, { id: uid(), name: "Nouveau", montant: 0, cycleJours: 30, dateDebut: new Date().toISOString().slice(0, 10), active: true }] });
    setDirty(true);
  };
  const updEntry = (id: string, patch: Partial<Entry>) => {
    setData({ ...data, tresorerie: data.tresorerie.map(e => e.id === id ? { ...e, ...patch } : e) });
    setDirty(true);
  };
  const updSub = (id: string, patch: Partial<Sub>) => {
    setData({ ...data, abonnements: data.abonnements.map(s => s.id === id ? { ...s, ...patch } : s) });
    setDirty(true);
  };

  const totalMonthly = data.abonnements.filter(a => a.active).reduce((s, a) => s + (a.montant * 30 / a.cycleJours), 0);

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Trésorerie</h1>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>Abonnements — total /mois: <span className="mono accent">{formatCurrency(totalMonthly, "EUR")}</span></div>
          <button className="btn" onClick={addSub}>+ Abonnement</button>
        </div>
        <table className="table">
          <thead><tr><th>Nom</th><th>Montant</th><th>Cycle (jours)</th><th>Date début</th><th>Actif</th><th></th></tr></thead>
          <tbody>
            {data.abonnements.map(s => (
              <tr key={s.id}>
                <td><input className="input" value={s.name} onChange={e => updSub(s.id, { name: e.target.value })} /></td>
                <td><input className="input mono" type="number" step="0.01" value={s.montant} onChange={e => updSub(s.id, { montant: parseFloat(e.target.value) || 0 })} style={{ maxWidth: 100 }} /></td>
                <td><input className="input mono" type="number" value={s.cycleJours} onChange={e => updSub(s.id, { cycleJours: parseInt(e.target.value) || 30 })} style={{ maxWidth: 80 }} /></td>
                <td><input className="input" type="date" value={s.dateDebut} onChange={e => updSub(s.id, { dateDebut: e.target.value })} style={{ maxWidth: 150 }} /></td>
                <td><input type="checkbox" checked={s.active} onChange={e => updSub(s.id, { active: e.target.checked })} /></td>
                <td><button className="btn btn-danger" onClick={() => { setData({ ...data, abonnements: data.abonnements.filter(x => x.id !== s.id) }); setDirty(true); }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>Entrées quotidiennes</div>
          <button className="btn btn-primary" onClick={addEntry}>+ Entrée</button>
        </div>
        <table className="table">
          <thead><tr><th>Date</th><th>CA brut</th><th>Nb cmd</th><th>Ads</th><th>Fournisseur</th><th>Virement Shopify</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {data.tresorerie.map(e => (
              <tr key={e.id}>
                <td><input className="input" type="date" value={e.date} onChange={ev => updEntry(e.id, { date: ev.target.value })} style={{ maxWidth: 140 }} /></td>
                <td><input className="input mono" type="number" step="0.01" value={e.caBrut} onChange={ev => updEntry(e.id, { caBrut: parseFloat(ev.target.value) || 0 })} style={{ maxWidth: 100 }} /></td>
                <td><input className="input mono" type="number" value={e.nbCommandes} onChange={ev => updEntry(e.id, { nbCommandes: parseInt(ev.target.value) || 0 })} style={{ maxWidth: 70 }} /></td>
                <td><input className="input mono" type="number" step="0.01" value={e.adsDepenses} onChange={ev => updEntry(e.id, { adsDepenses: parseFloat(ev.target.value) || 0 })} style={{ maxWidth: 100 }} /></td>
                <td><input className="input mono" type="number" step="0.01" value={e.fournisseurPaye} onChange={ev => updEntry(e.id, { fournisseurPaye: parseFloat(ev.target.value) || 0 })} style={{ maxWidth: 100 }} /></td>
                <td><input className="input mono" type="number" step="0.01" value={e.virementShopify} onChange={ev => updEntry(e.id, { virementShopify: parseFloat(ev.target.value) || 0 })} style={{ maxWidth: 100 }} /></td>
                <td><input className="input" value={e.notes} onChange={ev => updEntry(e.id, { notes: ev.target.value })} /></td>
                <td><button className="btn btn-danger" onClick={() => { setData({ ...data, tresorerie: data.tresorerie.filter(x => x.id !== e.id) }); setDirty(true); }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
