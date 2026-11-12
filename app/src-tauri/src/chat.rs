//! Questions about one note, a folder or all notes. The model only sees text taken from the notes, and the
//! answer links back to the notes it used.
use crate::enhance::export_md;
use crate::notes::{self, own_text, title_of};
use rusqlite::{params_from_iter, Connection};
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
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

#[cfg(test)]
mod tests {
    use super::*;

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
