"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import type { EcomConfig } from "@/lib/types";

interface ShopifyMarket {
  id: string;
  name: string;
  handle: string;
  enabled: boolean;
  primary: boolean;
  regions: { edges: { node: { id: string; name: string; code: string; currency: { currencyCode: string } } }[] };
}

interface ShopInfo {
  name: string;
  myshopifyDomain: string;
  currencyCode: string;
  billingAddress: { countryCodeV2: string; country: string } | null;
  plan: { displayName: string };
}

export default function ParametresPage() { return <Shell><Parametres /></Shell>; }

function Parametres() {
  const [config, setConfig] = useState<EcomConfig | null>(null);
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [markets, setMarkets] = useState<ShopifyMarket[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/data").then(r => r.json()), fetch("/api/shop").then(r => r.json())])
      .then(([d, s]) => {
        setConfig(d.data.config);
        if (s.shop) setShopInfo(s.shop);
        if (s.markets) setMarkets(s.markets);
      });
  }, []);

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

  // Pays tirés des marchés Shopify (tous régions actives)
  const countries = markets.flatMap(m => m.regions.edges.map(e => e.node)).filter((c, i, arr) => arr.findIndex(x => x.code === c.code) === i);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Paramètres</h1>
          {shopInfo && (
            <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
              {shopInfo.name} · {shopInfo.currencyCode} · Plan {shopInfo.plan.displayName}
            </div>
          )}
        </div>
        {saved && <div className="pill pill-green">Sauvegardé</div>}
      </div>

      {/* Infos Shopify en lecture seule */}
      {shopInfo && (
        <div className="card" style={{ marginBottom: "1rem", background: "rgba(96, 165, 250, 0.05)", borderColor: "var(--blue)" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--blue)" }}>
            🔗 Données Shopify (auto)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", fontSize: "0.85rem" }}>
            <div><div style={{ color: "var(--text-dim)" }}>Boutique</div><div style={{ fontWeight: 500 }}>{shopInfo.name}</div></div>
            <div><div style={{ color: "var(--text-dim)" }}>Domaine</div><div className="mono">{shopInfo.myshopifyDomain}</div></div>
            <div><div style={{ color: "var(--text-dim)" }}>Currency</div><div className="mono accent">{shopInfo.currencyCode}</div></div>
            <div><div style={{ color: "var(--text-dim)" }}>Plan</div><div>{shopInfo.plan.displayName}</div></div>
            {shopInfo.billingAddress && (
              <div><div style={{ color: "var(--text-dim)" }}>Pays facturation</div><div>{shopInfo.billingAddress.country} ({shopInfo.billingAddress.countryCodeV2})</div></div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="card">
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.25rem" }}>Fiscalité (France)</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
            Édite si tu es en micro-entreprise FR ou autre régime
          </div>
          <Row label="URSSAF %" value={config.urssaf} onChange={v => set({ urssaf: v })} />
          <Row label="IR %" value={config.ir} onChange={v => set({ ir: v })} />
          <Row label="TVA %" value={config.tva} onChange={v => set({ tva: v })} />
          <Row label="Solde initial" value={config.soldeInitial} onChange={v => set({ soldeInitial: v })} />
        </div>

        <div className="card">
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.25rem" }}>Objectifs & alertes</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
            Pour afficher les barres de progression sur le dashboard
          </div>
          <Row label={`Objectif CA /semaine (${shopInfo?.currencyCode || "USD"})`} value={config.objectifCA} onChange={v => set({ objectifCA: v })} />
          <Row label={`Objectif profit /semaine`} value={config.objectifProfit} onChange={v => set({ objectifProfit: v })} />
          <Row label="Alerte runway (jours)" value={config.alerteRunway} onChange={v => set({ alerteRunway: v })} step={1} />
        </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.25rem" }}>
            🌍 Marchés Shopify ({markets.length})
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
            Liste synchronisée depuis Shopify Markets — non éditable ici
          </div>
          {markets.length === 0 ? (
            <div style={{ padding: "1rem", color: "var(--text-faint)", fontSize: "0.85rem", textAlign: "center" }}>
              Aucun marché chargé. (Shopify Markets nécessite le scope <span className="mono">read_markets</span>)
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Marché</th>
                  <th>Statut</th>
                  <th>Pays</th>
                  <th>Devises</th>
                </tr>
              </thead>
              <tbody>
                {markets.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.name} {m.primary && <span className="pill pill-blue" style={{ marginLeft: "0.5rem" }}>Primary</span>}</td>
                    <td>
                      <span className={`pill ${m.enabled ? "pill-green" : "pill-gray"}`}>
                        {m.enabled ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {m.regions.edges.map(e => e.node.code).join(", ") || "—"}
                    </td>
                    <td className="mono" style={{ fontSize: "0.85rem" }}>
                      {Array.from(new Set(m.regions.edges.map(e => e.node.currency.currencyCode))).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {countries.length > 0 && (
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.25rem" }}>Seuils alerte livraison (jours)</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
              Pays tirés automatiquement de tes Shopify Markets
            </div>
            <table className="table">
              <thead><tr><th>Pays</th><th>Code</th><th>Seuil alerte (j)</th></tr></thead>
              <tbody>
                {countries.map(c => (
                  <tr key={c.code}>
                    <td>{c.name}</td>
                    <td className="mono">{c.code}</td>
                    <td>
                      <input
                        className="input mono"
                        type="number"
                        value={config.alerteLivraison[c.code] ?? 20}
                        onChange={e => set({ alerteLivraison: { ...config.alerteLivraison, [c.code]: parseInt(e.target.value) || 20 } })}
                        style={{ maxWidth: 100 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.25rem" }}>
            💳 Frais de paiement
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
            Les frais réels viennent <b style={{ color: "var(--green)" }}>directement des transactions Shopify</b> (pour Shopify Payments).
            Plus besoin de configurer les % par méthode — tout est lu depuis l&apos;API.
            Pour PayPal/Bancontact, les frais peuvent ne pas être disponibles si le gateway ne les expose pas à Shopify.
          </div>
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
