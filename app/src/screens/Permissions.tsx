// S03 microphone and system audio. Asks for each, and when macOS has said no, sends the user to the right System Settings pane.
import { useEffect, useState } from "react";
import { Banner, Button, PageHeader, PermissionRow, SkeletonRows } from "../ui/base";
import { LoadError, Page } from "../app/Layout";
import { go } from "../app/router";
import { PRIVACY_PANE, openExternal, permissionRequest, permissionsGet } from "../data/api";
import { useLive } from "../data/store";
import type { Permission } from "../data/types";

const ROWS = [
  { kind: "mic", key: "mic", title: "Microphone", body: "Your side of the conversation." },
  { kind: "system_audio", key: "systemAudio", title: "System audio", body: "The other side: whatever Zoom, Teams, Meet or a browser plays. No bot joins the call." },
] as const;

export function Permissions() {
  const p = useLive(() => permissionsGet(), []);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  // coming back from System Settings: check again
  useEffect(() => { const f = () => p.retry(); addEventListener("focus", f); return () => removeEventListener("focus", f); }, []);

  const allow = async (kind: "mic" | "system_audio", state: Permission) => {
    setError(undefined);
    // macOS shows its prompt once; after a no, only System Settings can change it
    if (state === "denied" && asked.has(kind)) return openExternal(PRIVACY_PANE[kind]).catch((e: Error) => setError(e.message));
    try { await permissionRequest(kind); } catch (e) { setError(String((e as Error).message ?? e)); }
    setAsked((s) => new Set(s).add(kind));
    p.retry();
  };

  return (
    <Page>
      <PageHeader title="Microphone and system audio" description="Both stay on this computer. Audio is turned into text here and then deleted, unless you choose to keep it in Settings." />
      {error && <div className="mb-4"><LoadError message={error} onRetry={() => setError(undefined)} /></div>}
      {p.loading && !p.data ? <SkeletonRows n={2} />
        : p.error ? <LoadError message={p.error} onRetry={p.retry} />
        : p.data && (
          <div className="flex flex-col gap-3">
            {ROWS.map((r) => {
              const state = p.data![r.key];
              const blocked = state === "denied" && asked.has(r.kind);
              return (
                <div key={r.kind} className="flex flex-col gap-2">
                  <PermissionRow title={r.title} body={r.body} granted={state === "granted"} onAllow={() => allow(r.kind, state)} />
                  {blocked && (
                    <Banner tone="warning" action={<Button size="sm" onClick={() => openExternal(PRIVACY_PANE[r.kind])}>Open System Settings</Button>}>
                      macOS is blocking {r.title.toLowerCase()}. Turn this app on under Privacy & Security, {r.kind === "mic" ? "Microphone" : "Screen & System Audio Recording"}. macOS may ask you to quit and reopen the app.
                    </Banner>
                  )}
                </div>
              );
            })}
            {p.data.mic === "granted" && p.data.systemAudio !== "granted" && (
              <p className="text-sm text-muted">You can start without system audio. Only your side of the call will be in the transcript.</p>
            )}
            <div className="mt-4 flex gap-2">
              <Button variant="primary" disabled={p.data.mic !== "granted"} onClick={() => go("/")}>Continue</Button>
              <Button variant="ghost" onClick={() => go("/welcome/calendar")}>Connect a calendar</Button>
            </div>
            {p.data.mic !== "granted" && <p className="text-sm text-muted">Allow the microphone to continue. Without it there is nothing to transcribe.</p>}
          </div>
        )}
    </Page>
  );
}
