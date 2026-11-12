# Parity: Footnote vs Granola (desktop)

Date: 2026-11-12 (fifth run)  Build: 15212fc (master)  Matrix: replica/features.csv
Previous runs: 49.5 at 347327b, 48.8 at ffd995b, 46.0 at 9712960, 43.3 at 9e8c1c0 (all 2026-11-08).

## Scores

| score | now | fourth | third | second | first |
| --- | --- | --- | --- | --- | --- |
| Overall | 51.0 / 100 (feature score only; no layout score) | 49.5 | 48.8 | 46.0 | 43.3 |
| Feature | 51.0 (94 counted, 12 skipped on purpose, 15 of our own not scored) | 49.5 | 48.8 | 46.0 | 43.3 |
| Must-haves | 22 of 35 done (13 missing or partial) | 20 | 19 | 18 | 17 |
| Layout vs Granola | not measured | not measured | not measured | not measured | not measured |
| Open bugs | none (12 found in five test rounds, all fixed; replica/bugs.md) | none | none | none | none |

What moved: folder icons and FTS5 full-text search are done, so organise went from 50 to 60 and search from 75 to 100. The brand and launch commits since then did not change any feature.

## Layout against Granola

Still not measured: replica/screens/ is empty. To get a layout score, take 1440x900 screenshots of S05, S07, S08, S09, S10 and S19 from your own Granola account, in the same state as replica/clone-screens/, save them as replica/screens/S05.png and so on, then run:

```bash
mkdir -p replica/diffs
for s in S05 S07 S08 S09 S10 S19; do python3 ~/.claude/skills/replica-diff/imgdiff.py replica/screens/$s.png replica/clone-screens/$s.png --json > replica/diffs/$s.json; done
python3 ~/.claude/skills/replica-diff/parity.py replica/features.csv --visual replica/diffs/*.json --markdown
```

The rebrand to ink indigo does not count against the layout score; it compares edges, not colour.

## By area, weakest first

0: recipes, briefs, consent, people, integrations, voice, settings (profile, troubleshooting), team.
Under 50: onboarding 19, detect 28, chat 33, platform 36.
50 to 80: calendar 50, share 59, organise 60, capture 60, notes 75, transcript 75, enhance 77, privacy 80.
85+: templates 86, home 100, search 100.

Nine of the 13 open must-haves are built and only wait on one real run in the desktop app (mic, stop/resume, live transcript, note writing, chat x2, export, notification from a real calendar, permissions). Without that run they stay partial. Ollama is still not installed on this Mac.

## Open must-haves, in build order

Not started:
1. Windows 10/11 install
2. Signed, notarised macOS 14+ app

Partial:
3. Choose which calendars to sync (ICS links, no per-calendar picker)
4. Capture microphone audio (not tried with a real mic in the app)
5. Capture system audio (macOS done and tested with real playback; Windows not)
6. Stop and resume transcription (verified on fake capture only)
7. Chat across all meetings (keyword retrieval, no embeddings)
8. Chat with one meeting (same)
9. Meeting notification 1 min before an event (not yet fired from a real calendar)
10. Generate notes from own notes plus transcript (Ollama never run here)
11. Permissions with recovery help (real macOS prompts need a signed build)
12. Export all notes (markdown done and unit tested; no CSV; not run in the app)
13. Live streaming transcript (lags up to about 35 s)

## Behaviour differences

Source for "original": replica/recon.md and replica/fixes.md (public pages, help docs, reviews). The original was not walked click by click. Unchanged since the fourth run.

| flow | original does | clone does | fix or keep |
| --- | --- | --- | --- |
| F02 core loop | 1 click: notification "Take Notes" opens the call and starts capture; auto-stops when the call ends | 1 click: S20 "Start notes" opens the note, records, opens the call link; manual Stop at the end | fix: auto-stop when the call ends |
| S20 pop-up | one notification per meeting | pop-ups a minute apart overlap; no keyboard access because the window opens without focus | fix both |
| F01 first run | sign-in with Google or Microsoft required (6 reviews hate it), then OS permission prompts | no account; S03 asks for mic and system audio, explains a denial and opens the right System Settings pane | keep |
| F02 failure | transcript or upload can fail silently and the meeting is lost (strongest complaint, 10 reviews) | per-note status, error with the reason, Try again, crash-safe 30 s segments, finishes after a crash or reload | keep |
| F02 live transcript | streams in near real time | arrives per 30 s segment, up to about 35 s behind | fix: shorter segments or streaming whisper |
| F09 generated notes | AI text, no way to check a line (5 reviews) | every line cites transcript timestamps; own text marked | keep; audio playback behind the citation still missing |
| privacy | audio deleted, transcript in the cloud | everything on device; you pick delete after transcript, 7 days, 30 days or forever | keep; the setting says that "Transcribe again" needs kept audio |
| export | CSV export, behind a paid plan per review complaints (fixes.md #6) | free: one markdown file per note into Documents; no CSV | keep, add CSV only if asked |
| settings | applied as you change them | save on their own after a short pause and when you leave (changed in test round 2 after an explicit Save lost changes) | same job |
| F06/F07 chat | history kept, model picker, rewrite into note | history lost when the panel closes, one model, no rewrite | fix: chat history first |
| F10 share | link with viewer/collaborator roles, web viewer | Copy as Markdown, Email to attendees (mailto draft) | keep for milestone 1; links need a server |
| F03 own notes | rich text, synced to the cloud as you type | rich text with Markdown shortcuts, stored as Markdown on device; saves after a pause, on leaving, on refresh and when the window hides | keep; check the window-close save in the desktop app (test-plan.md manual item 7) |
| F14 trash | 30-day trash | 30-day trash, typed confirm for delete forever, recording notes cannot be trashed | keep |
| F13 search | search across notes | Cmd+K over titles, own notes, generated notes and transcripts, on FTS5 | same job |

## Verdict

Not shippable. 13 of 35 must-haves are open; no open S1 or S2 bugs.

## Top five to build next

1. One real call through the desktop app: install Ollama, record mic plus system audio, stop, get notes, export, let a real calendar meeting trigger the pop-up, and try the editor (dead keys, Cmd+Q right after typing). Can move up to 9 partial must-haves. Needs you at the Mac.
2. Signed, notarised macOS build. Closes the macOS install must-have and turns S03 permissions from partial to done.
3. Auto-stop when the call ends, plus the S20 pop-up fixes (stacking, keyboard focus). Finishes the 1-click core loop.
4. Per-calendar picker in S02. Closes the calendar must-have.
5. Shorter transcript segments (about 10 s) so the live transcript stops lagging 35 s. Closes the live transcript must-have once the real run passes.

Windows is a must-have in the matrix and not in this list. If milestone 1 is macOS only, mark it skip with that reason and the must-have count drops to 34.
