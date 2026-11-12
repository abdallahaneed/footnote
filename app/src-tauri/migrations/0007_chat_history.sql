-- S10 chat history: the notes an answer links to, as shown under it ([{label, href}]).
alter table chat_messages add column citations text not null default '[]' check (json_valid(citations));
