// The data layer screens import. Inside the desktop app it calls the Rust core; in a plain browser
// (npm run dev, Playwright) it uses the in-memory fake with the same functions.
import * as fake from "./fake";
import * as real from "./real";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";

export const isDesktop = "__TAURI_INTERNALS__" in window;

// Typed against the fake so the two layers cannot drift apart without a compile error.
const api: typeof fake = isDesktop ? real : fake;

export const {
  calendarUpcoming, noteCreate, noteOpenForEvent, notesList, noteGet, noteUpdateOwn, recordingStart, recordingStop, generateNotes,
  transcriptDeleteSegment, transcriptCopyAll, transcriptRetry, templatesList, templateSave, templateDelete, foldersTree, folderSave,
  folderDelete, notesAddToFolder, notesRemoveFromFolder, noteTrash, noteRestore, noteDeleteForever, noteCopyMarkdown, noteEmailDraft,
  searchIndex, searchNotes, chatSend, calendarSourcesList, calendarAddSource, calendarSourceDelete,
  settingsGet, settingsUpdate, groqKeySet, permissionsGet, permissionRequest, notesExport, meetingTakeNotes, meetingDismiss,
} = api;

// mailto: and meeting links: the system handler in the app, the browser otherwise.
export const openExternal = (url: string) => (isDesktop ? openUrl(url) : Promise.resolve(void (location.href = url)));

export const revealInFinder = (path: string) => (isDesktop ? revealItemInDir(path) : Promise.resolve());

// System Settings panes for the permission screen (S03).
export const PRIVACY_PANE = {
  mic: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  system_audio: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
};
