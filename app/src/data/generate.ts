import type { GenLine, Segment, Template } from "./types";

// Stand-in for the local LLM step (enhance job). Sorts transcript lines into the template's sections by keyword
// and keeps each line's source segment. shortcut: keyword rules, replaced by the Ollama map-reduce in /replica-backend.
export const COMMIT = /\b(i'll|i will|we'll|she'll|he'll|they'll|will (send|check|set|ask)|by (monday|tuesday|wednesday|thursday|friday))\b/i;
const DECIDE = /\b(let's|agreed?|decided?|aiming|owns?|does)\b/i;
const tidy = (t: string) => t.replace(/^(yes|good|ok(ay)?|mostly|so|well|agreed)[,.]?\s+/i, "").replace(/^\w/, (c) => c.toUpperCase());

// Own notes are Markdown; search and the stand-in want the words only. Same rules as notes.rs md_plain.
export const mdPlain = (md: string) =>
  md.split("\n").map((l) => l.replace(/^\s*(#+|[-*•+]|\d+[.)]|>)\s+/, "").replace(/\*\*|__|`/g, "").replace(/\\$/, "").trim()).join("\n");

export function generate(t: Template, ownText: string, segs: Segment[]): GenLine[] {
  const buckets: GenLine[][] = t.sections.map(() => []);
  const last = buckets.length - 1;
  const mid = Math.min(1, last);
  for (const line of ownText.split("\n")) {
    const l = mdPlain(line);
    if (l) buckets[0].push({ kind: "own", text: l });
  }
  for (const s of segs) {
    if (s.deleted || s.text.trim().endsWith("?")) continue;
    const i = COMMIT.test(s.text) ? last : DECIDE.test(s.text) ? mid : 0;
    buckets[i].push({ kind: "ai", text: tidy(s.text), segIds: [s.id] });
  }
  return t.sections.flatMap((sec, i): GenLine[] => [
    { kind: "heading", text: sec.heading },
    ...(buckets[i].length ? buckets[i] : [{ kind: "ai", text: "Nothing came up on this.", segIds: [] } as GenLine]),
  ]);
}

export function toMarkdown(title: string, lines: GenLine[]) {
  return [`# ${title}`, ...lines.map((l) => (l.kind === "heading" ? `\n## ${l.text}` : `- ${l.text}`))].join("\n");
}
