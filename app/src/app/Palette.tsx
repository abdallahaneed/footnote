// S19 command palette: commands, folders, and full-text search over titles, own notes, generated notes and transcripts.
import { useCallback } from "react";
import { FileText, Folder, LayoutTemplate, Plus, Settings, Trash2, Home } from "lucide-react";
import { CommandPalette, type Option } from "../ui/notes";
import { noteCreate, searchIndex } from "../data/api";
import { useLive } from "../data/store";
import { dayLabel } from "../data/format";
import { go } from "./router";

const COMMANDS: Option[] = [
  { id: "new", label: "New note", hint: "Command", icon: <Plus className="size-4" /> },
  { id: "go:/", label: "Go to home", hint: "Command", icon: <Home className="size-4" /> },
  { id: "go:/templates", label: "Go to templates", hint: "Command", icon: <LayoutTemplate className="size-4" /> },
  { id: "go:/trash", label: "Go to trash", hint: "Command", icon: <Trash2 className="size-4" /> },
  { id: "go:/settings/preferences", label: "Open settings", hint: "Command", icon: <Settings className="size-4" /> },
];

export function Palette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const idx = useLive(() => (open ? searchIndex() : Promise.resolve(null)), [open]);
  const search = useCallback((q: string): Option[] => {
    const s = q.trim().toLowerCase();
    const has = (t: string) => t.toLowerCase().includes(s);
    const notes = (idx.data?.notes ?? []).filter((n) => !s || n.text.includes(s)).slice(0, 20).map((n) => ({
      id: `go:/note/${n.id}`, label: n.title, hint: !s || has(n.title) ? dayLabel(n.createdAt) : "Found in text", icon: <FileText className="size-4" />,
    }));
    const folders = (idx.data?.folders ?? []).filter((f) => !s || has(f.name)).map((f) => ({
      id: `go:/folder/${f.id}`, label: f.name, hint: "Folder", icon: <Folder className="size-4" />,
    }));
    const cmds = COMMANDS.filter((c) => !s || has(c.label));
    return s ? [...notes, ...folders, ...cmds] : [...cmds, ...notes.slice(0, 5)];
  }, [idx.data]);
  const pick = async (o: Option) => {
    if (o.id === "new") go(`/note/${(await noteCreate()).id}`);
    else go(o.id.slice(3));
  };
  return <CommandPalette open={open} onOpenChange={onOpenChange} items={COMMANDS} onPick={pick} search={search} />;
}
