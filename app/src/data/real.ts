// Data layer inside the desktop app: each function is one Tauri command in src-tauri/src/lib.rs.
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { notify } from "./store";
import type { CalendarEvent, Folder, Note, Permissions, Segment, Settings, Template } from "./types";

// The core emits "changed" after every write and as background work moves on; screens reload.
if ("__TAURI_INTERNALS__" in window) listen("changed", notify);

type FolderRow = Folder & { count: number };
type Bundle = { note: Note; segments: Segment[]; templates: Template[]; folders: Folder[] };

export const calendarUpcoming = (days = 14) => invoke<(CalendarEvent & { noteId: string | undefined })[]>("calendar_upcoming", { days });
export const noteCreate = () => invoke<Note>("note_create");
export const noteOpenForEvent = (eventId: string) => invoke<Note>("note_open_for_event", { eventId });
export const notesList = (f: { folderId?: string; deleted?: boolean } = {}) => invoke<Note[]>("notes_list", f);
export const noteGet = (id: string) => invoke<Bundle>("note_get", { id });
export const noteUpdateOwn = (id: string, patch: { title?: string; ownText?: string; templateId?: string }) =>
  invoke<Note>("note_update_own", { id, patch });
export const recordingStart = (id: string) => invoke<Note>("recording_start", { id });
export const recordingStop = (id: string) => invoke<Note>("recording_stop", { id });
export const generateNotes = (id: string, templateId?: string) => invoke<Note>("generate_notes", { id, templateId });
export const transcriptDeleteSegment = (segId: string) => invoke<void>("transcript_delete_segment", { segId });
export const transcriptCopyAll = (id: string) => invoke<string>("transcript_copy_all", { id });
export const transcriptRetry = (id: string) => invoke<void>("transcript_retry", { id });
export const templatesList = () => invoke<Template[]>("templates_list");
export const templateSave = (template: Template) => invoke<Template>("template_save", { template });
export const templateDelete = (id: string) => invoke<void>("template_delete", { id });
export const foldersTree = () => invoke<FolderRow[]>("folders_tree");
export const folderSave = (folder: Partial<Folder> & { name: string }) => invoke<Folder>("folder_save", { folder });
export const folderDelete = (id: string) => invoke<void>("folder_delete", { id });
export const notesAddToFolder = (ids: string[], folderId: string) => invoke<void>("notes_add_to_folder", { ids, folderId });
export const notesRemoveFromFolder = (ids: string[], folderId: string) => invoke<void>("notes_remove_from_folder", { ids, folderId });
export const noteTrash = (ids: string[]) => invoke<void>("note_trash", { ids });
export const noteRestore = (id: string) => invoke<void>("note_restore", { id });
export const noteDeleteForever = (id: string) => invoke<void>("note_delete_forever", { id });
export const noteCopyMarkdown = (id: string) => invoke<string>("note_copy_markdown", { id });
export const noteEmailDraft = (id: string) => invoke<string>("note_email_draft", { id });
export const searchIndex = () => invoke<{ notes: { id: string; title: string; createdAt: number; text: string }[]; folders: Folder[] }>("search");

export type CalendarSource = { id: string; label: string; lastSyncAt?: number; lastError?: string; events: number };
export const calendarSourcesList = () => invoke<CalendarSource[]>("calendar_sources_list");
export const calendarAddSource = (icsUrl: string) => invoke<string>("calendar_add_source", { icsUrl });
export const calendarSourceDelete = (id: string) => invoke<void>("calendar_source_delete", { id });

// Tokens arrive over a channel. Stopping only stops showing them.
// shortcut: the core keeps generating until the model finishes; add a chat_cancel command if that wastes time.
export async function chatSend(q: { scopeIds: string[] | "all"; text: string }, onToken: (t: string) => void, signal?: AbortSignal) {
  const ch = new Channel<string>();
  ch.onmessage = (t) => { if (!signal?.aborted) onToken(t); };
  return invoke<{ citations: { label: string; href: string }[] }>("chat_send", {
    scopeIds: q.scopeIds === "all" ? null : q.scopeIds, text: q.text, onToken: ch,
  });
}

export const settingsGet = () => invoke<Settings>("settings_get");
export const settingsUpdate = (s: Settings) => invoke<void>("settings_update", { s });
export const permissionsGet = () => invoke<Permissions>("permissions_get");
export const permissionRequest = (kind: "mic" | "system_audio") => invoke<Permissions>("permission_request", { kind });
export const notesExport = () => invoke<{ dir: string; count: number }>("notes_export");
