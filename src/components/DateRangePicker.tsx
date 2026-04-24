"use client";

import { useEffect, useRef, useState } from "react";
import { useDateRangeCtx } from "./DateRangeContext";
import { formatIsoDate, type DateRangePreset } from "@/hooks/useDateRange";

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "7d", label: "7 derniers jours" },
  { id: "30d", label: "30 derniers jours" },
  { id: "90d", label: "90 derniers jours" },
  { id: "thisMonth", label: "Ce mois-ci" },
  { id: "lastMonth", label: "Mois dernier" },
  { id: "thisYear", label: "Cette annee" },
  { id: "sinceShopStart", label: "Depuis debut boutique" },
  { id: "all", label: "Tout l'historique" },
];

export default function DateRangePicker() {
  const { range, setPreset, setCustom, shopStartDate } = useDateRangeCtx();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        className="btn"
        onClick={() => {
          if (!open) {
            setCustomFrom(range.from);
            setCustomTo(range.to);
          }
          setOpen((value) => !value);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          minWidth: 260,
          justifyContent: "space-between",
          borderColor: "var(--accent-dim)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
          <span className="icon" style={{ width: "1.7rem", minWidth: "1.7rem" }}>DR</span>
          <span style={{ fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {range.label}
          </span>
        </span>
        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" }}>
          {formatIsoDate(range.from, { day: "2-digit", month: "short", year: "numeric" })} - {formatIsoDate(range.to, { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 1000,
            background: "var(--bg-card)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: "0.5rem",
            minWidth: 300,
            boxShadow: "var(--shadow)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: "0.5rem" }}>
            {PRESETS.map((preset) => {
              const disabled = preset.id === "sinceShopStart" && !shopStartDate;
              return (
                <button
                  key={preset.id}
                  className="nav-item"
                  style={{
                    justifyContent: "space-between",
                    textAlign: "left",
                    opacity: disabled ? 0.45 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                    color: range.preset === preset.id ? "var(--accent)" : undefined,
                    background: range.preset === preset.id ? "var(--bg-elevated)" : undefined,
                    border: 0,
                    width: "100%",
                    fontFamily: "inherit",
                  }}
                  onClick={() => {
                    if (disabled) return;
                    setPreset(preset.id);
                    setOpen(false);
                  }}
                  disabled={disabled}
                >
                  <span>{preset.label}</span>
                  {preset.id === "sinceShopStart" && !shopStartDate && (
                    <span style={{ fontSize: "0.65rem", color: "var(--text-faint)" }}>
                      definir dans Parametres
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 0.5rem 0.5rem" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Periode personnalisee
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Du</label>
                <input className="input" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ fontSize: "0.8rem" }} />
              </div>
              <div>
                <label style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Au</label>
                <input className="input" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ fontSize: "0.8rem" }} />
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
