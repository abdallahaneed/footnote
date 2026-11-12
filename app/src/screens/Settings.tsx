// S28 settings: how notes get written, what happens to audio, words to spell right, export everything.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Banner, Button, PageHeader, RadioCards, SelectMenu, SkeletonRows, TextInput } from "../ui/base";
import { TagInput } from "../ui/notes";
import { LoadError, Page } from "../app/Layout";
import { go } from "../app/router";
import { groqKeySet, isDesktop, notesExport, revealInFinder, settingsGet, settingsUpdate } from "../data/api";
import { useLive } from "../data/store";
import type { Settings as S } from "../data/types";

const providers = (apple: S["appleStatus"]): { value: S["llmProvider"]; title: string; body: string; disabled?: boolean }[] => [
  { value: "apple", title: "Built into your Mac", disabled: apple === "not_eligible" || apple === "old_macos",
    body: "Apple's on-device model. Nothing leaves your Mac and there is nothing to download. Needs macOS 26 with Apple Intelligence." },
  { value: "groq", title: "Groq, with your own free key", body: "Faster and fuller notes. Your transcript is sent to Groq to write them." },
  { value: "none", title: "Transcript only", body: "Keep transcripts and your own notes. No generated notes." },
];
const APPLE_WHY: Record<string, string> = {
  not_eligible: "This Mac cannot run Apple's built-in model. Use Groq instead.",
  not_enabled: "Turn on Apple Intelligence in System Settings to use the built-in model.",
  not_ready: "Apple's built-in model is still downloading. It works once the download finishes.",
  old_macos: "Apple's built-in model needs macOS 26 or later. Use Groq instead.",
  unavailable: "Apple's built-in model is not available right now.",
};

// The key goes straight to the Keychain and never comes back to the screen.
function GroqKey({ saved, onSaved }: { saved: boolean; onSaved: (saved: boolean) => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const send = async (k: string) => {
    setBusy(true);
    try { await groqKeySet(k); setKey(""); setError(undefined); onSaved(!!k.trim()); } catch (e) { setError(String((e as Error).message ?? e)); }
    setBusy(false);
  };
  if (saved) return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Groq key saved in your Keychain.</span>
      <Button size="sm" variant="ghost" onClick={() => onSaved(false)}>Replace key</Button>
      <Button size="sm" variant="ghost" loading={busy} onClick={() => send("")}>Remove key</Button>
    </div>
  );
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (key.trim()) send(key); }}>
      <div className="flex flex-wrap items-end gap-2">
        <TextInput className="min-w-0 flex-1" label="Groq API key" type="password" autoComplete="off" spellCheck={false}
          value={key} onChange={(e) => setKey(e.target.value)} placeholder="gsk_..." />
        <Button type="submit" loading={busy} disabled={!key.trim()}>Save key</Button>
      </div>
      <p className="text-sm text-muted">Free, no card needed: sign in at console.groq.com, open API Keys, create one and paste it here.</p>
      {error && <Banner tone="error">{error}</Banner>}
    </form>
  );
}
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
    // the model name is only shown for Groq, so a half-typed one must not block saving another choice
    const out = x.llmProvider !== "groq" && saved.current ? { ...x, llmModel: saved.current.llmModel } : x;
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
              <RadioCards label="Who writes the notes" value={s.llmProvider} onChange={(v) => set("llmProvider", v)} options={providers(s.appleStatus)} />
              {s.llmProvider === "apple" && s.appleStatus && s.appleStatus !== "available" && (
                <Banner tone="warning">{APPLE_WHY[s.appleStatus]}</Banner>
              )}
              {s.llmProvider === "groq" && (
                <>
                  <GroqKey saved={!!s.groqKeySaved} onSaved={(k) => {
                    setS((p) => p && { ...p, groqKeySaved: k });
                    if (saved.current) saved.current = { ...saved.current, groqKeySaved: k };
                  }} />
                  <TextInput className="md:max-w-sm" label="Groq model" value={s.llmModel} onChange={(e) => set("llmModel", e.target.value)} placeholder="openai/gpt-oss-120b" />
                </>
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
