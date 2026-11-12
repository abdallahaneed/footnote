# Test plan: meeting-notes clone

Build: dd0bbe2, second round on 797c5af (S03, S28, export), third on b721afe (S20), fourth on 8161809 (S07 rich text editor), fifth on b2e0a57 (S19 FTS5 search, folder icons), sixth on b9e32f7 (Apple and Groq note writing, migration 0005, 2026-11-12), seventh on d8535b4 (live transcript pieces, auto-stop, pop-up slots and shortcut, calendar switches; desktop app run), plus the fixes in bugs.md  Date: 2026-11-08  Env: local, `npm run dev` (fake data layer, seed data), Chromium 1440px and 390px
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
| F03-E5 | | edge: Markdown characters typed as text (* _ # <b> [x](y) % & "1. 2.") | type, reload | same text back | e2e edge | pass |
| F03-E6 | | edge: blank line between notes | first, Enter, Enter, second, Copy as Markdown | no &nbsp; in the copy | e2e edge | pass |
| F03-E7 | | edge: empty input | type, select all, delete, reload | empty, hint shows again | e2e edge | pass |
| F03-E8 | | edge: paste plain text with line breaks | paste 3 lines, reload | 3 lines | e2e edge | pass |
| F03-E9 | | edge: click a typed link | autolinked https URL, click | app does not navigate, no new window | e2e edge | pass |
| F03-E10 | | edge: keyboard only, Tab out | Tab on a plain line | focus leaves the editor, text unchanged | e2e edge | pass |
| F03-E11 | | edge: keyboard only, Tab in a list | Tab on a second item | item indents | e2e edge | pass |
| F03-E12 | | edge: very long input | paste 2000 lines, reload | all kept | e2e edge | pass |
| F03-E13 | | edge: refresh right after typing notes | type, refresh at once | notes saved | e2e edge | pass after BUG-010 fix |
| F03-E14 | | edge: refresh right after typing a title | type, refresh at once | title saved | e2e edge | pass after BUG-010 fix |
| F05-E1 | | edge: slash menu Escape, slash mid-line | / Esc; "and/or" | menu closes, slash kept; no menu mid-line | e2e edge | pass |
| F05-E2 | | edge: slash menu inside a list item | "- keep me", "/one" Enter | template set, list item kept | e2e edge | pass |
| F05-E3 | | edge: formatted own notes into generated notes | heading + bold bullet, switch template | own line "budget", no ** or ## | e2e edge | pass |
| S07-A1 | | screen reader and contrast: editor at 1440/390, light/dark | axe scan | no serious issues, no sideways scroll | e2e app | pass |
| F13-E2 | | edge: word starts, any order, no accents, where it matched | "cafe reun", "fin quart", "udget", FTS syntax | found; "In your notes: …"; mid-word no match; syntax as words | e2e edge | pass |
| F13-E3 | | edge: search follows edits, trash and restore | add a word, search, trash, search, restore, search | found, gone, found | e2e edge | pass |
| F13-E4 | | edge: deleted transcript line | delete line, search its word | not found in transcript | e2e edge | pass |
| F13-E5 | | edge: keyboard only | type, arrows, Enter | note opens, palette closes | e2e edge | pass |
| F13-E6 | | edge: 390px, long snippets, screen reader | search "the" | one line each, no sideways scroll, no serious axe issues | e2e edge | pass |
| F13-E7 | | edge: emoji, punctuation, 600-char query, NUL | 👋, ?!, -, xxx…; Rust: 12 odd queries | no results, no error | e2e edge + Rust | pass after BUG-011 fix |
| F13-E8 | | edge: typing fast | type, backspace, replace query | only the last query's results | e2e edge | pass |
| F13-N1 | | negative: core error | ?fail=search_notes | no results, no crash | e2e edge | pass |
| F09-E1 | folders | edge: double click Save | dblclick | one folder | e2e edge | pass |
| F09-E2 | | edge: Cancel keeps icon; Enter saves | change icon, Cancel; change, Enter | old icon kept; new icon saved | e2e edge | pass after BUG-012 fix |
| F09-E3 | | edge: name over 40 characters | 60 x's, Save | says why, dialog stays | e2e edge | pass |
| S23-E1 | | edge: icon by keyboard, 390px, survives edit and reload | arrows in the icon group | Team checked after edit and reload; no serious axe issues | e2e edge | pass |
| F09-R1 | | Rust: icon saved, kept on rename, unsafe key refused | folder_save | "users" kept; "<svg…>" refused | Rust | pass |
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
| F02-H2 | meeting pop-up (S20) | happy | pop-up for a meeting, Start notes | the meeting's note opens recording; double click makes one note | e2e app | pass |
| F02-E4 | | edge: 60+ char title at 360x128 | open | fits, Start notes visible, full title in the label | e2e edge | pass |
| F02-E5 | | edge: Dismiss | click X | no note created | e2e edge | pass |
| F02-E6 | | edge: meeting already recording | Start notes | same note, one recording | e2e edge | pass |
| F02-E7 | | edge: old note for the meeting is in the trash | Start notes | a fresh note | e2e edge | pass |
| F02-E8 | | edge: card vs window | open at window size | card fills the window, square | e2e edge | pass after BUG-009 fix |
| F02-N3 | | negative: recording cannot start / meeting gone / load error | ?fail=recording_start; unknown id; ?fail=calendar_upcoming | reason shown, Start notes usable again; "no longer in your calendar"; retry | e2e app, edge | pass |
| F02-U1 | | unit: who gets a pop-up | Rust notify::due: 1 invitee, later, cancelled, just started, long started, already shown, already recording, calendar off | only the right meetings | cargo test | pass |
| F02-R1 | | real: desktop app, test meeting in 60 s with 2 invitees | insert into the dev database, wait | undecorated always-on-top window top right with title, time, invitees | manual (done 2026-11-08) | pass on the third try, see to-check 7 |
| F02-M2 | | real: click Start notes and Dismiss in the real window | | recording starts, link opens, main window on the note; Dismiss closes | manual | to run (System Events could not click without accessibility permission) |
| LLM-H1 | F09 notes | happy | Apple's model writes a 40-line meeting | template headings, own line kept, every source exists | cargo ignored apple_writes_notes | pass, 13 s |
| LLM-H2 | F09 notes | happy | Groq request path against a stand-in server | stored notes with checked sources | cargo talks_to_groq | pass |
| LLM-H3 | F06 chat | happy | Groq streams chat tokens | pieces arrive in order, joined answer | cargo streams_from_groq | pass |
| LLM-E1 | F09 notes | edge: one-hour meeting (600 lines, ~50k characters) on Apple | | notes written, no context error | cargo ignored apple_limits_one_hour | fail before the fix (context error after 305 s, BUG-013); pass after, 170 s |
| LLM-E2 | F09 notes | edge: own notes near 2,000 characters plus a full window on Apple | | notes written | cargo ignored apple_limits_own_notes_and_window | pass |
| LLM-E3 | F09 notes | edge: German transcript on Apple | | German notes, sources checked | cargo ignored apple_limits_german | pass |
| LLM-E4 | F06 chat | edge: closing chat mid-answer on Apple | stop after 3 pieces | stops at once, no hang | cargo ignored apple_limits_stop_early | pass, 2.7 s |
| LLM-E5 | F09 notes | edge: Groq free limit hit (429, retry-after 1) | | waits, then answers | cargo groq_waits_on_the_free_limit | pass |
| LLM-E6 | F06 chat | edge: Groq stream ends empty or with an error event | | readable error, not an empty answer | cargo streams_from_groq | pass after hardening |
| LLM-N1 | F09 notes | negative: no key, wrong key (401), retired model (400), offline | | "Add your Groq API key", "did not accept the API key", "no longer offers the model", "Could not reach Groq"; the first three are not retried | cargo talks_to_groq | pass |
| LLM-N2 | F09 notes | negative: note writing set to Transcript only | | "turned off in Settings" | cargo talks_to_groq | pass |
| MIG-H1 | upgrade | happy: migration 0005 on a copy of the real dev database | | provider ollama becomes apple, every other setting kept, foreign keys and integrity ok | sqlite3 by hand | pass |
| S28-H2 | settings | happy: Apple default, switch to Groq, model name, save key, Transcript only, come back | | all saved, key shown as saved, never shown again | e2e app | pass |
| S28-N2 | settings | negative: Apple Intelligence off | ?apple=not_enabled | reason shown, Groq offered | e2e app | pass |
| S28-E6 | settings | edge: 390px with Groq open | | no sideways scroll, Save key on screen | e2e edge | pass |
| S28-E7 | settings | edge: Mac that cannot run Apple's model, keyboard only, key with spaces around it | ?apple=old_macos | option disabled with reason; Groq picked with Space; key trimmed and saved; axe clean | e2e edge | pass |
| S28-E8 | settings | edge: Remove key, leave, come back | | key field shown again | e2e edge | pass |
| S28-N3 | settings | negative: key with a space inside, empty model name, 201-character model name | | "does not look like a Groq API key", "Enter a model name", length message | e2e app + edge | pass |
| R7-H1 | F02 live transcript | happy: 33 s spoken clip replayed in real time through capture, whisper and the job worker | | each line in the app within 20 s | cargo ignored live_lag | pass: 1.6-9.0 s, median 5.2 s |
| R7-E1 | F02 segments | edge: pause after 8 s, pause before 8 s, no pause for 15 s, under 8 s | | cut in the pause; wait; cut at the quietest point; wait | cargo segments_end_at_a_pause | pass |
| R7-H2 | F02 auto-stop | happy: silent recording, check 16 min later | | stops, note says "silence", queued for transcript | cargo auto_stop_ends_a_silent_recording | pass |
| R7-E2 | F02 auto-stop | edge: 14 vs 15 min, before and after the end time, meeting runs long, mic-only meeting, no calendar event | | only silence or an ended call stops it | cargo auto_stop_after_silence | pass |
| R7-E3 | F02 auto-stop | edge: Resume after an auto-stop, then Stop by hand | ?autostop=call_ended | message gone on Resume, no message after a manual Stop | e2e edge F02-E9, E10 | pass |
| R7-H3 | S20 pop-ups | happy, desktop app: two meetings due together | real windows read from macOS | two pop-ups, y 40 and 180, no overlap | by hand (CGWindowList) | pass |
| R7-H4 | S20 shortcut | happy, desktop app: Control-Option-N with two pop-ups open | real key press | Footnote comes to the front, newest pop-up focused | by hand (CGEvent, AX) | pass |
| R7-E4 | S20 dismiss | desktop app: click X on a pop-up | real click | window closes | by hand | pass |
| R7-E5 | S20 keyboard | desktop app: Esc, Tab, Option-Tab inside a pop-up | synthetic key presses | Esc closes it, Tab shows a focus ring | by hand | open: nothing visible happened; not counted as a bug until checked by hand (manual item 9) |
| R7-E6 | S20 slots | edge: slot reuse after a pop-up closes | | first free slot | cargo new_pop_ups_take_the_first_free_slot; desktop not checked | pass (unit) |
| R7-H5 | S02 calendars | happy: two calendars named from their files, switch one off and on, by keyboard, axe | | names shown, Off text, saved across pages | e2e edge S02-E5 | pass after BUG-014 fix |
| R7-E7 | S02 calendars | edge: 390px, long name | | wraps, switch and Remove on screen | e2e edge S02-E6 | pass |
| R7-E8 | S02 calendars | edge: calendar file name with escapes, empty name, 300 characters, name inside an event | | "Hiring, EMEA"; host kept; cut at 100; event value ignored | cargo reads_the_calendar_name | pass |
| R7-E9 | S02 calendars | off hides Home meetings, events kept, on brings them back | | | cargo reads_the_calendar_name | pass |
| R7-M1 | upgrade | desktop app on the real dev database at version 4 | | migrates to 6 at start, settings and notes kept, integrity ok | by hand | pass |
| X-H1 | all screens | a11y and widths | 6 screens x 1440/390 x light/dark | no serious axe issues, no sideways scroll | e2e app | pass |
| X-E1 | | edge: phone width, keyboard only | ⌘K, New note, type | works, axe clean | e2e edge | pass |
| X-N1 | | negative: core unreachable | ?fail=notes_list | error with Try again | e2e app | pass |

## Manual pass (desktop build, `npm run tauri dev`)

Not automatable from Playwright because the browser run uses the fake layer. Run these by hand and report back:

1. F01: grant mic and system audio, deny one, recover via System Settings.
2. F02: a real 5-minute call. Transcript arrives, Stop, notes generate with Apple's built-in model; then switch to Groq with your own key and press Regenerate; then turn Wi-Fi off and regenerate (banner "Could not reach Groq", Try again works once online).
3. F02: close the app mid-recording, reopen: the note finishes from saved audio.
4. F02: system audio from Zoom/Meet as "them" in an interview; echo filter keeps your voice out of their side.
5. Email to attendees opens the mail app with subject and body; Copy as Markdown pastes cleanly.
6. Calendar ICS link syncs real events into Upcoming, across a time-zone change.
7. Own-notes editor in the desktop window (WKWebView, not Chromium): German dead keys (ä via Option-u), Cmd+B/I, Cmd+Z, "- " list, then Cmd+Q right after typing and reopen: the last words are there.
8. Search in the desktop app after the 0004 migration: the first search after start indexes every note; it should feel instant, and a word from a transcript recorded today is found.
9. Meeting pop-up with the keyboard (round 7): when a pop-up shows, press Control-Option-N. Then press Esc: the pop-up should close. Open another one and press Tab, then Option-Tab: a ring should appear on X or Start notes. If Esc does nothing, that is a bug to log.
10. Auto-stop (round 7): in a real call with a calendar event, stay in the call past its end time, then leave the call and wait 2 minutes. Recording should stop on its own and the note should say the call ended.

## To check (seen in code, not reproduced as a user-visible bug)

1. Two browser tabs on the fake layer overwrite each other's localStorage (last write wins). Fake only; the desktop app is one window over SQLite.
2. Chat keyword match uses `[a-zäöüß]{4,}`, so words with é, ñ, ç are split ("café" never matches in chat; palette search is fine).
3. Rust `write()` sends the "changed" event even when the command failed: harmless reloads, confirm no flicker.
4. Whether the Rust `transcript_retry` refuses to start while a pipeline is already running (the UI no longer offers it, but the command does not guard).
5. Word-list remove buttons have no type="button". Inside a form they would submit it; today React removes the button before the browser submits, and Settings no longer uses a form, so nothing breaks. Add the type if TagInput is used in a form again.
6. Export with zero notes creates an empty dated folder in Documents. Harmless; could say "Nothing to export" instead.
7. Real notifier run on 2026-11-08: the first two attempts with a qualifying test meeting showed no pop-up; the third (after a restart) did, and the log showed "1 due" for it. The cause of the first two is not known. Watch for a missing pop-up in daily use.
8. Pop-ups that open in different 15-second checks stack from the same top position, so a second meeting a minute after the first would cover it. Not reproduced; seen in the code (the offset only counts meetings from one check).
9. The pop-up opens without focus (on purpose, so it does not steal typing), which means keyboard-only users cannot reach Start notes without the mouse or Cmd+Tab. A global shortcut would fix it.
10. The pop-up says "Starting now" from about a minute before the start.
11. Whether WKWebView fires pagehide or visibilitychange when the Tauri window is closed or the app quits. The BUG-010 fix relies on it; checked in Chromium only (manual pass item 7).
12. Notes saved before the editor, with single line breaks, are rewritten with Markdown hard breaks ("two spaces, newline") on their next edit. Same text, slightly different file in exports.
13. Groq's free-tier limits are not written down on their docs page. A day of long meetings could run out of daily tokens; the message then says to try again in a few minutes, which may be wrong for a daily limit.
14. In dev builds macOS may ask for Keychain access after every rebuild, because the unsigned app changes. Check that a signed build asks once at most.
15. Chat on Apple's model sees about 4,000 characters of notes, so in a long meeting it reads the written notes but only the start of the transcript. Answers about the end of a long meeting may say the notes do not cover it.
16. In the desktop app (WKWebView), Tab may skip buttons unless macOS Keyboard navigation is on (System Settings, Keyboard). Keyboard-only use of the whole app may then need Option-Tab. Not confirmed (R7-E5).
17. Auto-stop on silence trusts the loudness level used for speech (RMS 0.006). A noisy room or a fan above that level would keep a recording going forever. Not measured with a real mic.
18. Shorter segments mean whisper runs more often on near-silent clips, which can add invented words like "Thank you." in quiet stretches. Watch for it in a real call.
19. If another app already uses Control-Option-N, registering fails quietly (logged only) and the pop-up hint is wrong.
