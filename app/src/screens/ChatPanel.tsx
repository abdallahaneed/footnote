// S10 chat: ask about one note, a folder, or all notes. Answers stream in and cite the notes they used.
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/base";
import { ChatBar, ChatMessage } from "../ui/notes";
import { SidePanel } from "../app/Layout";
import { chatSend } from "../data/api";

type Msg = { role: "user" | "assistant"; text: string; citations?: { label: string; href: string }[]; error?: string; streaming?: boolean };
const SUGGESTIONS = ["List the action items", "Draft a follow-up email", "What did we decide?"];

export function ChatPanel({ scope, first, onClose }: { scope: { ids: string[] | "all"; label: string }; first?: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const ctrl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const streaming = msgs.at(-1)?.streaming ?? false;

  const patchLast = (f: (m: Msg) => Partial<Msg>) => setMsgs((ms) => [...ms.slice(0, -1), { ...ms[ms.length - 1], ...f(ms[ms.length - 1]) }]);

  const ask = async (text: string) => {
    ctrl.current = new AbortController();
    setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: "", streaming: true }]);
    try {
      const { citations } = await chatSend({ scopeIds: scope.ids, text }, (t) => patchLast((m) => ({ text: m.text + t })), ctrl.current.signal);
      patchLast(() => ({ streaming: false, citations }));
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

  const asked = useRef(false);
  useEffect(() => { if (first && !asked.current) { asked.current = true; ask(first); } }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]); // braces: Chromium's scrollIntoView returns a promise

  return (
    <SidePanel title="Ask" status={<span className="truncate text-xs text-muted">{scope.label}</span>} onClose={onClose}
      footer={<ChatBar scope={scope.label} streaming={streaming} onSend={ask} onStop={() => ctrl.current?.abort()} />}>
      {msgs.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">Put a question to {scope.ids === "all" ? "all your notes" : "this note"}. Answers come from your notes and transcripts only.</p>
          {SUGGESTIONS.map((s) => <Button key={s} size="sm" onClick={() => ask(s)}>{s}</Button>)}
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
