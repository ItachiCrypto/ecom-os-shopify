"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { DateRange, DateRangePreset, useDateRange } from "@/hooks/useDateRange";

interface Ctx {
  range: DateRange;
  setPreset: (p: DateRangePreset) => void;
  setCustom: (from: string, to: string) => void;
  shopStartDate?: string;
  setShopStartDate: (d: string | undefined) => void;
}

const fallbackToday = new Date();
const fallbackFrom = new Date(fallbackToday.getTime() - 29 * 86400_000);
const fallbackRange: DateRange = {
  preset: "30d",
  from: fallbackFrom.toISOString().slice(0, 10),
  to: fallbackToday.toISOString().slice(0, 10),
  label: "30 derniers jours",
};

const DateRangeContext = createContext<Ctx | null>(null);

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [shopStartDate, setShopStartDate] = useState<string | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/data")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data?.config?.shopStartDate) setShopStartDate(j.data.config.shopStartDate);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
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
    return {
      range: fallbackRange,
      setPreset: () => {},
      setCustom: () => {},
      shopStartDate: undefined,
      setShopStartDate: () => {},
    };
  }
  return ctx;
}
