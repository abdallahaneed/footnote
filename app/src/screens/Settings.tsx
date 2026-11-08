// S28 settings: how notes get written, what happens to audio, words to spell right, export everything.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Banner, Button, PageHeader, RadioCards, SelectMenu, SkeletonRows, TextInput } from "../ui/base";
import { TagInput } from "../ui/notes";
import { LoadError, Page } from "../app/Layout";
import { go } from "../app/router";
import { isDesktop, notesExport, revealInFinder, settingsGet, settingsUpdate } from "../data/api";
import { useLive } from "../data/store";
import type { Settings as S } from "../data/types";

const PROVIDERS: { value: S["llmProvider"]; title: string; body: string }[] = [
  { value: "ollama", title: "Ollama on this computer", body: "Nothing leaves your Mac. Needs Ollama running with a model pulled." },
  { value: "openai_compatible", title: "Another server", body: "Any OpenAI-compatible address, such as LM Studio or your own API key behind a proxy." },
  { value: "none", title: "Transcript only", body: "Keep transcripts and your own notes. No generated notes." },
];
const RETENTION: { value: S["audioRetention"]; title: string; body: string }[] = [
  { value: "delete_after_transcript", title: "Delete once transcribed", body: "Only text is kept. \"Transcribe again\" is not possible." },
  { value: "keep_7d", title: "Keep for 7 days", body: "Time to re-run a transcript that came out wrong." },
  { value: "keep_30d", title: "Keep for 30 days", body: "" },
  { value: "keep_forever", title: "Keep until I delete the note", body: "Uses about 1 MB per minute of meeting." },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`s-${title}`} className="mb-8 flex flex-col gap-3">
      <h2 id={`s-${title}`} className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Settings() {
  const live = useLive(() => settingsGet(), []);
  const [s, setS] = useState<S>();
  const [error, setError] = useState<string>();
  const [msg, setMsg] = useState("");
  const [exp, setExp] = useState<{ dir: string; count: number } | { error: string }>();
  const [exporting, setExporting] = useState(false);
  useEffect(() => { if (live.data && !s) setS(live.data); }, [live.data]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 2500); return () => clearTimeout(t); }, [msg]);

  // Saves on its own, like notes: 600 ms after the last change and when leaving the page.
  const saved = useRef<S>(undefined);
  const pending = useRef<S>(undefined);
  if (live.data && !saved.current) saved.current = live.data;
  const set = <K extends keyof S>(k: K, v: S[K]) => setS((p) => p && { ...p, [k]: v });
  const save = async (x: S) => {
    pending.current = undefined;
    // with "Transcript only" the model fields are hidden, so a half-typed address there must not block saving
    const out = x.llmProvider === "none" && saved.current ? { ...x, llmUrl: saved.current.llmUrl, llmModel: saved.current.llmModel } : x;
    try { await settingsUpdate(out); saved.current = out; setError(undefined); setMsg("Saved."); } catch (e) { setError(String((e as Error).message ?? e)); }
  };
  useEffect(() => {
    if (!s || JSON.stringify(s) === JSON.stringify(saved.current)) return;
    pending.current = s;
    const t = setTimeout(() => save(s), 600);
    return () => clearTimeout(t);
  }, [s]);
  useEffect(() => () => { if (pending.current) save(pending.current); }, []);
  const exportAll = async () => {
    setExporting(true);
    try { setExp(await notesExport()); } catch (e) { setExp({ error: String((e as Error).message ?? e) }); }
    setExporting(false);
  };

  return (
    <Page>
      <PageHeader title="Settings" description="Changes save on their own." actions={<span role="status" className="text-sm text-muted">{msg}</span>} />
      {error && <div className="mb-4"><Banner tone="error">{error}</Banner></div>}
      {live.loading && !s ? <SkeletonRows n={6} />
        : live.error && !s ? <LoadError message={live.error} onRetry={live.retry} />
        : s && (
          <div>
            <Section title="Note writing">
              <RadioCards label="Who writes the notes" value={s.llmProvider} onChange={(v) => set("llmProvider", v)} options={PROVIDERS} />
              {s.llmProvider !== "none" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <TextInput label="Model address" value={s.llmUrl} onChange={(e) => set("llmUrl", e.target.value)} placeholder="http://localhost:11434" />
                  <TextInput label="Model name" value={s.llmModel} onChange={(e) => set("llmModel", e.target.value)} placeholder="llama3.2:3b" />
                </div>
              )}
              <div className="flex items-center gap-2 text-base">
                <span>Summary length</span>
                <SelectMenu label="Summary length" value={s.summaryLength} onChange={(v) => set("summaryLength", v)}
                  options={[{ value: "short", label: "Short" }, { value: "normal", label: "Normal" }, { value: "detailed", label: "Detailed" }]} />
              </div>
            </Section>

            <Section title="Audio">
              <RadioCards label="What happens to recordings" value={s.audioRetention} onChange={(v) => set("audioRetention", v)} options={RETENTION} />
            </Section>

            <Section title="Transcription">
              <p className="text-sm text-muted">Names, products and jargon the transcript should spell right. Up to 30.</p>
              <TagInput label="Words to spell right" tags={s.jargon} onChange={(t) => set("jargon", t)} max={30} />
            </Section>

          </div>
        )}

      <Section title="Your data">
        <p className="text-sm text-muted">Every note as a markdown file, in a new folder in Documents. Notes in the trash are left out.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportAll} loading={exporting}>Export all notes</Button>
          <Button variant="ghost" onClick={() => go("/welcome/audio")}>Microphone and system audio</Button>
          <Button variant="ghost" onClick={() => go("/welcome/calendar")}>Calendars</Button>
        </div>
        {exp && ("error" in exp
          ? <Banner tone="error">{exp.error}</Banner>
          : isDesktop
            ? <Banner tone="success" action={<Button size="sm" onClick={() => revealInFinder(exp.dir)}>Show in Finder</Button>}>
                {exp.count} {exp.count === 1 ? "note" : "notes"} exported to {exp.dir}
              </Banner>
            : <Banner tone="info">{exp.count} notes would be exported. The browser preview cannot write files; use the desktop app.</Banner>)}
      </Section>
    </Page>
  );
}
