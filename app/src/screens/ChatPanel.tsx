// S10 chat: ask about one note, a folder, or all notes. Answers stream in and cite the notes they used. Every
// exchange is kept; the empty panel lists earlier chats for the same notes, to reopen or delete.
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { Button, IconButton } from "../ui/base";
import { ChatBar, ChatMessage } from "../ui/notes";
import { SidePanel } from "../app/Layout";
import { chatSend, chatThreadDelete, chatThreadGet, chatThreads } from "../data/api";
import { useLive } from "../data/store";
import { dayLabel, time } from "../data/format";

type Msg = { role: "user" | "assistant"; text: string; citations?: { label: string; href: string }[]; error?: string; streaming?: boolean };
const SUGGESTIONS = ["List the action items", "Draft a follow-up email", "What did we decide?"];
// Across several notes, e.g. an Interviews folder: preparing for the next one.
const ACROSS = ["Which questions came up in more than one interview?", "Where were my answers weakest?"];

export function ChatPanel({ scope, first, onClose }: { scope: { ids: string[] | "all"; label: string }; first?: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [note, setNote] = useState("");
  const history = useLive(() => chatThreads(scope.ids), [JSON.stringify(scope.ids)]);
  const ctrl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const streaming = msgs.at(-1)?.streaming ?? false;

  const patchLast = (f: (m: Msg) => Partial<Msg>) => setMsgs((ms) => [...ms.slice(0, -1), { ...ms[ms.length - 1], ...f(ms[ms.length - 1]) }]);

  const ask = async (text: string) => {
    ctrl.current = new AbortController();
    setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: "", streaming: true }]);
    try {
      const r = await chatSend({ scopeIds: scope.ids, text, threadId }, (t) => patchLast((m) => ({ text: m.text + t })), ctrl.current.signal);
      setThreadId(r.threadId);
      patchLast(() => ({ streaming: false, citations: r.citations }));
    } catch (e) {
      patchLast(() => ({ streaming: false, error: (e as Error).message }));
    }
  };
  const retry = () => {
    const q = msgs.at(-2)?.text;
    if (!q) return;
    setMsgs((m) => m.slice(0, -2));
    ask(q);
  };

  const openThread = async (id: string) => {
    try {
      const stored = await chatThreadGet(id);
      setMsgs(stored.map((m) => ({ role: m.role, text: m.failed ? "" : m.content, citations: m.citations, error: m.failed ? m.content : undefined })));
      setThreadId(id);
    } catch (e) { setNote((e as Error).message); }
  };
  const remove = async (id: string, title: string) => {
    try { await chatThreadDelete(id); setNote(`Deleted "${title}".`); } catch (e) { setNote((e as Error).message); }
  };
  const fresh = () => { ctrl.current?.abort(); setMsgs([]); setThreadId(undefined); setNote(""); };

  const asked = useRef(false);
  useEffect(() => { if (first && !asked.current) { asked.current = true; ask(first); } }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]); // braces: Chromium's scrollIntoView returns a promise

  return (
    <SidePanel title="Ask" onClose={onClose}
      status={<>
        <span className="truncate text-xs text-muted">{scope.label}</span>
        {msgs.length > 0 && !streaming && <Button size="sm" variant="ghost" onClick={fresh}>New chat</Button>}
      </>}
      footer={<ChatBar scope={scope.label} streaming={streaming} onSend={ask} onStop={() => ctrl.current?.abort()} />}>
      {msgs.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">Put a question to {scope.ids === "all" ? "all your notes" : "this note"}. Answers come from your notes and transcripts only.</p>
          {(scope.ids === "all" || scope.ids.length > 1 ? [...ACROSS, ...SUGGESTIONS] : SUGGESTIONS).map((s) => <Button key={s} size="sm" onClick={() => ask(s)}>{s}</Button>)}
          {!!history.data?.length && (
            <section aria-labelledby="chat-earlier" className="mt-4 w-full">
              <h3 id="chat-earlier" className="mb-1 text-xs font-medium text-muted">Earlier chats here</h3>
              <ul className="flex flex-col">
                {history.data.map((t) => (
                  <li key={t.id} className="flex items-center gap-1">
                    <button type="button" onClick={() => openThread(t.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
                      <MessageSquare className="size-3.5 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{t.title || "Untitled chat"}</span>
                      <span className="shrink-0 text-xs text-muted">{dayLabel(t.updatedAt)}, {time(t.updatedAt)}</span>
                    </button>
                    <IconButton label={`Delete chat: ${t.title || "Untitled chat"}`} onClick={() => remove(t.id, t.title || "Untitled chat")}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p role="status" className="text-xs text-muted">{note}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4" aria-live="polite">
          {msgs.map((m, i) => (
            <ChatMessage key={i} role={m.role} streaming={m.streaming} citations={m.citations} error={m.error} onRetry={i === msgs.length - 1 ? retry : undefined}>
              <div className="whitespace-pre-wrap break-words">{m.text}</div>
            </ChatMessage>
          ))}
          <div ref={end} />
        </div>
      )}
    </SidePanel>
  );
}
