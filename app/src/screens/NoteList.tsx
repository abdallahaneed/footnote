// Note rows with checkbox multi-select and a selection bar. Used by home (S05) and folders (S23).
import { useState, type ReactNode } from "react";
import { Button, Menu, SkeletonRows } from "../ui/base";
import { NoteRow } from "../ui/notes";
import { LoadError } from "../app/Layout";
import { go } from "../app/router";
import { notesAddToFolder, noteTrash } from "../data/api";
import { dayLabel, duration, groupBy, noteTitle, stageOf, time } from "../data/format";
import type { Folder, Note } from "../data/types";

export function NoteList({ notes, folders, empty, extraActions }: {
  notes: { data?: Note[]; error?: string; loading: boolean; retry: () => void };
  folders: Folder[];
  empty: ReactNode;
  extraActions?: (ids: string[], clear: () => void) => ReactNode;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const clear = () => setSel(new Set());
  const ids = [...sel].filter((id) => notes.data?.some((n) => n.id === id));
  const act = (fn: () => Promise<unknown>) => fn().then(clear, (e: Error) => setError(e.message));

  if (notes.loading) return <SkeletonRows n={4} />;
  if (notes.error) return <LoadError message={notes.error} onRetry={notes.retry} />;
  if (!notes.data?.length) return <>{empty}</>;
  return (
    <div className="flex flex-col gap-1">
      {ids.length > 0 && (
        <div role="toolbar" aria-label="Selected notes" className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg p-1.5 shadow-card">
          <span className="px-1 text-sm font-medium" aria-live="polite">{ids.length} selected</span>
          {folders.length > 0 && (
            <Menu trigger={<Button size="sm">Add to folder</Button>}
              items={folders.map((f) => ({ label: f.name, onSelect: () => act(() => notesAddToFolder(ids, f.id)) }))} />
          )}
          {extraActions?.(ids, clear)}
          <Button size="sm" onClick={() => act(() => noteTrash(ids))}>Move to trash</Button>
          <Button size="sm" variant="ghost" onClick={clear} className="ml-auto">Clear</Button>
        </div>
      )}
      {error && <LoadError message={error} onRetry={() => setError(undefined)} />}
      {groupBy(notes.data, (n) => dayLabel(n.createdAt)).map(([day, list]) => (
        <section key={day} aria-label={day}>
          <h3 className="px-2 pb-1 pt-3 text-xs font-semibold text-muted">{day}</h3>
          {list.map((n) => (
            <NoteRow key={n.id} title={noteTitle(n)} meta={`${time(n.createdAt)}${n.recordedMs ? ` · ${duration(n.recordedMs)}` : ""}`}
              stage={stageOf(n)} selected={sel.has(n.id)} selecting={ids.length > 0}
              onSelect={(v) => setSel((s) => { const c = new Set(s); if (v) c.add(n.id); else c.delete(n.id); return c; })}
              onOpen={() => go(`/note/${n.id}`)} />
          ))}
        </section>
      ))}
    </div>
  );
}
