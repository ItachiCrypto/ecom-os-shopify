"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import {
  DEFAULT_SHOP_TIME_ZONE,
  DateRange,
  DateRangePreset,
  addDaysIso,
  isoInTimeZone,
  useDateRange,
} from "@/hooks/useDateRange";

interface Ctx {
  range: DateRange;
  setPreset: (p: DateRangePreset) => void;
  setCustom: (from: string, to: string) => void;
  shopStartDate?: string;
  timeZone: string;
  setShopStartDate: (d: string | undefined) => void;
}

const fallbackToday = isoInTimeZone(new Date(), DEFAULT_SHOP_TIME_ZONE);
const fallbackRange: DateRange = {
  preset: "30d",
  from: addDaysIso(fallbackToday, -29),
  to: fallbackToday,
  label: "30 derniers jours",
};

const DateRangeContext = createContext<Ctx | null>(null);

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [shopStartDate, setShopStartDate] = useState<string | undefined>(undefined);
  const [timeZone, setTimeZone] = useState(DEFAULT_SHOP_TIME_ZONE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/data").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/shop").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([data, shop]) => {
        if (data?.data?.config?.shopStartDate) setShopStartDate(data.data.config.shopStartDate);
        if (shop?.shop?.ianaTimezone) setTimeZone(shop.shop.ianaTimezone);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const { range, setPreset, setCustom } = useDateRange(shopStartDate, timeZone);

  const updateShopStart = useCallback((d: string | undefined) => {
    setShopStartDate(d);
  }, []);

  if (!loaded) return <>{children}</>;

  return (
    <DateRangeContext.Provider value={{ range, setPreset, setCustom, shopStartDate, timeZone, setShopStartDate: updateShopStart }}>
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
      timeZone: DEFAULT_SHOP_TIME_ZONE,
      setShopStartDate: () => {},
    };
  }
  return ctx;
}
