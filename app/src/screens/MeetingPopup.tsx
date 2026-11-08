// S20 meeting notification. In the app this page fills a small always-on-top window the core opens a minute before a
// meeting with two or more people (src-tauri/src/notify.rs). In a browser it is a plain page at #/toast/<event id>.
import { useState } from "react";
import { Banner, Button, SkeletonRows } from "../ui/base";
import { MeetingToast } from "../ui/notes";
import { go } from "../app/router";
import { calendarUpcoming, isDesktop, meetingDismiss, meetingTakeNotes } from "../data/api";
import { useLive } from "../data/store";
import { time } from "../data/format";

export function MeetingPopup({ eventId }: { eventId: string }) {
  const events = useLive(() => calendarUpcoming(1), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ev = events.data?.find((e) => e.id === eventId);
  const close = () => (isDesktop ? meetingDismiss() : Promise.resolve(go("/")));
  const take = async () => {
    if (busy) return; // one click, one recording
    setBusy(true);
    try {
      const id = await meetingTakeNotes(eventId);
      if (!isDesktop) go(`/note/${id}`); // the app closes this window and moves the main one itself
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-full flex-col gap-2 bg-bg p-2">
      {events.loading && !events.data ? <SkeletonRows n={1} />
        : events.error ? <Banner tone="error" action={<Button size="sm" onClick={events.retry}>Try again</Button>}>{events.error}</Banner>
        : !ev ? <Banner tone="info" action={<Button size="sm" onClick={close}>Close</Button>}>This meeting is no longer in your calendar.</Banner>
        : <MeetingToast kind="calendar" title={ev.title} onTakeNotes={take} onDismiss={close}
            detail={`${time(ev.startAt)} · ${ev.invitees.map((p) => p.name.split(" ")[0]).join(", ")}`} />}
      {error && <Banner tone="error">{error}</Banner>}
    </main>
  );
}
