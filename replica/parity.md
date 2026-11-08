# Parity: meeting-notes clone vs Granola (desktop)

Date: 2026-11-08 (third run)  Build: ffd995b (branch replica-test)  Matrix: replica/features.csv
Previous runs: 46.0 at 9712960 and 43.3 at 9e8c1c0, same day.

## Scores

| score | now | second run | first run |
| --- | --- | --- | --- |
| Overall | 48.8 / 100 (feature score only; no layout score) | 46.0 | 43.3 |
| Feature | 48.8 (94 counted, 12 skipped on purpose, 15 of our own not scored) | 46.0 | 43.3 |
| Must-haves | 19 of 35 done (16 missing or partial) | 18 of 35 | 17 of 35 |
| Layout | not measured | not measured | not measured |
| Open bugs | none (9 found in three test rounds, all fixed; replica/bugs.md) | none | none |

What moved: S20 meeting notification (detect 0 to 27.8) and "capture only while a note is open", now done because capture always belongs to one note. Capture 48 to 60.

Layout is still not measured: replica/screens/ is empty, so imgdiff.py has nothing to compare against. To get a layout score, take 1440x900 screenshots of S05, S07, S08, S09, S10 and S19 from your own Granola account, in the same state as replica/clone-screens/, save them as replica/screens/S05.png and so on, then run:

```bash
mkdir -p replica/diffs
for s in S05 S07 S08 S09 S10 S19; do python3 ~/.claude/skills/replica-diff/imgdiff.py replica/screens/$s.png replica/clone-screens/$s.png --json > replica/diffs/$s.json; done
python3 ~/.claude/skills/replica-diff/parity.py replica/features.csv --visual replica/diffs/*.json --markdown
```

## By area, weakest first

0: recipes, briefs, consent, people, integrations, voice, settings (profile, troubleshooting), team.
Under 50: onboarding 19, detect 28, chat 33, platform 36.
50 to 80: calendar 50, organise 50, share 59, capture 60, notes 63, transcript 75, search 75, enhance 77, privacy 80.
85+: templates 86, home 100.

The screens are still ahead of the engine. Nine of the 16 open must-haves are built and only wait on one real run in the desktop app (mic, system audio, stop/resume, live transcript, note writing, chat x2, export, notification from a real calendar). Without that run they stay partial.

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
9. Meeting notification 1 min before an event (S20 built and seen in the desktop app with a test calendar; not yet fired from a real calendar; first two attempts showed nothing, cause unknown)
10. Generate notes from own notes plus transcript (Ollama never run here)
11. Rich text editor for own notes (plain textarea)
12. Permissions with recovery help (S03 built; real macOS prompts need a signed build)
13. Folders with icon (no icon)
14. Fast full-text search (FTS5 table unused)
15. Export all notes (markdown done and unit tested; no CSV; not run in the app)
16. Live streaming transcript (lags up to about 35 s)

## Behaviour differences

Source for "original": replica/recon.md and replica/fixes.md (public pages, help docs, reviews). The original was not walked click by click.

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
| F14 trash | 30-day trash | 30-day trash, typed confirm for delete forever, recording notes cannot be trashed | keep |
| F13 search | search across notes | ⌘K over titles, own notes, generated notes and transcripts | same job |

## Verdict

Not shippable. 16 of 35 must-haves are open; no open S1 or S2 bugs.

## Top five to build next

1. One real call through the desktop app: install Ollama, record mic plus system audio, stop, get notes, export, and let a real calendar meeting trigger the pop-up. Cheapest way to move up to 9 partial must-haves, or to find out which are broken. Needs you at the Mac.
2. Signed, notarised macOS build. Turns S03 from partial to done (real permission prompts), closes the macOS install must-have, and makes every capture test trustworthy.
3. Rich text editor for own notes (TipTap). One must-have, and the screen people use most.
4. Two small partials: FTS5 search (the table already exists) and folder icons. Cheap must-haves.
5. Auto-stop when the call ends, plus the S20 pop-up fixes (stacking, keyboard focus). Finishes the 1-click core loop.

Windows is a must-have in the matrix and not in this list. If milestone 1 is macOS only, mark it skip with that reason and the must-have count drops to 34.
