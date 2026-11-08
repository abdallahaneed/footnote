import { useEffect, useState } from "react";
import { PanelLeft } from "lucide-react";
import { IconButton } from "../ui/base";
import { Home } from "../screens/Home";
import { NoteScreen } from "../screens/Note";
import { FolderScreen } from "../screens/Folder";
import { Trash } from "../screens/Trash";
import { Templates } from "../screens/Templates";
import { Calendars } from "../screens/Calendars";
import { Permissions } from "../screens/Permissions";
import { Settings } from "../screens/Settings";
import { MeetingPopup } from "../screens/MeetingPopup";
import { NotFound, STUBS, Stub } from "../screens/Stub";
import { Sidebar } from "./Sidebar";
import { Palette } from "./Palette";
import { match, useRoute } from "./router";

const wide = () => matchMedia("(min-width: 768px)").matches;

function Screen({ path }: { path: string }) {
  let m: Record<string, string> | null;
  if (path === "/") return <Home />;
  if ((m = match("/note/:id", path))) return <NoteScreen key={m.id} id={m.id} />;
  if ((m = match("/folder/:id", path))) return <FolderScreen key={m.id} id={m.id} />;
  if (path === "/trash") return <Trash />;
  if (path === "/templates") return <Templates />;
  if (path === "/welcome/calendar") return <Calendars />;
  if (path === "/welcome/audio") return <Permissions />;
  if (path === "/settings/preferences" || path === "/settings") return <Settings />;
  const stub = STUBS.find((s) => match(s.path, path));
  return stub ? <Stub s={stub} /> : <NotFound />;
}

export function App() {
  const path = useRoute();
  const toast = match("/toast/:id", path);
  return toast ? <MeetingPopup key={toast.id} eventId={toast.id} /> : <Main path={path} />;
}

function Main({ path }: { path: string }) {
  const [sidebar, setSidebar] = useState(wide);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k") { e.preventDefault(); setPalette((p) => !p); }
      if (k === "s") { e.preventDefault(); setSidebar((s) => !s); } // notes save on their own, so the shortcut is free
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);

  // S06: the sidebar gets out of the way when a note opens and comes back elsewhere; on narrow windows it closes after any navigation.
  useEffect(() => { setSidebar(!path.startsWith("/note/") && wide()); }, [path]);

  return (
    <div className="flex h-full">
      {sidebar && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" aria-hidden onClick={() => setSidebar(false)} />}
      {sidebar && <Sidebar path={path} onSearch={() => setPalette(true)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3" style={{ height: "var(--titlebar)" }}>
          <IconButton label={sidebar ? "Hide sidebar" : "Show sidebar"} aria-expanded={sidebar} onClick={() => setSidebar((s) => !s)}>
            <PanelLeft className="size-4" aria-hidden />
          </IconButton>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto"><Screen path={path} /></main>
      </div>
      <Palette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
