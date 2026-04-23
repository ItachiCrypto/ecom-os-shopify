"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { formatCurrency } from "@/lib/format";

interface Row { id: string; date: string; orderShopify: string; client: string; pays: string; variante: string; quantite: number; cogs: number; tracking: string; refVersement: string; statut: "Paye" | "En attente" | "Livre"; notes: string; }

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function FournisseurPage() { return <Shell><Fournisseur /></Shell>; }

function Fournisseur() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { fetch("/api/data").then(r => r.json()).then(j => setRows(j.data.fournisseur || [])); }, []);
  useEffect(() => {
    if (!dirty || !rows) return;
    const t = setTimeout(() => fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fournisseur: rows }) }).then(() => setDirty(false)), 300);
    return () => clearTimeout(t);
  }, [rows, dirty]);

  if (!rows) return <div>Chargement...</div>;

  const add = () => { setRows([{ id: uid(), date: new Date().toISOString().slice(0, 10), orderShopify: "", client: "", pays: "FR", variante: "", quantite: 1, cogs: 0, tracking: "", refVersement: "", statut: "En attente", notes: "" }, ...rows]); setDirty(true); };
  const upd = (id: string, p: Partial<Row>) => { setRows(rows.map(r => r.id === id ? { ...r, ...p } : r)); setDirty(true); };
  const del = (id: string) => { setRows(rows.filter(r => r.id !== id)); setDirty(true); };

  const totalCogs = rows.reduce((s, r) => s + r.cogs, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div><h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Fournisseur</h1><div style={{ color: "var(--text-dim)", fontSize: "0.875rem" }}>Total COGS: <span className="mono accent">{formatCurrency(totalCogs, "EUR")}</span></div></div>
        <button className="btn btn-primary" onClick={add}>+ Ligne</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Date</th><th>Order</th><th>Client</th><th>Pays</th><th>Variante</th><th>Qté</th><th>COGS</th><th>Tracking</th><th>Réf vers.</th><th>Statut</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><input className="input" type="date" value={r.date} onChange={e => upd(r.id, { date: e.target.value })} style={{ maxWidth: 140 }} /></td>
                  <td><input className="input mono" value={r.orderShopify} onChange={e => upd(r.id, { orderShopify: e.target.value })} style={{ maxWidth: 90 }} /></td>
                  <td><input className="input" value={r.client} onChange={e => upd(r.id, { client: e.target.value })} style={{ maxWidth: 130 }} /></td>
                  <td><input className="input" value={r.pays} onChange={e => upd(r.id, { pays: e.target.value })} style={{ maxWidth: 60 }} /></td>
                  <td><input className="input" value={r.variante} onChange={e => upd(r.id, { variante: e.target.value })} style={{ maxWidth: 110 }} /></td>
                  <td><input className="input mono" type="number" value={r.quantite} onChange={e => upd(r.id, { quantite: parseInt(e.target.value) || 1 })} style={{ maxWidth: 60 }} /></td>
                  <td><input className="input mono" type="number" step="0.01" value={r.cogs} onChange={e => upd(r.id, { cogs: parseFloat(e.target.value) || 0 })} style={{ maxWidth: 90 }} /></td>
                  <td><input className="input mono" value={r.tracking} onChange={e => upd(r.id, { tracking: e.target.value })} style={{ maxWidth: 120 }} /></td>
                  <td><input className="input mono" value={r.refVersement} onChange={e => upd(r.id, { refVersement: e.target.value })} style={{ maxWidth: 100 }} /></td>
                  <td>
                    <select className="select" value={r.statut} onChange={e => upd(r.id, { statut: e.target.value as Row["statut"] })} style={{ maxWidth: 110 }}>
                      <option value="En attente">En attente</option>
                      <option value="Paye">Payé</option>
                      <option value="Livre">Livré</option>
                    </select>
                  </td>
                  <td><input className="input" value={r.notes} onChange={e => upd(r.id, { notes: e.target.value })} /></td>
                  <td><button className="btn btn-danger" onClick={() => del(r.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
