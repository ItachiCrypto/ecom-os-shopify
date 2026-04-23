"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/commandes", label: "Commandes", icon: "📦" },
  { href: "/roas", label: "ROAS Calculator", icon: "🎯" },
  { href: "/testings", label: "Testings", icon: "🧪" },
  { href: "/tresorerie", label: "Trésorerie", icon: "💰" },
  { href: "/fournisseur", label: "Fournisseur", icon: "🚚" },
  { href: "/analytics", label: "Analytics", icon: "📈" },
  { href: "/journal", label: "Journal", icon: "📝" },
  { href: "/parametres", label: "Paramètres", icon: "⚙️" },
];

interface ShopInfo {
  name: string;
  myshopifyDomain: string;
  currencyCode: string;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shop")
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) {
          setConnected(false);
          return;
        }
        const data = await r.json();
        if (cancelled) return;
        if (data.shop) {
          setShop(data.shop);
          setConnected(true);
        } else {
          setConnected(false);
        }
      })
      .catch(() => !cancelled && setConnected(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (connected === false) {
    return <ConnectScreen />;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 240,
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
          padding: "1.25rem 0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "0 0.75rem 1rem", borderBottom: "1px solid var(--border)", marginBottom: "0.75rem" }}>
          <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: "1.15rem" }}>EcomOS</div>
          {shop ? (
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>
              {shop.name}
            </div>
          ) : connected === null ? (
            <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", marginTop: "0.25rem" }}>
              Chargement...
            </div>
          ) : null}
        </div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${pathname === item.href ? "active" : ""}`}
          >
            <span className="icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
        <div style={{ flex: 1 }} />
        {shop && (
          <div style={{ padding: "0.75rem", fontSize: "0.7rem", color: "var(--text-faint)", borderTop: "1px solid var(--border)" }}>
            <div>Connecté à</div>
            <div className="mono" style={{ color: "var(--text-dim)", marginTop: "0.25rem" }}>
              {shop.myshopifyDomain}
            </div>
          </div>
        )}
      </aside>
      <main style={{ flex: 1, padding: "1.5rem 2rem", overflowX: "auto" }}>
        {children}
      </main>
    </div>
  );
}

function ConnectScreen() {
  const [shop, setShop] = useState("");
  const [autoRedirecting, setAutoRedirecting] = useState(false);

  // When embedded in Shopify admin, Shopify passes ?shop=X — auto-start OAuth
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const shopParam = params.get("shop");
    if (shopParam && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopParam)) {
      setAutoRedirecting(true);
      // Break out of Shopify iframe if we're inside one (OAuth can't happen in iframe)
      const redirectUrl = `/api/auth?shop=${encodeURIComponent(shopParam)}`;
      if (window.top && window.top !== window.self) {
        // Inside iframe — redirect the top frame
        window.top.location.href = `${window.location.origin}${redirectUrl}`;
      } else {
        window.location.href = redirectUrl;
      }
    }
  }, []);

  const install = () => {
    const domain = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const full = domain.includes(".myshopify.com") ? domain : `${domain}.myshopify.com`;
    window.location.href = `/api/auth?shop=${encodeURIComponent(full)}`;
  };

  if (autoRedirecting) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="card" style={{ maxWidth: 400, textAlign: "center" }}>
          <div style={{ color: "var(--accent)", fontSize: "1.2rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Connexion à Shopify…
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
            Redirection vers l&apos;autorisation OAuth
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div className="card" style={{ maxWidth: 480, width: "100%" }}>
        <div style={{ color: "var(--accent)", fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          EcomOS
        </div>
        <div style={{ color: "var(--text-dim)", marginBottom: "1.5rem" }}>
          Connecte ta boutique Shopify pour démarrer.
        </div>
        <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.35rem" }}>
          Domaine Shopify
        </label>
        <input
          className="input"
          placeholder="monstore.myshopify.com"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && install()}
          autoFocus
        />
        <button
          className="btn btn-primary"
          style={{ width: "100%", marginTop: "1rem" }}
          onClick={install}
          disabled={!shop.trim()}
        >
          Installer EcomOS
        </button>
        <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", marginTop: "1rem", lineHeight: 1.5 }}>
          Tu seras redirigé vers Shopify pour autoriser l&apos;accès aux commandes, produits et clients de ta boutique.
        </div>
      </div>
    </div>
  );
}
