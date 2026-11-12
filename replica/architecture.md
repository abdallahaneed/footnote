# Architecture: meeting-notes clone (a rebuild of Granola's core features)

Working name until /replica-brand. Never ship with the original's name.
Inputs: replica/recon.md (S01-S38, F01-F17), replica/features.csv (119 rows), replica/fixes.md (8 fixes).
Date: 2026-11-07

The skill's default stack (Next.js, Postgres, Stripe, Vercel) is for hosted web apps. This clone is a free, local-first desktop app for macOS and Windows with no paid APIs, so the stack is the one Abdallah already ships with in Quietkey and DailyAgile.

## Stack

| layer | choice | why |
| --- | --- | --- |
| shell | Tauri v2 (Rust core + system webview) | Same as Quietkey and DailyAgile; small binaries, one codebase for macOS and Windows. |
| UI | React 19 + TypeScript + Vite | Same as Quietkey, already set up with Playwright and axe tests. |
| styling | Tailwind 4 + Radix primitives, tokens from /replica-design | Same as Quietkey; Radix gives accessible menus, dialogs and popovers. |
| note editor | TipTap (ProseMirror) | Rich text with slash menu and custom marks for "AI line with source anchor" (fix #4). |
| database | SQLite via rusqlite (bundled), STRICT tables, migrations as include_str! files | Same pattern as Quietkey db.rs; one local file, works offline, nothing to host. |
| search | SQLite FTS5 | Built in, fast enough for years of notes. |
| vector search | f32 blobs in SQLite, brute-force cosine in Rust | No extra dependency; shortcut noted in schema.sql. |
| mic capture | cpal | Already in Quietkey. |
| system audio, macOS | Core Audio process tap (macOS 14.2+), ScreenCaptureKit audio fallback on 14.0-14.1 | Only official way to capture other apps' audio without a virtual driver. |
| system audio, Windows | WASAPI loopback on the default render device (via cpal or the windows crate) | Official API, no driver install. |
| speech to text | whisper-rs (Metal on macOS, CPU or Vulkan on Windows) | Already in Quietkey; free and local. |
| LLM | Apple's built-in model (FoundationModels, macOS 26+) by default; Groq with the user's own free key as opt-in | Changed 2026-11-12 from Ollama: nothing to install or download, still free. Swift bridge in app/src-tauri/apple/fm.swift; Groq key in the Keychain. |
| embeddings | not built; chat uses keyword retrieval | Ollama's embed model went with Ollama; Apple's NLEmbedding is the free on-device option if needed. |
| calendar | macOS EventKit (objc2), ICS URL on both OSes; Google and Microsoft OAuth (PKCE, loopback redirect) as optional extras | No account required (fix #3); OAuth only when the user wants it. |
| secrets | macOS Keychain (security-framework), Windows Credential Manager (keyring crate) | Tokens never sit in the database file. |
| auth | none | Single local user. Access control is the OS user account. |
| payments | none | Free tool. |
| email | mailto: links to the user's own mail app | "Send notes via email" without a mail service. |
| jobs | a worker thread in the Rust core reading the `jobs` table | Durable across crashes and quits, no external queue. |
| MCP | local stdio MCP server binary shipped with the app (milestone 2) | Claude Desktop and Cursor talk to it directly; no hosted server. |
| updates | Tauri updater against GitHub Releases | Free hosting for a free app. |
| hosting | GitHub Releases for builds, a static landing page | Nothing server-side in milestones 1 and 2. |
| team sync (milestone 3) | optional self-hosted server: one Rust or Node service + Postgres, Docker image | Only for workspaces, sharing and the web viewer. Designed later, separate schema. |

One database, one process plus a worker thread, no microservices.

## Schema

Tables: 24, plus 1 FTS5 index. File: replica/schema.sql (becomes src-tauri/migrations/0001_init.sql). Loaded and constraint-tested in SQLite on 2026-11-07.
Access rules: none in the database. Single local user; the OS file permission on the app-data folder is the boundary. Every Tauri command still validates its input in Rust, because the webview is a trust boundary.

Differences from the skill's Postgres rules, on purpose:
1. ids are UUIDv7 text made in Rust, not gen_random_uuid().
2. times are integer unix milliseconds in UTC, not timestamptz. Same meaning, SQLite has no timestamptz.
3. no owner columns, since there is one user. Milestone 3 adds workspace_id and user_id on the server side only.
4. no money columns, nothing is sold.

Tables by area:
1. Settings and setup: settings (one row), calendar_sources, calendar_events.
2. Notes: notes, audio_segments, transcript_segments, generations, attachments, templates.
3. Organising: folders (one level deep, trigger-enforced), note_folders, folder_auto_add.
4. People: people, companies, note_attendees (filled from calendar invitees, no paid enrichment).
5. AI: recipes, chat_threads, chat_messages, chunks (embeddings), search_fts.
6. Plumbing: jobs (durable queue with dedupe_key), integrations, folder_auto_post, integration_posts, dictations.

Hard constraints the recon found, solved in the database:
1. One note per calendar event: partial unique index notes_one_per_event.
2. Subfolders one level deep: two triggers on folders.
3. A failed pipeline always says why: check on notes (pipeline_status 'failed' needs pipeline_error).
4. A job is never queued twice: partial unique index jobs_dedupe on dedupe_key while queued or running.
5. A note is never posted twice to the same integration: unique (integration_id, generation_id) on integration_posts.
6. Recurring calendar instances: unique (source_id, provider_event_id, start_at).

## API

The API is Tauri commands (UI to Rust) and events (Rust to UI), not HTTP. Who can call: the app's own webview only, limited by Tauri capabilities. Every command validates its input.

F01 First run
| command | does | input | output |
| --- | --- | --- | --- |
| permissions_status | mic, system audio, calendar permission state | none | {mic, system_audio, calendar} each granted / denied / undetermined |
| permissions_request | trigger the OS prompt | kind | new state |
| permissions_open_settings | open the right OS settings pane | kind | none |
| calendar_add_source | add OS calendar, ICS URL, or start Google / Microsoft OAuth | {kind, ics_url?} | calendar_source |
| calendar_list_calendars / calendar_set_enabled | choose which calendars to use (S02) | source_id, ids | list |
| settings_get / settings_update | read and patch the settings row | partial settings | settings |
| models_status / models_download | check and fetch whisper and Ollama models | name | progress events |

F02, F03 Take notes (core loop)
| command | does | input | output |
| --- | --- | --- | --- |
| calendar_upcoming | events for the next 14 days (S05) | {from, to} | events with linked note id |
| note_create | new note, ad-hoc or for an event | {calendar_event_id?} | note |
| note_open_for_event | open or create the note for an event, also opens video link | event_id | note |
| recording_start | start mic + system capture into segments | note_id, mic_id? | none; emits recording:level, recording:segment |
| recording_stop / recording_resume | stop or append to an ended note | note_id | note |
| note_update_own | save the user's editor doc (debounced) | note_id, doc_json | updated_at |
| note_get | note with status, segments, latest generation | note_id | note bundle |
| notes_list | Your notes, with filters | {folder_id?, person_id?, company_id?, deleted?, cursor} | page of notes |

F04 Transcript
| command | does | input | output |
| --- | --- | --- | --- |
| transcript_get | segments for a note | note_id | segments |
| transcript_delete_segment | mark a chunk deleted | segment_id | none |
| transcript_copy_all | plain text with Me / Them labels | note_id | text |
| transcript_retry | re-run STT from saved audio (fix #1) | note_id | job id |

F05, F06 Enhance and rewrite
| command | does | input | output |
| --- | --- | --- | --- |
| generate_notes | queue an enhancement run | note_id, template_id?, summary_length? | generation id |
| generation_retry | retry a failed run (fix #2) | generation_id | generation id |
| templates_list / template_save / template_delete | S13 | template | template |
| chat_rewrite_selection | rewrite part of the enhanced note from a chat prompt | note_id, range, prompt | new enhanced_md |
| audio_play_range | play audio behind a cited line (fix #4) | note_id, start_ms, end_ms | none |

F07, F08 Chat and recipes
| command | does | input | output |
| --- | --- | --- | --- |
| chat_send | ask in a scope; streams tokens | {thread_id?, scope_type, scope_ids, text, recipe_id?, model?} | thread id; emits chat:token, chat:done with cited_segments |
| chat_threads_list / chat_thread_delete | history with delete | thread_id | list |
| recipes_list / recipe_save / recipe_delete | S11, S12 | recipe | recipe |

F09 Folders
| command | does | input | output |
| --- | --- | --- | --- |
| folders_tree / folder_save / folder_delete | S06, S23 | folder | tree |
| notes_add_to_folder / notes_remove_from_folder | multi-select | note_ids, folder_id | none |
| folder_auto_add_set | auto-add a recurring series | folder_id, series_id, on | none |

F10, F11 Share and post
| command | does | input | output |
| --- | --- | --- | --- |
| note_copy_markdown | enhanced notes as markdown | note_id | text |
| note_email_draft | open mailto: with notes and attendees | note_id | none |
| export_all | markdown folder plus CSV index | dir | count |
| integration_save / integration_test / integration_delete | Slack webhook, Notion token, generic webhook (milestone 2) | integration, secret | integration |
| note_post | post to an integration | note_id, integration_id | integration_post |
| folder_auto_post_set | auto-post every new note in a folder | folder_id, integration_id, on | none |

F12 to F14, F16 Briefs, search, trash, voice typing
| command | does | input | output |
| --- | --- | --- | --- |
| brief_get | pre-meeting brief from past notes with the same people | event_id | generation id |
| followup_draft | follow-up email draft | note_id | text |
| search | FTS over titles, own notes, enhanced notes, transcripts | query | hits with snippets |
| people_list / companies_list / person_get / company_get | S16-S18 | filters | rows with note counts |
| note_trash / note_restore / note_delete_forever | S22 | note_id | none |
| dictation_* | voice typing, ported from Quietkey | | |

Events, Rust to UI: recording:level, recording:segment, recording:state, transcript:segment, pipeline:status (per note), generation:progress, chat:token, chat:done, meeting:detected, meeting:upcoming, models:progress.

Webhooks in: none. OAuth for Google and Microsoft uses a loopback redirect on 127.0.0.1 with PKCE.
Webhooks out (milestone 2): Slack incoming webhook; generic webhook with events note.generated and note.edited, signed HMAC-SHA256 in the Standard Webhooks format; Notion pages API with the user's own integration token.
MCP (milestone 2): local stdio server with read-only tools list_notes, get_note, get_transcript, search_notes. Reads the same SQLite file in read-only mode.
Only official, public APIs (EventKit, Google Calendar API, Microsoft Graph, Slack, Notion), with the user's own keys. Never Granola's endpoints.

Jobs (worker thread, reads `jobs` where status = queued and run_after <= now):
| job | schedule | does |
| --- | --- | --- |
| transcribe | queued per closed audio segment | whisper on the segment, writes transcript_segments, marks segment transcribed |
| enhance | queued when recording stops, or by generate_notes | builds prompt from own notes + transcript + template, writes generations and notes.enhanced_md |
| embed | after enhance | chunks the note and stores embeddings |
| post | after enhance when a folder has auto-post | sends to integrations, writes integration_posts |
| calendar_sync | every 5 minutes, and on wake | refreshes calendar_events |
| meeting notifier | timer, every 15 s | 1 minute before events with 2+ invitees, emits meeting:upcoming |
| call detector | poll every 2 s | mic-in-use per app; emits meeting:detected; auto-stop after 15 min silence |
| retention | daily and on launch | deletes audio files past settings.audio_retention, transcripts past transcript_retention_days |
| trash purge | daily and on launch | hard-deletes notes with deleted_at older than 30 days |
| markdown mirror | after each note save | writes notes as .md to settings.markdown_mirror_dir, one way (fix #6) |
Retries: exponential backoff, 5 attempts, then status failed and the note shows Retry.

## The parts that bite

1. System audio capture: the biggest risk. macOS process taps need 14.2+ and the Screen and System Audio Recording permission; signing and notarisation are required or the prompt never shows. Windows loopback captures everything the speakers play, including notification sounds. Build a capture spike before anything else.
2. Echo: if the user is on speakers, the mic hears the other side, giving duplicate "me" lines. Run echo cancellation (WebRTC AEC via a Rust crate) or drop mic segments that match system audio text.
3. Crash safety (fix #1): close a WAV segment every 30 s with a valid header, fsync, then insert the row. On launch, any note stuck in 'recording' becomes 'saved' and its untranscribed segments are queued.
4. Live transcription speed: whisper on 30 s chunks gives a few seconds of lag; base.en on Apple Silicon is fine, Windows CPU-only machines may need tiny.en. Show the lag honestly in the UI.
5. Local LLM quality and context: a one-hour meeting is about 10,000 words, beyond small models' useful context. Map-reduce: summarise per 10-minute window with segment anchors, then merge into the template. Measure on real meetings before promising quality.
6. Citations (fix #4): ask the model to keep [[seg:id]] anchors; validate in Rust that every anchor exists in the note and strip unknown ones, so a made-up anchor never links anywhere.
7. Time zones: store UTC ms everywhere; convert with the OS time zone only in the UI. ICS feeds carry TZID and recurrence rules, so use a real ICS parser and expand RRULE with DST-aware dates.
8. Idempotency: dedupe_key on jobs; unique (integration_id, generation_id) on posts; calendar upserts by (source_id, provider_event_id, start_at).
9. Races: recording_stop while a segment is being written; only the capture thread closes segments, the command sends a message to it. One writer connection for SQLite with WAL mode, readers on separate connections.
10. Rate limits: Google Calendar and Microsoft Graph are generous at one user; back off on 429. Groq's free tier allows a few thousand tokens a minute; on 429 the request waits for retry-after, up to 3 times. The worker runs LLM jobs one at a time.
11. File sizes: 16 kHz mono 16-bit WAV is about 115 MB per hour for two channels. Retention defaults to 30 days; offer FLAC or Opus later if disk use is a complaint.
12. Search: FTS5 handles full text; semantic search is the brute-force shortcut until it gets slow.
13. Offline: everything works offline except OAuth calendars and integrations.
14. Privacy and deletion: delete forever removes rows, audio files, chunks and FTS rows in one transaction plus a file sweep. No telemetry by default.
15. Recording consent: laws differ by country (two-party consent in parts of the US, Germany's §201 StGB). Show a one-time notice and a "copy consent message" button; never record silently in the background without a note open.
16. Google OAuth verification: calendar.readonly is a sensitive scope. A public client needs Google's verification, so ship it with a "bring your own client ID" path and keep EventKit and ICS as the default.

## Build order

1. Vertical slice (2 to 3 weeks): sign nothing up; open the app, add an ICS or OS calendar, start a note, record mic + system audio to segments, see a live transcript, stop, get enhanced notes from one built-in template, with visible status.
   Screens: S03, S05, S07, S08, S09. Tables: settings, calendar_sources, calendar_events, notes, audio_segments, transcript_segments, generations, templates, jobs. Commands: permissions_*, calendar_add_source, calendar_upcoming, note_create, recording_start/stop, note_update_own, note_get, generate_notes, transcript_get. Proves the hard part: capture on both OSes.
2. Must-haves (features.csv must rows, by area):
   capture and transcript: auto-stop, mic selector, resume, copy all, retry from audio (S08).
   enhance and templates: template editor, slash menu, switch and regenerate, AI text vs own text, citations with audio playback (S09, S13).
   chat: one meeting and all meetings with citations (S10); tables chat_threads, chat_messages, chunks.
   organise and search: folders, multi-folder notes, command palette, FTS search, trash (S06, S19, S22, S23).
   detect: notification before meetings (S20).
   share: copy markdown, export all, markdown mirror.
   onboarding: S01-S04 local-first flow, model downloads.
3. Should-haves: live meeting indicator (S21), ad-hoc call detection, recipes (S11, S12), briefs and follow-up email (S25, S26), jargon, multi-language, summary length, dark mode, images, Slack and Notion posting, local MCP server, voice typing port from Quietkey (S37), settings screens (S27-S29, S32, S33).
4. Could-haves: people and companies (S16-S18), named speakers, consent message helper, generic webhooks, local read-only API, file attachments.
5. Fixes from replica-entrepreneur: fixes 1, 2, 4 and 6 are built into the slice and must-haves above, not added at the end, because they are the positioning. Fixes 3, 7 and 8 are already defaults in this design. Fix 5 (summary length) is a should-have.
6. Milestone 3, separate plan: self-hosted sync server for workspaces, spaces, sharing with Viewer and Collaborator roles, request access and the web viewer (S14, S15, S24, S30, S31, S35, S36).
