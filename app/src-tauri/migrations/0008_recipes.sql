-- S11/S12 starter recipes, written for Footnote. Built in = read-only; duplicate one to change it.
insert into recipes (id, slug, name, prompt, scope, built_in, created_at, updated_at) values
 ('r-follow-up', 'follow-up', 'Follow-up email',
  'Write a short follow-up email to the people in this meeting. Thank them in one line, list what was agreed with who owns each item and by when, then the questions still open. Plain text, under 150 words.',
  'single', 1, 0, 0),
 ('r-decisions', 'decisions', 'Decisions',
  'List every decision made in this meeting, who owns it, and the reason given for it. If nothing was decided, say so plainly.',
  'single', 1, 0, 0),
 ('r-weekly-update', 'weekly-update', 'Weekly update',
  'Write a weekly update from these meetings: progress, decisions, risks and what comes next. Group the points by topic, not by meeting, and keep each to one line.',
  'multiple', 1, 0, 0),
 ('r-open-questions', 'open-questions', 'Open questions',
  'List the questions that were raised in these meetings but not answered, and the meeting each one came from.',
  'multiple', 1, 0, 0);
