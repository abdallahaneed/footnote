# Bugs: meeting-notes clone

Run 2026-11-08 on dd0bbe2, Chromium (Playwright 1.65), 1440px, `npm run dev` with seed data. Every bug below was reproduced by a failing test before the fix; the test is kept.

Open S1: none.

### BUG-001: trashing a selection with a live recording trashes the other notes anyway

- Severity: S3 (note ends up in the trash while the screen says nothing happened; restorable)
- Flow / case: F14 / F14-N1
- Screen: S05
- Build: dd0bbe2  Browser / device: Chromium, 1440px

Steps
1. New note, Start recording, go home.
2. Tick the recording note and "Roadmap check-in".
3. Selected notes bar > Move to trash.

Expected: error "Stop recording before moving this note to the trash.", both notes stay.
Actual: the error shows, but "Roadmap check-in" disappears from home within 1.5 s and is in the trash (Trash count 2).
Evidence: test "F14-N1 trashing a selection that includes a live recording trashes nothing" (edge.spec.ts)
Suspected cause: fake `noteTrash` set `deletedAt` note by note and threw midway; the next transcript tick committed the half-done change. The Rust core already checks first inside a transaction, so this was browser-build only.
Status: fixed in 26eeac6

### BUG-002: title typed just before pressing Back is lost

- Severity: S2 (typed text lost, no way to get it back; small, so not S1)
- Flow / case: F03 / F03-E3
- Screen: S07

Steps
1. Home > New note.
2. Type "Quick back" in the title.
3. Within 400 ms press Back (browser back, or any route change that does not move focus).

Expected: home lists "Quick back".
Actual: home lists "Untitled note".
Evidence: test "F03-E3 title typed then back button right away is saved"
Suspected cause: TitleInput saved on a 400 ms debounce and on blur, but not on unmount; the debounce was cancelled when the screen unmounted. The notes body already saved on unmount. Affects both the fake and the desktop app.
Status: fixed in 26eeac6

### BUG-003: double click on New note creates two notes

- Severity: S3 (stray empty note; workaround: trash it)
- Flow / case: F03 / F03-E1
- Screen: S05

Steps
1. Home, double click "New note".
2. Go back home.

Expected: one new "Untitled note".
Actual: two.
Evidence: test "F03-E1 double click on New note makes one note" (Expected 1, Received 2)
Status: fixed in 26eeac6

### BUG-004: transcript panel offers Resume and Transcribe again while notes are being written

- Severity: S3 (header disables Resume while busy, the panel did not; Transcribe again during a run starts a second pipeline on the same note)
- Flow / case: F04 / F04-E2
- Screen: S08

Steps
1. Open "Hiring sync", Show transcript.
2. Click Transcribe again.
3. While the chip says Transcribing, look at the panel footer.

Expected: Resume disabled, Transcribe again hidden until the run ends.
Actual: both enabled.
Evidence: test "F04-E2 Transcribe again while busy does not run twice"
Status: fixed in 26eeac6

## To check

See the "To check" list at the end of replica/test-plan.md. Nothing there was reproduced as a user-visible bug.

## Round 2: S03, S28, export (797c5af)

### BUG-005: settings changes vanish when you leave the page without pressing Save

- Severity: S3 (the change is silently gone; workaround: come back and redo it, then Save)
- Flow / case: S28 / S28-E1
- Screen: S28

Steps
1. Settings, pick "Keep for 30 days".
2. Click Home in the sidebar, then Settings again.

Expected: "Keep for 30 days" is still picked.
Actual: back to the old value. Nothing said the change was not saved.
Evidence: test "S28-E1 unsaved settings are not lost silently when leaving"
Fix: Settings save on their own 600 ms after a change and when the page closes, like notes. The Save and Discard buttons are gone.
Status: fixed in 5c09b9d

### BUG-006: "Transcript only" cannot be saved while the hidden model address is invalid

- Severity: S3 (workaround: switch back, fix the address, switch again)
- Flow / case: S28 / S28-E2
- Screen: S28

Steps
1. Settings, type "nonsense" as the model address.
2. Pick "Transcript only" (the address field disappears), Save.

Expected: saved.
Actual: error "The model address must start with http:// or https://." about a field you can no longer see.
Evidence: test "S28-E2 Transcript only saves even if the hidden model address was invalid"
Fix: with Transcript only, the last saved address and model are sent instead of the hidden half-typed ones.
Status: fixed in 5c09b9d

### BUG-007: a model name that is too long gets the message "Enter a model name."

- Severity: S4
- Flow / case: S28 / S28-E3
- Screen: S28

Steps
1. Settings, paste a 201-character model name, Save.

Expected: a message about the length.
Actual: "Enter a model name." (same in the Rust core).
Evidence: test "S28-E3 a 201-character model name gets a message about length"
Status: fixed in 5c09b9d (fake and Rust)

### BUG-008: export overwrites a note whose title looks the same to macOS

- Severity: S2 (export is the backup; a note silently missing from it, no warning)
- Flow / case: export / EXP-U1
- Screen: S28, Rust notes_export

Steps
1. Two notes titled "Café", one typed (é as one character) and one pasted from a file name (e plus an accent mark), same day.
2. Settings > Export all notes.

Expected: two files.
Actual: one file; the second note overwrote the first. Same for two exports started in the same minute (same folder name).
Evidence: cargo test notes::tests::export_writes_one_file_per_live_note_and_never_overwrites (left 6, right 7)
Suspected cause: duplicate names were checked against a lowercase set, but APFS also treats the two ways of writing accents as one name.
Fix: ask the file system whether the name exists before writing; a second export in the same minute gets its own folder.
Status: fixed in 5c09b9d

## Round 3: S20 meeting pop-up (b721afe)

### BUG-009: the pop-up card sits inside a square dark frame

- Severity: S4
- Flow / case: F02 / F02-E8
- Screen: S20 (desktop window)

Steps
1. Desktop app, a meeting with 2+ invitees starting within a minute.
2. Look at the pop-up top right.

Expected: one clean card.
Actual: the rounded card with padding around it inside the square, undecorated window, so dark square corners show behind the rounded ones.
Evidence: screenshot of the real window during the 2026-11-08 run; test "S20-E5 the card fills the pop-up window, so no square frame shows around rounded corners"
Fix: in the pop-up page the card fills the window: full width, square, no border or shadow.
Status: fixed in 8977d37

### BUG-010: notes or title typed just before a refresh are lost

- Severity: S2 (typed text lost with no way back; only the last 400 ms of typing, so not S1)
- Flow / case: F03 / F03-E13, F03-E14
- Screen: S07, S09 (My notes)
- Build: 8161809  Browser / device: Chromium, 1440px

Steps
1. Home > New note.
2. Type "typed then refresh" in My notes (or a title).
3. Refresh within 400 ms of the last key.

Expected: the note reopens with the text.
Actual: notes and title are empty.
Evidence: tests "F03-E13 notes typed right before a refresh are saved" and "F03-E14 title typed right before a refresh is saved" (edge.spec.ts), both failed before the fix.
Suspected cause: saves ran on a 400 ms pause, on blur and on unmount. A refresh or window close runs none of those. Present since the first build (the old textarea had it too). In the desktop app the same gap applies to quitting or closing the window right after typing. Fix: both editors also save on pagehide and when the window is hidden; the fake data layer now applies a command at once and answers 60 ms later, like Tauri IPC, so a save sent while the page unloads lands.
Status: fixed in 2b321b1

### BUG-011: a search containing a NUL character fails in the core

- Severity: S4 (cannot be typed; only a paste carrying a control character hits it, and the palette then shows nothing)
- Flow / case: F13 / F13-E7 (Rust: search_odd_queries_never_error)
- Screen: S19
- Build: b2e0a57  Device: Rust unit test against SQLite FTS5

Steps
1. Call search_notes with "a\0b".

Expected: no results, no error.
Actual: error "unterminated string" from FTS5.
Evidence: Rust test "search_odd_queries_never_error" (notes.rs), failed before the fix. Emoji, punctuation, AND/OR/NOT, quotes, brackets, CJK and a 1000-character query were already fine.
Suspected cause: FTS5 reads NUL as the end of the query string, inside the quoted term the core builds.
Status: fixed in bea0c01 (control characters become spaces before the query is built)

### BUG-012: Enter in the folder dialog does nothing

- Severity: S3 (Save still works by mouse or Tab; keyboard users lose the shortcut every other dialog has)
- Flow / case: F09 / F09-E2
- Screen: S06, S23 (folder dialog)
- Build: b2e0a57  Browser / device: Chromium, 1440px

Steps
1. Hiring folder > Folder actions > Edit folder.
2. Pick another icon, put the cursor in Name, press Enter.

Expected: the dialog saves and closes.
Actual: nothing happens; the dialog stays open.
Evidence: test "F09-E2 folder dialog: Cancel keeps the old icon; Enter in the name saves the chosen icon" (edge.spec.ts), failed before the fix.
Suspected cause: the form has two text fields and its Save button sits in the dialog footer, outside the form. Browsers only submit on Enter without a submit button when there is a single field. Present since the description field was added on 2026-11-07, not caused by the icon picker. Fix: Save is a submit button linked with form=, and save ignores a second call while busy.
Status: fixed in bea0c01

## Round 6: Apple and Groq note writing (b9e32f7, 2026-11-12)

Run on b9e32f7 with Apple's real on-device model (macOS 27.0.1, Apple Silicon) for Apple cases, a stand-in HTTP server for Groq, and Chromium for S28.

### BUG-013: a one-hour meeting fails on Apple's model with a context error

- Severity: S2 (no notes for long meetings with the default provider; the workaround, Groq, sends the transcript off the Mac)
- Flow / case: F09 / LLM-E1
- Screen: S09
- Build: b9e32f7  Device: macOS 27.0.1, Apple Silicon

Steps
1. Note writing set to Built into your Mac.
2. A meeting with 600 transcript lines (about 50,000 characters, an hour of talk).
3. Generate notes.

Expected: notes written, maybe slowly.
Actual: after 305 s the note fails with "Apple's built-in model failed: The session's transcript exceeded the model's context size."
Evidence: test "apple_limits_one_hour" (enhance.rs, ignored, real model)
Cause: windows were sized in characters only (6,000) and the answer had no cap, but Apple's 4,096-token context counts the answer too, and [S#] numbers and German words take more tokens per character. The final request was never checked before sending.
Fix: answers capped at 1,000 tokens; each final request is counted in tokens before sending (exact from macOS 26.4, 3 characters per token before) and condensed again until it fits; windows are 4,000 characters; a request that still cannot fit after 3 rounds fails at once with a clear message instead of after minutes. The context error from Swift now also maps to a readable message.
Status: fixed in 8fa9ea7

Hardening without a reproduced bug: a Groq chat stream that ends without text, or with an error event, now gives a readable error instead of an empty answer (test streams_from_groq).

### BUG-014: a second calendar link typed while the first is being added is wiped

- Severity: S3 (typed text lost, retyping it works)
- Flow / case: F01 / S02-E5
- Screen: S02
- Build: c683f0c  Browser: Chromium, 1440px

Steps
1. Calendars, paste a link, Add calendar.
2. Paste a second link at once, before the first appears in the list.

Expected: the second link stays in the box.
Actual: the box is emptied when the first add finishes.
Evidence: test "S02-E5 each calendar shows its own name and can be switched off and on, by keyboard too" (edge.spec.ts)
Cause: the box was cleared after every add, whatever it held by then.
Fix: clear it only if it still holds the link that was added.
Status: fixed in FIXCOMMIT

