"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { formatDateTime } from "@/lib/format";

interface JournalEntry { id: string; title: string; date: string; content: string; tags: string[]; }

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function JournalPage() { return <Shell><Journal /></Shell>; }

function Journal() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/data").then(r => r.json()).then(j => setEntries(j.data.journal || []));
  }, []);
  useEffect(() => {
    if (!dirty || !entries) return;
    const t = setTimeout(() => fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journal: entries }) }).then(() => setDirty(false)), 300);
    return () => clearTimeout(t);
  }, [entries, dirty]);

  if (!entries) return <div>Chargement...</div>;

  const add = () => { setEntries([{ id: uid(), title: "Nouvelle entrée", date: new Date().toISOString(), content: "", tags: [] }, ...entries]); setDirty(true); };
  const upd = (id: string, p: Partial<JournalEntry>) => { setEntries(entries.map(e => e.id === id ? { ...e, ...p } : e)); setDirty(true); };
  const del = (id: string) => { setEntries(entries.filter(e => e.id !== id)); setDirty(true); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>Journal</h1>
        <button className="btn btn-primary" onClick={add}>+ Nouvelle entrée</button>
      </div>

      {entries.length === 0 && <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-dim)" }}>Aucune entrée.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {entries.map(e => (
          <div key={e.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", gap: "0.5rem" }}>
              <input className="input" style={{ fontWeight: 600 }} value={e.title} onChange={ev => upd(e.id, { title: ev.target.value })} />
              <input className="input" type="date" value={e.date.slice(0, 10)} onChange={ev => upd(e.id, { date: new Date(ev.target.value).toISOString() })} style={{ maxWidth: 170 }} />
              <button className="btn btn-danger" onClick={() => del(e.id)}>✕</button>
            </div>
            <textarea className="textarea" rows={4} value={e.content} onChange={ev => upd(e.id, { content: ev.target.value })} placeholder="Notes..." />
            <input className="input" style={{ marginTop: "0.5rem" }} placeholder="Tags (séparés par virgules)" value={e.tags.join(", ")} onChange={ev => upd(e.id, { tags: ev.target.value.split(",").map(t => t.trim()).filter(Boolean) })} />
            <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", marginTop: "0.5rem" }}>{formatDateTime(e.date)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
