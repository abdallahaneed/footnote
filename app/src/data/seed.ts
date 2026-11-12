// Seed data, all written for this clone. Times are relative to "now" so Upcoming always has something to show.
import { generate } from "./generate";
import type { DB, Note, Person, Segment, Template } from "./types";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

export const TEMPLATES: Template[] = [
  { id: "t-standard", name: "Standard meeting", description: "Works for most calls.", builtIn: true, sections: [
    { heading: "Summary", instructions: "The main points in a few lines." },
    { heading: "Decisions", instructions: "What was agreed, and by whom." },
    { heading: "Next steps", instructions: "Who does what, and by when." },
  ] },
  { id: "t-one-on-one", name: "One-on-one", description: "Regular check-ins with one person.", builtIn: true, sections: [
    { heading: "How things are going", instructions: "Mood, workload, wins." },
    { heading: "Topics", instructions: "What we talked through." },
    { heading: "Follow-ups", instructions: "What each of us will do." },
  ] },
  { id: "t-customer", name: "Customer conversation", description: "Sales, support or discovery calls.", builtIn: true, sections: [
    { heading: "Their situation", instructions: "Context about the customer." },
    { heading: "Problems raised", instructions: "Pain points in their words." },
    { heading: "What we promised", instructions: "Commitments from our side." },
  ] },
  { id: "t-standup", name: "Stand-up", description: "Short daily team sync.", builtIn: true, sections: [
    { heading: "Done", instructions: "Finished since last time." },
    { heading: "Up next", instructions: "Planned for today." },
    { heading: "Blockers", instructions: "Anything in the way." },
  ] },
  // Same text as src-tauri/migrations/0003_interviews.sql.
  { id: "t-interview", name: "Job interview", description: "What they asked, what you answered, and what to prepare next time.", builtIn: true, sections: [
    { heading: "Questions and my answers", instructions: "One bullet per question the interviewer (Them) asked, in order: the question in their words, then what I (Me) answered, briefly." },
    { heading: "Questions I asked", instructions: "What I asked them and what they answered." },
    { heading: "About the role and company", instructions: "Facts they shared: team, tasks, tools, salary, location, hiring process, people named." },
    { heading: "Next steps", instructions: "What happens next, who contacts whom, and dates." },
    { heading: "Prepare better next time", instructions: "Questions where my answer was vague, short or missing, and what I should prepare. Only from the transcript." },
  ] },
];

const P: Record<string, Person> = {
  mara: { name: "Mara Okafor", email: "mara@northwind.test" },
  jonas: { name: "Jonas Weber", email: "jonas@northwind.test" },
  sam: { name: "Sam Iqbal", email: "sam@northwind.test" },
  lena: { name: "Lena Brandt", email: "lena@brandt-supply.test" },
};

type Line = ["me" | "them", string];

function past(id: string, title: string, at: number, mins: number, who: Person[], lines: Line[], own: string, folderIds: string[], extra: Partial<Note> = {}) {
  const step = (mins * MIN) / lines.length;
  const segments: Segment[] = lines.map(([side, text], i) => ({
    id: `${id}-s${i}`, noteId: id, side, speaker: side === "me" ? "You" : who[0].name, startMs: i * step, endMs: (i + 1) * step, text,
  }));
  const note: Note = {
    id, title, attendees: who, createdAt: at, updatedAt: at + mins * MIN, recordedMs: mins * MIN,
    ownText: own, templateId: TEMPLATES[0].id, status: "done", generated: generate(TEMPLATES[0], own, segments), folderIds, ...extra,
  };
  return { note, segments };
}

export function seed(now: number): DB {
  const q = Math.floor(now / (15 * MIN)) * 15 * MIN;
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const at = (days: number, h: number, m = 0) => d.getTime() + days * DAY + h * HOUR + m * MIN;

  const hiring = past("n-hiring", "Hiring sync", at(-1, 11), 30, [P.sam], [
    ["them", "We have three candidates left for the backend role."],
    ["me", "I liked the second one most, she asked good questions about our data model."],
    ["them", "Agreed. Let's invite her for the final round."],
    ["me", "I'll schedule it for next Tuesday and send her the take-home task."],
    ["them", "I will check references on Monday."],
  ], "backend role: 3 left\nsecond candidate strongest", ["f-hiring"]);

  const roadmap = past("n-roadmap", "Roadmap check-in", at(-4, 15), 25, [P.mara], [
    ["them", "The export feature slipped by a week."],
    ["me", "That's fine as long as the markdown mirror ships with it."],
    ["them", "We decided to drop the PDF option for now."],
    ["me", "I'll update the roadmap page today."],
  ], "", ["f-product"]);

  const vendor = past("n-vendor", "Vendor onboarding", at(-6, 9, 30), 20, [P.lena], [
    ["them", "Our invoices go out on the first of each month."],
    ["me", "Can you send them as PDF to our finance inbox?"],
    ["them", "Yes, I'll set that up this week."],
  ], "", [], { status: "failed", generated: undefined, error: "Could not reach Groq. Check your internet connection, then try again." });

  const scratch = past("n-scratch", "Mic test", at(-9, 17), 1, [P.jonas], [["me", "Testing, one two."]], "", [], { deletedAt: now - 2 * DAY });

  return {
    events: [
      { id: "e-planning", title: "Weekly planning", startAt: q - 15 * MIN, endAt: q + 30 * MIN, invitees: [P.mara, P.jonas], videoLink: "https://meet.example.test/planning" },
      { id: "e-supplier", title: "Supplier call", startAt: q + 3 * HOUR, endAt: q + 3 * HOUR + 45 * MIN, invitees: [P.lena] },
      { id: "e-design", title: "Design review", startAt: at(1, 10), endAt: at(1, 11), invitees: [P.mara, P.sam] },
      { id: "e-quarterly", title: "Quarterly planning with the regional sales and marketing leads", startAt: at(3, 14), endAt: at(3, 15, 30), invitees: [P.jonas, P.sam, P.mara] },
    ],
    notes: [hiring.note, roadmap.note, vendor.note, scratch.note],
    segments: [...hiring.segments, ...roadmap.segments, ...vendor.segments, ...scratch.segments],
    templates: structuredClone(TEMPLATES),
    folders: [
      { id: "f-hiring", name: "Hiring", description: "Interviews and debriefs for open roles.", icon: "users" },
      { id: "f-product", name: "Product", description: "Roadmap, releases and reviews.", icon: "rocket" },
    ],
  };
}
