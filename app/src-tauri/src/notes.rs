//! Reads and writes for notes, templates, folders and trash. Shapes match app/src/data/types.ts.
use crate::db::{now_ms, uid};
use crate::enhance::{self, GenLine};
use anyhow::{bail, ensure, Context};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Person {
    pub name: String,
    pub email: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calendar_event_id: Option<String>,
    pub attendees: Vec<Person>,
    pub created_at: i64,
    pub updated_at: i64,
    pub recorded_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recording_since: Option<i64>,
    pub own_text: String,
    pub template_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generated: Option<Vec<GenLine>>,
    pub folder_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<i64>,
    /// Set when recording stopped on its own: "silence" or "call_ended".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_reason: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub id: String,
    pub note_id: String,
    pub side: String,
    pub speaker: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
    pub deleted: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Section {
    pub heading: String,
    pub instructions: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: String,
    pub name: String,
    pub description: String,
    pub sections: Vec<Section>,
    pub built_in: bool,
}

#[derive(Serialize, Debug)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub count: i64,
}

/// What capture knows about a running recording: (wall clock start, audio recorded before this session).
pub type LiveInfo = Option<(i64, i64)>;

fn ui_status(db: &str) -> &str {
    match db {
        "idle" => "draft",
        "enhancing" => "writing",
        s => s,
    }
}

pub fn own_text(json: &str) -> String {
    serde_json::from_str::<serde_json::Value>(json).ok().and_then(|v| v["text"].as_str().map(str::to_string)).unwrap_or_default()
}

pub fn attendees(conn: &Connection, note_id: &str) -> rusqlite::Result<Vec<Person>> {
    let mut st = conn.prepare(
        "select coalesce(p.name, p.email), p.email from note_attendees a join people p on p.id = a.person_id where a.note_id = ?1 order by p.name",
    )?;
    st.query_map([note_id], |r| Ok(Person { name: r.get(0)?, email: r.get(1)? }))?.collect()
}

fn folder_ids(conn: &Connection, note_id: &str) -> rusqlite::Result<Vec<String>> {
    let mut st = conn.prepare("select folder_id from note_folders where note_id = ?1")?;
    st.query_map([note_id], |r| r.get(0))?.collect()
}

fn recorded_ms(conn: &Connection, note_id: &str) -> rusqlite::Result<i64> {
    // both channels run in parallel, so the longer one is the meeting length
    conn.query_row(
        "select coalesce(max(total), 0) from (select sum(duration_ms) total from audio_segments where note_id = ?1 group by channel)",
        [note_id],
        |r| r.get(0),
    )
}

fn progress(conn: &Connection, note_id: &str) -> rusqlite::Result<i64> {
    let (done, all): (i64, i64) = conn.query_row(
        "select coalesce(sum(transcribed), 0), count(*) from audio_segments where note_id = ?1",
        [note_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    Ok(if all == 0 { 0 } else { done * 100 / all })
}

const NOTE_COLS: &str = "id, title, calendar_event_id, created_at, updated_at, own_notes_json, coalesce(template_id, 't-standard'),
  pipeline_status, pipeline_error, enhanced_md, deleted_at, stop_reason";

pub fn note(conn: &Connection, id: &str, live: impl Fn(&str) -> LiveInfo, with_generated: bool) -> anyhow::Result<Note> {
    let n = conn
        .query_row(&format!("select {NOTE_COLS} from notes where id = ?1"), [id], |r| {
            Ok((
                r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, i64>(3)?, r.get::<_, i64>(4)?,
                r.get::<_, String>(5)?, r.get::<_, String>(6)?, r.get::<_, String>(7)?, r.get::<_, Option<String>>(8)?,
                r.get::<_, Option<String>>(9)?, r.get::<_, Option<i64>>(10)?, r.get::<_, Option<String>>(11)?,
            ))
        })
        .optional()?
        .context("This note no longer exists.")?;
    let (id, title, event, created, updated, own, template, status, error, md, deleted, stop_reason) = n;
    let live = live(&id);
    Ok(Note {
        attendees: attendees(conn, &id)?,
        folder_ids: folder_ids(conn, &id)?,
        recorded_ms: match live { Some((_, base)) => base, None => recorded_ms(conn, &id)? },
        recording_since: live.map(|(since, _)| since),
        progress: (status == "transcribing").then(|| progress(conn, &id)).transpose()?,
        generated: if with_generated { md.as_deref().map(enhance::parse_md) } else { None },
        status: ui_status(&status).to_string(),
        own_text: own_text(&own),
        id, title, calendar_event_id: event, created_at: created, updated_at: updated, template_id: template, error, deleted_at: deleted,
        stop_reason: if live.is_some() { None } else { stop_reason },
    })
}

pub fn list(conn: &Connection, folder_id: Option<&str>, deleted: bool, live: impl Fn(&str) -> LiveInfo) -> anyhow::Result<Vec<Note>> {
    let mut st = conn.prepare(
        "select id from notes n where (deleted_at is not null) = ?1
           and (?2 is null or exists (select 1 from note_folders f where f.note_id = n.id and f.folder_id = ?2))
         order by case when ?1 then deleted_at else created_at end desc",
    )?;
    let ids: Vec<String> = st.query_map(params![deleted, folder_id], |r| r.get(0))?.collect::<Result<_, _>>()?;
    ids.iter().map(|id| note(conn, id, &live, false)).collect()
}

pub fn segments(conn: &Connection, note_id: &str) -> anyhow::Result<Vec<Segment>> {
    let them = attendees(conn, note_id)?.first().map(|p| p.name.clone()).unwrap_or_else(|| "Them".into());
    let mut st = conn.prepare(
        "select id, attribution, start_ms, end_ms, text, deleted from transcript_segments where note_id = ?1 order by start_ms, created_at",
    )?;
    let rows = st.query_map([note_id], |r| {
        let side: String = r.get(1)?;
        Ok(Segment {
            id: r.get(0)?, note_id: note_id.to_string(), speaker: if side == "me" { "You".into() } else { them.clone() }, side,
            start_ms: r.get(2)?, end_ms: r.get(3)?, text: r.get(4)?, deleted: r.get::<_, i64>(5)? == 1,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn exists(conn: &Connection, id: &str) -> anyhow::Result<()> {
    let n: i64 = conn.query_row("select count(*) from notes where id = ?1", [id], |r| r.get(0))?;
    ensure!(n == 1, "This note no longer exists.");
    Ok(())
}

/// A new note, ad hoc or for a calendar event. One live note per event (notes_one_per_event).
pub fn create(conn: &Connection, event_id: Option<&str>) -> anyhow::Result<String> {
    let now = now_ms();
    let template: Option<String> = conn.query_row("select default_template_id from settings where id = 1", [], |r| r.get(0))?;
    let tx = conn.unchecked_transaction()?;
    let id = match event_id {
        None => {
            let id = uid();
            tx.execute(
                "insert into notes (id, template_id, meeting_at, created_at, updated_at) values (?1, ?2, ?3, ?3, ?3)",
                params![id, template, now],
            )?;
            id
        }
        Some(ev) => {
            if let Some(existing) = tx
                .query_row("select id from notes where calendar_event_id = ?1 and deleted_at is null", [ev], |r| r.get::<_, String>(0))
                .optional()?
            {
                return Ok(existing);
            }
            let (title, start, invitees): (String, i64, String) = tx
                .query_row("select title, start_at, invitees from calendar_events where id = ?1", [ev], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .optional()?
                .context("That meeting is no longer in your calendar.")?;
            let id = uid();
            tx.execute(
                "insert into notes (id, title, calendar_event_id, template_id, meeting_at, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![id, title, ev, template, start, now],
            )?;
            for p in serde_json::from_str::<Vec<Person>>(&invitees).unwrap_or_default() {
                let pid = person(&tx, &p)?;
                tx.execute("insert or ignore into note_attendees (note_id, person_id) values (?1, ?2)", params![id, pid])?;
            }
            id
        }
    };
    tx.commit()?;
    Ok(id)
}

/// Upserts a person by email (people view later uses this; no paid enrichment).
fn person(conn: &Connection, p: &Person) -> rusqlite::Result<String> {
    conn.execute(
        "insert into people (id, email, name, created_at, updated_at) values (?1, ?2, ?3, ?4, ?4)
         on conflict(email) do update set name = coalesce(excluded.name, people.name)",
        params![uid(), p.email, p.name, now_ms()],
    )?;
    conn.query_row("select id from people where email = ?1", [&p.email], |r| r.get(0))
}

pub fn update_own(conn: &Connection, id: &str, title: Option<&str>, own: Option<&str>, template_id: Option<&str>) -> anyhow::Result<()> {
    exists(conn, id)?;
    let now = now_ms();
    if let Some(t) = title {
        let t: String = t.chars().take(200).collect();
        conn.execute("update notes set title = ?2, updated_at = ?3 where id = ?1", params![id, t, now])?;
    }
    if let Some(o) = own {
        ensure!(o.len() <= 1_000_000, "These notes are too long to save.");
        let json = serde_json::json!({ "type": "text", "text": o }).to_string();
        conn.execute("update notes set own_notes_json = ?2, updated_at = ?3 where id = ?1", params![id, json, now])?;
    }
    if let Some(t) = template_id {
        template(conn, t)?;
        conn.execute("update notes set template_id = ?2, updated_at = ?3 where id = ?1", params![id, t, now])?;
    }
    Ok(())
}

/* Templates ------------------------------------------------------------------------------------- */

fn row_template(r: &rusqlite::Row) -> rusqlite::Result<Template> {
    let sections: String = r.get(3)?;
    Ok(Template {
        id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, sections: serde_json::from_str(&sections).unwrap_or_default(),
        built_in: r.get::<_, i64>(4)? == 1,
    })
}

pub fn templates(conn: &Connection) -> anyhow::Result<Vec<Template>> {
    let mut st = conn.prepare("select id, name, description, sections, built_in from templates order by built_in desc, created_at, name")?;
    Ok(st.query_map([], row_template)?.collect::<Result<_, _>>()?)
}

pub fn template(conn: &Connection, id: &str) -> anyhow::Result<Template> {
    conn.query_row("select id, name, description, sections, built_in from templates where id = ?1", [id], row_template)
        .optional()?
        .context("That template no longer exists.")
}

pub fn template_save(conn: &Connection, t: &Template) -> anyhow::Result<Template> {
    let name = t.name.trim();
    ensure!(!name.is_empty(), "Give the template a name.");
    ensure!(name.chars().count() <= 40, "Keep the name under 40 characters.");
    ensure!(!t.sections.is_empty(), "Add at least one section.");
    ensure!(t.sections.len() <= 20, "Keep it to 20 sections or fewer.");
    let sections: Vec<Section> =
        t.sections.iter().map(|s| Section { heading: s.heading.trim().into(), instructions: s.instructions.trim().into() }).collect();
    ensure!(sections.iter().all(|s| !s.heading.is_empty()), "Every section needs a heading.");
    let json = serde_json::to_string(&sections)?;
    let now = now_ms();
    let existing = template(conn, &t.id).ok();
    if existing.as_ref().is_some_and(|e| e.built_in) {
        bail!("Built-in templates cannot be changed. Duplicate it instead.");
    }
    let id = if existing.is_some() { t.id.clone() } else { uid() };
    conn.execute(
        "insert into templates (id, name, description, sections, built_in, created_at, updated_at) values (?1, ?2, ?3, ?4, 0, ?5, ?5)
         on conflict(id) do update set name = ?2, description = ?3, sections = ?4, updated_at = ?5",
        params![id, name, t.description.trim(), json, now],
    )?;
    template(conn, &id)
}

pub fn template_delete(conn: &Connection, id: &str) -> anyhow::Result<()> {
    ensure!(!template(conn, id)?.built_in, "Built-in templates cannot be deleted.");
    let tx = conn.unchecked_transaction()?;
    tx.execute("update notes set template_id = 't-standard' where template_id = ?1", [id])?;
    tx.execute("delete from templates where id = ?1", [id])?;
    tx.commit()?;
    Ok(())
}

/* Folders --------------------------------------------------------------------------------------- */

pub fn folders(conn: &Connection) -> anyhow::Result<Vec<Folder>> {
    let mut st = conn.prepare(
        "select f.id, f.name, f.description, f.icon,
           (select count(*) from note_folders nf join notes n on n.id = nf.note_id where nf.folder_id = f.id and n.deleted_at is null)
         from folders f order by f.position, f.name",
    )?;
    Ok(st.query_map([], |r| Ok(Folder { id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, icon: r.get(3)?, count: r.get(4)? }))?.collect::<Result<_, _>>()?)
}

/// `icon` is a key the UI maps to a glyph; None keeps the current one. Only short lowercase keys are stored.
pub fn folder_save(conn: &Connection, id: Option<&str>, name: &str, description: &str, icon: Option<&str>) -> anyhow::Result<String> {
    let name = name.trim();
    if let Some(i) = icon {
        ensure!(!i.is_empty() && i.len() <= 32 && i.chars().all(|c| c.is_ascii_lowercase() || c == '-'), "That icon is not available.");
    }
    ensure!(!name.is_empty(), "Give the folder a name.");
    ensure!(name.chars().count() <= 40, "Keep the name under 40 characters.");
    let description: String = description.trim().chars().take(500).collect();
    let now = now_ms();
    let found = match id {
        Some(id) => conn.execute("update folders set name = ?2, description = ?3, icon = coalesce(?5, icon), updated_at = ?4 where id = ?1", params![id, name, description, now, icon])? == 1,
        None => false,
    };
    if found {
        return Ok(id.unwrap().to_string());
    }
    let new = uid();
    conn.execute("insert into folders (id, name, description, icon, created_at, updated_at) values (?1, ?2, ?3, ?5, ?4, ?4)", params![new, name, description, now, icon])?;
    Ok(new)
}

pub fn folder_delete(conn: &Connection, id: &str) -> anyhow::Result<()> {
    conn.execute("delete from folders where id = ?1", [id])?; // note_folders rows cascade, notes stay
    Ok(())
}

pub fn add_to_folder(conn: &Connection, ids: &[String], folder_id: &str) -> anyhow::Result<()> {
    let n: i64 = conn.query_row("select count(*) from folders where id = ?1", [folder_id], |r| r.get(0))?;
    ensure!(n == 1, "That folder no longer exists.");
    let tx = conn.unchecked_transaction()?;
    for id in ids {
        tx.execute(
            "insert or ignore into note_folders (note_id, folder_id, added_at) select id, ?2, ?3 from notes where id = ?1",
            params![id, folder_id, now_ms()],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn remove_from_folder(conn: &Connection, ids: &[String], folder_id: &str) -> anyhow::Result<()> {
    let tx = conn.unchecked_transaction()?;
    for id in ids {
        tx.execute("delete from note_folders where note_id = ?1 and folder_id = ?2", params![id, folder_id])?;
    }
    tx.commit()?;
    Ok(())
}

/* Trash ----------------------------------------------------------------------------------------- */

pub fn trash(conn: &Connection, ids: &[String], is_recording: impl Fn(&str) -> bool) -> anyhow::Result<()> {
    ensure!(!ids.iter().any(|id| is_recording(id)), "Stop recording before moving this note to the trash.");
    let tx = conn.unchecked_transaction()?;
    for id in ids {
        tx.execute("update notes set deleted_at = ?2 where id = ?1 and deleted_at is null", params![id, now_ms()])?;
    }
    tx.commit()?;
    Ok(())
}

pub fn restore(conn: &Connection, id: &str) -> anyhow::Result<()> {
    exists(conn, id)?;
    // A newer note for the same meeting would break "one note per event": restore it without the link then.
    let clash: i64 = conn.query_row(
        "select count(*) from notes a join notes b on a.calendar_event_id = b.calendar_event_id
         where a.id = ?1 and b.id <> a.id and b.deleted_at is null",
        [id],
        |r| r.get(0),
    )?;
    if clash > 0 {
        conn.execute("update notes set calendar_event_id = null where id = ?1", [id])?;
    }
    conn.execute("update notes set deleted_at = null, updated_at = ?2 where id = ?1", params![id, now_ms()])?;
    Ok(())
}

/// Removes the note and everything that cascades from it. The caller deletes the audio folder.
pub fn delete_forever(conn: &Connection, id: &str) -> anyhow::Result<()> {
    conn.execute("delete from notes where id = ?1", [id])?;
    Ok(())
}

/// Notes trashed more than 30 days ago. Returns their ids so the caller can remove audio files.
pub fn purge_trash(conn: &Connection, now: i64) -> anyhow::Result<Vec<String>> {
    let cutoff = now - 30 * 86_400_000;
    let mut st = conn.prepare("select id from notes where deleted_at is not null and deleted_at < ?1")?;
    let ids: Vec<String> = st.query_map([cutoff], |r| r.get(0))?.collect::<Result<_, _>>()?;
    for id in &ids {
        delete_forever(conn, id)?;
    }
    Ok(ids)
}

/* Share and search ------------------------------------------------------------------------------- */

pub fn title_of(t: &str) -> String {
    if t.trim().is_empty() { "Untitled note".into() } else { t.trim().into() }
}

pub fn markdown(conn: &Connection, id: &str) -> anyhow::Result<String> {
    let (title, own, md): (String, String, Option<String>) =
        conn.query_row("select title, own_notes_json, enhanced_md from notes where id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
    Ok(match md {
        Some(md) => format!("# {}\n\n{}", title_of(&title), enhance::export_md(&md)),
        None => format!("# {}\n\n{}", title_of(&title), own_text(&own)),
    })
}

pub fn email_draft(conn: &Connection, id: &str) -> anyhow::Result<String> {
    let title: String = conn.query_row("select title from notes where id = ?1", [id], |r| r.get(0))?;
    let to: Vec<String> = attendees(conn, id)?.into_iter().map(|p| p.email).collect();
    let enc = |s: &str| s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect::<String>();
    Ok(format!("mailto:{}?subject={}&body={}", to.join(","), enc(&format!("Notes: {}", title_of(&title))), enc(&markdown(conn, id)?)))
}

pub fn transcript_text(conn: &Connection, id: &str) -> anyhow::Result<String> {
    Ok(segments(conn, id)?
        .iter()
        .filter(|s| !s.deleted)
        .map(|s| format!("[{}] {}: {}", clock(s.start_ms), s.speaker, s.text))
        .collect::<Vec<_>>()
        .join("\n"))
}

pub fn clock(ms: i64) -> String {
    let s = ms / 1000;
    format!("{:02}:{:02}", s / 60, s % 60)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexEntry {
    id: String,
    title: String,
    created_at: i64,
}

/// Notes for the palette's empty state (most recent first); text search goes through search_notes.
pub fn search_index(conn: &Connection) -> anyhow::Result<Vec<IndexEntry>> {
    let mut st = conn.prepare("select id, title, created_at from notes where deleted_at is null order by created_at desc limit 20")?;
    let rows = st.query_map([], |r| Ok(IndexEntry { id: r.get(0)?, title: title_of(&r.get::<_, String>(1)?), created_at: r.get(2)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    /// title, notes, generated or transcript
    pub field: String,
    pub snippet: String,
}

/// Rewrites search_fts rows for notes the triggers marked stale (migration 0004).
fn refresh_search(conn: &Connection) -> anyhow::Result<()> {
    let stale: Vec<String> = conn.prepare("select note_id from search_stale")?.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
    if stale.is_empty() {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    for id in &stale {
        // shortcut: note_id is unindexed, so this delete scans the table; fine for thousands of notes, add a rowid map if not
        tx.execute("delete from search_fts where note_id = ?1", [id])?;
        let row = tx
            .query_row("select title, own_notes_json, coalesce(enhanced_md, '') from notes where id = ?1", [id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
            })
            .optional()?;
        if let Some((title, own, md)) = row {
            let add = |field: &str, body: String| tx.execute("insert into search_fts (note_id, field, body) values (?1, ?2, ?3)", params![id, field, body]);
            add("title", title_of(&title))?;
            add("notes", md_plain(&own_text(&own)))?;
            add("generated", enhance::export_md(&md))?;
            let segs: Vec<String> = tx
                .prepare("select text from transcript_segments where note_id = ?1 and deleted = 0 order by start_ms")?
                .query_map([id], |r| r.get(0))?
                .collect::<Result<_, _>>()?;
            for t in segs {
                add("transcript", t)?;
            }
        }
        tx.execute("delete from search_stale where note_id = ?1", [id])?;
    }
    tx.commit()?;
    Ok(())
}

/// Own notes are Markdown; the index wants words only, so snippets show no marks. Same rules as generate.ts mdPlain.
fn md_plain(md: &str) -> String {
    md.lines()
        .map(|l| {
            let t = l.trim_start();
            let marker = t.split_once(char::is_whitespace).map(|(m, _)| m).unwrap_or("");
            let is_marker = !marker.is_empty()
                && (marker.chars().all(|c| c == '#') || ["-", "*", "+", "•", ">"].contains(&marker)
                    || (marker.len() > 1 && marker[..marker.len() - 1].chars().all(|c| c.is_ascii_digit()) && marker.ends_with(['.', ')'])));
            let t = if is_marker { t[marker.len()..].trim_start() } else { t };
            t.replace("**", "").replace("__", "").replace('`', "").trim_end_matches('\\').trim().to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Each word as a quoted prefix term, all required: `"rel"* "dat"*`. Quotes inside a word are doubled, so no FTS syntax leaks in.
fn fts_query(q: &str) -> Option<String> {
    let q: String = q.chars().map(|c| if c.is_control() { ' ' } else { c }).collect(); // FTS5 reads NUL as the end of the string
    let terms: Vec<String> = q.split_whitespace().map(|w| format!("\"{}\"*", w.replace('"', "\"\""))).collect();
    (!terms.is_empty()).then(|| terms.join(" "))
}

/// Best hit per note, title matches first, then by bm25. Notes in the trash are left out.
pub fn search_notes(conn: &Connection, q: &str) -> anyhow::Result<Vec<SearchHit>> {
    refresh_search(conn)?;
    let Some(fq) = fts_query(q) else { return Ok(vec![]) };
    let mut st = conn.prepare(
        "select f.note_id, n.title, n.created_at, f.field, snippet(search_fts, 2, '', '', '…', 10)
         from search_fts f join notes n on n.id = f.note_id
         where search_fts match ?1 and n.deleted_at is null
         order by f.field = 'title' desc, bm25(search_fts) limit 500",
    )?;
    let rows = st.query_map([fq], |r| {
        Ok(SearchHit { id: r.get(0)?, title: title_of(&r.get::<_, String>(1)?), created_at: r.get(2)?, field: r.get(3)?, snippet: r.get(4)? })
    })?;
    let mut seen = std::collections::HashSet::new();
    let mut out = vec![];
    for h in rows {
        let h = h?;
        if seen.insert(h.id.clone()) {
            out.push(h);
            if out.len() == 20 {
                break;
            }
        }
    }
    Ok(out)
}

/// Every note not in the trash as "<day> <title>.md" in `dir`. Returns how many were written.
pub fn export_all(conn: &Connection, dir: &std::path::Path) -> anyhow::Result<usize> {
    let rows: Vec<(String, String, i64)> = conn
        .prepare("select id, title, created_at from notes where deleted_at is null order by created_at")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<_, _>>()?;
    std::fs::create_dir_all(dir)?;
    for (id, title, at) in &rows {
        let day = chrono::DateTime::from_timestamp_millis(*at).map(|d| d.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string()).unwrap_or_default();
        let safe: String = title_of(title).chars().map(|ch| if "/\\:*?\"<>|".contains(ch) || ch.is_control() { '-' } else { ch }).take(80).collect();
        // ask the file system, not a set of names: APFS treats case and the two ways of writing accents as the same name
        let mut path = dir.join(format!("{day} {}.md", safe.trim()));
        let mut n = 2;
        while path.exists() { path = dir.join(format!("{day} {} ({n}).md", safe.trim())); n += 1; }
        std::fs::write(path, markdown(conn, id)?)?;
    }
    Ok(rows.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::mem;

    fn none(_: &str) -> LiveInfo { None }

    #[test]
    fn search_odd_queries_never_error() {
        let c = mem();
        let a = create(&c, None).unwrap();
        update_own(&c, &a, Some("Follow-up with Jo\u{eb}l"), Some("we'll send it \u{1F44B} today, 3*4 = 12"), None).unwrap();
        for q in ["\u{1F44B}", "?", "-", "...", "\"", "*", "(", "NOT", "AND OR", "a\u{0}b", "\u{4f1a}\u{8bae}", &"long ".repeat(200)] {
            assert!(search_notes(&c, q).is_ok(), "query {q:?} errored: {:?}", search_notes(&c, q).err());
        }
        let ids = |q: &str| search_notes(&c, q).unwrap().into_iter().map(|h| h.id).collect::<Vec<_>>();
        assert_eq!(ids("follow-up"), vec![a.clone()]);
        assert_eq!(ids("we'll"), vec![a.clone()]);
        assert_eq!(ids("joel"), vec![a.clone()]);
        assert_eq!(ids("NOT"), Vec::<String>::new(), "operators are words, and this one is not in the note");
    }

    #[test]
    fn search_finds_every_field_follows_edits_and_skips_trash() {
        let c = mem();
        let a = create(&c, None).unwrap();
        update_own(&c, &a, Some("Release check"), Some("- **budget** is final"), None).unwrap();
        let b = create(&c, None).unwrap();
        update_own(&c, &b, Some("Caf\u{e9} sync"), Some(""), None).unwrap();
        let seg = |id: &str, note: &str, text: &str| c.execute(
            "insert into transcript_segments (id, note_id, source, attribution, text, start_ms, end_ms, created_at) values (?1, ?2, 'microphone', 'me', ?3, 0, 1, 0)",
            params![id, note, text]).unwrap();
        seg("s1", &b, "we ship the release on Friday");
        let ids = |q: &str| search_notes(&c, q).unwrap().into_iter().map(|h| h.id).collect::<Vec<_>>();

        assert_eq!(ids("budg"), vec![a.clone()], "prefix match in own notes");
        assert_eq!(ids("cafe"), vec![b.clone()], "accents ignored");
        assert_eq!(ids("release"), vec![a.clone(), b.clone()], "title hit ranks above transcript hit");
        assert_eq!(search_notes(&c, "friday").unwrap()[0].field, "transcript");
        assert!(ids("budget friday").is_empty(), "every word must match in one field");
        assert!(ids("\"* OR NEAR(").is_empty(), "FTS syntax in the query is plain text, not an error");
        assert!(ids("   ").is_empty());
        assert_eq!(search_notes(&c, "budget").unwrap()[0].snippet, "budget is final", "snippets show words, not Markdown");
        assert_eq!(md_plain("## Agenda\n1. one\n> quote  \\\n#tag and 3 * 4"), "Agenda\none\nquote\n#tag and 3 * 4");

        c.execute("update transcript_segments set deleted = 1 where id = 's1'", []).unwrap();
        assert!(ids("friday").is_empty(), "deleted transcript lines drop out");
        update_own(&c, &a, None, Some("plain"), None).unwrap();
        assert!(ids("budget").is_empty(), "edited notes reindex");
        trash(&c, &[a.clone()], |_| false).unwrap();
        assert!(ids("release").iter().all(|i| i != &a), "trashed notes are hidden");
    }

    #[test]
    fn export_writes_one_file_per_live_note_and_never_overwrites() {
        let c = mem();
        let titles = ["Plan", "plan", "a/b: c?", "", "Caf\u{e9}", "Cafe\u{301}", &"x".repeat(120)];
        let ids: Vec<String> = titles.iter().map(|t| { let id = create(&c, None).unwrap(); update_own(&c, &id, Some(t), Some("body"), None).unwrap(); id }).collect();
        let gone = create(&c, None).unwrap();
        update_own(&c, &gone, Some("Trashed one"), None, None).unwrap();
        trash(&c, &[gone], |_| false).unwrap();

        let dir = std::env::temp_dir().join(format!("export-test-{}", uuid::Uuid::now_v7()));
        assert_eq!(export_all(&c, &dir).unwrap(), ids.len());
        let names: Vec<String> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        // one file per note even where the file system treats names as equal (case, accents written two ways)
        assert_eq!(names.len(), ids.len(), "{names:?}");
        assert!(names.iter().all(|n| n.ends_with(".md") && !n.contains('/') && !n.contains(':')), "{names:?}");
        assert!(names.iter().any(|n| n.contains("Untitled note")), "{names:?}");
        assert!(!names.iter().any(|n| n.contains("Trashed")), "{names:?}");

        // a second export into the same folder (same minute) keeps the first files
        assert_eq!(export_all(&c, &dir).unwrap(), ids.len());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), ids.len() * 2);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn note_lifecycle_and_folders() {
        let c = mem();
        let id = create(&c, None).unwrap();
        update_own(&c, &id, Some("Plan"), Some("line one"), Some("t-standup")).unwrap();
        let n = note(&c, &id, none, true).unwrap();
        assert_eq!((n.title.as_str(), n.own_text.as_str(), n.template_id.as_str(), n.status.as_str()), ("Plan", "line one", "t-standup", "draft"));
        assert!(update_own(&c, &id, None, None, Some("nope")).is_err());

        let f = folder_save(&c, None, "Hiring", "", None).unwrap();
        add_to_folder(&c, &[id.clone()], &f).unwrap();
        add_to_folder(&c, &[id.clone()], &f).unwrap(); // idempotent
        assert_eq!(list(&c, Some(&f), false, none).unwrap().len(), 1);
        assert_eq!(folders(&c).unwrap()[0].count, 1);
        assert!(folder_save(&c, None, "  ", "", None).is_err());
        folder_save(&c, Some(&f), "Hiring", "", Some("users")).unwrap();
        assert_eq!(folders(&c).unwrap()[0].icon.as_deref(), Some("users"));
        folder_save(&c, Some(&f), "Hiring 2026", "", None).unwrap();
        assert_eq!(folders(&c).unwrap()[0].icon.as_deref(), Some("users"), "a rename without an icon keeps it");
        assert!(folder_save(&c, Some(&f), "Hiring", "", Some("<svg onload=x>")).is_err());

        trash(&c, &[id.clone()], |_| false).unwrap();
        assert_eq!(list(&c, None, true, none).unwrap().len(), 1);
        assert_eq!(folders(&c).unwrap()[0].count, 0);
        assert!(purge_trash(&c, now_ms()).unwrap().is_empty());
        assert_eq!(purge_trash(&c, now_ms() + 31 * 86_400_000).unwrap(), vec![id.clone()]);
        assert!(exists(&c, &id).is_err());
    }

    #[test]
    fn event_notes_are_unique_and_get_attendees() {
        let c = mem();
        c.execute("insert into calendar_sources (id, kind, label, ics_url, created_at, updated_at) values ('s','ics','x','https://a',0,0)", []).unwrap();
        c.execute(
            "insert into calendar_events (id, source_id, provider_event_id, title, invitees, start_at, end_at, created_at, updated_at)
             values ('e','s','p','Sync','[{\"name\":\"Mara Okafor\",\"email\":\"mara@x.test\"}]',5,6,0,0)",
            [],
        ).unwrap();
        let a = create(&c, Some("e")).unwrap();
        assert_eq!(create(&c, Some("e")).unwrap(), a);
        let n = note(&c, &a, none, false).unwrap();
        assert_eq!(n.title, "Sync");
        assert_eq!(n.attendees, vec![Person { name: "Mara Okafor".into(), email: "mara@x.test".into() }]);
        // trashed: a new note can take the event; restoring the old one drops its link instead of failing
        trash(&c, &[a.clone()], |_| false).unwrap();
        let b = create(&c, Some("e")).unwrap();
        assert_ne!(a, b);
        restore(&c, &a).unwrap();
        assert_eq!(note(&c, &a, none, false).unwrap().calendar_event_id, None);
    }

    #[test]
    fn templates_validate_and_protect_built_ins() {
        let c = mem();
        let mut t = template(&c, "t-standard").unwrap();
        assert!(template_save(&c, &t).is_err());
        assert!(template_delete(&c, "t-standard").is_err());
        t.id = String::new();
        t.name = "Retro".into();
        let saved = template_save(&c, &t).unwrap();
        assert!(!saved.built_in);
        t.sections[0].heading = " ".into();
        t.id = saved.id.clone();
        assert!(template_save(&c, &t).is_err());
        template_delete(&c, &saved.id).unwrap();
    }
}
