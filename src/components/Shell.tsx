"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DateRangeProvider } from "./DateRangeContext";
import DateRangePicker from "./DateRangePicker";
import ShopSwitcher from "./ShopSwitcher";
import { cachedJson, warmRouteData } from "@/lib/client-api-cache";

const NAV = [
  { href: "/", label: "Dashboard", icon: "DB" },
  { href: "/profit", label: "Profit Journalier", icon: "P&L" },
  { href: "/roas", label: "ROAS Calculator", icon: "RO" },
  { href: "/parametres", label: "Parametres", icon: "CFG" },
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
  const [shopReloadKey, setShopReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    cachedJson<{ shop?: ShopInfo }>("/api/shop")
      .then((data) => {
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
  }, [shopReloadKey]);

  useEffect(() => {
    const onShopChanged = () => setShopReloadKey((key) => key + 1);
    window.addEventListener("ecomos-shop-changed", onShopChanged);
    return () => window.removeEventListener("ecomos-shop-changed", onShopChanged);
  }, []);

  useEffect(() => {
    warmRouteData(pathname);
  }, [pathname]);

  if (connected === false) {
    return <ConnectScreen />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-lockup">
            <span className="brand-mark">EO</span>
            <div>
              <div className="brand-title">EcomOS</div>
              <div className="brand-subtitle">Shopify Ops</div>
            </div>
          </div>
          <ShopSwitcher currentShopName={shop?.name} />
        </div>

        <nav className="sidebar-nav" aria-label="Navigation principale">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${pathname === item.href ? "active" : ""}`}
              onMouseEnter={() => warmRouteData(item.href)}
              onFocus={() => warmRouteData(item.href)}
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {shop && (
          <div className="sidebar-shop">
            <div>Connecte a</div>
            <div className="mono" style={{ color: "var(--text-dim)", marginTop: "0.25rem" }}>
              {shop.myshopifyDomain}
            </div>
          </div>
        )}
      </aside>

      <main className="main-panel">
        <DateRangeProvider key={shopReloadKey}>
          <TopBar pathname={pathname} />
          {children}
        </DateRangeProvider>
      </main>
    </div>
  );
}

function TopBar({ pathname }: { pathname: string }) {
  const hiddenOn = ["/parametres", "/roas"];
  if (hiddenOn.includes(pathname)) return null;
  return (
    <div className="topbar">
      <DateRangePicker />
    </div>
  );
}

function ConnectScreen() {
  const [shop, setShop] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const shopParam = params.get("shop");
    if (shopParam && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopParam)) {
      const redirectUrl = `/api/auth?shop=${encodeURIComponent(shopParam)}`;
      if (window.top && window.top !== window.self) {
        window.top.location.href = `${window.location.origin}${redirectUrl}`;
      } else {
        window.location.href = redirectUrl;
      }
    }
  }, []);

  const install = () => {
    const domain = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const full = domain.includes(".myshopify.com") ? domain : `${domain}.myshopify.com`;
    const redirectUrl = `/api/auth?shop=${encodeURIComponent(full)}`;

    if (typeof window !== "undefined" && window.top && window.top !== window.self) {
      try {
        window.top.location.href = `${window.location.origin}${redirectUrl}`;
        return;
      } catch {
        window.open(`${window.location.origin}${redirectUrl}`, "_top");
        return;
      }
    }
    window.location.href = redirectUrl;
  };

  return (
    <div className="connect-screen">
      <div className="card connect-card" style={{ maxWidth: 480, width: "100%" }}>
        <div className="brand-lockup" style={{ marginBottom: "1rem" }}>
          <span className="brand-mark">EO</span>
          <div>
            <div className="brand-title">EcomOS</div>
            <div className="brand-subtitle">Shopify Ops Dashboard</div>
          </div>
        </div>
        <div style={{ color: "var(--text-dim)", marginBottom: "1.5rem" }}>
          Connecte ta boutique Shopify pour demarrer.
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
          Tu seras redirige vers Shopify pour autoriser l&apos;acces aux commandes, produits et clients de ta boutique.
        </div>
      </div>
    </div>
  );
}
