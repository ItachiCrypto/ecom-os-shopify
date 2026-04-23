"use client";

import { useEffect, useRef, useState } from "react";

interface ShopRow {
  shop: string;
  name: string;
  currencyCode?: string;
  active: boolean;
}

export default function ShopSwitcher({ currentShopName }: { currentShopName?: string }) {
  const [open, setOpen] = useState(false);
  const [shops, setShops] = useState<ShopRow[] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [addingShop, setAddingShop] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || shops) return;
    fetch("/api/shops")
      .then((r) => r.json())
      .then((d) => setShops(d.shops || []))
      .catch(() => setShops([]));
  }, [open, shops]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const switchTo = async (shop: string) => {
    setSwitching(shop);
    const res = await fetch("/api/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      setSwitching(null);
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Switch failed");
    }
  };

  const installNew = () => {
    const raw = addingShop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const full = raw.includes(".myshopify.com") ? raw : `${raw}.myshopify.com`;
    window.location.href = `/api/auth?shop=${encodeURIComponent(full)}`;
  };

  const current = shops?.find((s) => s.active);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: 8,
          padding: "0.5rem 0.65rem",
          color: "var(--text)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          fontSize: "0.85rem",
          fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden" }}>
          <span style={{ fontSize: "0.95rem" }}>🏪</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {current?.name || currentShopName || "Boutique…"}
          </span>
        </span>
        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "var(--bg-card)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            padding: "0.4rem",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: "0.65rem", color: "var(--text-faint)", padding: "0.3rem 0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Boutiques installées
          </div>
          {shops === null && (
            <div style={{ padding: "0.5rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>Chargement…</div>
          )}
          {shops?.length === 0 && (
            <div style={{ padding: "0.5rem", fontSize: "0.8rem", color: "var(--text-faint)" }}>Aucune boutique</div>
          )}
          {shops && shops.length > 1 && (
            <button
              onClick={() => !shops.find((s) => s.shop === "__all__")?.active && switchTo("__all__")}
              disabled={switching === "__all__"}
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                padding: "0.5rem 0.6rem",
                background: shops.find((s) => s.shop === "__all__")?.active
                  ? "var(--bg-elevated)"
                  : "transparent",
                border: "none",
                borderRadius: 6,
                color: shops.find((s) => s.shop === "__all__")?.active
                  ? "var(--accent)"
                  : "var(--text)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.85rem",
                borderBottom: "1px solid var(--border)",
                marginBottom: "0.25rem",
              }}
              onMouseEnter={(e) => {
                if (!shops.find((s) => s.shop === "__all__")?.active)
                  e.currentTarget.style.background = "var(--bg-elevated)";
              }}
              onMouseLeave={(e) => {
                if (!shops.find((s) => s.shop === "__all__")?.active)
                  e.currentTarget.style.background = "transparent";
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span style={{ fontWeight: 600 }}>🌐 Toutes les boutiques</span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                  {shops.length} boutiques agrégées
                </span>
              </div>
              {shops.find((s) => s.shop === "__all__")?.active && (
                <span style={{ fontSize: "0.7rem", color: "var(--green)" }}>● ACTIVE</span>
              )}
            </button>
          )}
          {shops?.map((s) => (
            <button
              key={s.shop}
              onClick={() => !s.active && switchTo(s.shop)}
              disabled={s.active || switching === s.shop}
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                padding: "0.5rem 0.6rem",
                background: s.active ? "var(--bg-elevated)" : "transparent",
                border: "none",
                borderRadius: 6,
                color: s.active ? "var(--accent)" : "var(--text)",
                cursor: s.active ? "default" : "pointer",
                fontFamily: "inherit",
                fontSize: "0.85rem",
                opacity: switching === s.shop ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!s.active) e.currentTarget.style.background = "var(--bg-elevated)"; }}
              onMouseLeave={(e) => { if (!s.active) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name}
                </span>
                <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.shop}
                </span>
              </div>
              {s.active && <span style={{ fontSize: "0.7rem", color: "var(--green)" }}>● ACTIVE</span>}
              {switching === s.shop && <span style={{ fontSize: "0.7rem", color: "var(--blue)" }}>…</span>}
            </button>
          ))}

          <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.35rem", paddingTop: "0.4rem" }}>
            <div style={{ fontSize: "0.65rem", color: "var(--text-faint)", padding: "0.2rem 0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Ajouter une boutique
            </div>
            <div style={{ display: "flex", gap: "0.3rem", padding: "0.3rem 0.4rem" }}>
              <input
                className="input"
                placeholder="shop.myshopify.com"
                value={addingShop}
                onChange={(e) => setAddingShop(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addingShop.trim() && installNew()}
                style={{ flex: 1, fontSize: "0.75rem", padding: "0.35rem 0.5rem" }}
              />
              <button
                className="btn btn-primary"
                onClick={installNew}
                disabled={!addingShop.trim()}
                style={{ padding: "0.35rem 0.6rem", fontSize: "0.75rem" }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
