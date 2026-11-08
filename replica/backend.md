# Backend

Date: 2026-11-07. Code: app/src-tauri (Rust core, Tauri v2). The UI calls it through app/src/data/real.ts; in a plain browser app/src/data/fake.ts stands in (Playwright runs against the fake). api.ts types the real layer against the fake, so the two cannot drift apart without a compile error.

Run: cd app && npm run tauri dev. Data: ~/Library/Application Support/dev.abdallah.meetingnotes/ (app.db, audio/<note>/, models/).
Tests: cd app/src-tauri && cargo test (17 unit tests); cargo test -- --include-ignored (adds the real-audio tests: pipeline e2e and system audio, which plays a short sentence through the speakers); cd app && npm run test:e2e (23 browser tests).
Note writing needs Ollama: brew install ollama, ollama pull llama3.2:3b, ollama serve. Without it, notes fail with "The local model did not answer..." and a Try again button.

## What the skill asks for, and what applies here

| skill section | status | why |
| --- | --- | --- |
| Auth (sign up, sessions, roles) | not applicable | Single local user; architecture.md picked "auth: none". The OS account is the boundary. |
| Payments (Stripe) | not applicable | Free tool, no billing. |
| Transactional email | not applicable | "Email to attendees" opens a mailto: draft in the user's own mail app. |
| Database | done | SQLite, migrations 0001 (schema.sql) and 0002 (built-in templates), run on launch by db.rs. Constraints tested. |
| Access rules | not applicable | No second user in a local database. Every command validates its input instead (lib.rs check_id, length and value limits). |
| Seed data | done (browser) | src/data/seed.ts for the browser fake. The desktop app starts empty plus 4 templates; no fake people in a real install. |
| Backups | not done | The database is one file in app data; Time Machine covers it. An "Export all" command is still a must-have (features.csv). |
| Jobs | done | `jobs` table + worker thread: transcribe, enhance, calendar_sync; retries 2/4/8 s then failed with the reason on the note; crash recovery on launch; trash purge and audio retention every 5 minutes. |

## Built

1. Notes, templates, folders, trash, search index, markdown copy, mailto draft: every command the screens use (lib.rs).
2. Capture: mic through cpal into 30 s WAV segments, each synced before its row is written (fix #1). Two-channel pipeline (Me / Them) proven with replayed WAVs.
3. Speech to text: whisper.cpp base model, downloaded once to models/, timed pieces per segment.
4. Note writing: Ollama or any OpenAI-compatible URL. Long meetings are condensed per 20k-character window first. The model cites [S#] lines; Rust keeps only references that exist (fix #4). The user's own lines are kept word for word and marked.
5. Chat: keyword retrieval over notes and transcripts, answer streamed over a Tauri channel, citations link to notes.
6. Calendar: ICS link (S02 screen added), recurring events expanded with their time zone (tested across the October DST change), 5-minute sync, events that leave the feed are removed.
7. System audio (2026-11-08): ScreenCaptureKit captures everything the Mac plays (any call app: Zoom, Teams, Meet, a browser) as the "Them" channel; this app's own sound is excluded. Needs the Screen & System Audio Recording permission. Tested for real: a sentence played through the speakers came back through whisper.
8. Echo filter: a mic line that repeats a system line spoken within 3 s (70% of the same words, 3+ words) is dropped, so speakers do not turn the interviewer's words into "Me" lines.
9. Interviews (2026-11-08): built-in "Job interview" template (questions and my answers, questions I asked, role facts, next steps, what to prepare next time), and chat suggestions across notes ("Which questions came up in more than one interview?"). Put interviews in one folder and ask the folder.
10. Transcript only by default (migration 0003): audio_retention = delete_after_transcript. 30 s pieces exist on disk only until whisper has read them; then they are deleted. "Transcribe again" therefore only works while audio is kept (setting).
11. Quit safety: recordings are flushed and the whisper model freed on exit. Without that, ggml's Metal backend aborts the process at exit (found by the e2e test; Quietkey uses the same whisper-rs and has no such handling).

## Not built (in order of risk)

1. Windows system audio (WASAPI loopback). macOS is done.
2. Real acoustic echo cancellation. The text-level filter covers the common case; heavy echo with different wording slips through. Headphones avoid it.
3. Audio playback behind a cited line (audio_play_range).
4. EventKit (macOS calendar without a link), meeting notifications (S20), call detection.
5. Settings screen: model, URL, retention, jargon, markdown folder exist as settings_update but have no UI.
6. Embeddings for chat (chunks table unused), FTS5 search (search_fts unused).
7. Chat history persistence (chat_threads tables unused), chat cancel.
8. Mic picker wiring (settings.mic_id is read, the UI selector does not set it).

## Integrations (milestone 2, not built)

| integration | official API | scopes / access | review | limits |
| --- | --- | --- | --- | --- |
| Google Calendar (optional, ICS covers most) | Calendar API v3, OAuth 2 PKCE, loopback redirect | calendar.events.readonly (sensitive) | Google OAuth verification for a public client: weeks, needs a privacy policy and a demo video. Start early, or ship "bring your own client ID". | per-user quota is generous; back off on 429 |
| Microsoft calendar | Graph /me/calendarView, PKCE | Calendars.Read (delegated) | publisher verification recommended; no review for this scope | throttling 429 with Retry-After |
| Slack | incoming webhook URL the user creates | none beyond the webhook | none | 1 message per second per webhook |
| Notion | REST API with the user's own internal integration token | the pages the user shares with it | none for internal integrations | ~3 requests per second |
| MCP | local stdio server reading app.db read-only | local only | none | n/a |

Secrets for these go in the macOS Keychain / Windows Credential Manager (integrations.keychain_ref), never in app.db.

## Security checklist

- [x] secrets only in env vars or the OS keychain, `.env*` in .gitignore, nothing in the client bundle (the app has no secrets today)
- [x] input validated on the trust boundary: every Tauri command checks ids, lengths and values; the schema's check constraints back it up
- [x] authorisation: not applicable (single local user); Tauri capabilities limit the webview to core events and opening mailto:/https links
- [ ] rate limits: not applicable to a local app; outbound calls back off (jobs retry 2/4/8 s)
- [ ] webhooks verify signatures: no inbound webhooks
- [ ] uploads: attachments not built yet
- [x] no user data in URLs or logs: logs print errors only, never transcript text
- [x] dependencies audited: npm audit 0 vulnerabilities; cargo audit not installed (cargo install cargo-audit, then run it)
- [ ] privacy policy: not written; must name Hugging Face (one model download) and, if the user sets one, their own LLM URL. No other processor.
- [x] CSP set in tauri.conf.json (self + IPC only)
- [x] deleting a note forever removes rows, transcript, generations and the audio folder

## Known limits

1. Transcript lag up to ~35 s (30 s segments). Shorter segments trade accuracy for speed.
2. Moved single instances of a recurring meeting (RECURRENCE-ID) show at the original time.
3. One SQLite connection behind a mutex for UI and worker; the model calls run without the lock.
4. The real data layer has not been clicked through in the desktop window yet (screen capture of the window needs a permission). The Rust side is covered by tests; the UI side by the type check against the fake.

## Consent

The app never tells the other party anything: no bot joins, no message is sent. It still captures their voice from the
system output to transcribe it. In Germany, recording the non-public spoken word without consent is an offence
(§201 StGB); in parts of the US both sides must agree. Defaults reduce exposure (no audio kept, transcript stays on the
Mac, never shared) but do not make it legal advice. A one-time notice and a "copy consent message" button are still on
the list (architecture.md, part 15).
