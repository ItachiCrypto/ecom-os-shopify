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
      return;
    }

    setSwitching(null);
    const j = await res.json().catch(() => ({}));
    alert(j.error || "Switch failed");
  };

  const installNew = () => {
    const raw = addingShop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const full = raw.includes(".myshopify.com") ? raw : `${raw}.myshopify.com`;
    window.location.href = `/api/auth?shop=${encodeURIComponent(full)}`;
  };

  const current = shops?.find((shop) => shop.active);
  const allShop = shops?.find((shop) => shop.shop === "__all__");

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="btn"
        onClick={() => setOpen((value) => !value)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "0.55rem 0.65rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden" }}>
          <span className="icon" style={{ width: "1.7rem", minWidth: "1.7rem" }}>SHOP</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {current?.name || currentShopName || "Boutique..."}
          </span>
        </span>
        <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>v</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "var(--bg-card)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: "0.45rem",
            boxShadow: "var(--shadow)",
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: "0.65rem", color: "var(--text-faint)", padding: "0.3rem 0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Boutiques installees
          </div>

          {shops === null && (
            <div style={{ padding: "0.5rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>Chargement...</div>
          )}
          {shops?.length === 0 && (
            <div style={{ padding: "0.5rem", fontSize: "0.8rem", color: "var(--text-faint)" }}>Aucune boutique</div>
          )}

          {shops && shops.length > 1 && (
            <button
              className={`switcher-option ${allShop?.active ? "active" : ""}`}
              onClick={() => !allShop?.active && switchTo("__all__")}
              disabled={switching === "__all__"}
            >
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span style={{ fontWeight: 600 }}>Toutes les boutiques</span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                  {shops.length} boutiques agregees
                </span>
              </div>
              {allShop?.active && <span className="status-dot">ACTIVE</span>}
            </button>
          )}

          {shops?.map((shop) => (
            <button
              key={shop.shop}
              className={`switcher-option ${shop.active ? "active" : ""}`}
              onClick={() => !shop.active && switchTo(shop.shop)}
              disabled={shop.active || switching === shop.shop}
              style={{ opacity: switching === shop.shop ? 0.55 : 1 }}
            >
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {shop.name}
                </span>
                <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {shop.shop}
                </span>
              </div>
              {shop.active && <span className="status-dot">ACTIVE</span>}
              {switching === shop.shop && <span style={{ fontSize: "0.72rem", color: "var(--blue)" }}>...</span>}
            </button>
          ))}

          <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.35rem", paddingTop: "0.45rem" }}>
            <div style={{ fontSize: "0.65rem", color: "var(--text-faint)", padding: "0.2rem 0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Ajouter une boutique
            </div>
            <div style={{ display: "flex", gap: "0.35rem", padding: "0.3rem 0.4rem" }}>
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
