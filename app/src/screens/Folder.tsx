// S23 folder: notes in the folder, rename and delete, remove notes, chat scoped to the folder.
import { useState } from "react";
import { FolderOpen, MoreHorizontal } from "lucide-react";
import { Button, EmptyState, Menu, Modal, SkeletonRows } from "../ui/base";
import { ChatBar } from "../ui/notes";
import { LoadError, Page, WithPanel } from "../app/Layout";
import { go } from "../app/router";
import { FolderDialog } from "../app/Sidebar";
import { FolderGlyph } from "../ui/folderIcons";
import { folderDelete, foldersTree, notesList, notesRemoveFromFolder } from "../data/api";
import { useLive } from "../data/store";
import { NoteList } from "./NoteList";
import { ChatPanel } from "./ChatPanel";
import { useRecipeOptions } from "./recipeOptions";

export function FolderScreen({ id }: { id: string }) {
  const recipeOptions = useRecipeOptions();
  const folders = useLive(() => foldersTree(), []);
  const notes = useLive(() => notesList({ folderId: id }), [id]);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [chat, setChat] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  if (folders.loading) return <Page><SkeletonRows n={4} /></Page>;
  if (folders.error) return <Page><LoadError message={folders.error} onRetry={folders.retry} /></Page>;
  const folder = folders.data?.find((f) => f.id === id);
  if (!folder) {
    return <Page><EmptyState icon={<FolderOpen className="size-6" />} title="Folder not found" body="It may have been deleted."
      action={<Button onClick={() => go("/")}>Back to home</Button>} /></Page>;
  }

  return (
    <WithPanel panel={chat !== null && <ChatPanel scope={{ ids: notes.data?.map((n) => n.id) ?? [], label: folder.name }} first={chat} onClose={() => setChat(null)} />}>
      <Page>
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold"><span className="shrink-0 text-muted"><FolderGlyph icon={folder.icon} className="size-5" /></span><span className="truncate">{folder.name}</span></h1>
            {folder.description && <p className="mt-1 text-sm text-muted">{folder.description}</p>}
          </div>
          <Menu trigger={<button aria-label="Folder actions" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"><MoreHorizontal className="size-4" aria-hidden /></button>}
            items={[{ label: "Edit folder", onSelect: () => setRenaming(true) }, { label: "Delete folder", danger: true, onSelect: () => setDeleting(true) }]} />
        </header>
        {error && <div className="mb-4"><LoadError message={error} onRetry={() => setError(undefined)} /></div>}
        <NoteList notes={notes} folders={(folders.data ?? []).filter((f) => f.id !== id)}
          extraActions={(ids, clear) => <Button size="sm" onClick={() => notesRemoveFromFolder(ids, id).then(clear, (e: Error) => setError(e.message))}>Remove from folder</Button>}
          empty={<EmptyState icon={<FolderOpen className="size-6" />} title="No notes in this folder"
            body="On Home, tick the notes you want and choose Add to folder." action={<Button onClick={() => go("/")}>Go to home</Button>} />} />
      </Page>
      {chat === null && !!notes.data?.length && (
        <div className="sticky bottom-0 mt-auto bg-bg px-4 pb-4 pt-2 md:px-6">
          <div className="mx-auto max-w-[var(--content-max)]"><ChatBar scope={folder.name} recipes={recipeOptions} onSend={setChat} onStop={() => {}} /></div>
        </div>
      )}
      {renaming && <FolderDialog folder={folder} onClose={() => setRenaming(false)} />}
      <Modal open={deleting} onOpenChange={setDeleting} title={`Delete “${folder.name}”?`} description="The notes stay in your library. Only the folder goes."
        footer={<><Button onClick={() => setDeleting(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => folderDelete(id).then(() => go("/"), (e: Error) => setError(e.message))}>Delete folder</Button></>} />
    </WithPanel>
  );
}
