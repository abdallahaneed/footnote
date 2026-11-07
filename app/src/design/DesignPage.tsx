// The design-system check: every primitive in every state, light and dark. No screen code here.
import { useState, type ReactNode } from "react";
import { Calendar, FileText, Folder, Inbox, MessageSquare, Mic, Plus, Search, Settings, Trash2, Users, Webhook } from "lucide-react";
import { Banner, Button, Checkbox, EmptyState, IconButton, KeyCaps, Menu, Modal, SelectMenu, SkeletonRows, Switch, TextArea, TextInput } from "../ui/base";
import {
  Avatar, ChatBar, ChatMessage, CommandPalette, GeneratedLine, IntegrationCard, MeetingRow, MeetingToast, NoteRow, OwnLine,
  RecordingBars, RecordingPill, SidebarItem, SlashMenu, StatusChip, Tabs, TagInput, TranscriptBubble, TypedConfirm, type Option,
} from "../ui/notes";

const noop = () => {};
const OPTIONS: Option[] = [
  { id: "n1", label: "Weekly planning with Mara", hint: "Note", icon: <FileText className="size-4" /> },
  { id: "n2", label: "Supplier call, Hamburg", hint: "Note", icon: <FileText className="size-4" /> },
  { id: "p", label: "Go to people", hint: "⌘P", icon: <Users className="size-4" /> },
  { id: "s", label: "Open settings", hint: "⌘,", icon: <Settings className="size-4" /> },
];
const SLASH: Option[] = [
  { id: "t1", label: "Standup", hint: "Template" },
  { id: "t2", label: "Customer call", hint: "Template" },
  { id: "r1", label: "Action items", hint: "Recipe" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-border py-8">
      <h2 id={id} className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-3"><span className="w-28 shrink-0 text-xs text-muted">{label}</span>{children}</div>
);

const COLORS = ["bg", "surface", "surface-2", "border", "border-input", "text", "text-ai", "text-muted", "accent", "accent-soft", "on-accent", "danger", "success", "warning", "warning-soft", "rec"];
type Theme = "system" | "light" | "dark";

export function DesignPage() {
  const [theme, setTheme] = useState<Theme>("system");
  const [tab, setTab] = useState("generated");
  const [sw, setSw] = useState(true);
  const [check, setCheck] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({ b: true });
  const [model, setModel] = useState("local");
  const [mic, setMic] = useState("auto");
  const [tags, setTags] = useState(["Aneed", "Tauri", "SQLite"]);
  const [palette, setPalette] = useState(false);
  const [modal, setModal] = useState(false);
  const [typed, setTyped] = useState(false);
  const [title, setTitle] = useState("");

  const applyTheme = (t: Theme) => {
    setTheme(t);
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  };
  const select = (k: string) => (v: boolean) => setSel({ ...sel, [k]: v });

  return (
    <main className="mx-auto max-w-[960px] px-8 py-10">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">Design system</h1>
          <p className="mt-1 text-sm text-muted">Tokens from replica/design/tokens.json. Accent is a placeholder until the rebrand.</p>
        </div>
        <SelectMenu label="Theme" value={theme} onChange={applyTheme} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
      </header>

      <Section id="colour" title="Colour roles">
        <div className="grid grid-cols-4 gap-2">
          {COLORS.map((c) => (
            <div key={c} className="overflow-hidden rounded-md border border-border">
              <div className="h-10" style={{ background: `var(--c-${c})` }} />
              <p className="px-2 py-1 font-mono text-xs">{c}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="type" title="Type scale">
        <p className="text-display font-bold">Display 28/34 for page titles</p>
        <p className="text-xl font-bold">Xl 24/30 for the note title</p>
        <p className="text-lg font-semibold">Lg 17/22 for section headings</p>
        <p className="text-note">Note 15/24 for editor body text, where people read the longest.</p>
        <p className="text-base">Base 14/20 for interface text, rows and inputs.</p>
        <p className="text-sm text-muted">Sm 13/18 for meta lines and help text.</p>
        <p className="text-xs font-medium text-muted">Xs 11/14 for counters and labels.</p>
      </Section>

      <Section id="buttons" title="Button and icon button">
        <Row label="variants">
          <Button variant="primary">Start notes</Button>
          <Button>Copy as Markdown</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Delete forever</Button>
          <IconButton label="New note"><Plus className="size-4" aria-hidden /></IconButton>
        </Row>
        <Row label="sizes"><Button size="sm">Small</Button><Button size="md">Medium</Button><Button size="lg">Large</Button></Row>
        <Row label="states"><Button variant="primary" loading>Writing notes</Button><Button disabled>Disabled</Button></Row>
      </Section>

      <Section id="inputs" title="Inputs">
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Template name" value={title} onChange={(e) => setTitle(e.target.value)} max={40} placeholder="Customer call" />
          <TextInput label="Calendar link" value="webcal://" onChange={noop} error="That link does not return a calendar file" />
          <TextArea label="What should the notes include?" value="" onChange={noop} placeholder="Decisions, owners, dates" max={2000} />
          <TagInput label="Words to spell right" tags={tags} onChange={setTags} max={30} />
        </div>
        <Row label="select">
          <SelectMenu label="Microphone" icon={<Mic className="size-4 text-muted" aria-hidden />} value={mic} onChange={setMic}
            options={[{ value: "auto", label: "Auto" }, { value: "mbp", label: "MacBook Pro mic" }, { value: "jabra", label: "Jabra Evolve (missing)", disabled: true }]} />
        </Row>
        <Row label="locked"><SelectMenu label="Model, locked" value={model} onChange={setModel} disabled options={[{ value: "local", label: "Local model" }, { value: "own", label: "Own API key" }]} /></Row>
        <Row label="checkbox"><Checkbox label="Include transcript" checked={check} onChange={setCheck} /></Row>
        <div className="max-w-md"><Switch label="Show recording pill" description="A small pill on the screen edge while a meeting records." checked={sw} onChange={setSw} /></div>
        <div className="max-w-md"><Switch label="Send usage data" checked={false} onChange={noop} lockedReason="Off in this build" /></div>
      </Section>

      <Section id="nav" title="Tabs and sidebar">
        <Tabs label="Note view" value={tab} onChange={setTab} tabs={[{ value: "mine", label: "My notes" }, { value: "generated", label: "Generated" }]}
          trailing={<SelectMenu label="Template" value="standup" onChange={noop} options={[{ value: "standup", label: "Standup" }]} />}>
          <p className="text-sm text-muted">{tab === "mine" ? "Panel: the lines you typed." : "Panel: notes written from the transcript."}</p>
        </Tabs>
        <nav aria-label="Sidebar sample" className="w-[var(--sidebar)] rounded-lg bg-surface p-2">
          <SidebarItem icon={<Inbox className="size-4" />} label="All notes" count={128} selected />
          <SidebarItem icon={<Folder className="size-4" />} label="Clients" expanded onToggle={noop} />
          <SidebarItem icon={<Folder className="size-4" />} label="Best Impact" depth={1} count={12} />
          <SidebarItem icon={<Folder className="size-4" />} label="Thesis" depth={1} dropTarget />
          <SidebarItem icon={<Folder className="size-4" />} label="Hiring" expanded={false} onToggle={noop} />
          <SidebarItem icon={<Trash2 className="size-4" />} label="Trash" count={3} />
        </nav>
      </Section>

      <Section id="rows" title="Meeting rows, note rows, status">
        <div className="rounded-lg border border-border p-1">
          <MeetingRow start="09:30" end="10:00" title="Weekly planning" attendees="Mara, Jonas" live onOpen={noop} />
          <MeetingRow start="14:00" end="14:45" title="Supplier call" attendees="Lena Brandt" external onOpen={noop} />
        </div>
        <div className="rounded-lg border border-border p-1">
          <NoteRow title="Weekly planning" meta="Today 09:30" stage={{ kind: "recording" }} selected={sel.a} onSelect={select("a")} onOpen={noop} />
          <NoteRow title="Supplier call" meta="Yesterday" stage={{ kind: "transcribing", pct: 64 }} selected={sel.b} onSelect={select("b")} onOpen={noop} />
          <NoteRow title="Board minutes, October" meta="2 Nov" stage={{ kind: "failed", reason: "model not running" }} selected={sel.c} onSelect={select("c")} onOpen={noop} />
          <NoteRow title="Portfolio review" meta="30 Oct" shared selected={sel.d} onSelect={select("d")} onOpen={noop} />
        </div>
        <Row label="pipeline">
          <StatusChip stage={{ kind: "recording" }} /><StatusChip stage={{ kind: "saved" }} /><StatusChip stage={{ kind: "transcribing", pct: 38 }} />
          <StatusChip stage={{ kind: "writing" }} /><StatusChip stage={{ kind: "done" }} /><StatusChip stage={{ kind: "failed", reason: "model not running" }} onRetry={noop} />
        </Row>
        <Row label="recording">
          <RecordingBars state="recording" /><RecordingBars state="paused" /><RecordingBars state="warning" />
          <RecordingPill onReturn={noop} /><RecordingPill onReturn={noop} paused />
        </Row>
      </Section>

      <Section id="editor" title="Note text: yours vs generated">
        <div className="flex max-w-[var(--content-max)] flex-col gap-2 rounded-lg border border-border p-5">
          <p className="text-xl font-bold">Supplier call</p>
          <OwnLine>price up 4% from January?</OwnLine>
          <GeneratedLine sources={["12:04", "13:40"]} onPlay={noop}>The supplier plans a 4% price rise from January and offered to hold the current price for a 12-month contract.</GeneratedLine>
          <GeneratedLine sources={["21:15"]} onPlay={noop}>Lena sends the revised offer by Friday.</GeneratedLine>
        </div>
        <Row label="slash menu"><SlashMenu query="c" items={SLASH} onPick={noop} /><SlashMenu query="zzz" items={SLASH} onPick={noop} /></Row>
      </Section>

      <Section id="transcript" title="Transcript bubbles">
        <div className="flex w-[var(--panel)] flex-col gap-3 rounded-lg border border-border p-4">
          <TranscriptBubble side="them" speaker="Lena" time="12:04" text="We have to move prices up in January, around four percent." match="four percent" onCopy={noop} onDelete={noop} />
          <TranscriptBubble side="me" speaker="You" time="12:10" text="Can you hold the price if we sign for a year?" onCopy={noop} onDelete={noop} />
        </div>
      </Section>

      <Section id="chat" title="Chat">
        <ChatBar scope="This meeting" onClearScope={noop} onSend={noop} onStop={noop}
          trailing={<SelectMenu label="Model" value={model} onChange={setModel} options={[{ value: "local", label: "Local model" }, { value: "own", label: "Own API key" }]} />} />
        <ChatBar streaming onSend={noop} onStop={noop} />
        <div className="flex max-w-[var(--panel)] flex-col gap-3 rounded-lg border border-border p-4">
          <ChatMessage role="user">What did we agree on price?</ChatMessage>
          <ChatMessage role="assistant" citations={[{ label: "Supplier call, 12:04", href: "#n2" }]}>A 4% rise from January, unless you sign a 12-month contract.</ChatMessage>
          <ChatMessage role="assistant" streaming>Looking through three meetings</ChatMessage>
          <ChatMessage role="assistant" error="The local model stopped answering." onRetry={noop}>{null}</ChatMessage>
        </div>
      </Section>

      <Section id="feedback" title="Banners, notifications, empty and loading">
        <Banner tone="warning" action={<Button size="sm">Check microphone</Button>}>No sound from the other side for 2 minutes. Audio is still being saved.</Banner>
        <Banner tone="error" action={<Button size="sm" variant="primary">Retry</Button>}>Writing notes failed. The transcript and audio are safe.</Banner>
        <Banner tone="info" onDismiss={noop}>This note was opened read-only.</Banner>
        <Banner tone="success">Exported 128 notes as Markdown.</Banner>
        <div className="flex flex-wrap gap-3">
          <MeetingToast kind="calendar" title="Weekly planning" detail="Mara, Jonas · 09:30" onTakeNotes={noop} onDismiss={noop} />
          <MeetingToast kind="detected" title="Call in Zoom" detail="Not on your calendar" onTakeNotes={noop} onDismiss={noop} />
        </div>
        <EmptyState icon={<Calendar className="size-6" />} title="No meetings scheduled" body="Add a calendar, or start a note any time." action={<Button variant="primary">Add a calendar</Button>} />
        <SkeletonRows n={2} />
      </Section>

      <Section id="people" title="Avatars and integrations">
        <Row label="avatar"><Avatar name="Mara Klein" /><Avatar name="Jonas Weber" size={32} /><Avatar name="Brandt Logistik" size={32} square /></Row>
        <div className="grid grid-cols-3 gap-3">
          <IntegrationCard icon={<MessageSquare className="size-4" />} name="Chat channel" body="Post notes to a channel." status="off" onConnect={noop} onManage={noop} />
          <IntegrationCard icon={<FileText className="size-4" />} name="Docs workspace" body="Save notes as pages." status="connected" onConnect={noop} onManage={noop} />
          <IntegrationCard icon={<Webhook className="size-4" />} name="Webhook" body="Send each finished note." status="error" onConnect={noop} onManage={noop} />
        </div>
      </Section>

      <Section id="overlays" title="Overlays">
        <Row label="open">
          <Button icon={<Search className="size-4" aria-hidden />} onClick={() => setPalette(true)}>Search <KeyCaps keys={["Cmd", "K"]} /></Button>
          <Button onClick={() => setModal(true)}>Modal</Button>
          <Button variant="danger" onClick={() => setTyped(true)}>Typed confirm</Button>
          <Menu trigger={<Button>Menu</Button>} items={[{ label: "Copy as Markdown", onSelect: noop }, { label: "Move to folder", onSelect: noop }, { label: "Move to trash", onSelect: noop, danger: true }]} />
        </Row>
      </Section>

      <CommandPalette open={palette} onOpenChange={setPalette} items={OPTIONS} onPick={noop} />
      <Modal open={modal} onOpenChange={setModal} title="Change template" description="Notes are written again from the transcript. Your own lines stay."
        footer={<><Button onClick={() => setModal(false)}>Cancel</Button><Button variant="primary">Rewrite notes</Button></>} />
      <TypedConfirm open={typed} onOpenChange={setTyped} title="Delete 3 notes forever" body="Audio, transcripts and notes are removed from this computer. This cannot be undone." word="delete" action="Delete forever" onConfirm={noop} />
    </main>
  );
}
