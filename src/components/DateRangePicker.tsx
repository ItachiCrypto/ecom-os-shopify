"use client";

import { useState, useRef, useEffect } from "react";
import { useDateRangeCtx } from "./DateRangeContext";
import type { DateRangePreset } from "@/hooks/useDateRange";

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "7d", label: "7 derniers jours" },
  { id: "30d", label: "30 derniers jours" },
  { id: "90d", label: "90 derniers jours" },
  { id: "thisMonth", label: "Ce mois-ci" },
  { id: "lastMonth", label: "Mois dernier" },
  { id: "thisYear", label: "Cette année" },
  { id: "sinceShopStart", label: "Depuis début boutique" },
  { id: "all", label: "Tout l'historique" },
];

export default function DateRangePicker() {
  const { range, setPreset, setCustom, shopStartDate } = useDateRangeCtx();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomFrom(range.from);
    setCustomTo(range.to);
  }, [range.from, range.to]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const applyCustom = () => {
    setCustom(customFrom, customTo);
    setOpen(false);
  };

  const fmtShort = (iso: string) => {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        className="btn"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          minWidth: 220,
          justifyContent: "space-between",
          borderColor: "var(--accent-dim)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          📅 <span style={{ fontSize: "0.85rem" }}>{range.label}</span>
        </span>
        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontFamily: "JetBrains Mono, monospace" }}>
          {fmtShort(range.from)} → {fmtShort(range.to)}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 1000,
            background: "var(--bg-card)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            padding: "0.5rem",
            minWidth: 280,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: "0.5rem" }}>
            {PRESETS.map((p) => {
              const disabled = p.id === "sinceShopStart" && !shopStartDate;
              return (
                <button
                  key={p.id}
                  className="nav-item"
                  style={{
                    justifyContent: "space-between",
                    textAlign: "left",
                    opacity: disabled ? 0.4 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                    color: range.preset === p.id ? "var(--accent)" : undefined,
                    background: range.preset === p.id ? "var(--bg-elevated)" : undefined,
                  }}
                  onClick={() => {
                    if (disabled) return;
                    setPreset(p.id);
                    setOpen(false);
                  }}
                  disabled={disabled}
                >
                  <span>{p.label}</span>
                  {p.id === "sinceShopStart" && !shopStartDate && (
                    <span style={{ fontSize: "0.65rem", color: "var(--text-faint)" }}>
                      (définir dans Paramètres)
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem", paddingLeft: "0.5rem", paddingRight: "0.5rem" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Période personnalisée
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem", marginBottom: "0.5rem" }}>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Du</label>
                <input
                  className="input"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{ fontSize: "0.8rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Au</label>
                <input
                  className="input"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={{ fontSize: "0.8rem" }}
                />
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={applyCustom}>
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
