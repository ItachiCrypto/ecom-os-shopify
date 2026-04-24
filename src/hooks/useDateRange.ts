"use client";

import { useCallback, useEffect, useState } from "react";

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
  from: string;
  to: string;
  label: string;
}

const STORAGE_KEY = "ecomos_dateRange_v1";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_SHOP_TIME_ZONE = "America/New_York";

function parseIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

export function addDaysIso(date: string, days: number): string {
  const { year, month, day } = parseIsoDate(date);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12));
  return next.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(from: string, to: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  const start = Date.UTC(a.year, a.month - 1, a.day);
  const end = Date.UTC(b.year, b.month - 1, b.day);
  return Math.max(1, Math.floor((end - start) / 86400_000) + 1);
}

export function isoInTimeZone(value: string | Date, timeZone = DEFAULT_SHOP_TIME_ZONE): string {
  if (typeof value === "string" && ISO_DATE_RE.test(value)) return value;

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function formatIsoDate(date: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    ...options,
  });
}

export function formatDateTimeInTimeZone(value: string | Date, timeZone = DEFAULT_SHOP_TIME_ZONE) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("fr-FR", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function computeRange(
  preset: DateRangePreset,
  shopStartDate?: string,
  timeZone = DEFAULT_SHOP_TIME_ZONE
): DateRange {
  const todayStr = isoInTimeZone(new Date(), timeZone);
  const { year, month } = parseIsoDate(todayStr);
  const thisMonthStart = `${year}-${String(month).padStart(2, "0")}-01`;

  switch (preset) {
    case "today":
      return { preset, from: todayStr, to: todayStr, label: "Aujourd'hui" };
    case "7d":
      return { preset, from: addDaysIso(todayStr, -6), to: todayStr, label: "7 derniers jours" };
    case "30d":
      return { preset, from: addDaysIso(todayStr, -29), to: todayStr, label: "30 derniers jours" };
    case "90d":
      return { preset, from: addDaysIso(todayStr, -89), to: todayStr, label: "90 derniers jours" };
    case "thisMonth":
      return { preset, from: thisMonthStart, to: todayStr, label: "Ce mois-ci" };
    case "lastMonth": {
      const firstThisMonth = new Date(Date.UTC(year, month - 1, 1, 12));
      firstThisMonth.setUTCMonth(firstThisMonth.getUTCMonth() - 1);
      const from = firstThisMonth.toISOString().slice(0, 10);
      return { preset, from, to: addDaysIso(thisMonthStart, -1), label: "Mois dernier" };
    }
    case "thisYear":
      return { preset, from: `${year}-01-01`, to: todayStr, label: "Cette annee" };
    case "sinceShopStart":
      return { preset, from: shopStartDate || "2020-01-01", to: todayStr, label: "Depuis debut boutique" };
    case "all":
      return { preset, from: "2000-01-01", to: todayStr, label: "Tout l'historique" };
    case "custom":
    default:
      return { preset: "custom", from: todayStr, to: todayStr, label: "Personnalise" };
  }
}

export function useDateRange(shopStartDate?: string, timeZone = DEFAULT_SHOP_TIME_ZONE) {
  const [range, setRangeState] = useState<DateRange>(() => {
    if (typeof window === "undefined") return computeRange("30d", shopStartDate, timeZone);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DateRange;
        if (parsed.preset === "custom") return parsed;
        return computeRange(parsed.preset, shopStartDate, timeZone);
      }
    } catch {
      // ignore invalid local storage
    }
    return computeRange(shopStartDate ? "sinceShopStart" : "30d", shopStartDate, timeZone);
  });

  useEffect(() => {
    if (range.preset !== "custom") {
      queueMicrotask(() => {
        setRangeState((prev) => (prev.preset !== "custom" ? computeRange(prev.preset, shopStartDate, timeZone) : prev));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopStartDate, timeZone]);

  const setPreset = useCallback((preset: DateRangePreset) => {
    const next = computeRange(preset, shopStartDate, timeZone);
    setRangeState(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, [shopStartDate, timeZone]);

  const setCustom = useCallback((from: string, to: string) => {
    const next: DateRange = { preset: "custom", from, to, label: `${from} - ${to}` };
    setRangeState(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  return { range, setPreset, setCustom };
}

export function inRange(dateStr: string, range: { from: string; to: string }, timeZone = DEFAULT_SHOP_TIME_ZONE): boolean {
  const date = isoInTimeZone(dateStr, timeZone);
  return date >= range.from && date <= range.to;
}
