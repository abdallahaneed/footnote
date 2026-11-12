//! The worker thread: reads the `jobs` table, so queued work survives a crash or quit (fix #1, #2).
//! transcribe (one per audio segment) -> enhance (one per note run) ; calendar_sync every 5 minutes.
use crate::capture::{self, SegmentFile};
use crate::db::{now_ms, uid};
use crate::enhance::{self, Llm};
use crate::notes;
use crate::stt::{self, Stt};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct Core {
    pub db: Mutex<Connection>,
    pub data: PathBuf,
    /// Tells the UI to reload (the "changed" event).
    pub notify: Box<dyn Fn() + Send + Sync>,
}

impl Core {
    pub fn audio_dir(&self, note_id: &str) -> PathBuf {
        self.data.join("audio").join(note_id)
    }
}

const MAX_ATTEMPTS: i64 = 4;

/// The loaded whisper model. Kept here, not on the worker's stack, so quitting can free it first: ggml's Metal
/// backend aborts the process at exit if a model is still loaded (GGML_ASSERT in ggml-metal-device.m).
static STT: Mutex<Option<Stt>> = Mutex::new(None);

/// Call before the process exits. Waits for a running transcription to finish.
pub fn release_model() {
    STT.lock().unwrap_or_else(|e| e.into_inner()).take();
}

pub fn enqueue(conn: &Connection, kind: &str, note_id: Option<&str>, payload: serde_json::Value, dedupe: Option<String>) -> rusqlite::Result<()> {
    let now = now_ms();
    conn.execute(
        "insert or ignore into jobs (id, kind, note_id, payload, run_after, dedupe_key, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?5, ?5)",
        params![uid(), kind, note_id, payload.to_string(), now, dedupe],
    )?;
    Ok(())
}

fn set_status(conn: &Connection, note_id: &str, status: &str, error: Option<&str>) -> rusqlite::Result<()> {
    conn.execute(
        "update notes set pipeline_status = ?2, pipeline_error = ?3, updated_at = ?4 where id = ?1",
        params![note_id, status, error, now_ms()],
    )?;
    Ok(())
}

/// A finished audio file from capture: row first after the file is synced, then its transcription job.
pub fn on_segment(core: &Core, note_id: &str, s: SegmentFile) {
    let conn = core.db.lock().unwrap();
    let id = uid();
    let r = conn.execute(
        "insert into audio_segments (id, note_id, channel, seq, path, start_ms, duration_ms, bytes, created_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, note_id, s.channel, s.seq, s.file_name, s.start_ms, s.duration_ms, s.bytes, now_ms()],
    );
    match r.and_then(|_| enqueue(&conn, "transcribe", Some(note_id), serde_json::json!({ "segment": id }), Some(format!("transcribe:{id}")))) {
        Ok(()) => {
            let _ = conn.execute("update notes set ended_at = ?2 where id = ?1", params![note_id, now_ms()]);
        }
        Err(e) => eprintln!("could not save audio segment row: {e}"),
    }
    drop(conn);
    (core.notify)();
}

/// Moves a stopped note along: still transcribing, or ready to be written up.
pub fn advance(conn: &Connection, note_id: &str) -> anyhow::Result<()> {
    let status: Option<String> = conn.query_row("select pipeline_status from notes where id = ?1", [note_id], |r| r.get(0)).optional()?;
    let Some(status) = status else { return Ok(()) };
    if status == "recording" || capture::is_recording(note_id) {
        return Ok(());
    }
    let pending: i64 = conn.query_row(
        "select count(*) from audio_segments where note_id = ?1 and transcribed = 0 and deleted_at is null",
        [note_id],
        |r| r.get(0),
    )?;
    if pending > 0 {
        set_status(conn, note_id, "transcribing", None)?;
    } else if status == "saved" || status == "transcribing" {
        queue_enhance(conn, note_id)?;
    }
    Ok(())
}

/// A new writing run with the note's current template. A run already waiting picks up the change instead.
pub fn queue_enhance(conn: &Connection, note_id: &str) -> anyhow::Result<()> {
    let (template, length, model): (Option<String>, String, String) = conn.query_row(
        "select n.template_id, s.summary_length, s.llm_model from notes n, settings s where n.id = ?1 and s.id = 1",
        [note_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let waiting: Option<String> = conn
        .query_row("select json_extract(payload, '$.generation') from jobs where kind = 'enhance' and note_id = ?1 and status = 'queued'", [note_id], |r| r.get(0))
        .optional()?;
    match waiting {
        Some(g) => {
            conn.execute("update generations set template_id = ?2, summary_length = ?3, model = ?4 where id = ?1", params![g, template, length, model])?;
        }
        None => {
            let g = uid();
            conn.execute(
                "insert into generations (id, note_id, template_id, summary_length, model, status, created_at) values (?1, ?2, ?3, ?4, ?5, 'queued', ?6)",
                params![g, note_id, template, length, model, now_ms()],
            )?;
            enqueue(conn, "enhance", Some(note_id), serde_json::json!({ "generation": g }), Some(format!("enhance:{g}")))?;
        }
    }
    set_status(conn, note_id, "enhancing", None)?;
    Ok(())
}

/// Re-run speech to text from the saved audio (fix #1).
pub fn retranscribe(conn: &Connection, note_id: &str) -> anyhow::Result<()> {
    anyhow::ensure!(!capture::is_recording(note_id), "Stop recording first.");
    let kept: i64 = conn.query_row("select count(*) from audio_segments where note_id = ?1 and deleted_at is null", [note_id], |r| r.get(0))?;
    anyhow::ensure!(kept > 0, "The audio for this note was already deleted, so it cannot be transcribed again.");
    let tx = conn.unchecked_transaction()?;
    tx.execute("delete from transcript_segments where note_id = ?1", [note_id])?;
    tx.execute("update audio_segments set transcribed = 0 where note_id = ?1 and deleted_at is null", [note_id])?;
    let ids: Vec<String> = {
        let mut st = tx.prepare("select id from audio_segments where note_id = ?1 and deleted_at is null")?;
        st.query_map([note_id], |r| r.get(0))?.collect::<Result<_, _>>()?
    };
    for id in ids {
        enqueue(&tx, "transcribe", Some(note_id), serde_json::json!({ "segment": id }), Some(format!("transcribe:{id}")))?;
    }
    set_status(&tx, note_id, "transcribing", None)?;
    tx.commit()?;
    Ok(())
}

/// On launch: work that was running when the app stopped is queued again, notes cut off mid-recording finish.
pub fn recover(conn: &Connection) -> anyhow::Result<()> {
    conn.execute("update jobs set status = 'queued' where status = 'running'", [])?;
    conn.execute("update generations set status = 'queued' where status = 'running'", [])?;
    let mut st = conn.prepare("select id from notes where pipeline_status in ('recording','saved','transcribing')")?;
    let ids: Vec<String> = st.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
    for id in ids {
        conn.execute("update notes set pipeline_status = 'saved' where id = ?1 and pipeline_status = 'recording'", [&id])?;
        let mut segs = conn.prepare("select id from audio_segments where note_id = ?1 and transcribed = 0 and deleted_at is null")?;
        for s in segs.query_map([&id], |r| r.get::<_, String>(0))? {
            let s = s?;
            enqueue(conn, "transcribe", Some(&id), serde_json::json!({ "segment": s }), Some(format!("transcribe:{s}")))?;
        }
        advance(conn, &id)?;
    }
    Ok(())
}

struct Job {
    id: String,
    kind: String,
    note_id: Option<String>,
    payload: serde_json::Value,
    attempts: i64,
}

fn next(conn: &Connection) -> rusqlite::Result<Option<Job>> {
    let job = conn
        .query_row(
            "select id, kind, note_id, payload, attempts from jobs where status = 'queued' and run_after <= ?1
             order by case kind when 'transcribe' then 0 when 'calendar_sync' then 1 else 2 end, run_after limit 1",
            [now_ms()],
            |r| {
                let p: String = r.get(3)?;
                Ok(Job { id: r.get(0)?, kind: r.get(1)?, note_id: r.get(2)?, payload: serde_json::from_str(&p).unwrap_or_default(), attempts: r.get(4)? })
            },
        )
        .optional()?;
    if let Some(j) = &job {
        conn.execute("update jobs set status = 'running', attempts = attempts + 1, updated_at = ?2 where id = ?1", params![j.id, now_ms()])?;
    }
    Ok(job)
}

/// Errors that a retry will not fix.
fn permanent(e: &str) -> bool {
    e.contains("Nothing to write up") || e.contains("turned off") || e.contains("no longer exists") || e.contains("Settings")
}

pub fn spawn(core: Arc<Core>) {
    std::thread::spawn(move || {
        let mut last_maintenance = 0i64;
        loop {
            if now_ms() - last_maintenance > 5 * 60_000 {
                last_maintenance = now_ms();
                if let Err(e) = maintenance(&core) {
                    eprintln!("maintenance: {e}");
                }
            }
            let job = next(&core.db.lock().unwrap()).ok().flatten();
            let Some(job) = job else {
                std::thread::sleep(Duration::from_millis(400));
                continue;
            };
            let result = match job.kind.as_str() {
                "transcribe" => transcribe(&core, &job),
                "enhance" => write_notes(&core, &job),
                "calendar_sync" => sync_calendar(&core, &job),
                other => Err(anyhow::anyhow!("unknown job {other}")),
            };
            let conn = core.db.lock().unwrap();
            match result {
                Ok(()) => {
                    let _ = conn.execute("update jobs set status = 'done', last_error = null, updated_at = ?2 where id = ?1", params![job.id, now_ms()]);
                }
                Err(e) => {
                    let msg = e.to_string();
                    let last = job.attempts + 1 >= MAX_ATTEMPTS || permanent(&msg);
                    // retry with backoff: 2 s, 4 s, 8 s
                    let _ = conn.execute(
                        "update jobs set status = ?2, last_error = ?3, run_after = ?4, updated_at = ?5 where id = ?1",
                        params![job.id, if last { "failed" } else { "queued" }, msg, now_ms() + (2_000i64 << job.attempts.min(5)), now_ms()],
                    );
                    if last {
                        give_up(&conn, &job, &msg);
                    }
                }
            }
            drop(conn);
            (core.notify)();
        }
    });
}

/// The job failed for good: the note says why and offers Try again (fix #2).
fn give_up(conn: &Connection, job: &Job, msg: &str) {
    let Some(note) = &job.note_id else { return };
    if job.kind == "enhance" {
        if let Some(g) = job.payload["generation"].as_str() {
            let _ = conn.execute("update generations set status = 'failed', error = ?2, finished_at = ?3 where id = ?1", params![g, msg, now_ms()]);
        }
    }
    if job.kind == "transcribe" {
        // keep going without this piece; the note still gets written from the rest
        if let Some(s) = job.payload["segment"].as_str() {
            let _ = conn.execute("update audio_segments set transcribed = 1 where id = ?1", [s]);
        }
        let _ = advance(conn, note);
        return;
    }
    let _ = set_status(conn, note, "failed", Some(msg));
}

fn transcribe(core: &Core, job: &Job) -> anyhow::Result<()> {
    let seg = job.payload["segment"].as_str().unwrap_or_default().to_string();
    let row = core
        .db
        .lock()
        .unwrap()
        .query_row(
            "select a.note_id, a.channel, a.path, a.start_ms, s.languages, s.jargon from audio_segments a, settings s where a.id = ?1 and s.id = 1 and a.deleted_at is null",
            [&seg],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?)),
        )
        .optional()?;
    let Some((note_id, channel, file, start, langs, jargon)) = row else { return Ok(()) }; // note or audio gone
    let samples = capture::read_wav(&core.audio_dir(&note_id).join(&file))?;
    let pieces = if capture::has_speech(&samples) {
        let mut stt = STT.lock().unwrap_or_else(|e| e.into_inner());
        if stt.is_none() {
            let model = stt::ensure_model(&core.data.join("models"), |_, _| {})?;
            *stt = Some(Stt::load(&model)?);
        }
        let langs: Vec<String> = serde_json::from_str(&langs).unwrap_or_default();
        let jargon: Vec<String> = serde_json::from_str(&jargon).unwrap_or_default();
        stt.as_mut().unwrap().transcribe(&samples, (langs.len() == 1).then(|| langs[0].as_str()), &jargon.join(", "))?
    } else {
        Vec::new()
    };
    let conn = core.db.lock().unwrap();
    let tx = conn.unchecked_transaction()?;
    let (source, who) = if channel == "mic" { ("microphone", "me") } else { ("speaker", "them") };
    for p in pieces {
        let (a, b) = (start + p.start_ms, start + p.end_ms.max(p.start_ms));
        // Echo: on speakers the mic also hears the other side. A mic line that repeats a system line spoken at
        // the same time is that echo, not you. Whichever channel is transcribed second removes it.
        let near: Vec<(String, String)> = {
            let mut st = tx.prepare(
                "select id, text from transcript_segments where note_id = ?1 and attribution <> ?2 and deleted = 0 and start_ms < ?4 + 3000 and end_ms > ?3 - 3000",
            )?;
            st.query_map(params![note_id, who, a, b], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?
        };
        let echo: Vec<&String> = near.iter().filter(|(_, t)| same_words(t, &p.text)).map(|(id, _)| id).collect();
        if who == "me" && !echo.is_empty() {
            continue;
        }
        for id in echo {
            tx.execute("delete from transcript_segments where id = ?1", [id])?;
        }
        tx.execute(
            "insert into transcript_segments (id, note_id, audio_segment_id, source, attribution, text, start_ms, end_ms, created_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![uid(), note_id, seg, source, who, p.text, a, b, now_ms()],
        )?;
    }
    tx.execute("update audio_segments set transcribed = 1 where id = ?1", [&seg])?;
    let delete_audio: bool = tx.query_row("select audio_retention = 'delete_after_transcript' from settings", [], |r| r.get(0))?;
    tx.commit()?;
    if delete_audio {
        let _ = std::fs::remove_file(core.audio_dir(&note_id).join(&file));
        conn.execute("update audio_segments set deleted_at = ?2 where id = ?1", params![seg, now_ms()])?;
    }
    advance(&conn, &note_id)?;
    Ok(())
}

/// True when two lines are mostly the same words (echo of the same speech heard twice).
pub fn same_words(a: &str, b: &str) -> bool {
    let words = |t: &str| t.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| w.len() > 1).map(str::to_string).collect::<Vec<_>>();
    let (x, y) = (words(a), words(b));
    let (short, long) = if x.len() <= y.len() { (&x, &y) } else { (&y, &x) };
    if short.len() < 3 {
        return false; // "yes", "okay" said by both is not an echo
    }
    let hits = short.iter().filter(|w| long.contains(w)).count();
    hits * 10 >= short.len() * 7
}

pub fn llm(conn: &Connection) -> rusqlite::Result<Llm> {
    conn.query_row("select llm_provider, llm_url, llm_model from settings where id = 1", [], |r| {
        let provider: String = r.get(0)?;
        let key = if provider == "groq" { enhance::groq_key().unwrap_or_default() } else { String::new() };
        Ok(Llm { provider, url: r.get(1)?, model: r.get(2)?, key })
    })
}

fn write_notes(core: &Core, job: &Job) -> anyhow::Result<()> {
    let g = job.payload["generation"].as_str().unwrap_or_default().to_string();
    let note_id = job.note_id.clone().unwrap_or_default();
    // Gather everything under the lock, then call the model without it.
    let (llm, template, title, own, segs, context, length) = {
        let conn = core.db.lock().unwrap();
        let (template_id, length): (Option<String>, String) =
            conn.query_row("select template_id, summary_length from generations where id = ?1", [&g], |r| Ok((r.get(0)?, r.get(1)?)))?;
        let template = notes::template(&conn, template_id.as_deref().unwrap_or("t-standard")).or_else(|_| notes::template(&conn, "t-standard"))?;
        let (title, own): (String, String) = conn.query_row("select title, own_notes_json from notes where id = ?1", [&note_id], |r| Ok((r.get(0)?, r.get(1)?)))?;
        let context: String = conn.query_row(
            "select trim(coalesce(user_name, '') || ' ' || coalesce(user_role, '') || ' ' || coalesce(user_context, '')) from settings",
            [],
            |r| r.get(0),
        )?;
        conn.execute("update generations set status = 'running', started_at = ?2 where id = ?1", params![g, now_ms()])?;
        (llm(&conn)?, template, title, notes::own_text(&own), notes::segments(&conn, &note_id)?, context, length)
    };
    let live: Vec<_> = segs.into_iter().filter(|s| !s.deleted).collect();
    let input = enhance::Input { title: &title, template: &template, own: &own, segments: &live, context: &context, length: &length };
    let md = enhance::write(&llm, &input)?;
    let conn = core.db.lock().unwrap();
    let now = now_ms();
    let tx = conn.unchecked_transaction()?;
    tx.execute("update generations set status = 'done', output_md = ?2, finished_at = ?3 where id = ?1", params![g, md, now])?;
    tx.execute(
        "update notes set enhanced_md = ?2, pipeline_status = 'done', pipeline_error = null, updated_at = ?3 where id = ?1 and pipeline_status <> 'recording'",
        params![note_id, md, now],
    )?;
    tx.commit()?;
    mirror(&conn, &note_id);
    Ok(())
}

/// Fix #6: when a folder is set in Settings, every written note is also saved there as a Markdown file.
fn mirror(conn: &Connection, note_id: &str) {
    let dir: Option<String> = conn.query_row("select markdown_mirror_dir from settings", [], |r| r.get(0)).ok().flatten();
    let Some(dir) = dir else { return };
    let Ok((title, created)) = conn.query_row("select title, created_at from notes where id = ?1", [note_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))) else { return };
    let date = chrono::DateTime::from_timestamp_millis(created).map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default();
    let safe: String = notes::title_of(&title).chars().map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' }).take(80).collect();
    let path = PathBuf::from(dir).join(format!("{date} {safe} {}.md", &note_id[..8.min(note_id.len())]));
    if let Ok(md) = notes::markdown(conn, note_id) {
        if let Err(e) = std::fs::write(&path, md) {
            eprintln!("markdown mirror: {e}");
        }
    }
}

fn sync_calendar(core: &Core, job: &Job) -> anyhow::Result<()> {
    let src = job.payload["source"].as_str().unwrap_or_default().to_string();
    let url: Option<String> = core.db.lock().unwrap().query_row("select ics_url from calendar_sources where id = ?1 and enabled = 1", [&src], |r| r.get(0)).optional()?.flatten();
    let Some(url) = url else { return Ok(()) };
    let (from, to) = (now_ms() - 86_400_000, now_ms() + 30 * 86_400_000);
    let result = crate::calendar::fetch(&url).map(|ics| crate::calendar::parse(&ics, from, to));
    let conn = core.db.lock().unwrap();
    match result {
        Ok(evs) => {
            crate::calendar::store(&conn, &src, &evs, from, to)?;
            Ok(())
        }
        Err(e) => {
            conn.execute("update calendar_sources set last_error = ?2 where id = ?1", params![src, e.to_string()])?;
            Err(e)
        }
    }
}

/// Every 5 minutes: calendar sync, trash purge, audio retention.
fn maintenance(core: &Core) -> anyhow::Result<()> {
    let conn = core.db.lock().unwrap();
    let mut st = conn.prepare("select id from calendar_sources where enabled = 1 and kind = 'ics'")?;
    let sources: Vec<String> = st.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
    for s in sources {
        enqueue(&conn, "calendar_sync", None, serde_json::json!({ "source": s }), Some(format!("calendar_sync:{s}")))?;
    }
    for id in notes::purge_trash(&conn, now_ms())? {
        let _ = std::fs::remove_dir_all(core.audio_dir(&id));
    }
    let keep_days: Option<i64> = conn.query_row(
        "select case audio_retention when 'keep_7d' then 7 when 'keep_30d' then 30 else null end from settings",
        [],
        |r| r.get(0),
    )?;
    if let Some(days) = keep_days {
        let cutoff = now_ms() - days * 86_400_000;
        let mut st = conn.prepare("select id, note_id, path from audio_segments where deleted_at is null and transcribed = 1 and created_at < ?1")?;
        let old: Vec<(String, String, String)> = st.query_map([cutoff], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<Result<_, _>>()?;
        for (id, note, path) in old {
            let _ = std::fs::remove_file(core.audio_dir(&note).join(path));
            conn.execute("update audio_segments set deleted_at = ?2 where id = ?1", params![id, now_ms()])?;
        }
    }
    let days: Option<i64> = conn.query_row("select transcript_retention_days from settings", [], |r| r.get(0))?;
    if let Some(d) = days {
        conn.execute("delete from transcript_segments where created_at < ?1", [now_ms() - d * 86_400_000])?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::mem;

    fn status(c: &Connection, id: &str) -> String {
        c.query_row("select pipeline_status from notes where id = ?1", [id], |r| r.get(0)).unwrap()
    }

    #[test]
    fn pipeline_moves_and_dedupes() {
        let c = mem();
        let id = notes::create(&c, None).unwrap();
        c.execute("update notes set pipeline_status = 'saved' where id = ?1", [&id]).unwrap();
        c.execute(
            "insert into audio_segments (id, note_id, channel, seq, path, start_ms, duration_ms, bytes, created_at) values ('a', ?1, 'mic', 0, 'mic-0.wav', 0, 1000, 10, 0)",
            [&id],
        ).unwrap();
        enqueue(&c, "transcribe", Some(&id), serde_json::json!({"segment": "a"}), Some("transcribe:a".into())).unwrap();
        enqueue(&c, "transcribe", Some(&id), serde_json::json!({"segment": "a"}), Some("transcribe:a".into())).unwrap();
        let n: i64 = c.query_row("select count(*) from jobs", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1, "dedupe key");
        advance(&c, &id).unwrap();
        assert_eq!(status(&c, &id), "transcribing");
        c.execute("update audio_segments set transcribed = 1", []).unwrap();
        advance(&c, &id).unwrap();
        assert_eq!(status(&c, &id), "enhancing");
        queue_enhance(&c, &id).unwrap(); // a second request while one waits: no second run
        let runs: i64 = c.query_row("select count(*) from jobs where kind = 'enhance'", [], |r| r.get(0)).unwrap();
        assert_eq!(runs, 1);
        // a crash mid-job puts it back in the queue
        let j = next(&c).unwrap().unwrap();
        assert_eq!(j.kind, "transcribe");
        recover(&c).unwrap();
        let queued: i64 = c.query_row("select count(*) from jobs where status = 'queued'", [], |r| r.get(0)).unwrap();
        assert_eq!(queued, 2);
    }

    #[test]
    fn echo_detection() {
        assert!(same_words("Tell me about a project you led.", "tell me about a project you led"));
        assert!(same_words("Tell me about a project you led", "about a project you led last year, tell me"));
        assert!(!same_words("Yes, okay", "yes okay"));
        assert!(!same_words("I led the migration to Rust", "Tell me about a project you led"));
    }

    #[test]
    fn failure_is_visible_with_a_reason() {
        let c = mem();
        let id = notes::create(&c, None).unwrap();
        queue_enhance(&c, &id).unwrap();
        let j = next(&c).unwrap().unwrap();
        give_up(&c, &j, "The local model did not answer.");
        assert_eq!(status(&c, &id), "failed");
        let n = notes::note(&c, &id, |_| None, false).unwrap();
        assert_eq!((n.status.as_str(), n.error.as_deref()), ("failed", Some("The local model did not answer.")));
        assert!(retranscribe(&c, &id).unwrap_err().to_string().contains("already deleted"));
    }
    /// The whole path with real audio and real whisper: two channels -> 8-15 s segments on disk -> transcribe jobs ->
    /// enhance job against a stand-in Groq -> stored notes with checked sources. Needs `say` (macOS) and the
    /// 60 MB model (copied from Quietkey's folder if there, else downloaded). Run: cargo test -- --ignored e2e
    #[cfg(debug_assertions)]
    #[test]
    #[ignore]
    fn e2e_record_transcribe_write() {
        let _one = capture::AUDIO_TEST.lock().unwrap_or_else(|e| e.into_inner());
        let data = std::env::temp_dir().join(format!("mn-e2e-{}", uid()));
        std::fs::create_dir_all(data.join("models")).unwrap();
        let qk = dirs_model();
        if qk.exists() {
            std::fs::copy(&qk, data.join("models").join(stt::MODEL_FILE)).unwrap();
        }
        let say = |file: &str, text: &str| {
            let ok = std::process::Command::new("say").args(["-o", data.join(file).to_str().unwrap(), "--data-format=LEI16@16000", text]).status().unwrap();
            assert!(ok.success());
            data.join(file)
        };
        let me = say("me.wav", "We are aiming to release on the twentieth of November.");
        let them = say("them.wav", "Good. Please send the pricing page to Lena by Friday.");
        unsafe {
            std::env::set_var("MEETING_NOTES_TEST_MIC_WAV", &me);
            std::env::set_var("MEETING_NOTES_TEST_SYSTEM_WAV", &them);
        }
        let conn = crate::db::open(&data.join("app.db")).unwrap();
        let url = crate::enhance::fake_server(r###"{"choices":[{"message":{"content":"## Summary\n- Release planned for 20 November [S1]\n## Next steps\n- Send the pricing page to Lena by Friday [S2]"}}]}"###, 200);
        conn.execute("update settings set llm_provider = 'groq', llm_url = ?1, llm_model = 'test'", [url]).unwrap();
        unsafe { std::env::set_var("MEETING_NOTES_TEST_GROQ_KEY", "test") };
        let id = notes::create(&conn, None).unwrap();
        let core = Arc::new(Core { db: Mutex::new(conn), data: data.clone(), notify: Box::new(|| {}) });
        let c2 = core.clone();
        capture::start(&id, core.audio_dir(&id), 0, 0, None, Arc::new(move |n, s| on_segment(&c2, n, s))).unwrap();
        core.db.lock().unwrap().execute("update notes set pipeline_status = 'recording' where id = ?1", [&id]).unwrap();
        std::thread::sleep(Duration::from_secs(5));
        capture::stop(&id);
        {
            let c = core.db.lock().unwrap();
            c.execute("update notes set pipeline_status = 'saved' where id = ?1", [&id]).unwrap();
            advance(&c, &id).unwrap();
        }
        spawn(core.clone());
        let started = std::time::Instant::now();
        let n = loop {
            let n = notes::note(&core.db.lock().unwrap(), &id, |_| None, true).unwrap();
            if n.status == "done" || n.status == "failed" || started.elapsed() > Duration::from_secs(180) {
                break n;
            }
            std::thread::sleep(Duration::from_millis(500));
        };
        assert_eq!(n.status, "done", "{:?}", n.error);
        let segs = notes::segments(&core.db.lock().unwrap(), &id).unwrap();
        let text = |side: &str| segs.iter().filter(|s| s.side == side).map(|s| s.text.to_lowercase()).collect::<Vec<_>>().join(" ");
        assert!(text("me").contains("release"), "mic transcript: {}", text("me"));
        assert!(text("them").contains("pricing"), "system transcript: {}", text("them"));
        let lines = n.generated.unwrap();
        let ai: Vec<_> = lines.iter().filter_map(|l| match l { crate::enhance::GenLine::Ai { seg_ids, .. } => Some(seg_ids.clone()), _ => None }).collect();
        assert!(ai.iter().all(|ids| ids.iter().all(|i| segs.iter().any(|s| &s.id == i))), "every source exists");
        assert!(ai.iter().any(|ids| !ids.is_empty()));
        assert!(n.recorded_ms >= 3_000, "duration {}", n.recorded_ms);
        release_model(); // as the app does on quit; without it the test process aborts at exit
        std::fs::remove_dir_all(data).unwrap();
    }

    /// Live transcript lag with real whisper: a ~45 s spoken clip replayed in real time as the mic. For each
    /// transcript line, how long after it was said it reached the database. Run: cargo test -- --ignored live_lag --nocapture
    #[cfg(debug_assertions)]
    #[test]
    #[ignore]
    fn live_lag() {
        let _one = capture::AUDIO_TEST.lock().unwrap_or_else(|e| e.into_inner());
        let data = std::env::temp_dir().join(format!("mn-lag-{}", uid()));
        std::fs::create_dir_all(data.join("models")).unwrap();
        if dirs_model().exists() {
            std::fs::copy(dirs_model(), data.join("models").join(stt::MODEL_FILE)).unwrap();
        }
        let text = "We need to decide the release date for version two. [[slnc 700]] QA wants at least one full week for testing. [[slnc 700]] \
            The twentieth of November works if the build is ready by Monday. [[slnc 700]] Lena will send the new pricing page to the board on Thursday. [[slnc 700]] \
            Marketing would like a launch post on the same day as the release. [[slnc 700]] Tom can write the first draft and share it with everyone on Monday. [[slnc 700]] \
            The budget for ads stays at five thousand euros for this quarter. [[slnc 700]] Let us meet again next Tuesday to check where we are.";
        let wav = data.join("talk.wav");
        assert!(std::process::Command::new("say").args(["-r", "150", "-o", wav.to_str().unwrap(), "--data-format=LEI16@16000", text]).status().unwrap().success());
        let secs = capture::read_wav(&wav).unwrap().len() as f64 / 16_000.0;
        unsafe { std::env::set_var("MEETING_NOTES_TEST_MIC_WAV", &wav) };
        let conn = crate::db::open(&data.join("app.db")).unwrap();
        let id = notes::create(&conn, None).unwrap();
        let core = Arc::new(Core { db: Mutex::new(conn), data: data.clone(), notify: Box::new(|| {}) });
        let c2 = core.clone();
        // warm whisper up first, as a running app has it loaded after the first segment
        spawn(core.clone());
        let started = std::time::Instant::now();
        capture::start(&id, core.audio_dir(&id), 0, 0, None, Arc::new(move |n, s| on_segment(&c2, n, s))).unwrap();
        core.db.lock().unwrap().execute("update notes set pipeline_status = 'recording' where id = ?1", [&id]).unwrap();
        let mut seen = std::collections::HashMap::<String, f64>::new();
        while started.elapsed().as_secs_f64() < secs + 25.0 {
            let rows: Vec<(String, i64)> = {
                let c = core.db.lock().unwrap();
                let mut st = c.prepare("select id, end_ms from transcript_segments where note_id = ?1").unwrap();
                st.query_map([&id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().map(Result::unwrap).collect()
            };
            for (sid, end) in rows {
                seen.entry(sid).or_insert(started.elapsed().as_secs_f64() - end as f64 / 1000.0);
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        capture::stop(&id);
        unsafe { std::env::remove_var("MEETING_NOTES_TEST_MIC_WAV") };
        let mut lags: Vec<f64> = seen.values().copied().collect();
        lags.sort_by(|a, b| a.partial_cmp(b).unwrap());
        println!("clip {secs:.0} s, {} lines, lag min {:.1} s, median {:.1} s, max {:.1} s", lags.len(), lags[0], lags[lags.len() / 2], lags[lags.len() - 1]);
        let first_load = lags.len() > 1; // the very first line also pays for loading whisper
        assert!(first_load && lags[lags.len() - 2] < 20.0, "lags {lags:?}");
        release_model();
        std::fs::remove_dir_all(data).unwrap();
    }

    fn dirs_model() -> PathBuf {
        PathBuf::from(std::env::var("HOME").unwrap()).join("Library/Application Support/dev.abdallah.quietkey/models").join(stt::MODEL_FILE)
    }
}
