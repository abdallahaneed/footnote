# Parity: meeting-notes clone vs Granola (desktop)

Date: 2026-11-08 (second run)  Build: 9712960 (branch replica-test)  Matrix: replica/features.csv
Previous run: 43.3 at 9e8c1c0, same day.

## Scores

| score | now | first run |
| --- | --- | --- |
| Overall | 46.0 / 100 (feature score only; no layout score) | 43.3 |
| Feature | 46.0 (94 counted, 12 skipped on purpose, 15 of our own not scored) | 43.3 |
| Must-haves | 18 of 35 done (17 missing or partial) | 17 of 35 |
| Layout | not measured | not measured |
| Open bugs | none (8 found in two test rounds, all fixed; replica/bugs.md) | none |

What moved: S03 permissions (onboarding 0 to 18.8), S28 settings (audio retention and word list now done, privacy 50 to 80, transcript 69 to 75), Export all (share 46 to 59). Summary length, one of our own fixes, is done but not scored.

Layout is still not measured: replica/screens/ is empty, so imgdiff.py has nothing to compare against. To get a layout score, take 1440x900 screenshots of S05, S07, S08, S09, S10 and S19 from your own Granola account, in the same state as replica/clone-screens/, save them as replica/screens/S05.png and so on, then run:

```bash
mkdir -p replica/diffs
for s in S05 S07 S08 S09 S10 S19; do python3 ~/.claude/skills/replica-diff/imgdiff.py replica/screens/$s.png replica/clone-screens/$s.png --json > replica/diffs/$s.json; done
python3 ~/.claude/skills/replica-diff/parity.py replica/features.csv --visual replica/diffs/*.json --markdown
```

## By area, weakest first

0: recipes, briefs, detect, consent, people, integrations, voice, settings (profile, troubleshooting), team.
Under 50: onboarding 19, chat 33, platform 36, capture 48.
50 to 80: calendar 50, organise 50, share 59, notes 63, transcript 75, search 75, enhance 77, privacy 80.
85+: templates 86, home 100.

The screens are still ahead of the engine. Eight of the 17 open must-haves are built in Rust and only wait on one real run in the desktop app (mic, system audio, stop/resume, live transcript, note writing, chat x2, export). Without that run they stay partial.

## Open must-haves, in build order

Not started:
1. Capture only while a note is open
2. Meeting notification 1 min before an event (S20)
3. Windows 10/11 install
4. Signed, notarised macOS 14+ app

Partial:
5. Choose which calendars to sync (ICS links, no per-calendar picker)
6. Capture microphone audio (not tried with a real mic in the app)
7. Capture system audio (macOS done and tested with real playback; Windows not)
8. Stop and resume transcription (verified on fake capture only)
9. Chat across all meetings (keyword retrieval, no embeddings)
10. Chat with one meeting (same)
11. Generate notes from own notes plus transcript (Ollama never run here)
12. Rich text editor for own notes (plain textarea)
13. Permissions with recovery help (S03 built; real macOS prompts need a signed build)
14. Folders with icon (no icon)
15. Fast full-text search (FTS5 table unused)
16. Export all notes (markdown done and unit tested; no CSV; not run in the app)
17. Live streaming transcript (lags up to about 35 s)

## Behaviour differences

Source for "original": replica/recon.md and replica/fixes.md (public pages, help docs, reviews). The original was not walked click by click.

| flow | original does | clone does | fix or keep |
| --- | --- | --- | --- |
| F02 core loop | 1 click: notification "Take Notes" opens the call and starts capture; auto-stops when the call ends | 3 clicks plus a manual stop: Home, meeting row, Start recording, then Stop | fix: S20 notification and auto-stop |
| F01 first run | sign-in with Google or Microsoft required (6 reviews hate it), then OS permission prompts | no account; S03 asks for mic and system audio, explains a denial and opens the right System Settings pane | keep |
| F02 failure | transcript or upload can fail silently and the meeting is lost (strongest complaint, 10 reviews) | per-note status, error with the reason, Try again, crash-safe 30 s segments, finishes after a crash or reload | keep |
| F02 live transcript | streams in near real time | arrives per 30 s segment, up to about 35 s behind | fix: shorter segments or streaming whisper |
| F09 generated notes | AI text, no way to check a line (5 reviews) | every line cites transcript timestamps; own text marked | keep; audio playback behind the citation still missing |
| privacy | audio deleted, transcript in the cloud | everything on device; you pick delete after transcript, 7 days, 30 days or forever | keep; the setting says that "Transcribe again" needs kept audio |
| export | CSV export, behind a paid plan per review complaints (fixes.md #6) | free: one markdown file per note into Documents; no CSV | keep, add CSV only if asked |
| settings | applied as you change them | save on their own after a short pause and when you leave (changed in test round 2 after an explicit Save lost changes) | same job |
| F06/F07 chat | history kept, model picker, rewrite into note | history lost when the panel closes, one model, no rewrite | fix: chat history first |
| F10 share | link with viewer/collaborator roles, web viewer | Copy as Markdown, Email to attendees (mailto draft) | keep for milestone 1; links need a server |
| F14 trash | 30-day trash | 30-day trash, typed confirm for delete forever, recording notes cannot be trashed | keep |
| F13 search | search across notes | ⌘K over titles, own notes, generated notes and transcripts | same job |

## Verdict

Not shippable. 17 of 35 must-haves are open; no open S1 or S2 bugs.

## Top five to build next

1. One real call through the desktop app: install Ollama, record mic plus system audio, stop, get notes, export. This is the cheapest way to move up to 8 partial must-haves, or to find out which ones are broken. It is also the manual pass in test-plan.md. I can't do it from here; it needs you at the Mac.
2. Signed, notarised macOS build. Turns S03 from partial to done (real permission prompts), closes the macOS install must-have, and makes every capture test trustworthy.
3. Meeting notification (S20) plus "capture only while a note is open" plus auto-stop. Two must-haves, and the core flow goes from 3 clicks to 1.
4. Rich text editor for own notes (TipTap). One must-have, and the screen people use most.
5. Two small partials: FTS5 search (the table already exists) and folder icons. Cheap must-haves.

Windows is a must-have in the matrix and not in this list. If milestone 1 is macOS only, mark it skip with that reason and the must-have count drops to 34.
