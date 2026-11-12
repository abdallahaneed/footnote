//! Questions about one note, a folder or all notes. The model only sees text taken from the notes, and the
//! answer links back to the notes it used.
use crate::enhance::export_md;
use crate::notes::{self, own_text, title_of};
use rusqlite::{params_from_iter, Connection};
use serde::Serialize;

#[derive(Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct Citation {
    pub label: String,
    pub href: String,
}

pub struct Context {
    pub text: String,
    pub notes: Vec<(String, String)>, // (id, title), [N1] is notes[0]
}

const STOP: &[&str] = &["what", "when", "with", "that", "this", "have", "about", "does", "there", "from", "they", "were", "which", "would",
    "should", "could", "your", "notes", "meeting", "meetings", "tell", "please", "the", "and", "did", "who", "how", "was"];

fn words(q: &str) -> Vec<String> {
    q.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| w.chars().count() >= 3 && !STOP.contains(w)).map(str::to_string).collect()
}

/// Picks what the model reads. One note: all of it. Many: the notes that match the question best, with their
/// written-up notes and the transcript lines that match.
// shortcut: keyword matching; the embeddings in `chunks` come with the embed job.
/// `budget` is how many characters of notes the model gets (Llm::window).
pub fn context(conn: &Connection, scope: Option<&[String]>, question: &str, budget: usize) -> anyhow::Result<Context> {
    let ids: Vec<String> = match scope {
        Some(ids) => {
            let marks = vec!["?"; ids.len()].join(",");
            let mut st = conn.prepare(&format!("select id from notes where deleted_at is null and id in ({marks}) order by created_at desc"))?;
            st.query_map(params_from_iter(ids.iter()), |r| r.get(0))?.collect::<Result<_, _>>()?
        }
        None => {
            let mut st = conn.prepare("select id from notes where deleted_at is null order by created_at desc limit 500")?;
            st.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?
        }
    };
    let q = words(question);
    let mut scored = Vec::new();
    for id in &ids {
        let (title, own, md, created): (String, String, Option<String>, i64) =
            conn.query_row("select title, own_notes_json, enhanced_md, created_at from notes where id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
        let segs = notes::segments(conn, id)?;
        let written = md.as_deref().map(export_md).unwrap_or_default();
        let hits = |t: &str| { let t = t.to_lowercase(); q.iter().filter(|w| t.contains(w.as_str())).count() };
        let matching: Vec<String> = segs.iter().filter(|s| !s.deleted && (ids.len() == 1 || hits(&s.text) > 0)).map(|s| format!("{} ({}): {}", s.speaker, notes::clock(s.start_ms), s.text)).collect();
        let score = hits(&title) * 3 + hits(&written) * 2 + hits(&own_text(&own)) * 2 + matching.len();
        let date = chrono::DateTime::from_timestamp_millis(created).map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default();
        let body = format!("Title: {}\nDate: {date}\nNotes:\n{}\n{}\nTranscript:\n{}", title_of(&title), written, own_text(&own), matching.join("\n"));
        scored.push((score, id.clone(), title_of(&title), body));
    }
    if ids.len() > 1 {
        scored.sort_by(|a, b| b.0.cmp(&a.0));
        // questions like "list the action items" match nothing: fall back to the newest notes
        if scored.first().is_some_and(|s| s.0 > 0) {
            scored.retain(|s| s.0 > 0);
        }
    }
    let (mut text, mut used) = (String::new(), Vec::new());
    for (_, id, title, body) in scored.into_iter().take(8) {
        let room = budget.saturating_sub(text.len());
        if room < 500 {
            break;
        }
        used.push((id, title));
        text.push_str(&format!("[N{}]\n{}\n\n", used.len(), body.chars().take(room).collect::<String>()));
    }
    Ok(Context { text, notes: used })
}

const SYSTEM: &str = "You answer questions about the user's meeting notes. Use only the notes given; if they do not contain \
the answer, say so plainly. Be brief. After each fact, cite the note it came from like [N1]. Answer in the language of the question.";

pub fn answer(llm: &crate::enhance::Llm, ctx: &Context, question: &str, on_token: impl FnMut(&str) -> bool) -> anyhow::Result<Vec<Citation>> {
    if ctx.notes.is_empty() {
        let mut on_token = on_token;
        on_token("There are no notes here yet, so there is nothing to look through.");
        return Ok(Vec::new());
    }
    let all = crate::enhance::stream(llm, SYSTEM, &format!("Notes:\n{}\nQuestion: {question}", ctx.text), on_token)?;
    let cited: Vec<Citation> = ctx
        .notes
        .iter()
        .enumerate()
        .filter(|(i, _)| all.contains(&format!("N{}", i + 1)))
        .map(|(_, (id, title))| Citation { label: title.clone(), href: format!("#/note/{id}") })
        .collect();
    Ok(cited)
}

/* History (S10): one thread per conversation, kept per scope ------------------------------------------ */

/// ("all", "[]"), ("note", [id]) or ("selection", sorted ids): the same notes always find the same chats.
fn scope_key(scope: Option<&[String]>) -> (&'static str, String) {
    match scope {
        None => ("all", "[]".into()),
        Some(ids) => {
            let mut ids = ids.to_vec();
            ids.sort();
            (if ids.len() == 1 { "note" } else { "selection" }, serde_json::to_string(&ids).unwrap_or_else(|_| "[]".into()))
        }
    }
}

pub fn thread_start(conn: &Connection, scope: Option<&[String]>, question: &str, model: &str) -> anyhow::Result<String> {
    let (kind, ids) = scope_key(scope);
    let id = crate::db::uid();
    let title: String = question.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(80).collect();
    let now = crate::db::now_ms();
    conn.execute(
        "insert into chat_threads (id, scope_type, scope_ids, title, model, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        rusqlite::params![id, kind, ids, title, model, now],
    )?;
    Ok(id)
}

pub fn add_message(conn: &Connection, thread: &str, role: &str, content: &str, citations: &[Citation], status: &str) -> anyhow::Result<()> {
    let now = crate::db::now_ms();
    let n = conn.execute("update chat_threads set updated_at = ?2 where id = ?1", rusqlite::params![thread, now])?;
    anyhow::ensure!(n == 1, "This chat was deleted.");
    conn.execute(
        "insert into chat_messages (id, thread_id, role, content, citations, status, created_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![crate::db::uid(), thread, role, content, serde_json::to_string(citations)?, status, now],
    )?;
    Ok(())
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub id: String,
    pub title: String,
    pub updated_at: i64,
    pub messages: i64,
}

/// Chats for exactly these notes, newest first.
pub fn threads(conn: &Connection, scope: Option<&[String]>) -> anyhow::Result<Vec<Thread>> {
    let (kind, ids) = scope_key(scope);
    let mut st = conn.prepare(
        "select t.id, t.title, t.updated_at, (select count(*) from chat_messages m where m.thread_id = t.id)
         from chat_threads t where t.scope_type = ?1 and t.scope_ids = ?2 order by t.updated_at desc limit 50",
    )?;
    let rows = st.query_map(rusqlite::params![kind, ids], |r| Ok(Thread { id: r.get(0)?, title: r.get(1)?, updated_at: r.get(2)?, messages: r.get(3)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub role: String,
    pub content: String,
    pub citations: Vec<Citation>,
    pub failed: bool,
}

pub fn messages(conn: &Connection, thread: &str) -> anyhow::Result<Vec<Message>> {
    let mut st = conn.prepare("select role, content, citations, status from chat_messages where thread_id = ?1 order by created_at, rowid")?;
    let rows = st.query_map([thread], |r| {
        let (c, s): (String, String) = (r.get(2)?, r.get(3)?);
        Ok(Message { role: r.get(0)?, content: r.get(1)?, citations: serde_json::from_str(&c).unwrap_or_default(), failed: s == "failed" })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn delete_thread(conn: &Connection, id: &str) -> anyhow::Result<()> {
    conn.execute("delete from chat_threads where id = ?1", [id])?; // messages go with it (on delete cascade)
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_is_kept_per_scope_and_deletes_cleanly() {
        let c = crate::db::mem();
        let (a, b) = ("n-a".to_string(), "n-b".to_string());
        let t = thread_start(&c, Some(&[a.clone()]), "  What did   we decide about pricing?  ", "apple").unwrap();
        add_message(&c, &t, "user", "What did we decide about pricing?", &[], "done").unwrap();
        let cite = vec![Citation { label: "Roadmap".into(), href: "#/note/n-a".into() }];
        add_message(&c, &t, "assistant", "Price stays.", &cite, "done").unwrap();
        let both = thread_start(&c, Some(&[b.clone(), a.clone()]), "x", "apple").unwrap();
        thread_start(&c, None, "everything", "apple").unwrap();

        let here = threads(&c, Some(&[a.clone()])).unwrap();
        assert_eq!((here.len(), here[0].title.as_str(), here[0].messages), (1, "What did we decide about pricing?", 2));
        assert_eq!(threads(&c, Some(&[a.clone(), b.clone()])).unwrap()[0].id, both, "same notes in another order: same chats");
        assert_eq!(threads(&c, None).unwrap().len(), 1);
        let m = messages(&c, &t).unwrap();
        assert_eq!((m[1].content.as_str(), m[1].citations.clone(), m[1].failed), ("Price stays.", cite, false));

        delete_thread(&c, &t).unwrap();
        assert!(threads(&c, Some(&[a.clone()])).unwrap().is_empty());
        assert_eq!(c.query_row("select count(*) from chat_messages", [], |r| r.get::<_, i64>(0)).unwrap(), 0, "messages deleted too");
        assert!(add_message(&c, &t, "user", "late", &[], "done").unwrap_err().to_string().contains("deleted"));
        let long = thread_start(&c, None, &"word ".repeat(40), "m").unwrap();
        assert!(threads(&c, None).unwrap().iter().find(|t| t.id == long).unwrap().title.chars().count() <= 80);
    }

    #[test]
    fn picks_matching_notes() {
        let c = crate::db::mem();
        let a = notes::create(&c, None).unwrap();
        let b = notes::create(&c, None).unwrap();
        notes::update_own(&c, &a, Some("Hiring sync"), Some("second candidate strongest"), None).unwrap();
        notes::update_own(&c, &b, Some("Roadmap"), Some("export slipped"), None).unwrap();
        let ctx = context(&c, None, "What did we say about the candidate?", 20_000).unwrap();
        assert_eq!(ctx.notes.iter().map(|n| n.1.as_str()).collect::<Vec<_>>(), vec!["Hiring sync"]);
        assert!(ctx.text.starts_with("[N1]\nTitle: Hiring sync"));
        let all = context(&c, None, "list the action items", 20_000).unwrap();
        assert_eq!(all.notes.len(), 2, "no keyword match: newest notes");
        let scoped = context(&c, Some(&[b.clone()]), "anything", 20_000).unwrap();
        assert_eq!(scoped.notes[0].0, b);
        let none = context(&c, Some(&[]), "x", 6_000).unwrap();
        let mut said = String::new();
        let llm = crate::enhance::Llm { provider: "groq".into(), url: "http://127.0.0.1:9".into(), model: "m".into(), key: "k".into() };
        assert!(answer(&llm, &none, "x", |t| { said.push_str(t); true }).unwrap().is_empty());
        assert!(said.contains("no notes"));
    }
}
