// S19 command palette: commands, folders, and full-text search over titles, own notes, generated notes and transcripts.
import { useCallback, useEffect, useState } from "react";
import { FileText, Home, LayoutTemplate, Plus, ScrollText, Settings, Trash2 } from "lucide-react";
import { CommandPalette, type Option } from "../ui/notes";
import { noteCreate, searchIndex, searchNotes } from "../data/api";
import type { SearchHit } from "../data/types";
import { FolderGlyph } from "../ui/folderIcons";
import { useLive } from "../data/store";
import { dayLabel } from "../data/format";
import { go } from "./router";

const COMMANDS: Option[] = [
  { id: "new", label: "New note", hint: "Command", icon: <Plus className="size-4" /> },
  { id: "go:/", label: "Go to home", hint: "Command", icon: <Home className="size-4" /> },
  { id: "go:/templates", label: "Go to templates", hint: "Command", icon: <LayoutTemplate className="size-4" /> },
  { id: "go:/recipes", label: "Go to recipes", hint: "Command", icon: <ScrollText className="size-4" /> },
  { id: "go:/trash", label: "Go to trash", hint: "Command", icon: <Trash2 className="size-4" /> },
  { id: "go:/settings/preferences", label: "Open settings", hint: "Command", icon: <Settings className="size-4" /> },
];

const FOUND_IN: Record<SearchHit["field"], string> = { title: "", notes: "In your notes", generated: "In generated notes", transcript: "In transcript" };

export function Palette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const idx = useLive(() => (open ? searchIndex() : Promise.resolve(null)), [open]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ q: string; items: SearchHit[] }>({ q: "", items: [] });
  // Full-text search runs in the core (FTS5). Old results stay on screen until new ones arrive, so the list does not flicker.
  useEffect(() => {
    const s = q.trim();
    if (!open || !s) return;
    let live = true;
    const t = setTimeout(() => searchNotes(s).then((items) => live && setHits({ q: s, items }), () => live && setHits({ q: s, items: [] })), 120);
    return () => { live = false; clearTimeout(t); };
  }, [q, open]);
  const search = useCallback((query: string): Option[] => {
    const s = query.trim().toLowerCase();
    const has = (t: string) => t.toLowerCase().includes(s);
    const recent = (idx.data?.notes ?? []).slice(0, 5).map((n) => ({ id: `go:/note/${n.id}`, label: n.title, hint: dayLabel(n.createdAt), icon: <FileText className="size-4" /> }));
    const notes = hits.items.map((h) => ({
      id: `go:/note/${h.id}`, label: h.title, hint: dayLabel(h.createdAt), icon: <FileText className="size-4" />,
      detail: h.field === "title" ? undefined : `${FOUND_IN[h.field]}: ${h.snippet}`,
    }));
    const folders = (idx.data?.folders ?? []).filter((f) => !s || has(f.name)).map((f) => ({
      id: `go:/folder/${f.id}`, label: f.name, hint: "Folder", icon: <FolderGlyph icon={f.icon} />,
    }));
    const cmds = COMMANDS.filter((c) => !s || has(c.label));
    return s ? [...notes, ...folders, ...cmds] : [...cmds, ...recent];
  }, [idx.data, hits]);
  const pick = async (o: Option) => {
    if (o.id === "new") go(`/note/${(await noteCreate()).id}`);
    else go(o.id.slice(3));
  };
  return <CommandPalette open={open} onOpenChange={onOpenChange} items={COMMANDS} onPick={pick} search={search} onQuery={setQ} />;
}
