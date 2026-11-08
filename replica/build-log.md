# Build log

App: app/ (React 19 + Vite, Tailwind tokens, Radix primitives). Run: cd app && npm run dev, http://localhost:1430. Tests: npm run test:e2e (43 passing on 2026-11-08).
Data layer: app/src/data/api.ts is a fake with the Tauri command names from architecture.md. replica-backend swaps each body for invoke(); no screen changes.
Error knobs for screenshots: ?fail=<command> (e.g. ?fail=notes_list) or ?fail=enhance before the # in the URL.
Screenshots: replica/clone-screens/, 1440x900 and 390x844, light and dark. No reference screenshots exist in replica/screens/, so replica-diff has nothing to diff against yet.

| ID | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| shell | 2026-11-07 | done | Tauri project (src-tauri) not created yet; belongs with replica-backend | Chromium's scrollIntoView now returns a promise, which broke an arrow-function effect |
| S05 home | 2026-11-07 | done | shift-click range select; 12-hour times wrap in the meeting row's time column | nothing |
| S06 sidebar | 2026-11-07 | partial | spaces, subfolders, drag and drop | auto-close on note open had to reopen on leaving, or home lost its nav |
| S07 note, live | 2026-11-07 | partial | images, consent notice, real capture | slash menu needs capture-phase keys so the textarea does not take Enter |
| S08 transcript | 2026-11-07 | partial | real mic list, named speakers, auto-stop on silence | nothing |
| S09 note, generated | 2026-11-07 | partial | audio playback behind citations, summary length switch, regenerate right after a line delete, real LLM | nothing |
| S10 chat | 2026-11-07 | partial | thread history, model picker, file attach, rewrite-into-note, selection scope; answers come from a keyword stand-in | nothing |
| S13 templates | 2026-11-07 | done | sharing (milestone 3) | nothing |
| S19 command palette | 2026-11-07 | done | people and companies results (screens not built) | nothing |
| S22 trash | 2026-11-07 | done | empty-trash-all button | nothing |
| S23 folder | 2026-11-07 | partial | auto-add recurring meetings, integrations button, share settings | nothing |
| S03 permissions | 2026-11-08 | partial | real macOS prompts not tried yet (needs a signed build; the dev binary asks on behalf of the terminal) | macOS only reports screen recording as granted or not, so "never asked" and "denied" look the same; the screen asks once, then sends you to System Settings |
| S28 settings | 2026-11-08 | partial | saves on its own since replica-test round 2 (an explicit Save lost changes when you left); theme switch, live meeting indicator toggle, languages, markdown mirror folder picker (no folder dialog plugin yet) | Radix radio checks on arrow focus only while the key is down; fast synthetic taps can miss it, so the test presses Space |
| export all | 2026-11-08 | partial | CSV; Rust notes_export compiled but not yet run in the desktop app | nothing |
| S20 meeting notification | 2026-11-08 | partial | not seen fire from a real calendar yet; per-app toggles (S29); call detection from mic use; auto-stop when the call ends | needed its own window: a Rust thread opens a small undecorated always-on-top webview per meeting, and "Start notes" runs in the core so it can focus the main window and tell it where to go |
| S07 rich text editor | 2026-11-08 | done | images and file uploads (separate should/could rows); custom marks for own vs generated lines stay in S09 | Playwright's End key does nothing on macOS, so scripted cursor moves need a click on the exact spot; the slash menu needed ProseMirror's handleKeyDown to stop Enter splitting the line |
| S19 full-text search | 2026-11-08 | done | jump to the matching transcript line; people and companies results | the palette search was synchronous over text sent to the UI; moving it into the core meant an async query with old results kept on screen. Triggers only mark notes stale and Rust rewrites their rows before each search, because transcript writes are spread over several files. Snippets showed Markdown marks until own notes were indexed as plain words |
| S06/S23 folder icons | 2026-11-08 | done | custom emoji or uploaded icons (16 fixed glyphs instead) | nothing; the column was already in the schema |
| layout | 2026-11-08 | done | — | main was not a scroll container, so long pages scrolled the whole window and the sidebar went with it |
| S01, S02 picker, S04, S11, S12, S14-S18, S21, S24-S27, S29-S38 | 2026-11-07 | stub | routed with a "Not built yet" page naming the milestone | — |

Bigger than it looks:
1. Everything in the core loop past the UI is fake: capture, whisper, the LLM, audio playback. The slice proves the screens and the flow, not the hard part. architecture.md says to build the capture spike first; that is the next real risk.
2. Onboarding S01-S03 is a must-have and not built. It depends on real permission and calendar commands, so it waits for replica-backend.
3. S20 meeting notification is a must-have and needs the Rust notifier and an OS-level window.
