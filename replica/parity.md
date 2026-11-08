# Parity: meeting-notes clone vs Granola (desktop)

Date: 2026-11-08  Build: 9e8c1c0 (branch replica-test)  Matrix: replica/features.csv (updated in dd0bbe2)

## Scores

| score | value |
| --- | --- |
| Overall | 43.3 / 100 (feature score only; no layout score, see below) |
| Feature | 43.3 (94 features counted, 12 skipped on purpose, 15 of our own not scored) |
| Must-haves | 17 of 35 done (18 missing or partial) |
| Layout | not measured |
| Open bugs | none (S1 0, S2 0; four fixed today, replica/bugs.md) |

Layout was not measured because replica/screens/ is empty. No screenshots of the original exist, so imgdiff.py has nothing to compare against. To get a layout score, take 1440x900 screenshots of S05, S07, S08, S09, S10 and S19 from your own Granola account, in the same state as the clone's (replica/clone-screens/), save them as replica/screens/S05.png and so on, then run:

```bash
mkdir -p replica/diffs
for s in S05 S07 S08 S09 S10 S19; do python3 ~/.claude/skills/replica-diff/imgdiff.py replica/screens/$s.png replica/clone-screens/$s.png --json > replica/diffs/$s.json; done
python3 ~/.claude/skills/replica-diff/parity.py replica/features.csv --visual replica/diffs/*.json --markdown
```

## By area, weakest first

0: onboarding, recipes, briefs, detect, consent, people, integrations, voice, settings, team.
33-50: chat 33, platform 36, share 46, capture 48, calendar 50, privacy 50, organise 50.
60+: notes 63, transcript 69, search 75, enhance 77, templates 86, home 100.

The screens are ahead of the engine. Home, templates, trash, folders and search are close to done. Capture, transcription, note writing and chat are built in Rust but marked partial because none of them has been run end to end in the desktop app with a real mic, a real call and Ollama installed.

## Missing must-haves, in build order

1. Capture only while a note is open (no)
2. Meeting notification 1 min before an event (S20, no)
3. Mic and system audio permission flow with recovery help (S03, no)
4. Windows 10/11 install (no)
5. Signed, notarised macOS 14+ app (no)
6. Export all notes as markdown / CSV (no)
7. Choose which calendars to sync (partial: ICS links, no per-calendar picker)
8. Capture microphone audio (partial: not yet tried with a real mic in the app)
9. Capture system audio (partial: macOS done, Windows not)
10. Stop and resume transcription (partial: verified on fake capture only)
11. Chat across all meetings (partial: keyword retrieval, no embeddings)
12. Chat with one meeting (partial: same)
13. Generate notes from own notes plus transcript (partial: Ollama never run here)
14. Rich text editor for own notes (partial: plain textarea)
15. Folders with icon (partial: no icon)
16. Audio on device, keep or delete setting (partial: no settings screen)
17. Fast full-text search (partial: FTS5 table unused)
18. Live streaming transcript (partial: lags up to about 35 s)

The full should/could list comes from `python3 ~/.claude/skills/replica-diff/parity.py replica/features.csv`.

## Behaviour differences

Source for "original": replica/recon.md and replica/fixes.md (public pages, help docs, reviews). The original was not walked click by click in this run.

| flow | original does | clone does | fix or keep |
| --- | --- | --- | --- |
| F02 core loop | 1 click: notification "Take Notes" opens the call and starts capture; auto-stops when the call ends | 3 clicks plus a manual stop: Home, meeting row, Start recording, then Stop | fix: S20 notification and auto-stop |
| F01 first run | sign-in with Google or Microsoft required (6 reviews hate it) | no account, starts straight on home | keep, it's a selling point |
| F02 failure | transcript or upload can fail silently and the meeting is lost (strongest complaint, 10 reviews) | per-note pipeline status, error with the reason, Try again, crash-safe 30 s segments, finishes after a crash or reload | keep |
| F02 live transcript | streams in near real time | arrives per 30 s segment, up to about 35 s behind | fix: shorter segments or streaming whisper |
| F09 generated notes | AI text, no way to check a line (5 reviews) | every line cites transcript timestamps; own text marked | keep; audio playback behind the citation still missing |
| privacy | audio deleted, transcript kept in the cloud | audio deleted after transcription by default, all on device | keep; "Transcribe again" only works while audio is kept, say so in the UI |
| F06/F07 chat | history kept, model picker, rewrite into note | history lost when the panel closes, one model, no rewrite | fix: chat history first |
| F10 share | link with viewer/collaborator roles, web viewer | Copy as Markdown, Email to attendees (mailto draft) | keep for milestone 1; links need a server |
| F14 trash | 30-day trash | 30-day trash, typed confirm for delete forever, recording notes cannot be trashed | keep |
| F13 search | search across notes | ⌘K over titles, own notes, generated notes and transcripts | same job |

## Verdict

Not shippable. 18 must-haves are missing or partial; there are no open S1 or S2 bugs.

## Top five to build next

1. Run the core loop for real in the desktop app: install Ollama, record a real call (mic plus system audio), get notes. This proves or breaks four partial must-haves at once (mic, live transcript, stop/resume, note writing) and is the manual pass in test-plan.md.
2. Permissions onboarding (S03) and a signed, notarised macOS build. Without notarisation the mic and screen-audio permissions are unreliable, so every other capture feature depends on it.
3. Meeting notification (S20), auto-stop on call end or silence, and capture only while a note is open. That takes F02 from 3 clicks to 1, which is the original's main promise.
4. Export all notes as a markdown folder. Small, a must-have, and it backs the "your data stays yours" angle.
5. Faster live transcript (shorter segments) and chat history. These are the two most visible gaps in daily use.

Windows is a must-have in the matrix, but it isn't in this list. If milestone 1 is macOS only, move it to skip with that reason and the must-have count drops to 34.
