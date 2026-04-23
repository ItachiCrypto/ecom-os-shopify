"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import type { EcomConfig, ProductCost, Bundle } from "@/lib/types";

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

interface ShopifyProduct {
  id: string;
  title: string;
  status: string;
  totalInventory: number;
  variants: {
    edges: {
      node: {
        id: string;
        title: string;
        sku: string | null;
        price: string;
        inventoryQuantity: number;
        inventoryItem?: { unitCost: { amount: string; currencyCode: string } | null } | null;
      };
    }[];
  };
}

export default function ParametresPage() { return <Shell><Parametres /></Shell>; }

function Parametres() {
  const [config, setConfig] = useState<EcomConfig | null>(null);
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [markets, setMarkets] = useState<ShopifyMarket[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/data").then(r => r.json()),
      fetch("/api/shop").then(r => r.json()),
      fetch("/api/products").then(r => r.ok ? r.json() : { products: [] }),
    ]).then(([d, s, p]) => {
      setConfig(d.data.config);
      if (s.shop) setShopInfo(s.shop);
      if (s.markets) setMarkets(s.markets);
      if (p.products) setProducts(p.products);
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

      <div className="card" style={{ marginBottom: "1rem", borderColor: "var(--accent-dim)" }}>
        <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.25rem" }}>
          📅 Période de la boutique
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
          Indique la date à partir de laquelle tu comptes le début de ta boutique (ou d&apos;une nouvelle phase).
          Tous les calculs (solde, CA, profit) se feront à partir de cette date quand tu sélectionnes <b>&quot;Depuis début boutique&quot;</b> dans le filtre en haut.
          Pratique pour isoler des périodes — par ex. un produit lancé en décembre vs un autre en avril.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <input
            className="input"
            type="date"
            value={config.shopStartDate || ""}
            onChange={e => set({ shopStartDate: e.target.value || undefined })}
            style={{ maxWidth: 200 }}
          />
          {config.shopStartDate && (
            <button className="btn" onClick={() => set({ shopStartDate: undefined })}>
              ✕ Effacer
            </button>
          )}
          <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
            {config.shopStartDate
              ? `Début: ${new Date(config.shopStartDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`
              : "Aucune date définie — utilise les presets classiques"}
          </span>
        </div>
      </div>

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
          <Row label="TVA sur dépenses pub (%)" value={config.taxOnAdSpend ?? 5} onChange={v => set({ taxOnAdSpend: v })} />
        </div>

        <ProductCostsSection
          config={config}
          products={products}
          currency={shopInfo?.currencyCode || "USD"}
          onChange={(productCosts) => set({ productCosts })}
        />

        <BundlesSection
          config={config}
          products={products}
          onChange={(bundles) => set({ bundles })}
        />

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

function ProductCostsSection({
  config,
  products,
  onChange,
}: {
  config: EcomConfig;
  products: ShopifyProduct[];
  currency: string; // kept in signature for callers, not used
  onChange: (pc: Record<string, ProductCost>) => void;
}) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const costs = config.productCosts || {};

  const updateVariant = (variantId: string, patch: Partial<ProductCost>) => {
    const next = { ...costs, [variantId]: { ...costs[variantId], ...patch } as ProductCost };
    onChange(next);
  };

  const flattened = products.flatMap((p) =>
    p.variants.edges.map((e) => ({
      variantId: e.node.id,
      variantTitle: e.node.title,
      sku: e.node.sku,
      price: parseFloat(e.node.price),
      productTitle: p.title,
      productStatus: p.status,
    }))
  );

  const filtered = flattened.filter((v) => {
    if (!showInactive && v.productStatus !== "ACTIVE") return false;
    if (search) {
      const s = search.toLowerCase();
      return (v.productTitle + " " + v.variantTitle + " " + (v.sku || "")).toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div style={{ marginBottom: "0.5rem" }}>
        <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>💰 Coûts produits (COGS)</div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.25rem", lineHeight: 1.5 }}>
          Saisis juste combien te coûte chaque produit. Le CA des commandes vient automatiquement de Shopify —
          on calcule ensuite la marge réelle en soustrayant tes COGS.
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", marginTop: "0.75rem" }}>
        <input
          className="input"
          placeholder="Rechercher un produit ou variante..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Afficher produits inactifs
        </label>
      </div>

      {flattened.length === 0 ? (
        <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-faint)", fontSize: "0.85rem" }}>
          Chargement des produits Shopify...
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Produit / Variante</th>
                <th>SKU</th>
                <th style={{ textAlign: "right" }}>Coût unitaire (COGS)</th>
                <th style={{ textAlign: "center" }}>Inclure</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const existing = costs[v.variantId];
                const cogsValue = existing?.cogs ?? 0;
                const active = existing?.active ?? true;
                return (
                  <tr key={v.variantId}>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{v.productTitle}</div>
                      {v.variantTitle !== "Default Title" && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{v.variantTitle}</div>
                      )}
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-dim)" }} className="mono">{v.sku || "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <input
                        className="input mono"
                        type="number"
                        step="0.01"
                        value={cogsValue}
                        onChange={(e) => updateVariant(v.variantId, {
                          productTitle: v.productTitle,
                          variantTitle: v.variantTitle,
                          price: v.price,
                          cogs: parseFloat(e.target.value) || 0,
                          active,
                        })}
                        style={{ maxWidth: 110, textAlign: "right", marginLeft: "auto" }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => updateVariant(v.variantId, {
                          productTitle: v.productTitle,
                          variantTitle: v.variantTitle,
                          price: v.price,
                          cogs: cogsValue,
                          active: e.target.checked,
                        })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function uid() { return Math.random().toString(36).slice(2, 10); }

function BundlesSection({
  config,
  products,
  onChange,
}: {
  config: EcomConfig;
  products: ShopifyProduct[];
  onChange: (bundles: Bundle[]) => void;
}) {
  const bundles = config.bundles || [];
  const productCosts = config.productCosts || {};

  // Flatten variants for dropdowns
  const variants = products.flatMap((p) =>
    p.variants.edges.map((e) => ({
      variantId: e.node.id,
      label: `${p.title}${e.node.title !== "Default Title" ? ` — ${e.node.title}` : ""}${e.node.sku ? ` (${e.node.sku})` : ""}`,
    }))
  );

  const addBundle = () => {
    onChange([
      ...bundles,
      { id: uid(), name: "Nouveau bundle", triggerVariantIds: [], items: [], active: true },
    ]);
  };

  const updateBundle = (id: string, patch: Partial<Bundle>) => {
    onChange(bundles.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBundle = (id: string) => {
    onChange(bundles.filter((b) => b.id !== id));
  };

  const bundleCogs = (b: Bundle): number => {
    return b.items.reduce((s, it) => {
      const pc = productCosts[it.variantId];
      return s + (pc?.cogs || 0) * it.quantity;
    }, 0);
  };

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.5rem", gap: "1rem" }}>
        <div>
          <div style={{ fontSize: "1.05rem", fontWeight: 600 }}>🎁 Bundles / Produits offerts</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.25rem", lineHeight: 1.5 }}>
            Définis des bundles pour tracker les produits offerts avec une vente.
            Ex: &quot;Chaque ring vendu = 1 lubrifiant offert&quot; → le COGS du lubrifiant est automatiquement ajouté
            au jour où un ring est vendu (même s&apos;il est à 0$ dans Shopify).
          </div>
        </div>
        <button className="btn btn-primary" onClick={addBundle}>+ Bundle</button>
      </div>

      {bundles.length === 0 ? (
        <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-faint)", fontSize: "0.85rem" }}>
          Aucun bundle configuré.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {bundles.map((b) => (
            <div key={b.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem", background: "var(--bg-elevated)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr auto auto auto", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
                <input
                  className="input"
                  placeholder="Nom du bundle"
                  value={b.name}
                  onChange={(e) => updateBundle(b.id, { name: e.target.value })}
                  style={{ fontWeight: 500 }}
                />
                <div className="pill pill-blue" style={{ whiteSpace: "nowrap" }}>
                  COGS bundle: {bundleCogs(b).toFixed(2)}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>
                  <input
                    type="checkbox"
                    checked={b.active}
                    onChange={(e) => updateBundle(b.id, { active: e.target.checked })}
                  />
                  Actif
                </label>
                <button className="btn btn-danger" onClick={() => removeBundle(b.id)}>✕</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    🎯 Déclenché quand ces variantes sont vendues
                  </div>
                  <div style={{ maxHeight: 180, overflowY: "auto", padding: "0.35rem", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
                    {variants.map((v) => (
                      <label key={v.variantId} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", padding: "0.2rem 0.1rem" }}>
                        <input
                          type="checkbox"
                          checked={b.triggerVariantIds.includes(v.variantId)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...b.triggerVariantIds, v.variantId]
                              : b.triggerVariantIds.filter((x) => x !== v.variantId);
                            updateBundle(b.id, { triggerVariantIds: next });
                          }}
                        />
                        <span>{v.label}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", marginTop: "0.25rem" }}>
                    {b.triggerVariantIds.length} sélectionné(s)
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      🎁 Produits offerts (par unité vendue)
                    </div>
                    <button
                      className="btn"
                      style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                      onClick={() =>
                        updateBundle(b.id, {
                          items: [...b.items, { variantId: variants[0]?.variantId || "", quantity: 1 }],
                        })
                      }
                    >
                      + Item
                    </button>
                  </div>
                  {b.items.length === 0 ? (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", padding: "0.5rem", textAlign: "center" }}>
                      Aucun produit offert
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      {b.items.map((it, idx) => {
                        const pc = productCosts[it.variantId];
                        const cogs = pc?.cogs || 0;
                        return (
                          <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 60px 90px auto", gap: "0.35rem", alignItems: "center" }}>
                            <select
                              className="select"
                              value={it.variantId}
                              onChange={(e) => {
                                const next = [...b.items];
                                next[idx] = { ...it, variantId: e.target.value };
                                updateBundle(b.id, { items: next });
                              }}
                              style={{ fontSize: "0.8rem" }}
                            >
                              <option value="">— Choisir —</option>
                              {variants.map((v) => (
                                <option key={v.variantId} value={v.variantId}>{v.label}</option>
                              ))}
                            </select>
                            <input
                              className="input mono"
                              type="number"
                              min={1}
                              step={1}
                              value={it.quantity}
                              onChange={(e) => {
                                const next = [...b.items];
                                next[idx] = { ...it, quantity: parseInt(e.target.value) || 1 };
                                updateBundle(b.id, { items: next });
                              }}
                              style={{ fontSize: "0.8rem" }}
                            />
                            <div className="mono" style={{ fontSize: "0.75rem", color: "var(--text-dim)", textAlign: "right" }}>
                              {cogs > 0 ? `${(cogs * it.quantity).toFixed(2)}€` : "—"}
                            </div>
                            <button
                              className="btn btn-danger"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                              onClick={() => updateBundle(b.id, { items: b.items.filter((_, i) => i !== idx) })}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
