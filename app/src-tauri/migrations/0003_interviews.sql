-- Job interview template, written for this app, and transcript-only by default: audio files are deleted as soon
-- as they are transcribed, so no recording of the other side is kept (the app still briefly stores 30 s pieces
-- until whisper has read them).
insert into templates (id, name, description, sections, built_in, created_at, updated_at) values
('t-interview', 'Job interview', 'What they asked, what you answered, and what to prepare next time.',
 '[{"heading":"Questions and my answers","instructions":"One bullet per question the interviewer (Them) asked, in order: the question in their words, then what I (Me) answered, briefly."},{"heading":"Questions I asked","instructions":"What I asked them and what they answered."},{"heading":"About the role and company","instructions":"Facts they shared: team, tasks, tools, salary, location, hiring process, people named."},{"heading":"Next steps","instructions":"What happens next, who contacts whom, and dates."},{"heading":"Prepare better next time","instructions":"Questions where my answer was vague, short or missing, and what I should prepare. Only from the transcript."}]',
 1, 0, 0);

update settings set audio_retention = 'delete_after_transcript' where id = 1;
