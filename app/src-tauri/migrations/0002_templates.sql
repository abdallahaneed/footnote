-- Built-in note templates, written for this app. Same ids and text as app/src/data/seed.ts.
insert into templates (id, name, description, sections, built_in, created_at, updated_at) values
('t-standard', 'Standard meeting', 'Works for most calls.',
 '[{"heading":"Summary","instructions":"The main points in a few lines."},{"heading":"Decisions","instructions":"What was agreed, and by whom."},{"heading":"Next steps","instructions":"Who does what, and by when."}]', 1, 0, 0),
('t-one-on-one', 'One-on-one', 'Regular check-ins with one person.',
 '[{"heading":"How things are going","instructions":"Mood, workload, wins."},{"heading":"Topics","instructions":"What we talked through."},{"heading":"Follow-ups","instructions":"What each of us will do."}]', 1, 0, 0),
('t-customer', 'Customer conversation', 'Sales, support or discovery calls.',
 '[{"heading":"Their situation","instructions":"Context about the customer."},{"heading":"Problems raised","instructions":"Pain points in their words."},{"heading":"What we promised","instructions":"Commitments from our side."}]', 1, 0, 0),
('t-standup', 'Stand-up', 'Short daily team sync.',
 '[{"heading":"Done","instructions":"Finished since last time."},{"heading":"Up next","instructions":"Planned for today."},{"heading":"Blockers","instructions":"Anything in the way."}]', 1, 0, 0);

update settings set default_template_id = 't-standard' where id = 1;
