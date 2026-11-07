// S06 sidebar: home, folders, templates, trash (hidden when empty), settings.
import { useEffect, useState } from "react";
import { FileText, Folder as FolderIcon, Home, LayoutTemplate, Plus, Search, Settings, Trash2 } from "lucide-react";
import { Button, IconButton, KeyCaps, Modal, TextInput } from "../ui/base";
import { SidebarItem } from "../ui/notes";
import { folderSave, foldersTree, notesList } from "../data/api";
import { useLive } from "../data/store";
import type { Folder } from "../data/types";
import { go } from "./router";

const isMac = navigator.platform.toLowerCase().includes("mac");
export const MOD = isMac ? "Cmd" : "Ctrl";

export function Sidebar({ path, onSearch }: { path: string; onSearch: () => void }) {
  const folders = useLive(() => foldersTree(), []);
  const trash = useLive(() => notesList({ deleted: true }), []);
  const [editing, setEditing] = useState<Partial<Folder> | null>(null);
  return (
    <nav aria-label="Main" className="fixed inset-y-0 left-0 z-40 flex w-[var(--sidebar)] shrink-0 flex-col border-r border-border bg-surface md:static">
      <div className="flex shrink-0 items-center gap-2 px-3" style={{ height: "var(--titlebar)" }}>
        <FileText className="size-4 text-accent" aria-hidden />
        <span className="text-base font-semibold">Notes</span>
      </div>
      <div className="px-2 pb-2">
        <button onClick={onSearch} className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-bg px-2 text-sm text-muted hover:text-fg">
          <Search className="size-4" aria-hidden />Search
          <span className="ml-auto"><KeyCaps keys={[MOD, "K"]} /></span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        <SidebarItem icon={<Home className="size-4" />} label="Home" selected={path === "/"} onClick={() => go("/")} />
        <SidebarItem icon={<LayoutTemplate className="size-4" />} label="Templates" selected={path === "/templates"} onClick={() => go("/templates")} />
        <div className="mt-4 flex h-7 items-center justify-between pl-2">
          <h2 className="text-xs font-semibold text-muted">Folders</h2>
          <IconButton label="New folder" onClick={() => setEditing({ name: "", description: "" })}><Plus className="size-4" aria-hidden /></IconButton>
        </div>
        {folders.data?.map((f) => (
          <SidebarItem key={f.id} icon={<FolderIcon className="size-4" />} label={f.name} count={f.count}
            selected={path === `/folder/${f.id}`} onClick={() => go(`/folder/${f.id}`)} />
        ))}
        {folders.data?.length === 0 && <p className="px-2 py-1 text-sm text-muted">No folders yet.</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-border p-2">
        {!!trash.data?.length && (
          <SidebarItem icon={<Trash2 className="size-4" />} label="Trash" count={trash.data.length} selected={path === "/trash"} onClick={() => go("/trash")} />
        )}
        <SidebarItem icon={<Settings className="size-4" />} label="Settings" selected={path.startsWith("/settings")} onClick={() => go("/settings/preferences")} />
      </div>
      {editing && <FolderDialog folder={editing} onClose={(id) => { setEditing(null); if (id) go(`/folder/${id}`); }} />}
    </nav>
  );
}

// Create or rename a folder. Also used by the folder screen.
export function FolderDialog({ folder, onClose }: { folder: Partial<Folder>; onClose: (savedId?: string) => void }) {
  const [name, setName] = useState(folder.name ?? "");
  const [description, setDescription] = useState(folder.description ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => setError(undefined), [name]);
  const save = async () => {
    setBusy(true);
    try { const f = await folderSave({ id: folder.id, name, description }); onClose(f.id); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={folder.id ? "Rename folder" : "New folder"}
      footer={<><Button onClick={() => onClose()}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <TextInput label="Name" value={name} max={40} error={error} autoFocus onChange={(e) => setName(e.target.value)} />
        <TextInput label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      </form>
    </Modal>
  );
}
