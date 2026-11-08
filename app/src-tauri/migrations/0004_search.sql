-- S19/F13: keep search_fts current. Triggers only mark a note stale; Rust rewrites its rows before each search,
-- so no write path can forget the index and the text is formatted the same way as export.
create table search_stale (note_id text primary key) strict;
insert into search_stale select id from notes;
create trigger search_notes_ai after insert on notes begin insert or ignore into search_stale values (new.id); end;
create trigger search_notes_au after update of title, own_notes_json, enhanced_md on notes begin insert or ignore into search_stale values (new.id); end;
create trigger search_notes_ad after delete on notes begin insert or ignore into search_stale values (old.id); end;
create trigger search_segs_ai after insert on transcript_segments begin insert or ignore into search_stale values (new.note_id); end;
create trigger search_segs_au after update of text, deleted on transcript_segments begin insert or ignore into search_stale values (new.note_id); end;
create trigger search_segs_ad after delete on transcript_segments begin insert or ignore into search_stale values (old.note_id); end;
