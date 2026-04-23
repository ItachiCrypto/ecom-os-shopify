"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useDateRange, DateRange, DateRangePreset } from "@/hooks/useDateRange";

interface Ctx {
  range: DateRange;
  setPreset: (p: DateRangePreset) => void;
  setCustom: (from: string, to: string) => void;
  shopStartDate?: string;
  setShopStartDate: (d: string | undefined) => void;
}

const DateRangeContext = createContext<Ctx | null>(null);

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [shopStartDate, setShopStartDate] = useState<string | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  // Load shopStartDate from config once
  useEffect(() => {
    fetch("/api/data").then(r => r.ok ? r.json() : null).then(j => {
      if (j?.data?.config?.shopStartDate) setShopStartDate(j.data.config.shopStartDate);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const { range, setPreset, setCustom } = useDateRange(shopStartDate);

  const updateShopStart = useCallback((d: string | undefined) => {
    setShopStartDate(d);
  }, []);

  if (!loaded) return <>{children}</>;

  return (
    <DateRangeContext.Provider value={{ range, setPreset, setCustom, shopStartDate, setShopStartDate: updateShopStart }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRangeCtx(): Ctx {
  const ctx = useContext(DateRangeContext);
  if (!ctx) {
    // Fallback when context isn't wrapping — return a default range (30d)
    return {
      range: { preset: "30d", from: new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10), label: "30 derniers jours" },
      setPreset: () => {},
      setCustom: () => {},
      shopStartDate: undefined,
      setShopStartDate: () => {},
    };
  }
  return ctx;
}
