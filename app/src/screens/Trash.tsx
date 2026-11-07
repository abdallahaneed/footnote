// S22 trash: restore, or delete for good. The purge job removes notes 30 days after they were trashed.
import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button, EmptyState, PageHeader, SkeletonRows } from "../ui/base";
import { TypedConfirm } from "../ui/notes";
import { LoadError, Page } from "../app/Layout";
import { noteDeleteForever, noteRestore, notesList } from "../data/api";
import { useLive } from "../data/store";
import { noteTitle } from "../data/format";
import type { Note } from "../data/types";

const DAY = 86_400_000;
const left = (n: Note) => Math.max(0, 30 - Math.floor((Date.now() - (n.deletedAt ?? 0)) / DAY));

export function Trash() {
  const notes = useLive(() => notesList({ deleted: true }), []);
  const [doomed, setDoomed] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const forever = async () => {
    if (!doomed) return;
    setBusy(true);
    try { await noteDeleteForever(doomed.id); setDoomed(null); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <Page>
      <PageHeader title="Trash" description="Notes here are deleted for good 30 days after you trash them." />
      {error && <div className="mb-4"><LoadError message={error} onRetry={() => setError(undefined)} /></div>}
      {notes.loading ? <SkeletonRows n={3} />
        : notes.error ? <LoadError message={notes.error} onRetry={notes.retry} />
        : !notes.data?.length ? <EmptyState icon={<Trash2 className="size-6" />} title="Trash is empty" body="Notes you delete show up here first." />
        : (
          <ul className="flex flex-col gap-1">
            {notes.data.map((n) => (
              <li key={n.id} className="flex items-center gap-3 rounded-md px-2 hover:bg-surface" style={{ minHeight: "var(--row)" }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium">{noteTitle(n)}</p>
                  <p className="text-xs text-muted">Deleted for good in {left(n)} {left(n) === 1 ? "day" : "days"}</p>
                </div>
                <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" aria-hidden />} aria-label={`Restore ${noteTitle(n)}`}
                  onClick={() => noteRestore(n.id).catch((e: Error) => setError(e.message))}>Restore</Button>
                <Button size="sm" variant="ghost" className="text-danger" aria-label={`Delete ${noteTitle(n)} for good`} onClick={() => setDoomed(n)}>Delete</Button>
              </li>
            ))}
          </ul>
        )}
      <TypedConfirm open={!!doomed} onOpenChange={(o) => !o && setDoomed(null)} title="Delete for good?"
        body={`“${doomed ? noteTitle(doomed) : ""}”, its transcript and its audio will be removed from this computer. This cannot be undone.`}
        word="delete" action="Delete for good" busy={busy} onConfirm={forever} />
    </Page>
  );
}
