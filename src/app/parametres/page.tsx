"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import type { EcomConfig } from "@/lib/types";

export default function ParametresPage() { return <Shell><Parametres /></Shell>; }

function Parametres() {
  const [config, setConfig] = useState<EcomConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetch("/api/data").then(r => r.json()).then(j => setConfig(j.data.config)); }, []);
  useEffect(() => {
    if (!dirty || !config) return;
    const t = setTimeout(async () => {
      await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }) });
      setDirty(false); setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 300);
    return () => clearTimeout(t);
  }, [config, dirty]);

  if (!config) return <div>Chargement...</div>;
  const set = (p: Partial<EcomConfig>) => { setConfig({ ...config, ...p }); setDirty(true); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Paramètres</h1>
        {saved && <div className="pill pill-green">Sauvegardé</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="card">
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.75rem" }}>Micro-entreprise</div>
          <Row label="URSSAF %" value={config.urssaf} onChange={v => set({ urssaf: v })} />
          <Row label="IR %" value={config.ir} onChange={v => set({ ir: v })} />
          <Row label="TVA %" value={config.tva} onChange={v => set({ tva: v })} />
          <Row label="Solde initial €" value={config.soldeInitial} onChange={v => set({ soldeInitial: v })} />
        </div>

        <div className="card">
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.75rem" }}>Objectifs & alertes</div>
          <Row label="Objectif CA /sem" value={config.objectifCA} onChange={v => set({ objectifCA: v })} />
          <Row label="Objectif profit /sem" value={config.objectifProfit} onChange={v => set({ objectifProfit: v })} />
          <Row label="Alerte runway (jours)" value={config.alerteRunway} onChange={v => set({ alerteRunway: v })} step={1} />
        </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.75rem" }}>Marchés · Seuil alerte livraison (jours)</div>
          <table className="table">
            <thead><tr><th>Pays</th><th>Code</th><th>Seuil alerte (j)</th></tr></thead>
            <tbody>
              {config.markets.map(m => (
                <tr key={m.id}>
                  <td>{m.flag} {m.name}</td>
                  <td className="mono">{m.id}</td>
                  <td>
                    <input className="input mono" type="number" value={config.alerteLivraison[m.id] || 15}
                      onChange={e => set({ alerteLivraison: { ...config.alerteLivraison, [m.id]: parseInt(e.target.value) || 15 } })}
                      style={{ maxWidth: 100 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.75rem" }}>Frais par moyen de paiement × pays</div>
          <table className="table">
            <thead>
              <tr>
                <th>Méthode</th>
                {config.markets.map(m => <th key={m.id} style={{ textAlign: "center" }}>{m.flag} {m.id}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.keys(config.fraisParMethode).map(method => (
                <tr key={method}>
                  <td style={{ fontWeight: 500 }}>{method}</td>
                  {config.markets.map(m => {
                    const f = config.fraisParMethode[method]?.[m.id] || { pct: 0, fixe: 0 };
                    return (
                      <td key={m.id}>
                        <div style={{ display: "flex", gap: "0.25rem" }}>
                          <input className="input mono" type="number" step="0.1" value={f.pct}
                            onChange={e => set({
                              fraisParMethode: {
                                ...config.fraisParMethode,
                                [method]: { ...config.fraisParMethode[method], [m.id]: { ...f, pct: parseFloat(e.target.value) || 0 } },
                              }
                            })}
                            style={{ width: 60, fontSize: "0.8rem" }} />
                          <input className="input mono" type="number" step="0.01" value={f.fixe}
                            onChange={e => set({
                              fraisParMethode: {
                                ...config.fraisParMethode,
                                [method]: { ...config.fraisParMethode[method], [m.id]: { ...f, fixe: parseFloat(e.target.value) || 0 } },
                              }
                            })}
                            style={{ width: 60, fontSize: "0.8rem" }} />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", marginTop: "0.5rem" }}>Gauche: % — Droite: frais fixe €</div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, onChange, step = 0.01 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>{label}</span>
      <input className="input mono" type="number" step={step} value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} style={{ maxWidth: 120 }} />
    </div>
  );
}
