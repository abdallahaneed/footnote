// Fake data layer for the browser (dev and Playwright). Every export mirrors a Tauri command from replica/architecture.md (the name passed to call()).
// The real one is real.ts (Tauri commands); api.ts picks one. Keep both in step.
import { commit, db } from "./store";
import { COMMIT, generate, toMarkdown } from "./generate";
import { clock } from "./format";
import type { CalendarEvent, Folder, Note, Permissions, Segment, Settings, Template } from "./types";

const DAY = 86_400_000;
const SEG_MS = 1500; // a real segment is 30 s; shortened so the fake transcript moves
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () => crypto.randomUUID();

// ?fail=<command> (or ?fail=all) makes that command throw, ?fail=enhance makes note writing fail, to see error states.
const fail = new URLSearchParams(location.search).get("fail");

async function call<T>(cmd: string, fn: () => T): Promise<T> {
  await wait(60);
  if (fail === cmd || fail === "all") throw new Error(`Could not reach the app core (${cmd}).`);
  return structuredClone(fn()); // like IPC: screens never hold a live reference
}

function note(id: string) {
  const n = db.notes.find((x) => x.id === id);
  if (!n) throw new Error("This note no longer exists.");
  return n;
}
const touch = (n: Note) => { n.updatedAt = Date.now(); commit(); };
const segsOf = (id: string) => db.segments.filter((s) => s.noteId === id);
const templateOf = (n: Note) => db.templates.find((t) => t.id === n.templateId) ?? db.templates[0];

/* Calendar ---------------------------------------------------------------- */

export const calendarUpcoming = (days = 14) => call("calendar_upcoming", () => {
  const now = Date.now();
  return db.events
    .filter((e) => e.endAt > now && e.startAt < now + days * DAY)
    .sort((a, b) => a.startAt - b.startAt)
    .map((e) => ({ ...e, noteId: db.notes.find((n) => n.calendarEventId === e.id && !n.deletedAt)?.id }));
});

// Calendar links (S02). The fake keeps them in memory and adds no events.
type CalendarSource = { id: string; label: string; lastSyncAt?: number; lastError?: string; events: number };
let sources: CalendarSource[] = [];
export const calendarSourcesList = () => call("calendar_sources_list", () => sources);
export const calendarAddSource = (icsUrl: string) => call("calendar_add_source", () => {
  const u = icsUrl.trim().replace(/^webcal:\/\//, "https://");
  if (!/^https?:\/\/\S+$/.test(u)) throw new Error("Paste the calendar's ICS link. It starts with https:// or webcal://.");
  const s: CalendarSource = { id: uid(), label: new URL(u).host, events: 0, lastSyncAt: Date.now() };
  sources = [...sources, s];
  commit();
  return s.id;
});
export const calendarSourceDelete = (id: string) => call("calendar_source_delete", () => { sources = sources.filter((s) => s.id !== id); commit(); });

/* Notes ------------------------------------------------------------------- */

function newNote(ev?: CalendarEvent): Note {
  const now = Date.now();
  const n: Note = {
    id: uid(), title: ev?.title ?? "", calendarEventId: ev?.id, attendees: ev?.invitees ?? [], createdAt: now, updatedAt: now,
    recordedMs: 0, ownText: "", templateId: db.templates[0].id, status: "draft", folderIds: [],
  };
  db.notes.push(n);
  commit();
  return n;
}

export const noteCreate = () => call("note_create", () => newNote());

// One note per calendar event (schema: notes_one_per_event).
export const noteOpenForEvent = (eventId: string) => call("note_open_for_event", () => {
  const ev = db.events.find((e) => e.id === eventId);
  if (!ev) throw new Error("That meeting is no longer in your calendar.");
  return db.notes.find((n) => n.calendarEventId === eventId && !n.deletedAt) ?? newNote(ev);
});

export const notesList = (f: { folderId?: string; deleted?: boolean } = {}) => call("notes_list", () =>
  db.notes
    .filter((n) => !!n.deletedAt === !!f.deleted && (!f.folderId || n.folderIds.includes(f.folderId)))
    .sort((a, b) => (f.deleted ? b.deletedAt! - a.deletedAt! : b.createdAt - a.createdAt)));

export const noteGet = (id: string) => call("note_get", () => {
  const n = note(id);
  return { note: n, segments: segsOf(id), templates: db.templates, folders: db.folders };
});

export const noteUpdateOwn = (id: string, patch: { title?: string; ownText?: string; templateId?: string }) => call("note_update_own", () => {
  const n = note(id);
  if (patch.title !== undefined) n.title = patch.title.slice(0, 200);
  if (patch.ownText !== undefined) n.ownText = patch.ownText;
  if (patch.templateId && db.templates.some((t) => t.id === patch.templateId)) n.templateId = patch.templateId;
  touch(n);
  return n;
});

/* Recording (fake capture: replays a script) -------------------------------- */

const SCRIPT: Segment["side"][] = ["them", "me", "them", "me", "them", "me", "them", "me", "them", "me"];
const LINES = [
  "Thanks for making time. Shall we start with the release date?",
  "Yes. We're aiming for the twentieth, assuming testing finishes this week.",
  "What's still open on the testing side?",
  "Mostly the Windows audio checks. Two machines still drop the system sound.",
  "Can we get extra hardware for that?",
  "I'll ask IT for two more laptops by Wednesday.",
  "Good. And the pricing page, who owns that?",
  "Lena does. She'll have a draft on Friday.",
  "Then let's meet again Monday to confirm the date.",
  "Works for me. I'll send a summary after this.",
];
const timers = new Map<string, number>();

function tick(id: string) {
  const n = db.notes.find((x) => x.id === id);
  if (!n || n.status !== "recording" || !n.recordingSince) { clearInterval(timers.get(id)); timers.delete(id); return; }
  const i = segsOf(id).length % LINES.length;
  const elapsed = n.recordedMs + Date.now() - n.recordingSince;
  db.segments.push({
    id: uid(), noteId: id, side: SCRIPT[i], speaker: SCRIPT[i] === "me" ? "You" : n.attendees[0]?.name ?? "Them",
    startMs: Math.max(0, elapsed - SEG_MS), endMs: elapsed, text: LINES[i],
  });
  commit();
}

// Also resumes an ended note: new audio is appended (F04).
export const recordingStart = (id: string) => call("recording_start", () => {
  const n = note(id);
  if (n.deletedAt) throw new Error("Restore this note from the trash before recording.");
  if (n.status === "recording") return n;
  n.status = "recording"; n.recordingSince = Date.now(); n.error = undefined; n.progress = undefined;
  timers.set(id, window.setInterval(() => tick(id), SEG_MS));
  touch(n);
  return n;
});

export const recordingStop = (id: string) => call("recording_stop", () => {
  const n = note(id);
  if (n.status !== "recording") return n;
  clearInterval(timers.get(id)); timers.delete(id);
  n.recordedMs += Date.now() - (n.recordingSince ?? Date.now());
  n.recordingSince = undefined; n.status = "saved";
  touch(n);
  setTimeout(() => runPipeline(id), 300);
  return n;
});

/* Pipeline: transcribe -> write, always visible on the note (fix #2) -------- */

function runPipeline(id: string) {
  const n = db.notes.find((x) => x.id === id);
  if (!n || n.status === "recording") return;
  n.status = "transcribing"; n.progress = 0; n.error = undefined;
  commit();
  const t = window.setInterval(() => {
    const m = db.notes.find((x) => x.id === id);
    if (!m || m.status !== "transcribing") return clearInterval(t);
    m.progress = (m.progress ?? 0) + 25;
    if (m.progress >= 100) { clearInterval(t); write(id); } else commit();
  }, 250);
}

function write(id: string) {
  const n = db.notes.find((x) => x.id === id);
  if (!n || n.status === "recording") return;
  n.status = "writing"; n.progress = undefined;
  commit();
  setTimeout(() => {
    const m = db.notes.find((x) => x.id === id);
    if (!m || m.status !== "writing") return;
    const segs = segsOf(id).filter((s) => !s.deleted);
    if (fail === "enhance") { // the enhance job (local model) fails, not the command
      m.status = "failed"; m.error = "The local model did not answer. Check that Ollama is running, then try again.";
    } else if (!segs.length && !m.ownText.trim()) {
      m.status = "failed"; m.error = "Nothing to write up yet: there is no transcript and no notes of your own.";
    } else {
      m.generated = generate(templateOf(m), m.ownText, segs); m.status = "done";
    }
    touch(m);
  }, 600);
}

// Crash safety (fix #1): a note left mid-recording or mid-pipeline is finished from its saved segments on launch.
for (const n of db.notes) {
  if (["recording", "saved", "transcribing", "writing"].includes(n.status)) {
    const last = segsOf(n.id).at(-1);
    n.recordedMs = Math.max(n.recordedMs, last?.endMs ?? 0);
    n.recordingSince = undefined; n.status = "saved";
    setTimeout(() => runPipeline(n.id), 500);
  }
}

// Switching template after the fact regenerates; own notes are kept (F05).
export const generateNotes = (id: string, templateId?: string) => call("generate_notes", () => {
  const n = note(id);
  if (templateId && db.templates.some((t) => t.id === templateId)) n.templateId = templateId;
  if (n.status !== "recording") write(id);
  touch(n);
  return n;
});

/* Transcript --------------------------------------------------------------- */

export const transcriptDeleteSegment = (segId: string) => call("transcript_delete_segment", () => {
  const s = db.segments.find((x) => x.id === segId);
  if (s) { s.deleted = true; commit(); }
});

export const transcriptCopyAll = (id: string) => call("transcript_copy_all", () =>
  segsOf(id).filter((s) => !s.deleted).map((s) => `[${clock(s.startMs)}] ${s.speaker}: ${s.text}`).join("\n"));

// Re-run speech to text from the saved audio (fix #1).
export const transcriptRetry = (id: string) => call("transcript_retry", () => { runPipeline(id); });

/* Templates ---------------------------------------------------------------- */

export const templatesList = () => call("templates_list", () => db.templates);

export const templateSave = (t: Template) => call("template_save", () => {
  const name = t.name.trim();
  if (!name) throw new Error("Give the template a name.");
  if (name.length > 40) throw new Error("Keep the name under 40 characters.");
  const sections = t.sections.map((s) => ({ heading: s.heading.trim(), instructions: s.instructions.trim() }));
  if (!sections.length) throw new Error("Add at least one section.");
  if (sections.some((s) => !s.heading)) throw new Error("Every section needs a heading.");
  const existing = db.templates.find((x) => x.id === t.id);
  if (existing?.builtIn) throw new Error("Built-in templates cannot be changed. Duplicate it instead.");
  const saved: Template = { id: existing ? t.id : uid(), name, description: t.description.trim(), sections, builtIn: false };
  if (existing) Object.assign(existing, saved); else db.templates.push(saved);
  commit();
  return saved;
});

export const templateDelete = (id: string) => call("template_delete", () => {
  const t = db.templates.find((x) => x.id === id);
  if (!t || t.builtIn) throw new Error("Built-in templates cannot be deleted.");
  db.templates = db.templates.filter((x) => x.id !== id);
  for (const n of db.notes) if (n.templateId === id) n.templateId = db.templates[0].id;
  commit();
});

/* Folders ------------------------------------------------------------------ */

export const foldersTree = () => call("folders_tree", () =>
  db.folders.map((f) => ({ ...f, count: db.notes.filter((n) => !n.deletedAt && n.folderIds.includes(f.id)).length })));

export const folderSave = (f: Partial<Folder> & { name: string }) => call("folder_save", () => {
  const name = f.name.trim();
  if (!name) throw new Error("Give the folder a name.");
  if (name.length > 40) throw new Error("Keep the name under 40 characters.");
  const existing = f.id ? db.folders.find((x) => x.id === f.id) : undefined;
  const saved: Folder = { id: existing?.id ?? uid(), name, description: (f.description ?? "").trim() };
  if (existing) Object.assign(existing, saved); else db.folders.push(saved);
  commit();
  return saved;
});

export const folderDelete = (id: string) => call("folder_delete", () => {
  db.folders = db.folders.filter((f) => f.id !== id);
  for (const n of db.notes) n.folderIds = n.folderIds.filter((x) => x !== id);
  commit();
});

export const notesAddToFolder = (ids: string[], folderId: string) => call("notes_add_to_folder", () => {
  if (!db.folders.some((f) => f.id === folderId)) throw new Error("That folder no longer exists.");
  for (const n of db.notes) if (ids.includes(n.id) && !n.folderIds.includes(folderId)) n.folderIds.push(folderId);
  commit();
});

export const notesRemoveFromFolder = (ids: string[], folderId: string) => call("notes_remove_from_folder", () => {
  for (const n of db.notes) if (ids.includes(n.id)) n.folderIds = n.folderIds.filter((x) => x !== folderId);
  commit();
});

/* Trash -------------------------------------------------------------------- */

export const noteTrash = (ids: string[]) => call("note_trash", () => {
  const picked = db.notes.filter((n) => ids.includes(n.id));
  if (picked.some((n) => n.status === "recording")) throw new Error("Stop recording before moving this note to the trash.");
  for (const n of picked) n.deletedAt = Date.now();
  commit();
});

export const noteRestore = (id: string) => call("note_restore", () => { note(id).deletedAt = undefined; commit(); });

export const noteDeleteForever = (id: string) => call("note_delete_forever", () => {
  clearInterval(timers.get(id)); timers.delete(id);
  db.notes = db.notes.filter((n) => n.id !== id);
  db.segments = db.segments.filter((s) => s.noteId !== id);
  commit();
});

// Trash purge job: notes trashed more than 30 days ago are gone for good.
{
  const cutoff = Date.now() - 30 * DAY;
  const gone = new Set(db.notes.filter((n) => n.deletedAt && n.deletedAt < cutoff).map((n) => n.id));
  if (gone.size) {
    db.notes = db.notes.filter((n) => !gone.has(n.id));
    db.segments = db.segments.filter((s) => !gone.has(s.noteId));
    commit();
  }
}

/* Share -------------------------------------------------------------------- */

const titleOf = (n: Note) => n.title.trim() || "Untitled note";

export const noteCopyMarkdown = (id: string) => call("note_copy_markdown", () => {
  const n = note(id);
  return n.generated ? toMarkdown(titleOf(n), n.generated) : `# ${titleOf(n)}\n\n${n.ownText}`;
});

export const noteEmailDraft = (id: string) => call("note_email_draft", () => {
  const n = note(id);
  const body = n.generated ? toMarkdown(titleOf(n), n.generated) : n.ownText;
  return `mailto:${n.attendees.map((a) => a.email).join(",")}?subject=${encodeURIComponent(`Notes: ${titleOf(n)}`)}&body=${encodeURIComponent(body)}`;
});

/* Search (FTS5 stand-in) ----------------------------------------------------- */

export const searchIndex = () => call("search", () => ({
  notes: db.notes.filter((n) => !n.deletedAt).sort((a, b) => b.createdAt - a.createdAt).map((n) => ({
    id: n.id, title: titleOf(n), createdAt: n.createdAt,
    text: [titleOf(n), n.ownText, ...(n.generated ?? []).map((l) => l.text), ...segsOf(n.id).filter((s) => !s.deleted).map((s) => s.text)].join("\n").toLowerCase(),
  })),
  folders: db.folders,
}));

/* Chat (local LLM stand-in) -------------------------------------------------- */

type Citation = { label: string; href: string };
const STOP = new Set(["what", "when", "with", "that", "this", "have", "about", "does", "there", "from", "they", "were", "which", "would", "should", "could", "your", "notes", "meeting", "tell", "please"]);

function answer(scopeIds: string[] | "all", text: string): { text: string; citations: Citation[] } {
  const notes = db.notes.filter((n) => !n.deletedAt && (scopeIds === "all" || scopeIds.includes(n.id)));
  if (!notes.length) return { text: "There are no notes here yet, so there is nothing to look through.", citations: [] };
  const cite = (ns: Note[]) => [...new Set(ns)].map((n) => ({ label: titleOf(n), href: `#/note/${n.id}` }));
  const aiLines = (n: Note) => (n.generated ?? []).filter((l) => l.kind === "ai" && l.segIds.length).map((l) => l.text);

  if (/e-?mail/i.test(text)) {
    const n = notes.sort((a, b) => b.createdAt - a.createdAt)[0];
    const lines = aiLines(n);
    const next = lines.filter((l) => COMMIT.test(l));
    const rest = lines.filter((l) => !COMMIT.test(l));
    return {
      text: [`Subject: Notes from ${titleOf(n)}`, "", "Hi all,", "", "Thanks for the time today. What we covered:", ...rest.map((l) => `- ${l}`),
        ...(next.length ? ["", "Next steps:", ...next.map((l) => `- ${l}`)] : []), "", "Best"].join("\n"),
      citations: cite([n]),
    };
  }
  if (/action|next step|to-?do|follow.?up|owe|promis/i.test(text)) {
    const hits = notes.flatMap((n) => aiLines(n).filter((l) => COMMIT.test(l)).map((l) => ({ n, l })));
    if (!hits.length) return { text: "I found no action items in these notes.", citations: [] };
    return { text: ["Action items:", ...hits.map((h) => `- ${h.l} (${titleOf(h.n)})`)].join("\n"), citations: cite(hits.map((h) => h.n)) };
  }
  const words = (text.toLowerCase().match(/[a-zäöüß]{4,}/g) ?? []).filter((w) => !STOP.has(w));
  const hits = notes.flatMap((n) => segsOf(n.id).filter((s) => !s.deleted && words.some((w) => s.text.toLowerCase().includes(w))).map((s) => ({ n, s }))).slice(0, 4);
  if (!hits.length) return { text: `I could not find anything about "${text}" in these notes.`, citations: [] };
  return { text: ["From your notes:", ...hits.map(({ n, s }) => `- "${s.text}" (${titleOf(n)}, ${clock(s.startMs)})`)].join("\n"), citations: cite(hits.map((h) => h.n)) };
}

// Streams the answer word by word, like the chat:token events will.
export async function chatSend(q: { scopeIds: string[] | "all"; text: string }, onToken: (t: string) => void, signal?: AbortSignal) {
  const a = await call("chat_send", () => answer(q.scopeIds, q.text));
  for (const w of a.text.split(/(\s+)/)) {
    if (signal?.aborted) break;
    onToken(w);
    await wait(15);
  }
  return { citations: a.citations };
}

/* Settings (S28), same checks as settings_update ------------------------------ */

let settings: Settings = {
  llmProvider: "ollama", llmUrl: "http://localhost:11434", llmModel: "llama3.2:3b", summaryLength: "normal",
  audioRetention: "delete_after_transcript", jargon: [], languages: ["en"],
};
export const settingsGet = () => call("settings_get", () => settings);
export const settingsUpdate = (s: Settings) => call("settings_update", () => {
  if (!/^https?:\/\//.test(s.llmUrl) || s.llmUrl.length > 500) throw new Error("The model address must start with http:// or https://.");
  if (!s.llmModel.trim()) throw new Error("Enter a model name.");
  if (s.llmModel.length > 200) throw new Error("Keep the model name under 200 characters.");
  if (s.jargon.length > 30 || s.jargon.some((j) => j.length > 60)) throw new Error("Up to 30 words, each under 60 characters.");
  settings = { ...s, llmUrl: s.llmUrl.trim(), llmModel: s.llmModel.trim() };
  commit();
});

/* Permissions (S03). ?perm=denied or ?perm=undetermined shows those states in the browser. */

const permStart = (new URLSearchParams(location.search).get("perm") ?? "granted") as Permissions["mic"];
let perms: Permissions = { mic: permStart, systemAudio: permStart === "undetermined" ? "denied" : permStart };
export const permissionsGet = () => call("permissions_get", () => perms);
export const permissionRequest = (kind: "mic" | "system_audio") => call("permission_request", () => {
  // the OS only prompts once; after a denial the user has to go to System Settings
  if (kind === "mic" && perms.mic === "undetermined") perms = { ...perms, mic: "granted" };
  commit();
  return perms;
});

/* Export all (share): the desktop app writes one markdown file per note. The browser has no folder to write to. */

export const notesExport = () => call("notes_export", () => ({
  dir: "", count: db.notes.filter((n) => !n.deletedAt).length,
}));

/* Meeting notification (S20). In the app the core does all of this and focuses the main window; here the one window navigates. */

export const meetingTakeNotes = async (eventId: string) => {
  const n = await noteOpenForEvent(eventId);
  await recordingStart(n.id);
  return n.id;
};
export const meetingDismiss = () => Promise.resolve();
