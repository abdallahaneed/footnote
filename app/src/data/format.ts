import type { Stage } from "../ui/notes";
import type { Note } from "./types";

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

export const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };

export function duration(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "under 1 min";
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function dayLabel(t: number, now = Date.now()) {
  const a = new Date(t); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  const diff = Math.round((a.getTime() - b.getTime()) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return a.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

export const noteTitle = (n: { title: string }) => n.title.trim() || "Untitled note";

export const liveMs = (n: Note, now = Date.now()) => n.recordedMs + (n.recordingSince ? now - n.recordingSince : 0);

export function stageOf(n: Note): Stage | undefined {
  switch (n.status) {
    case "draft": return undefined;
    case "transcribing": return { kind: "transcribing", pct: n.progress ?? 0 };
    case "failed": return { kind: "failed", reason: n.error ?? "unknown error" };
    default: return { kind: n.status };
  }
}

export function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const i of items) { const k = key(i); m.set(k, [...(m.get(k) ?? []), i]); }
  return [...m];
}
