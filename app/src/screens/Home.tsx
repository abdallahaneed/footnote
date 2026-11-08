// S05 home: upcoming meetings for the next 14 days, all notes, new note, ask across all notes.
import { useRef, useState } from "react";
import { NotebookPen, Plus } from "lucide-react";
import { Button, EmptyState, PageHeader, SkeletonRows } from "../ui/base";
import { ChatBar, MeetingRow } from "../ui/notes";
import { LoadError, Page, WithPanel } from "../app/Layout";
import { go } from "../app/router";
import { calendarUpcoming, foldersTree, noteCreate, noteOpenForEvent, notesList } from "../data/api";
import { useLive } from "../data/store";
import { dayLabel, groupBy, time } from "../data/format";
import { NoteList } from "./NoteList";
import { ChatPanel } from "./ChatPanel";

export function Home() {
  const events = useLive(() => calendarUpcoming(), []);
  const notes = useLive(() => notesList(), []);
  const folders = useLive(() => foldersTree(), []);
  const [chat, setChat] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const open = (p: Promise<{ id: string }>) => p.then((n) => go(`/note/${n.id}`), (e: Error) => setError(e.message));
  const creating = useRef(false); // a double click would otherwise create two notes
  const newNote = () => { if (creating.current) return; creating.current = true; open(noteCreate()).finally(() => { creating.current = false; }); };
  const now = Date.now();

  return (
    <WithPanel panel={chat !== null && <ChatPanel scope={{ ids: "all", label: "All notes" }} first={chat} onClose={() => setChat(null)} />}>
      <Page>
        <PageHeader title="Home" actions={<Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={newNote}>New note</Button>} />
        {error && <div className="mb-4"><LoadError message={error} onRetry={() => setError(undefined)} /></div>}

        <section aria-labelledby="upcoming-h" className="mb-8">
          <h2 id="upcoming-h" className="mb-1 text-sm font-semibold text-muted">Upcoming</h2>
          {events.loading ? <SkeletonRows n={2} />
            : events.error ? <LoadError message={events.error} onRetry={events.retry} />
            : !events.data?.length ? <p className="px-2 py-3 text-sm text-muted">No meetings in the next two weeks. <a href="#/welcome/calendar" className="text-accent underline underline-offset-2">Connect a calendar</a></p>
            : groupBy(events.data, (e) => dayLabel(e.startAt)).map(([day, list]) => (
              <section key={day} aria-label={`Meetings ${day}`}>
                <h3 className="px-2 pb-1 pt-2 text-xs font-semibold text-muted">{day}</h3>
                {list.map((e) => (
                  <MeetingRow key={e.id} start={time(e.startAt)} end={time(e.endAt)} title={e.title}
                    attendees={e.invitees.map((p) => p.name.split(" ")[0]).join(", ")}
                    external={e.invitees.some((p) => !p.email.endsWith("@northwind.test"))}
                    live={e.startAt <= now && now < e.endAt} onOpen={() => open(noteOpenForEvent(e.id))} />
                ))}
              </section>
            ))}
        </section>

        <section aria-labelledby="notes-h">
          <h2 id="notes-h" className="mb-1 text-sm font-semibold text-muted">Notes</h2>
          <NoteList notes={notes} folders={folders.data ?? []} empty={
            <EmptyState icon={<NotebookPen className="size-6" />} title="No notes yet"
              body="Open a meeting above or start a blank note. Everything stays on this computer."
              action={<Button onClick={newNote}>New note</Button>} />
          } />
        </section>
      </Page>
      {chat === null && (
        <div className="sticky bottom-0 mt-auto bg-bg px-4 pb-4 pt-2 md:px-6">
          <div className="mx-auto max-w-[var(--content-max)]"><ChatBar scope="All notes" onSend={setChat} onStop={() => {}} /></div>
        </div>
      )}
    </WithPanel>
  );
}
