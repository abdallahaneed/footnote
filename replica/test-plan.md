# Test plan: meeting-notes clone

Build: dd0bbe2, second round on 797c5af (S03, S28, export), plus the fixes in bugs.md  Date: 2026-11-08  Env: local, `npm run dev` (fake data layer, seed data), Chromium 1440px and 390px
Specs: app/e2e/app.spec.ts (happy paths, axe, widths), app/e2e/edge.spec.ts (edge and negative cases), app/e2e/design.spec.ts (components). Every spec fails on page errors and console errors; edge.spec.ts also fails on any 5xx response.

Scope: milestone 1 screens that are built (S02 calendar links, S05-S10, S13, S19, S22, S23). F01 sign-in/permissions, F08, F10-F12, F15-F17 hit "Not built yet" stubs and are blocked, not failed.

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | first run | happy | add ICS link, list, remove | validated, listed, removable | e2e app | pass |
| F01-N1 | | negative: bad link | "not a link" | message about https/webcal | e2e app | pass |
| F01-H2 | | happy: sign-in, calendar OAuth, mic/system audio prompts | | | manual | blocked (S01, S03 stubs) |
| F02-H1 | core loop | happy | new note, record, transcript streams, stop | "Notes ready", generated notes with sources, own text kept | e2e app | pass |
| F02-E1 | | edge: back button mid-recording | record, Back | still recording, home row shows Recording, reopen shows Stop | e2e edge | pass |
| F02-E2 | | edge: refresh mid-recording | record, reload | note finishes from saved segments | e2e edge | pass |
| F02-E3 | | edge: keyboard only | Tab to Resume, Enter, Stop | records and finishes | e2e app | pass |
| F02-N1 | | negative: model down | ?fail=enhance | error banner, Failed chip, transcript kept | e2e app | pass |
| F02-N2 | | negative: failed note recovers | Try again | Notes ready | e2e app | pass |
| F02-M1 | | real capture, 15 min silence auto-stop, sleep, Bluetooth mic | desktop app | | manual | to run in Tauri build |
| F03-H1 | ad-hoc note | happy | New note | note screen opens | e2e app | pass |
| F03-E1 | | edge: double click New note | dblclick | one note | e2e edge | pass after BUG-003 fix |
| F03-E2 | | edge: emoji, accents, 250-char title | type, reload | kept, clipped at 200 | e2e edge | pass |
| F03-E3 | | edge: Back right after typing title | type, Back | title saved | e2e edge | pass after BUG-002 fix |
| F03-E4 | | edge: Back right after typing notes | type, Back | notes saved | e2e edge | pass |
| F04-H1 | transcript edit | happy | delete a line | line gone | e2e app | pass |
| F04-E1 | | edge: deleted line after regenerate | delete, switch template, Copy all | line absent from transcript copy | e2e edge | pass |
| F04-E2 | | edge: re-run while busy | Transcribe again | no second run or resume offered while transcribing | e2e edge | pass after BUG-004 fix |
| F05-H1 | switch template | happy | Enhanced dropdown, Stand-up | regenerates, own notes survive | e2e app | pass |
| F05-H2 | | happy: "/" menu by keyboard | / one Enter | template set, slash removed | e2e app | pass |
| F06-H1 | chat one note | happy | ask | streamed answer | e2e app | pass |
| F06-E1 | | edge: empty input, Stop mid-stream | Enter on empty; Stop | nothing sent; answer cut off | e2e edge | pass |
| F06-E2 | | rewrite into note, undo | | | manual | blocked (not built) |
| F07-H1 | chat all notes | happy | List the action items | answer with links, link opens note | e2e app | pass |
| F07-N1 | | negative: no match | zebra crossing | "could not find" | e2e app | pass |
| F07-E1 | | edge: trashed note | trash, ask | trashed note not cited | e2e edge | pass |
| F09-H1 | folders | happy | add from home, view, remove | listed, removed | e2e app | pass |
| F09-E1 | | edge: one note, two folders | add to both | in both | e2e edge | pass |
| F09-N1 | | negative: empty name, 41 chars | | refused with message | e2e app, edge | pass |
| F09-N2 | | negative: unknown folder | /folder/nope | Folder not found | e2e app | pass |
| F13-H1 | find | happy | ⌘K, text inside transcript | "Found in text", Enter opens | e2e app | pass |
| F13-E1 | | edge: accents, case, trashed | CAFÉ; trash then search | match; trashed hidden | e2e edge | pass |
| F13-N1 | | negative: no results | zzqx | Nothing matches | e2e app | pass |
| F14-H1 | trash | happy | trash, restore, delete with typed confirm | works, confirm locked until typed | e2e app | pass |
| F14-N1 | | negative: selection includes a live recording | select both, Move to trash | error, nothing trashed | e2e edge | pass after BUG-001 fix |
| F14-N2 | | negative: deleted record by link | trashed id; unknown id | cannot record; "Could not open" with way home | e2e edge | pass |
| F01-H3 | permissions (S03) | happy: undetermined mic | Allow, Continue | Allowed, note about system audio, home | e2e app | pass |
| F01-N2 | | negative: denied | Allow | warning with Open System Settings | e2e app | pass |
| F01-N3 | | negative: status cannot load / request fails | ?fail=permissions_get, ?fail=permission_request | error with reason, Allow stays | e2e edge | pass |
| F01-E1 | | edge: keyboard only | Tab to Allow, Enter, Continue | works | e2e edge | pass |
| F01-E2 | | edge: Open System Settings in the browser | click | page stays usable, no errors | e2e edge | pass |
| F01-M1 | | real macOS prompts, deny then recover in System Settings | desktop | | manual | to run in a signed build |
| S28-H1 | settings | happy: change provider, address, retention, words | edit, leave, come back | saved on their own, kept | e2e app | pass after BUG-005 fix |
| S28-E1 | | edge: leave right after a change | pick, Home, back | change kept | e2e edge | pass after BUG-005 fix |
| S28-E2 | | edge: Transcript only with a half-typed hidden address | type bad address, pick Transcript only | saves | e2e edge | pass after BUG-006 fix |
| S28-E3 | | edge: 201-char model name | type | message about length | e2e edge | pass after BUG-007 fix |
| S28-E4 | | edge: word list duplicates, 30 limit | add 31 | duplicate ignored, input locks at 30 | e2e edge | pass |
| S28-E5 | | edge: remove a word | add, remove | removed, nothing else fires | e2e edge | pass |
| S28-E6 | | edge: keyboard only | Tab into retention, arrows, Space | saved | e2e app | pass |
| S28-N1 | | negative: settings cannot load / save fails | ?fail=settings_get, ?fail=settings_update | error with retry; edits kept | e2e edge | pass |
| EXP-H1 | export all | happy | Export all notes | count; browser explains it cannot write | e2e app | pass |
| EXP-N1 | | negative: export fails | ?fail=notes_export | error with reason | e2e edge | pass |
| EXP-U1 | | unit: file names | Rust export_all: case, accents two ways, slashes, empty and 120-char titles, trashed note, second export into the same folder | one file per live note, nothing overwritten | cargo test | pass after BUG-008 fix |
| EXP-M1 | | real export in the desktop app, Show in Finder | desktop | | manual | to run |
| X-H1 | all screens | a11y and widths | 6 screens x 1440/390 x light/dark | no serious axe issues, no sideways scroll | e2e app | pass |
| X-E1 | | edge: phone width, keyboard only | ⌘K, New note, type | works, axe clean | e2e edge | pass |
| X-N1 | | negative: core unreachable | ?fail=notes_list | error with Try again | e2e app | pass |

## Manual pass (desktop build, `npm run tauri dev`)

Not automatable from Playwright because the browser run uses the fake layer. Run these by hand and report back:

1. F01: grant mic and system audio, deny one, recover via System Settings.
2. F02: a real 5-minute call. Transcript arrives, Stop, notes generate with Ollama running; repeat with Ollama stopped (banner, then Try again after starting it).
3. F02: close the app mid-recording, reopen: the note finishes from saved audio.
4. F02: system audio from Zoom/Meet as "them" in an interview; echo filter keeps your voice out of their side.
5. Email to attendees opens the mail app with subject and body; Copy as Markdown pastes cleanly.
6. Calendar ICS link syncs real events into Upcoming, across a time-zone change.

## To check (seen in code, not reproduced as a user-visible bug)

1. Two browser tabs on the fake layer overwrite each other's localStorage (last write wins). Fake only; the desktop app is one window over SQLite.
2. Chat keyword match uses `[a-zäöüß]{4,}`, so words with é, ñ, ç are split ("café" never matches in chat; palette search is fine).
3. Rust `write()` sends the "changed" event even when the command failed: harmless reloads, confirm no flicker.
4. Whether the Rust `transcript_retry` refuses to start while a pipeline is already running (the UI no longer offers it, but the command does not guard).
5. Word-list remove buttons have no type="button". Inside a form they would submit it; today React removes the button before the browser submits, and Settings no longer uses a form, so nothing breaks. Add the type if TagInput is used in a form again.
6. Export with zero notes creates an empty dated folder in Documents. Harmless; could say "Nothing to export" instead.
