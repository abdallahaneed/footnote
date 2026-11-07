import { useEffect, useState } from "react";
import { seed } from "./seed";
import type { DB } from "./types";

// In-memory database for the fake layer, kept in localStorage so a reload keeps your notes.
// shortcut: browser storage, replaced by SQLite behind Tauri commands in /replica-backend.
const KEY = "notes-clone:db:v1";

function load(): DB {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return JSON.parse(s) as DB;
  } catch { /* private window or blocked storage: start from seed */ }
  return seed(Date.now());
}

export const db: DB = load();
const subs = new Set<() => void>();

// Stands in for Tauri events: every write tells mounted screens to reload.
export function commit() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* keeps working in memory */ }
  subs.forEach((f) => f());
}

export function subscribe(f: () => void) {
  subs.add(f);
  return () => { subs.delete(f); };
}

type Live<T> = { data?: T; error?: string; loading: boolean; key: string };

// Runs a data-layer call, and again after every write. Keeps showing old data while reloading.
export function useLive<T>(fn: () => Promise<T>, deps: unknown[]) {
  const key = JSON.stringify(deps);
  const [tick, setTick] = useState(0);
  const [s, set] = useState<Live<T>>({ loading: true, key });
  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    let live = true;
    fn().then(
      (data) => live && set({ data, loading: false, key }),
      (e: Error) => live && set((p) => ({ ...p, error: e.message, loading: false, key })),
    );
    return () => { live = false; };
  }, [key, tick]);
  const fresh = s.key === key;
  return { data: fresh ? s.data : undefined, error: fresh ? s.error : undefined, loading: !fresh || s.loading, retry: () => setTick((t) => t + 1) };
}
