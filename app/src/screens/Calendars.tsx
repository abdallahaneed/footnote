// S02 connect a calendar: an ICS link, no account. Sync runs in the background every 5 minutes. Each calendar can be
// switched off without removing it: its meetings and pop-ups stop, and come back when it is on again.
import { useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
import { Banner, Button, EmptyState, IconButton, PageHeader, SkeletonRows, Switch, TextInput } from "../ui/base";
import { LoadError, Page } from "../app/Layout";
import { calendarAddSource, calendarSourceDelete, calendarSourceSetEnabled, calendarSourcesList } from "../data/api";
import { useLive } from "../data/store";
import { dayLabel, time } from "../data/format";

export function Calendars() {
  const list = useLive(() => calendarSourcesList(), []);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    const sent = url;
    // clear only what was added: a second link typed while the first was being added stays in the box
    try { await calendarAddSource(sent); setUrl((cur) => (cur === sent ? "" : cur)); setError(undefined); } catch (e) { setError(String((e as Error).message ?? e)); }
    setBusy(false);
  };
  return (
    <Page>
      <PageHeader title="Calendars" description="Your meetings show up on Home. Nothing is sent anywhere; the link is read from this computer." />
      <form className="mb-6 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <TextInput label="Calendar link (ICS)" placeholder="https://… or webcal://…" value={url} error={error} onChange={(e) => setUrl(e.target.value)} />
        <p className="text-sm text-muted">Google Calendar: Settings, your calendar, “Secret address in iCal format”. Outlook: Settings, Calendar, Shared calendars, Publish. Apple Calendar: share the calendar publicly and copy the link.</p>
        <Button type="submit" variant="primary" loading={busy} disabled={!url.trim()} className="self-start">Add calendar</Button>
      </form>
      {list.loading ? <SkeletonRows n={2} />
        : list.error ? <LoadError message={list.error} onRetry={list.retry} />
        : !list.data?.length ? <EmptyState icon={<CalendarDays className="size-6" />} title="No calendars yet" body="Add a link above. You can also take notes without one." />
        : (
          <ul className="flex flex-col gap-2">
            {list.data.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3">
                <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1 [&_label]:[overflow-wrap:anywhere]">
                  <Switch label={s.label} checked={s.enabled}
                    onChange={(on) => calendarSourceSetEnabled(s.id, on).catch((e: Error) => setError(e.message))}
                    description={!s.enabled ? "Off: its meetings and pop-ups are hidden."
                      : s.lastSyncAt ? `${s.events} meetings · synced ${dayLabel(s.lastSyncAt).toLowerCase()} ${time(s.lastSyncAt)}` : "Syncing…"} />
                  {s.lastError && s.enabled && <div className="mb-3"><Banner tone="warning">{s.lastError}</Banner></div>}
                </div>
                <IconButton label={`Remove ${s.label}`} onClick={() => calendarSourceDelete(s.id).catch((e: Error) => setError(e.message))}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
    </Page>
  );
}
