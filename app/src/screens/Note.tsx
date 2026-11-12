// S07 note while recording, S09 note after the meeting. One screen: the generated view appears once notes exist.
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { AudioLines, Mic, MoreHorizontal, Square } from "lucide-react";
import { Banner, Button, EmptyState, IconButton, Menu, SelectMenu, SkeletonRows } from "../ui/base";
import { ChatBar, GeneratedLine, OwnLine, SlashMenu, StatusChip, Tabs, type Option } from "../ui/notes";
import { LoadError, Page, WithPanel } from "../app/Layout";
import { go } from "../app/router";
import {
  generateNotes, noteCopyMarkdown, noteEmailDraft, noteGet, noteTrash, noteUpdateOwn, recordingStart, recordingStop, transcriptCopyAll, openExternal,
} from "../data/api";
import { useLive } from "../data/store";
import { clock, dayLabel, duration, liveMs, stageOf, time } from "../data/format";
import type { GenLine, Note, Segment, Template } from "../data/types";
import { TranscriptPanel } from "./TranscriptPanel";
import { ChatPanel } from "./ChatPanel";
import { useRecipeOptions } from "./recipeOptions";

function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!on) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [on]);
  return now;
}

export function NoteScreen({ id }: { id: string }) {
  const recipeOptions = useRecipeOptions();
  const b = useLive(() => noteGet(id), [id]);
  const [panel, setPanel] = useState<"transcript" | "chat" | null>(null);
  const [chatFirst, setChatFirst] = useState<string>();
  const [focusSeg, setFocusSeg] = useState<string>();
  const [tab, setTab] = useState<string>();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState<string>();
  const now = useNow(b.data?.note.status === "recording");

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 2500); return () => clearTimeout(t); }, [msg]);

  if (b.loading) return <Page><SkeletonRows n={6} /></Page>;
  if (b.error || !b.data) {
    return <Page><EmptyState icon={<AudioLines className="size-6" />} title="Could not open this note" body={b.error ?? ""}
      action={<Button onClick={() => go("/")}>Back to home</Button>} /></Page>;
  }

  const { note, segments, templates } = b.data;
  const recording = note.status === "recording";
  const stage = stageOf(note);
  const busy = note.status === "saved" || note.status === "transcribing" || note.status === "writing";
  const run = (p: Promise<unknown>) => p.catch((e: Error) => setError(e.message));
  const copy = async (p: Promise<string>, what: string) => {
    try { await navigator.clipboard.writeText(await p); setMsg(`${what} copied`); } catch { setMsg("Could not copy. Check clipboard permission."); }
  };
  const play = (segId: string) => {
    // shortcut: jumps to the line in the transcript; audio playback comes with the Rust audio_play_range command
    setFocusSeg(segId); setPanel("transcript");
    const s = segments.find((x) => x.id === segId);
    if (s) setMsg(`Source at ${clock(s.startMs)}`);
  };
  const changeTemplate = (t: string) => run(note.generated ? generateNotes(note.id, t) : noteUpdateOwn(note.id, { templateId: t }));
  const activeTab = tab ?? (note.generated ? "gen" : "mine");

  const own = <OwnNotes key={note.id} note={note} templates={templates} onTemplate={(t) => { changeTemplate(t); setMsg(`Template: ${templates.find((x) => x.id === t)?.name}`); }} />;

  return (
    <WithPanel panel={
      panel === "transcript" ? <TranscriptPanel note={note} segments={segments} focusId={focusSeg} onClose={() => { setPanel(null); setFocusSeg(undefined); }} onError={setError} />
      : panel === "chat" ? <ChatPanel key={chatFirst} scope={{ ids: [note.id], label: "This note" }} first={chatFirst} onClose={() => setPanel(null)} />
      : null
    }>
      <Page>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {stage && <StatusChip stage={stage} onRetry={() => run(generateNotes(note.id))} />}
          <span role="status" className="text-xs text-muted">{msg}</span>
          <div className="ml-auto flex items-center gap-1">
            {recording
              ? <Button onClick={() => run(recordingStop(note.id))} icon={<Square className="size-3.5" aria-hidden />}>Stop</Button>
              : <Button variant={note.status === "draft" ? "primary" : "secondary"} disabled={busy} onClick={() => run(recordingStart(note.id))}
                  icon={<Mic className="size-4" aria-hidden />}>{note.status === "draft" ? "Start recording" : "Resume"}</Button>}
            <IconButton label={panel === "transcript" ? "Hide transcript" : "Show transcript"} aria-pressed={panel === "transcript"}
              onClick={() => setPanel(panel === "transcript" ? null : "transcript")}><AudioLines className="size-4" aria-hidden /></IconButton>
            <Menu trigger={<button aria-label="More actions" className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"><MoreHorizontal className="size-4" aria-hidden /></button>}
              items={[
                { label: "Copy as Markdown", onSelect: () => copy(noteCopyMarkdown(note.id), "Notes") },
                { label: "Copy transcript", onSelect: () => copy(transcriptCopyAll(note.id), "Transcript"), disabled: !segments.length },
                { label: "Email to attendees", onSelect: () => noteEmailDraft(note.id).then(openExternal).catch((e: Error) => setError(e.message)) },
                { label: "Move to trash", danger: true, onSelect: () => noteTrash([note.id]).then(() => go("/"), (e: Error) => setError(e.message)) },
              ]} />
          </div>
        </div>

        <TitleInput key={note.id} note={note} />
        <p className="mb-5 text-sm text-muted">
          {dayLabel(note.createdAt)}, {time(note.createdAt)}
          {(note.recordedMs > 0 || recording) && ` · ${duration(liveMs(note, now))}`}
          {note.attendees.length > 0 && ` · ${note.attendees.map((a) => a.name).join(", ")}`}
        </p>
        {note.stopReason && !recording && (
          <p className="-mt-3 mb-5 text-sm text-muted" role="status">
            {note.stopReason === "call_ended"
              ? "Recording stopped on its own: the call ended. Press Resume if it is still going."
              : "Recording stopped on its own after 15 minutes without anyone speaking. Press Resume to go on."}
          </p>
        )}

        {error && <div className="mb-4"><LoadError message={error} onRetry={() => setError(undefined)} /></div>}
        {note.status === "failed" && (
          <div className="mb-4">
            <Banner tone="error" action={<Button size="sm" onClick={() => run(generateNotes(note.id))}>Try again</Button>}>
              {note.error} Your recording and transcript are saved.
            </Banner>
          </div>
        )}

        {note.generated ? (
          <Tabs label="Note views" value={activeTab} onChange={setTab}
            tabs={[{ value: "mine", label: "My notes" }, { value: "gen", label: "Generated" }]}
            trailing={<SelectMenu label="Template" value={note.templateId} onChange={changeTemplate} options={templates.map((t) => ({ value: t.id, label: t.name }))} />}>
            {activeTab === "mine" ? own : busy ? <SkeletonRows n={5} /> : <Generated lines={note.generated} segments={segments} onPlay={play} />}
          </Tabs>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2 text-sm text-muted">
              <span>Template</span>
              <SelectMenu label="Template" value={note.templateId} onChange={changeTemplate} options={templates.map((t) => ({ value: t.id, label: t.name }))} />
            </div>
            {own}
            {busy && <div className="mt-6" aria-label="Writing notes"><SkeletonRows n={3} /></div>}
          </>
        )}
      </Page>
      {panel !== "chat" && (
        <div className="sticky bottom-0 mt-auto bg-bg px-4 pb-4 pt-2 md:px-6">
          <div className="mx-auto max-w-[var(--content-max)]">
            <ChatBar scope="This note" recipes={recipeOptions} onSend={(q) => { setChatFirst(q); setPanel("chat"); }} onStop={() => {}} />
          </div>
        </div>
      )}
    </WithPanel>
  );
}

// Unmount effects do not run on refresh or window close, so pending edits also save when the page hides.
function useSaveOnHide(save: () => void) {
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("pagehide", save); document.removeEventListener("visibilitychange", onHide); save(); };
  }, []);
}

function TitleInput({ note }: { note: Note }) {
  const [v, setV] = useState(note.title);
  const latest = useRef({ v, saved: note.title });
  latest.current.v = v;
  useSaveOnHide(() => { const l = latest.current; if (l.v !== l.saved) { l.saved = l.v; noteUpdateOwn(note.id, { title: l.v }); } });
  useEffect(() => {
    if (v === note.title) return;
    const t = setTimeout(() => { latest.current.saved = v; noteUpdateOwn(note.id, { title: v }); }, 400);
    return () => clearTimeout(t);
  }, [v]);
  return (
    <input aria-label="Note title" placeholder="Untitled note" value={v} maxLength={200} onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== latest.current.saved) { latest.current.saved = v; noteUpdateOwn(note.id, { title: v }); } }}
      className="w-full rounded-md bg-transparent text-xl font-bold text-fg placeholder:text-muted" />
  );
}

// Own notes editor (TipTap). Stored as Markdown in ownText, so the Rust side, export, search and the LLM prompt read it unchanged.
// Saves 400 ms after typing stops and on leaving, so nothing typed is lost.
function OwnNotes({ note, templates, onTemplate }: { note: Note; templates: Template[]; onTemplate: (id: string) => void }) {
  const [text, setText] = useState(note.ownText);
  const [slash, setSlash] = useState<string | null>(null);
  const slashOpen = useRef(false);
  slashOpen.current = slash !== null;
  const latest = useRef({ text, saved: note.ownText });
  latest.current.text = text;

  const save = () => {
    const l = latest.current;
    if (l.text !== l.saved) { l.saved = l.text; noteUpdateOwn(note.id, { ownText: l.text }); }
  };
  useEffect(() => { const t = setTimeout(save, 400); return () => clearTimeout(t); }, [text]);
  useSaveOnHide(save);

  // "/word" alone at the start of a block opens the template menu
  const slashQuery = (ed: Editor) => {
    const { $from, empty } = ed.state.selection;
    const m = empty ? $from.parent.textBetween(0, $from.parentOffset).match(/^\/(\w*)$/) : null;
    return m ? m[1] : null;
  };
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }), // a click must not navigate the app window
      Placeholder.configure({ placeholder: "Write down what matters to you. Type / to pick a template." }),
      Markdown.configure({ markedOptions: { breaks: true } }), // notes saved before the editor used single line breaks
    ],
    content: note.ownText,
    contentType: "markdown",
    editorProps: {
      attributes: { role: "textbox", "aria-multiline": "true", "aria-label": "My notes", class: "own-notes min-h-64 text-note text-fg" },
      // the slash menu takes these keys in the capture phase; stop ProseMirror acting on them too
      handleKeyDown: (_, e) => {
        if (e.key === "Escape") { setSlash(null); return slashOpen.current; }
        return slashOpen.current && ["Enter", "ArrowUp", "ArrowDown"].includes(e.key);
      },
    },
    onUpdate: ({ editor: ed }) => { setText(ed.getMarkdown()); setSlash(slashQuery(ed)); },
    onSelectionUpdate: ({ editor: ed }) => setSlash(slashQuery(ed)),
    onBlur: save,
  });

  const pick = (o: Option) => {
    if (editor) {
      const { $from } = editor.state.selection;
      editor.chain().focus().deleteRange({ from: $from.start(), to: $from.pos }).run();
    }
    setSlash(null);
    onTemplate(o.id);
  };

  return (
    <div className="relative">
      <EditorContent editor={editor} />
      {slash !== null && (
        <div className="absolute left-0 top-8 z-20">
          <SlashMenu query={slash} items={templates.map((t) => ({ id: t.id, label: t.name, hint: "Template" }))} onPick={pick} />
        </div>
      )}
    </div>
  );
}

function Generated({ lines, segments, onPlay }: { lines: GenLine[]; segments: Segment[]; onPlay: (segId: string) => void }) {
  const byId = new Map(segments.filter((s) => !s.deleted).map((s) => [s.id, s]));
  return (
    <article className="flex flex-col gap-1.5" aria-label="Generated notes">
      {lines.map((l, i) => {
        if (l.kind === "heading") return <h3 key={i} className="mt-4 text-lg first:mt-0">{l.text}</h3>;
        if (l.kind === "own") return <OwnLine key={i}>{l.text}</OwnLine>;
        const srcs = l.segIds.map((s) => byId.get(s)).filter((s): s is Segment => !!s);
        return (
          <GeneratedLine key={i} sources={srcs.map((s) => clock(s.startMs))} onPlay={(t) => { const s = srcs.find((x) => clock(x.startMs) === t); if (s) onPlay(s.id); }}>
            {l.text}
          </GeneratedLine>
        );
      })}
    </article>
  );
}
