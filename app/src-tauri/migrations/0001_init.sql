-- 0001_init.sql for the meeting-notes clone (working name until /replica-brand picks one).
-- Local SQLite database in the OS app-data folder (macOS ~/Library/Application Support/<bundle id>/app.db,
-- Windows %APPDATA%\<bundle id>\app.db). Same conventions as Quietkey:
--   single local user, so no owner columns; access control is the OS file permission on the app folder
--   ids: UUIDv7 text made in Rust (time-sortable)
--   times: unix epoch milliseconds, UTC, integer. Time zones are applied only in the UI.
--   booleans: integer 0/1 with a check
--   every table is STRICT; foreign keys need `pragma foreign_keys = on` per connection (db.rs sets it)
-- Milestone 3 (team sync server) gets its own Postgres schema later; nothing here assumes it.

pragma foreign_keys = on;

create table templates (
  id           text    primary key,
  name         text    not null,
  description  text    not null default '',
  sections     text    not null check (json_valid(sections) and json_array_length(sections) > 0), -- [{heading, instructions}]
  built_in     integer not null default 0 check (built_in in (0,1)),  -- our own starter set, written for this app
  created_at   integer not null,
  updated_at   integer not null
) strict;

-- One row only. Typed columns so bad values fail at write time.
create table settings (
  id                      integer primary key check (id = 1),
  user_name               text,
  user_role               text,                                 -- "job info and context for notes" (S27)
  user_context            text,
  default_template_id     text references templates(id) on delete set null,
  summary_length          text    not null default 'normal' check (summary_length in ('short','normal','detailed')),
  languages               text    not null default '["en"]' check (json_valid(languages)),
  jargon                  text    not null default '[]' check (json_valid(jargon)),   -- personal terms, max 30 enforced in Rust
  mic_id                  text,                                 -- null = Auto
  stt_model               text    not null default 'base.en',
  llm_provider            text    not null default 'ollama' check (llm_provider in ('ollama','openai_compatible','none')),
  llm_model               text    not null default 'llama3.2:3b',
  llm_url                 text    not null default 'http://127.0.0.1:11434',
  embed_model             text    not null default 'nomic-embed-text',
  audio_retention         text    not null default 'keep_30d'
                                  check (audio_retention in ('delete_after_transcript','keep_7d','keep_30d','keep_forever')),
  transcript_retention_days integer check (transcript_retention_days is null or transcript_retention_days > 0),
  markdown_mirror_dir     text,                                 -- null = off; fix #6
  live_indicator          integer not null default 1 check (live_indicator in (0,1)),
  notify_before_meeting   integer not null default 1 check (notify_before_meeting in (0,1)),
  detect_adhoc_calls      integer not null default 1 check (detect_adhoc_calls in (0,1)),
  muted_detect_apps       text    not null default '[]' check (json_valid(muted_detect_apps)),
  theme                   text    not null default 'system' check (theme in ('light','dark','system')),
  onboarding_done         integer not null default 0 check (onboarding_done in (0,1)),
  updated_at              integer not null default (unixepoch('subsec') * 1000)
) strict;

-- Where meetings come from. No account needed: 'os' (EventKit on macOS) or an ICS URL work without any login.
create table calendar_sources (
  id            text    primary key,
  kind          text    not null check (kind in ('os','ics','google','microsoft')),
  label         text    not null,
  ics_url       text,
  account_email text,
  keychain_ref  text,                                 -- OAuth refresh token lives in the OS keychain, never in this file
  enabled       integer not null default 1 check (enabled in (0,1)),
  last_sync_at  integer,
  last_error    text,
  created_at    integer not null,
  updated_at    integer not null,
  check (kind <> 'ics' or ics_url is not null)
) strict;

create table calendar_events (
  id                  text    primary key,
  source_id           text    not null references calendar_sources(id) on delete cascade,
  provider_event_id   text    not null,
  recurring_series_id text,
  title               text    not null,
  organiser_email     text,
  invitees            text    not null default '[]' check (json_valid(invitees)),   -- [{email,name,response}]
  start_at            integer not null,
  end_at              integer not null,
  video_link          text,
  cancelled           integer not null default 0 check (cancelled in (0,1)),
  created_at          integer not null,
  updated_at          integer not null,
  check (end_at >= start_at),
  unique (source_id, provider_event_id, start_at)      -- recurring instances share an id, differ by start
) strict;
create index calendar_events_start on calendar_events (start_at);
create index calendar_events_series on calendar_events (recurring_series_id);

create table folders (
  id               text    primary key,
  parent_folder_id text    references folders(id) on delete cascade,   -- one level deep, enforced by triggers below
  name             text    not null,
  icon             text,
  description      text    not null default '',
  position         integer not null default 0,
  created_at       integer not null,
  updated_at       integer not null
) strict;
create index folders_parent on folders (parent_folder_id);

create trigger folders_one_level_insert before insert on folders
when new.parent_folder_id is not null
 and (select parent_folder_id from folders where id = new.parent_folder_id) is not null
begin select raise(abort, 'subfolders are one level deep'); end;

create trigger folders_one_level_update before update of parent_folder_id on folders
when new.parent_folder_id is not null
 and ((select parent_folder_id from folders where id = new.parent_folder_id) is not null
      or exists (select 1 from folders where parent_folder_id = new.id))
begin select raise(abort, 'subfolders are one level deep'); end;

create table notes (
  id                text    primary key,
  title             text    not null default '',
  calendar_event_id text    references calendar_events(id) on delete set null,  -- note survives the event vanishing
  template_id       text    references templates(id) on delete set null,
  own_notes_json    text    not null default '{"type":"doc","content":[]}' check (json_valid(own_notes_json)), -- editor doc, user's text
  enhanced_md       text,                                -- AI notes; lines carry [[seg:<id>]] anchors (fix #4)
  pipeline_status   text    not null default 'idle'
                    check (pipeline_status in ('idle','recording','saved','transcribing','enhancing','done','failed')),
  pipeline_error    text,
  meeting_at        integer not null,                    -- event start, else creation time
  started_at        integer,                             -- first audio
  ended_at          integer,                             -- last audio; duration = ended_at - started_at (fix #8)
  deleted_at        integer,                             -- in Trash; purged after 30 days
  created_at        integer not null,
  updated_at        integer not null,
  check (ended_at is null or started_at is null or ended_at >= started_at),
  check (pipeline_status <> 'failed' or pipeline_error is not null)
) strict;
create index notes_meeting_at on notes (meeting_at desc) where deleted_at is null;
create index notes_event on notes (calendar_event_id);
create index notes_template on notes (template_id);
create index notes_deleted on notes (deleted_at) where deleted_at is not null;
create unique index notes_one_per_event on notes (calendar_event_id) where calendar_event_id is not null and deleted_at is null;

-- Audio on disk in short WAV segments, written while recording, so a crash loses at most one segment (fix #1).
create table audio_segments (
  id          text    primary key,
  note_id     text    not null references notes(id) on delete cascade,
  channel     text    not null check (channel in ('mic','system')),
  seq         integer not null,
  path        text    not null,                    -- relative to app-data/audio/<note_id>/
  start_ms    integer not null,                    -- offset from notes.started_at
  duration_ms integer not null check (duration_ms >= 0),
  bytes       integer not null check (bytes >= 0),
  transcribed integer not null default 0 check (transcribed in (0,1)),
  deleted_at  integer,                             -- file removed by retention job, row kept for the timeline
  created_at  integer not null,
  unique (note_id, channel, seq)
) strict;
create index audio_segments_retention on audio_segments (created_at) where deleted_at is null;

create table transcript_segments (
  id               text    primary key,
  note_id          text    not null references notes(id) on delete cascade,
  audio_segment_id text    references audio_segments(id) on delete set null,
  source           text    not null check (source in ('microphone','speaker')),
  attribution      text    not null check (attribution in ('me','them')),
  speaker_label    text,                           -- diarization label or name, later milestone
  text             text    not null,
  start_ms         integer not null,
  end_ms           integer not null,
  deleted          integer not null default 0 check (deleted in (0,1)),  -- user deleted a chunk; excluded on regenerate
  created_at       integer not null,
  check (end_ms >= start_ms)
) strict;
create index transcript_segments_note on transcript_segments (note_id, start_ms);
create index transcript_segments_audio on transcript_segments (audio_segment_id);

-- Each enhancement run, so Retry and "regenerate with another template" keep history and errors (fix #2).
create table generations (
  id             text    primary key,
  note_id        text    not null references notes(id) on delete cascade,
  template_id    text    references templates(id) on delete set null,
  summary_length text    not null check (summary_length in ('short','normal','detailed')),
  model          text    not null,
  status         text    not null check (status in ('queued','running','done','failed')),
  output_md      text,
  error          text,
  started_at     integer,
  finished_at    integer,
  created_at     integer not null
) strict;
create index generations_note on generations (note_id, created_at desc);
create index generations_template on generations (template_id);

create table attachments (
  id         text    primary key,
  note_id    text    not null references notes(id) on delete cascade,
  kind       text    not null check (kind in ('image','file')),
  path       text    not null,
  mime       text    not null,
  bytes      integer not null check (bytes >= 0),
  width      integer,
  height     integer,
  created_at integer not null
) strict;
create index attachments_note on attachments (note_id);

create table note_folders (
  note_id   text    not null references notes(id) on delete cascade,
  folder_id text    not null references folders(id) on delete cascade,
  added_at  integer not null,
  primary key (note_id, folder_id)
) strict, without rowid;
create index note_folders_folder on note_folders (folder_id);

create table folder_auto_add (
  folder_id           text not null references folders(id) on delete cascade,
  recurring_series_id text not null,
  primary key (folder_id, recurring_series_id)
) strict, without rowid;
create index folder_auto_add_series on folder_auto_add (recurring_series_id);

create table companies (
  id         text    primary key,
  domain     text    not null unique collate nocase,
  name       text    not null,
  created_at integer not null,
  updated_at integer not null
) strict;

create table people (
  id         text    primary key,
  email      text    not null unique collate nocase,
  name       text,
  company_id text    references companies(id) on delete set null,
  created_at integer not null,
  updated_at integer not null
) strict;
create index people_company on people (company_id);

create table note_attendees (
  note_id   text not null references notes(id) on delete cascade,
  person_id text not null references people(id) on delete cascade,
  primary key (note_id, person_id)
) strict, without rowid;
create index note_attendees_person on note_attendees (person_id);

create table recipes (
  id         text    primary key,
  slug       text    not null unique check (length(slug) between 1 and 40 and slug not glob '*[^a-z0-9-]*'),  -- the /shortcut
  name       text    not null,
  prompt     text    not null,
  scope      text    not null check (scope in ('single','multiple')),
  model      text,                                 -- null = settings.llm_model
  built_in   integer not null default 0 check (built_in in (0,1)),
  created_at integer not null,
  updated_at integer not null
) strict;

create table chat_threads (
  id         text    primary key,
  scope_type text    not null check (scope_type in ('all','note','folder','selection','person','company')),
  scope_ids  text    not null default '[]' check (json_valid(scope_ids)),
  title      text    not null default '',
  model      text    not null,
  created_at integer not null,
  updated_at integer not null
) strict;
create index chat_threads_updated on chat_threads (updated_at desc);

create table chat_messages (
  id             text    primary key,
  thread_id      text    not null references chat_threads(id) on delete cascade,
  role           text    not null check (role in ('user','assistant')),
  content        text    not null,
  cited_segments text    not null default '[]' check (json_valid(cited_segments)),  -- transcript_segment ids
  recipe_id      text    references recipes(id) on delete set null,
  status         text    not null default 'done' check (status in ('streaming','done','failed')),
  created_at     integer not null
) strict;
create index chat_messages_thread on chat_messages (thread_id, created_at);
create index chat_messages_recipe on chat_messages (recipe_id);

-- Retrieval chunks for chat across meetings. Brute-force cosine in Rust.
-- shortcut: linear scan over embeddings, fine to ~50k chunks; upgrade to sqlite-vec when search > 200 ms.
create table chunks (
  id          text    primary key,
  note_id     text    not null references notes(id) on delete cascade,
  kind        text    not null check (kind in ('transcript','enhanced','own')),
  text        text    not null,
  start_ms    integer,
  end_ms      integer,
  segment_ids text    not null default '[]' check (json_valid(segment_ids)),
  embed_model text    not null,
  embedding   blob    not null,                    -- f32 little-endian
  created_at  integer not null
) strict;
create index chunks_note on chunks (note_id);

-- Full-text search over titles, own notes, enhanced notes and transcripts (S19, F13). Rebuilt per note in Rust.
create virtual table search_fts using fts5 (
  note_id unindexed, field unindexed, body,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Durable work queue: transcribe, enhance, embed, post, calendar sync. Survives a crash or quit (fix #1, #2).
create table jobs (
  id          text    primary key,
  kind        text    not null check (kind in ('transcribe','enhance','embed','post','calendar_sync')),
  note_id     text    references notes(id) on delete cascade,
  payload     text    not null default '{}' check (json_valid(payload)),
  status      text    not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts    integer not null default 0 check (attempts >= 0),
  run_after   integer not null,
  last_error  text,
  dedupe_key  text,                                -- e.g. 'enhance:<generation_id>'
  created_at  integer not null,
  updated_at  integer not null
) strict;
create index jobs_ready on jobs (status, run_after);
create index jobs_note on jobs (note_id);
create unique index jobs_dedupe on jobs (dedupe_key) where dedupe_key is not null and status in ('queued','running');

-- Outbound integrations (milestone 2). Secrets in the OS keychain.
create table integrations (
  id           text    primary key,
  kind         text    not null check (kind in ('slack_webhook','notion','webhook')),
  label        text    not null,
  keychain_ref text    not null,
  config       text    not null default '{}' check (json_valid(config)),  -- e.g. notion database id
  enabled      integer not null default 1 check (enabled in (0,1)),
  created_at   integer not null,
  updated_at   integer not null
) strict;

create table folder_auto_post (
  folder_id      text not null references folders(id) on delete cascade,
  integration_id text not null references integrations(id) on delete cascade,
  primary key (folder_id, integration_id)
) strict, without rowid;
create index folder_auto_post_integration on folder_auto_post (integration_id);

-- One row per delivery, so a retried job never posts the same generation twice.
create table integration_posts (
  id             text    primary key,
  integration_id text    not null references integrations(id) on delete cascade,
  note_id        text    not null references notes(id) on delete cascade,
  generation_id  text    not null references generations(id) on delete cascade,
  status         text    not null check (status in ('sent','failed')),
  response       text,
  created_at     integer not null,
  unique (integration_id, generation_id)
) strict;
create index integration_posts_note on integration_posts (note_id);
create index integration_posts_generation on integration_posts (generation_id);

-- Voice typing in any app (F16), carried over from Quietkey.
create table dictations (
  id          text    primary key,
  raw_text    text    not null,
  final_text  text    not null,
  app_id      text,
  duration_ms integer not null check (duration_ms >= 0),
  created_at  integer not null
) strict;
create index dictations_created on dictations (created_at desc);

insert into settings (id) values (1);
