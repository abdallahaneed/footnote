// Primitives specific to the meeting-notes clone. Specs in replica/design/components.md.
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Avatar as RAvatar, Dialog, Tabs as RTabs } from "radix-ui";
import { AlertCircle, ArrowUp, Check, ChevronRight, Copy, Loader2, Play, RotateCcw, Search, Square, Trash2, X } from "lucide-react";
import { Button, IconButton, Modal, TextInput, cx } from "./base";

/* Tabs (S09 My notes / Generated, S11, settings) --------------------------------- */

// children is the active tab's panel; Radix links it to its tab via aria-controls.
export function Tabs({ label, value, onChange, tabs, trailing, children }: {
  label: string; value: string; onChange: (v: string) => void; tabs: { value: string; label: string }[]; trailing?: ReactNode; children: ReactNode;
}) {
  return (
    <RTabs.Root value={value} onValueChange={onChange}>
      <div className="flex items-center gap-2 border-b border-border">
        <RTabs.List aria-label={label} className="flex gap-1">
          {tabs.map((t) => (
            <RTabs.Trigger key={t.value} value={t.value}
              className="-mb-px h-9 border-b-2 border-transparent px-3 text-base text-muted hover:text-fg data-[state=active]:border-accent data-[state=active]:font-semibold data-[state=active]:text-fg">
              {t.label}
            </RTabs.Trigger>
          ))}
        </RTabs.List>
        {trailing && <div className="ml-auto pb-1">{trailing}</div>}
      </div>
      <RTabs.Content value={value} className="pt-4 outline-none">{children}</RTabs.Content>
    </RTabs.Root>
  );
}

/* Sidebar tree (S06) ----------------------------------------------------------- */

export function SidebarItem({ icon, label, count, depth = 0, selected, expanded, onToggle, dropTarget, onClick }: {
  icon: ReactNode; label: string; count?: number; depth?: 0 | 1 | 2; selected?: boolean; expanded?: boolean;
  onToggle?: () => void; dropTarget?: boolean; onClick?: () => void;
}) {
  return (
    <div className={cx("group flex h-8 items-center rounded-md pr-1 text-base text-fg", selected ? "bg-surface-2 font-semibold" : "hover:bg-surface-2",
      dropTarget && "ring-2 ring-accent ring-inset")} style={{ paddingLeft: 4 + depth * 16 }}>
      {onToggle ? (
        <button aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`} aria-expanded={expanded} onClick={onToggle}
          className="flex size-5 items-center justify-center rounded-sm text-muted hover:text-fg">
          <ChevronRight className={cx("size-3.5 transition-transform duration-[var(--motion-fast)]", expanded && "rotate-90")} aria-hidden />
        </button>
      ) : <span className="size-5" />}
      <button onClick={onClick} aria-current={selected ? "page" : undefined} className="flex h-full min-w-0 flex-1 items-center gap-2 px-1 text-left">
        <span className="shrink-0 text-muted" aria-hidden>{icon}</span>
        <span className="truncate">{label}</span>
        {count != null && <span className="ml-auto text-xs text-muted">{count}</span>}
      </button>
    </div>
  );
}

/* Processing status, fix #2: every note always shows where it is ---------------- */

export type Stage = { kind: "recording" } | { kind: "saved" } | { kind: "transcribing"; pct: number } | { kind: "writing" } | { kind: "done" } | { kind: "failed"; reason: string };

function stageText(s: Stage) {
  switch (s.kind) {
    case "recording": return "Recording";
    case "saved": return "Audio saved";
    case "transcribing": return `Transcribing ${s.pct}%`;
    case "writing": return "Writing notes";
    case "done": return "Notes ready";
    case "failed": return "Failed";
  }
}

export function StatusChip({ stage, onRetry }: { stage: Stage; onRetry?: () => void }) {
  const busy = stage.kind === "transcribing" || stage.kind === "writing";
  const ink = { recording: "text-fg", saved: "text-muted", transcribing: "text-muted", writing: "text-muted", done: "text-success", failed: "text-danger" }[stage.kind];
  return (
    <span role="status" aria-live="polite" className={cx("inline-flex h-6 items-center gap-1.5 rounded-pill bg-surface px-2 text-xs", ink)}>
      {stage.kind === "recording" && <RecordingBars state="recording" size="sm" />}
      {busy && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {stage.kind === "done" && <Check className="size-3" aria-hidden />}
      {stage.kind === "failed" && <AlertCircle className="size-3" aria-hidden />}
      {stageText(stage)}{stage.kind === "failed" && <span className="sr-only">: {stage.reason}</span>}
      {stage.kind === "failed" && onRetry && (
        <button onClick={onRetry} className="ml-1 inline-flex items-center gap-1 font-semibold underline underline-offset-2">
          <RotateCcw className="size-3" aria-hidden />Retry
        </button>
      )}
    </span>
  );
}

/* Recording indicator (S07 inline, S21 floating pill) -------------------------------- */

export function RecordingBars({ state, size = "md" }: { state: "recording" | "paused" | "warning"; size?: "sm" | "md" }) {
  const color = { recording: "bg-rec", paused: "bg-muted", warning: "bg-warning" }[state];
  return (
    <span role="img" aria-label={{ recording: "Recording", paused: "Paused", warning: "Recording with problems" }[state]}
      className={cx("inline-flex items-center gap-[2px]", size === "sm" ? "h-3" : "h-4")}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={cx("block h-full w-[3px] origin-center rounded-pill", color)}
          style={state === "recording" ? { animation: `rec-bar 900ms var(--motion-ease) ${i * 120}ms infinite` } : { transform: "scaleY(.4)" }} />
      ))}
    </span>
  );
}

export function RecordingPill({ onReturn, paused }: { onReturn: () => void; paused?: boolean }) {
  return (
    <button onClick={onReturn} aria-label={paused ? "Recording paused, return to note" : "Recording, return to note"}
      className="flex flex-col items-center justify-center gap-3 rounded-pill bg-bar-bg text-bar-text shadow-bar" style={{ width: "var(--pill-w)", height: "var(--pill-h)" }}>
      <span className={cx("size-2 rounded-pill", paused ? "bg-bar-muted" : "bg-bar-rec")} aria-hidden />
      <span className="inline-flex h-6 items-center gap-[3px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-full w-[3px] rounded-pill bg-bar-level"
            style={paused ? { transform: "scaleY(.3)" } : { animation: `rec-bar 900ms var(--motion-ease) ${i * 150}ms infinite` }} />
        ))}
      </span>
    </button>
  );
}

/* Note lines, fix #4: own text vs generated text, every generated line has a source ---- */

export function OwnLine({ children }: { children: ReactNode }) {
  // Left rule plus weight, so "you wrote this" never relies on colour.
  return <p className="border-l-2 border-fg pl-3 text-note font-medium text-fg"><span className="sr-only">Your note: </span>{children}</p>;
}

export function GeneratedLine({ children, sources, onPlay }: { children: ReactNode; sources: string[]; onPlay: (t: string) => void }) {
  return (
    <p className="pl-3.5 text-note text-ai">
      {children}{" "}
      {sources.map((t) => (
        <button key={t} onClick={() => onPlay(t)} aria-label={`Play source audio at ${t}`}
          className="ml-1 inline-flex h-5 items-center gap-0.5 rounded-sm bg-surface-2 px-1 align-[1px] font-mono text-xs text-muted hover:bg-accent-soft hover:text-accent">
          <Play className="size-2.5" aria-hidden />{t}
        </button>
      ))}
    </p>
  );
}

/* Rows (S05, S16-S18, S22, S23) ---------------------------------------------------- */

export function NoteRow({ title, meta, stage, selected, selecting, onSelect, onOpen, shared }: {
  title: string; meta: string; stage?: Stage; selected?: boolean; selecting?: boolean; onSelect: (v: boolean) => void; onOpen: () => void; shared?: boolean;
}) {
  return (
    <div className={cx("group flex items-center gap-3 rounded-md px-2", selected ? "bg-accent-soft" : "hover:bg-surface")} style={{ height: "var(--row)" }}>
      <input type="checkbox" aria-label={`Select ${title}`} checked={!!selected} onChange={(e) => onSelect(e.target.checked)}
        className={cx("size-4 accent-accent", !selected && !selecting && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")} />
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="truncate text-base font-medium">{title}</span>
        {shared && <span className="shrink-0 text-xs text-muted">Shared with you</span>}
        <span className="ml-auto shrink-0 text-sm text-muted">{meta}</span>
      </button>
      {stage && stage.kind !== "done" && <StatusChip stage={stage} />}
    </div>
  );
}

export function MeetingRow({ start, end, title, attendees, live, external, onOpen }: {
  start: string; end: string; title: string; attendees: string; live?: boolean; external?: boolean; onOpen: () => void;
}) {
  return (
    <button onClick={onOpen} className="flex h-13 w-full items-center gap-4 rounded-md px-2 text-left hover:bg-surface">
      <span className={cx("h-8 w-[3px] shrink-0 rounded-pill", live ? "bg-rec" : "bg-border")} aria-hidden />
      <span className="w-24 shrink-0 text-sm tabular-nums text-muted">{start} – {end}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base font-medium">{title}</span>
        <span className="truncate text-sm text-muted">{attendees}{external && " · external"}</span>
      </span>
      {live && <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-fg"><RecordingBars state="recording" size="sm" />Now</span>}
    </button>
  );
}

/* Transcript bubble (S08) ------------------------------------------------------------ */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function TranscriptBubble({ side, speaker, time, text, match, onCopy, onDelete }: {
  side: "me" | "them"; speaker: string; time: string; text: string; match?: string; onCopy: () => void; onDelete: () => void;
}) {
  // split with a capture group: odd indexes are the matches
  const parts = match ? text.split(new RegExp(`(${escapeRe(match)})`, "i")) : [text];
  const actions = <BubbleActions onCopy={onCopy} onDelete={onDelete} />;
  return (
    <div className={cx("group flex flex-col gap-1", side === "me" ? "items-end" : "items-start")}>
      <span className="px-1 text-xs text-muted">{speaker} · {time}</span>
      <div className="flex items-start gap-1">
        {side === "me" && actions}
        <p className={cx("max-w-[280px] rounded-bubble px-3 py-2 text-base text-fg", side === "me" ? "rounded-br-sm bg-accent-soft" : "rounded-bl-sm bg-surface-2")}>
          {parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded-sm bg-warning-soft text-fg underline decoration-warning decoration-2">{p}</mark> : p))}
        </p>
        {side === "them" && actions}
      </div>
    </div>
  );
}

function BubbleActions({ onCopy, onDelete }: { onCopy: () => void; onDelete: () => void }) {
  return (
    <span className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
      <IconButton label="Copy line" onClick={onCopy}><Copy className="size-3.5" aria-hidden /></IconButton>
      <IconButton label="Delete line" onClick={onDelete}><Trash2 className="size-3.5" aria-hidden /></IconButton>
    </span>
  );
}

/* Chat bar and messages (S10) ------------------------------------------------------- */

export function ChatBar({ scope, onClearScope, streaming, onSend, onStop, trailing }: {
  scope?: string; onClearScope?: () => void; streaming?: boolean; onSend: (q: string) => void; onStop: () => void; trailing?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const send = () => { if (q.trim()) { onSend(q.trim()); setQ(""); } };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-2 shadow-card focus-within:border-accent" style={{ height: "var(--chat-bar)" }}>
      {scope && (
        <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-pill bg-surface-2 pl-2 pr-1 text-xs text-fg">
          {scope}
          {onClearScope && <button aria-label={`Remove scope ${scope}`} onClick={onClearScope} className="rounded-pill p-0.5 hover:bg-border"><X className="size-3" aria-hidden /></button>}
        </span>
      )}
      <input aria-label="Ask about your notes" placeholder="Ask about your notes…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !streaming && send()}
        className="h-full min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-muted" />
      {trailing}
      {streaming
        ? <IconButton label="Stop answer" onClick={onStop} className="bg-surface-2 text-fg"><Square className="size-3.5" aria-hidden /></IconButton>
        : <IconButton label="Send" onClick={send} disabled={!q.trim()} className="bg-accent text-on-accent hover:bg-accent hover:text-on-accent disabled:opacity-40"><ArrowUp className="size-4" aria-hidden /></IconButton>}
    </div>
  );
}

export function ChatMessage({ role, children, citations, streaming, error, onRetry }: {
  role: "user" | "assistant"; children: ReactNode; citations?: { label: string; href: string }[]; streaming?: boolean; error?: string; onRetry?: () => void;
}) {
  if (role === "user") return <div className="ml-auto max-w-[80%] rounded-bubble bg-surface-2 px-3 py-2 text-base">{children}</div>;
  return (
    <div className="flex flex-col gap-2 text-base" aria-busy={streaming || undefined}>
      <div>{children}{streaming && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-fg" aria-hidden />}</div>
      {citations && citations.length > 0 && (
        <ul aria-label="Sources" className="flex flex-wrap gap-1.5">
          {citations.map((c) => <li key={c.href}><a href={c.href} className="inline-flex h-6 items-center rounded-sm border border-border px-2 text-xs text-accent hover:bg-accent-soft">{c.label}</a></li>)}
        </ul>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="size-4" aria-hidden />{error}
          {onRetry && <Button size="sm" variant="ghost" onClick={onRetry}>Try again</Button>}
        </p>
      )}
    </div>
  );
}

/* Meeting notification (S20): solid edge = calendar, dashed edge = detected call ---------- */

export function MeetingToast({ kind, title, detail, onTakeNotes, onDismiss }: {
  kind: "calendar" | "detected"; title: string; detail: string; onTakeNotes: () => void; onDismiss: () => void;
}) {
  return (
    <section aria-label={`Meeting: ${title}`} className="flex overflow-hidden rounded-lg border border-border bg-bg shadow-pop" style={{ width: "var(--toast-w)" }}>
      <span className={cx("shrink-0 border-l-4 border-accent", kind === "detected" && "border-dashed")} aria-hidden />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{kind === "calendar" ? "Starting now" : "Call detected"}</p>
            <p className="truncate text-base font-semibold">{title}</p>
            <p className="truncate text-sm text-muted">{detail}</p>
          </div>
          <IconButton label="Dismiss" onClick={onDismiss}><X className="size-4" aria-hidden /></IconButton>
        </div>
        <Button variant="primary" size="sm" onClick={onTakeNotes} className="self-start">Start notes</Button>
      </div>
    </section>
  );
}

/* Avatar (S05, S14, S16-S18) ---------------------------------------------------------- */

export function Avatar({ name, src, size = 24, square }: { name: string; src?: string; size?: number; square?: boolean }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <RAvatar.Root className={cx("inline-flex shrink-0 items-center justify-center overflow-hidden bg-surface-2 text-fg", square ? "rounded-sm" : "rounded-pill")}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}>
      {src && <RAvatar.Image src={src} alt={name} className="size-full object-cover" />}
      <RAvatar.Fallback delayMs={src ? 300 : 0} role="img" aria-label={name} className="font-semibold">{initials}</RAvatar.Fallback>
    </RAvatar.Root>
  );
}

/* Option list: shared by the command palette (S19) and the slash menu (S07, S10) ------------ */

export type Option = { id: string; label: string; hint?: string; icon?: ReactNode; detail?: string }; // detail: second line, e.g. a search snippet

const filterOptions = (items: Option[], q: string) => items.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));

function useOptionKeys(items: Option[], onPick: (o: Option) => void) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [items]);
  const onKeyDown = (e: Pick<KeyboardEvent, "key" | "preventDefault">) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && items[active]) { e.preventDefault(); onPick(items[active]); }
  };
  return { active, setActive, onKeyDown };
}

function OptionList({ id, label, items, active, setActive, onPick, empty }: {
  id: string; label: string; items: Option[]; active: number; setActive: (i: number) => void; onPick: (o: Option) => void; empty: string;
}) {
  if (!items.length) return <p className="px-3 py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul id={id} role="listbox" aria-label={label} className="max-h-72 overflow-auto p-1">
      {items.map((o, i) => (
        <li key={o.id} id={`${id}-${o.id}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => { e.preventDefault(); onPick(o); }}
          className={cx("flex min-h-8 cursor-default items-center gap-2 rounded-sm px-2 text-base", o.detail && "py-1", i === active && "bg-accent-soft")}>
          {o.icon && <span className="text-muted" aria-hidden>{o.icon}</span>}
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{o.label}</span>
            {o.detail && <span className="truncate text-sm text-muted">{o.detail}</span>}
          </span>
          {o.hint && <span className="ml-auto shrink-0 text-xs text-muted">{o.hint}</span>}
        </li>
      ))}
    </ul>
  );
}

// search replaces the label filter, e.g. for full-text search over note bodies.
export function CommandPalette({ open, onOpenChange, items, onPick, search, onQuery }: {
  open: boolean; onOpenChange: (o: boolean) => void; items: Option[]; onPick: (o: Option) => void; search?: (q: string) => Option[];
  onQuery?: (q: string) => void; // for searches that load results; they come back through search
}) {
  const [q, setQ] = useState("");
  useEffect(() => onQuery?.(q), [q]);
  const shown = useMemo(() => (search ? search(q) : filterOptions(items, q)), [items, q, search]);
  const pick = (o: Option) => { onPick(o); onOpenChange(false); setQ(""); };
  const { active, setActive, onKeyDown } = useOptionKeys(shown, pick);
  const id = useId();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content className="fixed left-1/2 top-[15vh] z-50 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-bg shadow-pop">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Search notes, people and commands</Dialog.Description>
          <div className="flex h-11 items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted" aria-hidden />
            <input autoFocus role="combobox" aria-expanded aria-controls={id} aria-activedescendant={shown[active] ? `${id}-${shown[active].id}` : undefined}
              aria-label="Search notes and commands" placeholder="Search notes and commands…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
              className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-muted" />
          </div>
          <OptionList id={id} label="Results" items={shown} active={active} setActive={setActive} onPick={pick} empty={`Nothing matches “${q}”`} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Slash menu popup. The editor owns the "/" trigger, the query and Escape; while open, the menu takes
// arrow keys and Enter in the capture phase so the editor does not move the caret or add a line.
export function SlashMenu({ query, items, onPick }: { query: string; items: Option[]; onPick: (o: Option) => void }) {
  const shown = useMemo(() => filterOptions(items, query), [items, query]);
  const { active, setActive, onKeyDown } = useOptionKeys(shown, onPick);
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  });
  const id = useId();
  return (
    <div className="w-64 rounded-md border border-border bg-bg shadow-pop">
      <OptionList id={id} label="Insert template or recipe" items={shown} active={active} setActive={setActive} onPick={onPick} empty="No templates or recipes match" />
    </div>
  );
}

/* Tag input (S28 jargon, 30 max; S30 workspace jargon, 50 max) ------------------------------ */

export function TagInput({ label, tags, onChange, max }: { label: string; tags: string[]; onChange: (t: string[]) => void; max: number }) {
  const [v, setV] = useState("");
  const id = useId();
  const full = tags.length >= max;
  const add = () => {
    const t = v.trim();
    if (t && !full && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t]);
    setV("");
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <span className={cx("text-xs", full ? "text-warning" : "text-muted")} aria-live="polite">{tags.length}/{max}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-bg p-1.5 focus-within:border-accent">
        {tags.map((t) => (
          <span key={t} className="inline-flex h-6 items-center gap-1 rounded-sm bg-surface-2 pl-2 pr-1 text-sm">
            {t}
            <button aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded-sm p-0.5 hover:bg-border"><X className="size-3" aria-hidden /></button>
          </span>
        ))}
        <input id={id} value={v} disabled={full} placeholder={full ? `Limit of ${max} reached` : "Add a word, press Enter"}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
            if (e.key === "Backspace" && !v && tags.length) onChange(tags.slice(0, -1));
          }}
          className="h-6 min-w-32 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted disabled:cursor-not-allowed" />
      </div>
    </div>
  );
}

/* Integration card (S32, S38) --------------------------------------------------------- */

export function IntegrationCard({ icon, name, body, status, onConnect, onManage }: {
  icon: ReactNode; name: string; body: string; status: "off" | "connected" | "error"; onConnect: () => void; onManage: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-bg p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-fg" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold">{name}</p>
        <p className="text-sm text-muted">{body}</p>
        {status === "connected" && <p className="mt-1 inline-flex items-center gap-1 text-sm text-success"><Check className="size-3.5" aria-hidden />Connected</p>}
        {status === "error" && <p className="mt-1 inline-flex items-center gap-1 text-sm text-danger" role="alert"><AlertCircle className="size-3.5" aria-hidden />Connection expired</p>}
      </div>
      {status === "off" && <Button size="sm" onClick={onConnect}>Connect</Button>}
      {status === "error" && <Button size="sm" variant="primary" onClick={onConnect}>Reconnect</Button>}
      {status === "connected" && <Button size="sm" variant="ghost" onClick={onManage}>Manage</Button>}
    </div>
  );
}

/* Typed confirm (S30 remove member, delete workspace; S22 delete forever) ------------------- */

export function TypedConfirm({ open, onOpenChange, title, body, word, action, onConfirm, busy, error }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; body: string; word: string; action: string; onConfirm: () => void; busy?: boolean; error?: string;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (!open) setTyped(""); }, [open]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={body}
      footer={<>
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="danger" disabled={typed.trim() !== word} loading={busy} onClick={onConfirm}>{action}</Button>
      </>}>
      <TextInput label={`Type ${word} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} error={error} autoComplete="off" />
    </Modal>
  );
}
