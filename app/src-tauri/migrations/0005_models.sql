-- Ollama is gone: notes are written by Apple's built-in model (default, on device) or Groq with the user's own
-- free key (kept in the Keychain, not here). SQLite cannot change a check constraint, so the one row is copied.
create table settings_new (
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
  llm_provider            text    not null default 'apple' check (llm_provider in ('apple','groq','none')),
  llm_model               text    not null default 'openai/gpt-oss-120b',  -- Groq model; Apple's has no choice
  llm_url                 text    not null default 'https://api.groq.com/openai/v1',
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
insert into settings_new (id, user_name, user_role, user_context, default_template_id, summary_length, languages, jargon, mic_id, stt_model, embed_model, audio_retention, transcript_retention_days, markdown_mirror_dir, live_indicator, notify_before_meeting, detect_adhoc_calls, muted_detect_apps, theme, onboarding_done, updated_at, llm_provider)
  select id, user_name, user_role, user_context, default_template_id, summary_length, languages, jargon, mic_id, stt_model, embed_model, audio_retention, transcript_retention_days, markdown_mirror_dir, live_indicator, notify_before_meeting, detect_adhoc_calls, muted_detect_apps, theme, onboarding_done, updated_at, case llm_provider when 'none' then 'none' else 'apple' end from settings;
drop table settings;
alter table settings_new rename to settings;
