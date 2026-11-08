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
Status: fixed in the commit that adds edge.spec.ts (see git log)

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
Status: fixed in the commit that adds edge.spec.ts

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
Status: fixed in the commit that adds edge.spec.ts

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
Status: fixed in the commit that adds edge.spec.ts

## To check

See the "To check" list at the end of replica/test-plan.md. Nothing there was reproduced as a user-visible bug.
