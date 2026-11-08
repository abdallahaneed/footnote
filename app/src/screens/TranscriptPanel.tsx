// S08 transcript: live lines (you on the right, them on the left), search, mic choice, copy, delete, stop and resume.
import { useEffect, useRef, useState } from "react";
import { Copy, Mic, RotateCcw, Square } from "lucide-react";
import { Button, SelectMenu, TextInput, cx } from "../ui/base";
import { RecordingBars, TranscriptBubble } from "../ui/notes";
import { SidePanel } from "../app/Layout";
import { recordingStart, recordingStop, transcriptCopyAll, transcriptDeleteSegment, transcriptRetry } from "../data/api";
import { clock } from "../data/format";
import type { Note, Segment } from "../data/types";

const MICS = [
  { value: "auto", label: "Automatic" },
  { value: "builtin", label: "Built-in microphone" },
  { value: "headset", label: "Headset" },
];

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return "Copied"; } catch { return "Could not copy. Check clipboard permission."; }
}

export function TranscriptPanel({ note, segments, focusId, onClose, onError }: {
  note: Note; segments: Segment[]; focusId?: string; onClose: () => void; onError: (m: string) => void;
}) {
  const [q, setQ] = useState("");
  const [mic, setMic] = useState("auto");
  const [msg, setMsg] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const recording = note.status === "recording";
  const busy = note.status === "saved" || note.status === "transcribing" || note.status === "writing";
  const live = segments.filter((s) => !s.deleted);
  const shown = live.filter((s) => !q || s.text.toLowerCase().includes(q.toLowerCase()));
  const run = (p: Promise<unknown>) => p.catch((e: Error) => onError(e.message));

  useEffect(() => { if (recording && !q && !focusId) end.current?.scrollIntoView({ block: "end" }); }, [live.length]);
  useEffect(() => { if (focusId) document.getElementById(`seg-${focusId}`)?.scrollIntoView({ block: "center" }); }, [focusId]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 2500); return () => clearTimeout(t); }, [msg]);

  const status = recording
    ? <span className="inline-flex items-center gap-1.5 text-xs text-fg"><RecordingBars state="recording" size="sm" />Live</span>
    : <span className="text-xs text-muted">{live.length ? "Stopped" : "Not started"}</span>;

  return (
    <SidePanel title="Transcript" status={status} onClose={onClose} footer={
      <div className="flex flex-wrap items-center gap-2">
        {recording
          ? <Button onClick={() => run(recordingStop(note.id))} icon={<Square className="size-3.5" aria-hidden />}>Stop</Button>
          : <Button disabled={busy} onClick={() => run(recordingStart(note.id))} icon={<Mic className="size-4" aria-hidden />}>{live.length ? "Resume" : "Start recording"}</Button>}
        {!recording && !busy && live.length > 0 && (
          <Button variant="ghost" onClick={() => run(transcriptRetry(note.id))} icon={<RotateCcw className="size-3.5" aria-hidden />}>Transcribe again</Button>
        )}
      </div>
    }>
      <div className="mb-3 flex flex-col gap-2">
        <TextInput label="Search transcript" hideLabel placeholder="Search transcript…" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <SelectMenu label="Microphone" value={mic} onChange={setMic} options={MICS} icon={<Mic className="size-4 text-muted" aria-hidden />} />
          <Button size="sm" variant="ghost" disabled={!live.length} icon={<Copy className="size-3.5" aria-hidden />}
            onClick={async () => setMsg(await copy(await transcriptCopyAll(note.id)))}>Copy all</Button>
          <span role="status" className="text-xs text-muted">{msg}</span>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-muted">
          {q ? `No lines contain “${q}”.` : recording ? "Listening. The first lines show up in a few seconds." : "Nothing transcribed yet. Start recording and the conversation shows up here."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((s) => (
            <div key={s.id} id={`seg-${s.id}`} className={cx("rounded-md p-1", s.id === focusId && "ring-2 ring-accent")}>
              <TranscriptBubble side={s.side} speaker={s.speaker} time={clock(s.startMs)} text={s.text} match={q || undefined}
                onCopy={async () => setMsg(await copy(s.text))} onDelete={() => run(transcriptDeleteSegment(s.id))} />
            </div>
          ))}
          <div ref={end} />
        </div>
      )}
    </SidePanel>
  );
}
