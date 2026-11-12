// Routes for every screen in the recon inventory that is not built yet. Each says what it is and when it comes.
import { Construction } from "lucide-react";
import { Button, EmptyState } from "../ui/base";
import { Page } from "../app/Layout";
import { go } from "../app/router";

export type StubScreen = { id: string; path: string; name: string; purpose: string; when: string };

export const STUBS: StubScreen[] = [
  { id: "S01", path: "/welcome", name: "Welcome", purpose: "First launch. No account needed; explains that everything stays on this computer.", when: "Milestone 1, onboarding" },
  { id: "S04", path: "/welcome/sample", name: "Sample note", purpose: "A short sample meeting to show how notes come together.", when: "Could-have" },
  { id: "S14", path: "/share", name: "Share a note", purpose: "Invite people and set link access.", when: "Milestone 3, needs the sync server" },
  { id: "S15", path: "/locked", name: "No access", purpose: "Ask the owner for access to a shared note.", when: "Milestone 3, needs the sync server" },
  { id: "S16", path: "/people", name: "People", purpose: "Everyone you have met, from calendar invitees.", when: "Could-have" },
  { id: "S17", path: "/companies", name: "Companies", purpose: "Companies grouped by email domain.", when: "Could-have" },
  { id: "S18", path: "/people/:id", name: "Person", purpose: "All notes with one person, plus chat scoped to them.", when: "Could-have" },
  { id: "S21", path: "/preview/indicator", name: "Floating recording indicator", purpose: "Small pill on the screen edge while recording in the background.", when: "Should-have, separate always-on-top window" },
  { id: "S24", path: "/folder-share", name: "Folder sharing", purpose: "Members and link access for a folder.", when: "Milestone 3, needs the sync server" },
  { id: "S25", path: "/brief/:id", name: "Meeting brief", purpose: "What you discussed last time with the same people.", when: "Should-have" },
  { id: "S26", path: "/follow-up/:id", name: "Follow-up email", purpose: "A draft email to attendees after the meeting.", when: "Should-have (chat can already draft one)" },
  { id: "S27", path: "/settings/profile", name: "Settings: profile", purpose: "Your name, role and context for better notes.", when: "Should-have" },
  { id: "S29", path: "/settings/notifications", name: "Settings: notifications", purpose: "Which meeting pop-ups appear.", when: "Should-have" },
  { id: "S30", path: "/settings/workspace", name: "Settings: workspace", purpose: "Team name, members and roles.", when: "Milestone 3, needs the sync server" },
  { id: "S31", path: "/settings/spaces", name: "Settings: spaces", purpose: "Custom spaces for teams.", when: "Milestone 3, needs the sync server" },
  { id: "S32", path: "/settings/connectors", name: "Settings: connections", purpose: "Slack, Notion, webhooks and the local MCP server.", when: "Milestone 2" },
  { id: "S33", path: "/settings/troubleshooting", name: "Settings: troubleshooting", purpose: "Check microphone, models and disk, with a copyable report.", when: "Could-have" },
  { id: "S34", path: "/settings/billing", name: "Billing", purpose: "Not part of this app: it is free.", when: "Skipped" },
  { id: "S35", path: "/workspaces", name: "Workspace switcher", purpose: "Switch between or add workspaces.", when: "Milestone 3, needs the sync server" },
  { id: "S36", path: "/view/:id", name: "Web viewer", purpose: "Read a shared note in a browser.", when: "Milestone 3, needs the sync server" },
  { id: "S37", path: "/voice", name: "Voice typing", purpose: "Dictate into any app with a global shortcut.", when: "Should-have, port from Quietkey" },
  { id: "S38", path: "/post", name: "Send to a tool", purpose: "Post a note to Slack or Notion.", when: "Milestone 2" },
];

export function Stub({ s }: { s: StubScreen }) {
  return (
    <Page>
      <h1 className="mb-6 text-xl font-bold">{s.name}</h1>
      <EmptyState icon={<Construction className="size-6" />} title="Not built yet" body={`${s.purpose} Planned: ${s.when}. (${s.id})`}
        action={<Button onClick={() => go("/")}>Back to home</Button>} />
    </Page>
  );
}

export function NotFound() {
  return (
    <Page>
      <EmptyState icon={<Construction className="size-6" />} title="Nothing here" body="This page does not exist." action={<Button onClick={() => go("/")}>Back to home</Button>} />
    </Page>
  );
}
