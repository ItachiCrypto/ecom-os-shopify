"use client";

import { useEffect, useRef, useState } from "react";
import { revalidate } from "@/lib/data-cache";

interface SyncStatus {
  shop: string;
  lastSyncedAt: string | null;
  totalOrders: number;
  hasSnapshot: boolean;
}

interface ShopSyncResult {
  shop: string;
  mode: "initial" | "incremental";
  added: number;
  updated: number;
  totalOrders: number;
  durationMs: number;
}

const AUTO_SYNC_INTERVAL_MS = 5 * 60_000; // 5 minutes

export default function SyncButton() {
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [shops, setShops] = useState<SyncStatus[]>([]);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  // Load status on mount
  useEffect(() => {
    fetchStatus();
  }, []);

  // Auto-sync every 5 min while page is open
  useEffect(() => {
    const tick = setInterval(() => {
      // Skip if user is offline or tab is hidden
      if (typeof document !== "undefined" && document.hidden) return;
      sync({ silent: true }).catch(() => {});
    }, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(tick);
  }, []);

  // Refresh "il y a X" label every 30s
  useEffect(() => {
    const tick = setInterval(() => setShops((s) => [...s]), 30_000);
    return () => clearInterval(tick);
  }, []);

  const fetchStatus = async () => {
    try {
      const r = await fetch("/api/sync", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setLastSyncedAt(j.lastSyncedAt);
      setShops(j.shops || []);
    } catch {
      // ignore
    }
  };

  const sync = async (opts: { force?: boolean; silent?: boolean } = {}) => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: opts.force === true }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { results: ShopSyncResult[]; totalAdded: number; totalUpdated: number; durationMs: number };

      // Re-fetch and push fresh data to any pages still mounted (Dashboard,
      // Profit, Paramètres). `invalidate` alone wouldn't notify subscribers —
      // pages would keep their stale useState until they remount.
      await revalidate("/api/orders?all=true", "/api/data", "/api/sync");
      await fetchStatus();

      if (!opts.silent) {
        const changed = j.totalAdded + j.totalUpdated;
        const msg =
          changed === 0
            ? "Aucun changement"
            : `${j.totalAdded} nouvelles · ${j.totalUpdated} màj · ${(j.durationMs / 1000).toFixed(1)}s`;
        setToast(msg);
        if (tickRef.current) clearTimeout(tickRef.current);
        tickRef.current = setTimeout(() => setToast(null), 3500);
      }
    } catch (e) {
      if (!opts.silent) {
        setToast(`Erreur: ${e instanceof Error ? e.message : "sync failed"}`);
        if (tickRef.current) clearTimeout(tickRef.current);
        tickRef.current = setTimeout(() => setToast(null), 4500);
      }
    } finally {
      setSyncing(false);
    }
  };

  const label = lastSyncedAt ? `Synced ${relativeTime(lastSyncedAt)}` : "Jamais syncé";
  const fresh = lastSyncedAt && Date.now() - new Date(lastSyncedAt).getTime() < 5 * 60_000;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <button
        onClick={() => sync()}
        disabled={syncing}
        title={
          shops.length
            ? shops.map((s) => `${s.shop}: ${s.totalOrders} orders, ${s.lastSyncedAt ? relativeTime(s.lastSyncedAt) : "—"}`).join("\n")
            : "Synchroniser maintenant"
        }
        style={{
          width: "100%",
          textAlign: "left",
          background: syncing ? "var(--bg-elevated)" : fresh ? "rgba(52, 211, 153, 0.08)" : "var(--bg-elevated)",
          border: "1px solid",
          borderColor: fresh ? "rgba(52, 211, 153, 0.3)" : "var(--border-strong)",
          borderRadius: 8,
          padding: "0.45rem 0.65rem",
          color: "var(--text)",
          cursor: syncing ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          fontSize: "0.78rem",
          fontFamily: "inherit",
          transition: "all 0.15s",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.45rem", overflow: "hidden" }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: syncing ? "var(--blue)" : fresh ? "var(--green)" : "var(--text-faint)",
              animation: syncing ? "syncPulse 1.2s ease-in-out infinite" : undefined,
            }}
          />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {syncing ? "Sync..." : label}
          </span>
        </span>
        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>↻</span>
      </button>

      {toast && (
        <div
          style={{
            fontSize: "0.7rem",
            padding: "0.35rem 0.55rem",
            borderRadius: 6,
            background: toast.startsWith("Erreur")
              ? "rgba(248, 113, 113, 0.12)"
              : "rgba(52, 211, 153, 0.12)",
            color: toast.startsWith("Erreur") ? "var(--red)" : "var(--green)",
            border: "1px solid",
            borderColor: toast.startsWith("Erreur") ? "rgba(248, 113, 113, 0.3)" : "rgba(52, 211, 153, 0.3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {toast.startsWith("Erreur") ? "✗" : "✓"} {toast}
        </div>
      )}

      <style>{`
        @keyframes syncPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "à l'instant";
  if (sec < 60) return `il y a ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}
