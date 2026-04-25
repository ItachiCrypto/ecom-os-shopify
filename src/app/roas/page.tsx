"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatPct } from "@/lib/format";
import { cachedJson, clearClientApiCache } from "@/lib/client-api-cache";

interface Scenario {
  id: string;
  name: string;
  productName: string;
  prixVente: number;
  margeMinimum: number;
  margeCible: number;
  cogsByMarket: Record<string, number>;
  createdAt: string;
}

interface EcomConfig {
  shopifyPct: number;
  shopifyFixe: number;
  urssaf: number;
  ir: number;
  markets: { id: string; name: string; flag: string }[];
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// Formula (méthode Zezinho)
function roasBE(prix: number, urssaf: number, shopifyPct: number, ir: number, cogs: number, fixe: number): number {
  const denom = (prix / (1 + urssaf / 100)) * (1 - shopifyPct / 100 - ir / 100) - cogs - fixe;
  if (denom <= 0) return Infinity;
  return prix / denom;
}
function roasTarget(prix: number, urssaf: number, shopifyPct: number, ir: number, margeCible: number, cogs: number, fixe: number): number {
  const denom = (prix / (1 + urssaf / 100)) * (1 - shopifyPct / 100 - ir / 100 - margeCible / 100) - cogs - fixe;
  if (denom <= 0) return Infinity;
  return prix / denom;
}
function margeNette(prix: number, urssaf: number, shopifyPct: number, ir: number, cogs: number, fixe: number): number {
  return (prix / (1 + urssaf / 100)) * (1 - shopifyPct / 100 - ir / 100) - cogs - fixe;
}

export default function ROASPage() {
  return <ROAS />;
}

function ROAS() {
  const [config, setConfig] = useState<EcomConfig | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [currency] = useState("EUR");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    cachedJson<{ data: { config: EcomConfig; scenarios?: Scenario[] } }>("/api/data").then(j => {
      setConfig(j.data.config);
      setScenarios(j.data.scenarios || []);
    });
  }, []);

  useEffect(() => {
    if (!dirty || !config) return;
    const timer = setTimeout(() => {
      fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config, scenarios }) })
        .then(() => {
          clearClientApiCache("/api/data");
          setDirty(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [scenarios, config, dirty]);

  const update = (updater: (s: Scenario[]) => Scenario[]) => {
    setScenarios(updater);
    setDirty(true);
  };

  const addScenario = () => {
    const markets = config?.markets || [];
    const cogsByMarket: Record<string, number> = {};
    markets.forEach(m => (cogsByMarket[m.id] = 0));
    update(s => [...s, {
      id: uid(),
      name: "Nouveau scénario",
      productName: "Produit",
      prixVente: 50,
      margeMinimum: 20,
      margeCible: 30,
      cogsByMarket,
      createdAt: new Date().toISOString(),
    }]);
  };

  if (!config) return <div>Chargement...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>ROAS Calculator</h1>
          <div style={{ color: "var(--text-dim)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Méthode Zezinho · Calcul par marché
          </div>
        </div>
        <button className="btn btn-primary" onClick={addScenario}>+ Produit</button>
      </div>

      {/* Params bar */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "0.9rem", fontWeight: 500, marginBottom: "0.75rem" }}>Paramètres</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
          <div>
            <label style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Shopify %</label>
            <input className="input mono" type="number" step="0.01" value={config.shopifyPct}
              onChange={(e) => { setConfig({ ...config, shopifyPct: parseFloat(e.target.value) || 0 }); setDirty(true); }} />
          </div>
          <div>
            <label style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Frais fixe €</label>
            <input className="input mono" type="number" step="0.01" value={config.shopifyFixe}
              onChange={(e) => { setConfig({ ...config, shopifyFixe: parseFloat(e.target.value) || 0 }); setDirty(true); }} />
          </div>
          <div>
            <label style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>URSSAF %</label>
            <input className="input mono" type="number" step="0.01" value={config.urssaf}
              onChange={(e) => { setConfig({ ...config, urssaf: parseFloat(e.target.value) || 0 }); setDirty(true); }} />
          </div>
          <div>
            <label style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>IR %</label>
            <input className="input mono" type="number" step="0.01" value={config.ir}
              onChange={(e) => { setConfig({ ...config, ir: parseFloat(e.target.value) || 0 }); setDirty(true); }} />
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <div className="pill pill-gray">{config.markets.length} marchés</div>
          </div>
        </div>
      </div>

      {scenarios.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-dim)" }}>
          Aucun scénario. Ajoute un produit pour démarrer.
        </div>
      )}

      {scenarios.map((s) => (
        <div key={s.id} className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "1rem", gap: "1rem" }}>
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
              <input className="input" placeholder="Nom du produit" value={s.productName}
                onChange={(e) => update(arr => arr.map(x => x.id === s.id ? { ...x, productName: e.target.value } : x))} />
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Prix de vente</label>
                <input className="input mono" type="number" step="0.01" value={s.prixVente}
                  onChange={(e) => update(arr => arr.map(x => x.id === s.id ? { ...x, prixVente: parseFloat(e.target.value) || 0 } : x))} />
              </div>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Marge min %</label>
                <input className="input mono" type="number" step="0.1" value={s.margeMinimum}
                  onChange={(e) => update(arr => arr.map(x => x.id === s.id ? { ...x, margeMinimum: parseFloat(e.target.value) || 0 } : x))} />
              </div>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Marge cible %</label>
                <input className="input mono" type="number" step="0.1" value={s.margeCible}
                  onChange={(e) => update(arr => arr.map(x => x.id === s.id ? { ...x, margeCible: parseFloat(e.target.value) || 0 } : x))} />
              </div>
            </div>
            <button className="btn btn-danger" onClick={() => update(arr => arr.filter(x => x.id !== s.id))}>✕</button>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Marché</th>
                <th style={{ textAlign: "right" }}>COGS</th>
                <th style={{ textAlign: "right" }}>ROAS BE</th>
                <th style={{ textAlign: "right" }}>ROAS Cible</th>
                <th style={{ textAlign: "right" }}>Marge nette €</th>
                <th style={{ textAlign: "right" }}>Marge nette %</th>
              </tr>
            </thead>
            <tbody>
              {config.markets.map(m => {
                const cogs = s.cogsByMarket[m.id] || 0;
                const be = roasBE(s.prixVente, config.urssaf, config.shopifyPct, config.ir, cogs, config.shopifyFixe);
                const target = roasTarget(s.prixVente, config.urssaf, config.shopifyPct, config.ir, s.margeCible, cogs, config.shopifyFixe);
                const marge = margeNette(s.prixVente, config.urssaf, config.shopifyPct, config.ir, cogs, config.shopifyFixe);
                const margePct = s.prixVente > 0 ? (marge / s.prixVente) * 100 : 0;
                return (
                  <tr key={m.id}>
                    <td>{m.flag} {m.name}</td>
                    <td style={{ textAlign: "right" }}>
                      <input className="input mono" type="number" step="0.01" value={cogs}
                        style={{ maxWidth: 100, marginLeft: "auto", textAlign: "right" }}
                        onChange={(e) => update(arr => arr.map(x => x.id === s.id ? { ...x, cogsByMarket: { ...x.cogsByMarket, [m.id]: parseFloat(e.target.value) || 0 } } : x))} />
                    </td>
                    <td className="mono accent" style={{ textAlign: "right" }}>{be > 99 ? "∞" : be.toFixed(2)}</td>
                    <td className="mono blue" style={{ textAlign: "right" }}>{target > 99 ? "∞" : target.toFixed(2)}</td>
                    <td className={`mono ${marge > 0 ? "green" : "red"}`} style={{ textAlign: "right" }}>
                      {formatCurrency(marge, currency)}
                    </td>
                    <td className={`mono ${margePct > s.margeMinimum ? "green" : "red"}`} style={{ textAlign: "right" }}>
                      {formatPct(margePct)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
