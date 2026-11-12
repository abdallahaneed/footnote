// Shapes the fake data layer returns. They follow replica/schema.sql so the Tauri commands can return the same JSON.
export type Person = { name: string; email: string };

export type CalendarEvent = { id: string; title: string; startAt: number; endAt: number; invitees: Person[]; videoLink?: string };

export type Section = { heading: string; instructions: string };
export type Template = { id: string; name: string; description: string; sections: Section[]; builtIn: boolean };

// S11/S12 saved chat prompt, run with /slug. "single" needs one meeting.
export type Recipe = { id: string; slug: string; name: string; prompt: string; scope: "single" | "multiple"; builtIn: boolean };

export type Segment = {
  id: string; noteId: string; side: "me" | "them"; speaker: string; startMs: number; endMs: number; text: string; deleted?: boolean;
};

// One line of generated notes. "ai" lines keep the transcript segments they came from (fix #4).
export type GenLine = { kind: "heading"; text: string } | { kind: "own"; text: string } | { kind: "ai"; text: string; segIds: string[] };

export type Status = "draft" | "recording" | "saved" | "transcribing" | "writing" | "done" | "failed";

export type Note = {
  id: string; title: string; calendarEventId?: string; attendees: Person[];
  createdAt: number; updatedAt: number;
  recordedMs: number; recordingSince?: number;
  ownText: string; templateId: string;
  status: Status; progress?: number; error?: string;
  generated?: GenLine[];
  folderIds: string[]; deletedAt?: number;
  // set when recording stopped on its own
  stopReason?: "silence" | "call_ended";
};

export type Folder = { id: string; name: string; description: string; icon?: string | null };

export type DB = { events: CalendarEvent[]; notes: Note[]; segments: Segment[]; templates: Template[]; folders: Folder[] };

// Mirrors the settings row (Rust lib.rs Settings).
export type Settings = {
  llmProvider: "apple" | "groq" | "none"; llmModel: string;
  // read-only, filled by settings_get
  appleStatus?: "available" | "not_eligible" | "not_enabled" | "not_ready" | "old_macos" | "unavailable"; groqKeySaved?: boolean;
  summaryLength: "short" | "normal" | "detailed";
  audioRetention: "delete_after_transcript" | "keep_7d" | "keep_30d" | "keep_forever";
  markdownMirrorDir?: string; userName?: string; userRole?: string; userContext?: string;
  jargon: string[]; languages: string[];
  theme: "system" | "light" | "dark";
  transcriptRetentionDays?: number | null; // null = keep until the note is deleted
};

export type Permission = "granted" | "denied" | "undetermined" | "unknown";
export type Permissions = { mic: Permission; systemAudio: Permission };

// S19 full-text search: best match per note. field says where it matched.
export type SearchHit = { id: string; title: string; createdAt: number; field: "title" | "notes" | "generated" | "transcript"; snippet: string };
