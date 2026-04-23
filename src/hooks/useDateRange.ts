"use client";

import { useEffect, useState, useCallback } from "react";

export type DateRangePreset =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "all"
  | "sinceShopStart"
  | "custom";

export interface DateRange {
  preset: DateRangePreset;
  from: string; // ISO date YYYY-MM-DD (inclusive, 00:00:00)
  to: string;   // ISO date YYYY-MM-DD (inclusive, 23:59:59)
  label: string;
}

const STORAGE_KEY = "ecomos_dateRange_v1";

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeRange(preset: DateRangePreset, shopStartDate?: string): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = iso(today);

  switch (preset) {
    case "today":
      return { preset, from: todayStr, to: todayStr, label: "Aujourd'hui" };
    case "7d": {
      const from = new Date(today.getTime() - 6 * 86400_000);
      return { preset, from: iso(from), to: todayStr, label: "7 derniers jours" };
    }
    case "30d": {
      const from = new Date(today.getTime() - 29 * 86400_000);
      return { preset, from: iso(from), to: todayStr, label: "30 derniers jours" };
    }
    case "90d": {
      const from = new Date(today.getTime() - 89 * 86400_000);
      return { preset, from: iso(from), to: todayStr, label: "90 derniers jours" };
    }
    case "thisMonth": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { preset, from: iso(from), to: todayStr, label: "Ce mois-ci" };
    }
    case "lastMonth": {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { preset, from: iso(from), to: iso(to), label: "Mois dernier" };
    }
    case "thisYear": {
      const from = new Date(today.getFullYear(), 0, 1);
      return { preset, from: iso(from), to: todayStr, label: "Cette année" };
    }
    case "sinceShopStart": {
      const from = shopStartDate || "2020-01-01";
      return { preset, from, to: todayStr, label: "Depuis début boutique" };
    }
    case "all":
      return { preset, from: "2000-01-01", to: todayStr, label: "Tout l'historique" };
    case "custom":
    default:
      return { preset: "custom", from: todayStr, to: todayStr, label: "Personnalisé" };
  }
}

export function useDateRange(shopStartDate?: string) {
  const [range, setRangeState] = useState<DateRange>(() => {
    if (typeof window === "undefined") return computeRange("30d", shopStartDate);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DateRange;
        if (parsed.preset === "custom") return parsed;
        // Recompute to keep relative ranges fresh
        return computeRange(parsed.preset, shopStartDate);
      }
    } catch { /* ignore */ }
    return computeRange(shopStartDate ? "sinceShopStart" : "30d", shopStartDate);
  });

  // Recompute when shopStartDate loads async (unless custom)
  useEffect(() => {
    if (range.preset !== "custom" && shopStartDate) {
      setRangeState((prev) => (prev.preset !== "custom" ? computeRange(prev.preset, shopStartDate) : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopStartDate]);

  const setPreset = useCallback((preset: DateRangePreset) => {
    const next = computeRange(preset, shopStartDate);
    setRangeState(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, [shopStartDate]);

  const setCustom = useCallback((from: string, to: string) => {
    const next: DateRange = { preset: "custom", from, to, label: `${from} → ${to}` };
    setRangeState(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  return { range, setPreset, setCustom };
}

/**
 * Check if a date string falls within the date range (inclusive).
 */
export function inRange(dateStr: string, range: { from: string; to: string }): boolean {
  const d = dateStr.slice(0, 10); // YYYY-MM-DD
  return d >= range.from && d <= range.to;
}
