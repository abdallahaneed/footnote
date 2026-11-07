// Shapes the fake data layer returns. They follow replica/schema.sql so the Tauri commands can return the same JSON.
export type Person = { name: string; email: string };

export type CalendarEvent = { id: string; title: string; startAt: number; endAt: number; invitees: Person[]; videoLink?: string };

export type Section = { heading: string; instructions: string };
export type Template = { id: string; name: string; description: string; sections: Section[]; builtIn: boolean };

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
};

export type Folder = { id: string; name: string; description: string };

export type DB = { events: CalendarEvent[]; notes: Note[]; segments: Segment[]; templates: Template[]; folders: Folder[] };
