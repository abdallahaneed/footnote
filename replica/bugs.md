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
