//! Tauri commands. Names and shapes match app/src/data/api.ts. Every command validates its input here,
//! because the webview is a trust boundary.
mod apple;
mod calendar;
mod capture;
mod chat;
mod db;
mod enhance;
mod jobs;
mod notes;
mod notify;
mod stt;

use db::now_ms;
use jobs::Core;
use notes::{Folder, Note, Segment, Template};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{ipc::Channel, Emitter, Manager, State};

type R<T> = Result<T, String>;
struct St(Arc<Core>);

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Ids come from the UI: UUIDs, or the short fixed ids of built-in templates.
fn check_id(id: &str) -> R<()> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Unknown id.".into());
    }
    Ok(())
}

fn check_ids(ids: &[String]) -> R<()> {
    if ids.len() > 1000 {
        return Err("Too many notes at once.".into());
    }
    ids.iter().try_for_each(|i| check_id(i))
}

/// Runs `f` with the database, then tells the UI to reload.
fn write<T>(st: &St, f: impl FnOnce(&rusqlite::Connection) -> anyhow::Result<T>) -> R<T> {
    let out = f(&st.0.db.lock().unwrap()).map_err(err);
    (st.0.notify)();
    out
}

fn read<T>(st: &St, f: impl FnOnce(&rusqlite::Connection) -> anyhow::Result<T>) -> R<T> {
    f(&st.0.db.lock().unwrap()).map_err(err)
}

fn note_of(conn: &rusqlite::Connection, id: &str) -> anyhow::Result<Note> {
    notes::note(conn, id, capture::live, true)
}

/* Calendar ----------------------------------------------------------------------------------------- */

#[tauri::command(async)]
fn calendar_upcoming(st: State<St>, days: Option<i64>) -> R<Vec<calendar::Upcoming>> {
    read(&st, |c| calendar::upcoming(c, now_ms(), days.unwrap_or(14)))
}

#[tauri::command(async)]
fn calendar_sources_list(st: State<St>) -> R<Vec<calendar::Source>> {
    read(&st, calendar::sources)
}

#[tauri::command(async)]
fn calendar_add_source(st: State<St>, ics_url: String) -> R<String> {
    write(&st, |c| {
        let id = calendar::add_source(c, &ics_url)?;
        jobs::enqueue(c, "calendar_sync", None, serde_json::json!({ "source": id }), Some(format!("calendar_sync:{id}")))?;
        Ok(id)
    })
}

#[tauri::command(async)]
fn calendar_source_delete(st: State<St>, id: String) -> R<()> {
    check_id(&id)?;
    write(&st, |c| Ok(c.execute("delete from calendar_sources where id = ?1", [&id]).map(|_| ())?))
}

/* Notes -------------------------------------------------------------------------------------------- */

#[tauri::command(async)]
fn note_create(st: State<St>) -> R<Note> {
    write(&st, |c| note_of(c, &notes::create(c, None)?))
}

#[tauri::command(async)]
fn note_open_for_event(st: State<St>, event_id: String) -> R<Note> {
    check_id(&event_id)?;
    write(&st, |c| note_of(c, &notes::create(c, Some(&event_id))?))
}

#[tauri::command(async)]
fn notes_list(st: State<St>, folder_id: Option<String>, deleted: Option<bool>) -> R<Vec<Note>> {
    if let Some(f) = &folder_id {
        check_id(f)?;
    }
    read(&st, |c| notes::list(c, folder_id.as_deref(), deleted.unwrap_or(false), capture::live))
}

#[derive(Serialize)]
struct Bundle {
    note: Note,
    segments: Vec<Segment>,
    templates: Vec<Template>,
    folders: Vec<Folder>,
}

#[tauri::command(async)]
fn note_get(st: State<St>, id: String) -> R<Bundle> {
    check_id(&id)?;
    read(&st, |c| Ok(Bundle { note: note_of(c, &id)?, segments: notes::segments(c, &id)?, templates: notes::templates(c)?, folders: notes::folders(c)? }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OwnPatch {
    title: Option<String>,
    own_text: Option<String>,
    template_id: Option<String>,
}

#[tauri::command(async)]
fn note_update_own(st: State<St>, id: String, patch: OwnPatch) -> R<Note> {
    check_id(&id)?;
    write(&st, |c| {
        notes::update_own(c, &id, patch.title.as_deref(), patch.own_text.as_deref(), patch.template_id.as_deref())?;
        note_of(c, &id)
    })
}

/* Recording ---------------------------------------------------------------------------------------- */

#[tauri::command(async)]
fn recording_start(st: State<St>, id: String) -> R<Note> {
    check_id(&id)?;
    let core = st.0.clone();
    let (base, seq, mic) = read(&st, |c| {
        let deleted: Option<i64> = c
            .query_row("select deleted_at from notes where id = ?1", [&id], |r| r.get(0))
            .optional()?
            .ok_or_else(|| anyhow::anyhow!("This note no longer exists."))?;
        anyhow::ensure!(deleted.is_none(), "Restore this note from the trash before recording.");
        let base = notes::note(c, &id, |_| None, false)?.recorded_ms;
        let seq: i64 = c.query_row("select coalesce(max(seq) + 1, 0) from audio_segments where note_id = ?1", [&id], |r| r.get(0))?;
        let mic: Option<String> = c.query_row("select mic_id from settings", [], |r| r.get(0))?;
        Ok((base, seq, mic))
    })?;
    if !capture::is_recording(&id) {
        let c2 = core.clone();
        capture::start(&id, core.audio_dir(&id), base, seq, mic, Arc::new(move |nid, s| jobs::on_segment(&c2, nid, s))).map_err(err)?;
    }
    write(&st, |c| {
        c.execute(
            "update notes set pipeline_status = 'recording', pipeline_error = null, stop_reason = null, started_at = coalesce(started_at, ?2), updated_at = ?2 where id = ?1",
            params![id, now_ms()],
        )?;
        note_of(c, &id)
    })
}

#[tauri::command(async)]
fn recording_stop(st: State<St>, id: String) -> R<Note> {
    check_id(&id)?;
    jobs::stop_recording(&st.0, &id, None).map_err(err)?;
    read(&st, |c| note_of(c, &id))
}

/* Writing notes and transcript --------------------------------------------------------------------- */

#[tauri::command(async)]
fn generate_notes(st: State<St>, id: String, template_id: Option<String>) -> R<Note> {
    check_id(&id)?;
    write(&st, |c| {
        notes::update_own(c, &id, None, None, template_id.as_deref())?;
        if !capture::is_recording(&id) {
            c.execute("update notes set pipeline_status = 'saved' where id = ?1", [&id])?;
            jobs::advance(c, &id)?;
        }
        note_of(c, &id)
    })
}

#[tauri::command(async)]
fn transcript_delete_segment(st: State<St>, seg_id: String) -> R<()> {
    check_id(&seg_id)?;
    write(&st, |c| Ok(c.execute("update transcript_segments set deleted = 1 where id = ?1", [&seg_id]).map(|_| ())?))
}

#[tauri::command(async)]
fn transcript_copy_all(st: State<St>, id: String) -> R<String> {
    check_id(&id)?;
    read(&st, |c| notes::transcript_text(c, &id))
}

#[tauri::command(async)]
fn transcript_retry(st: State<St>, id: String) -> R<()> {
    check_id(&id)?;
    write(&st, |c| jobs::retranscribe(c, &id))
}

/* Templates and folders ---------------------------------------------------------------------------- */

#[tauri::command(async)]
fn templates_list(st: State<St>) -> R<Vec<Template>> {
    read(&st, notes::templates)
}

#[tauri::command(async)]
fn template_save(st: State<St>, template: Template) -> R<Template> {
    if !template.id.is_empty() {
        check_id(&template.id)?;
    }
    write(&st, |c| notes::template_save(c, &template))
}

#[tauri::command(async)]
fn template_delete(st: State<St>, id: String) -> R<()> {
    check_id(&id)?;
    write(&st, |c| notes::template_delete(c, &id))
}

#[tauri::command(async)]
fn folders_tree(st: State<St>) -> R<Vec<Folder>> {
    read(&st, notes::folders)
}

#[derive(Deserialize)]
struct FolderIn {
    id: Option<String>,
    name: String,
    description: Option<String>,
    icon: Option<String>,
}

#[tauri::command(async)]
fn folder_save(st: State<St>, folder: FolderIn) -> R<Folder> {
    if let Some(id) = &folder.id {
        check_id(id)?;
    }
    write(&st, |c| {
        let id = notes::folder_save(c, folder.id.as_deref(), &folder.name, folder.description.as_deref().unwrap_or(""), folder.icon.as_deref())?;
        notes::folders(c)?.into_iter().find(|f| f.id == id).ok_or_else(|| anyhow::anyhow!("folder vanished"))
    })
}

#[tauri::command(async)]
fn folder_delete(st: State<St>, id: String) -> R<()> {
    check_id(&id)?;
    write(&st, |c| notes::folder_delete(c, &id))
}

#[tauri::command(async)]
fn notes_add_to_folder(st: State<St>, ids: Vec<String>, folder_id: String) -> R<()> {
    check_ids(&ids)?;
    check_id(&folder_id)?;
    write(&st, |c| notes::add_to_folder(c, &ids, &folder_id))
}

#[tauri::command(async)]
fn notes_remove_from_folder(st: State<St>, ids: Vec<String>, folder_id: String) -> R<()> {
    check_ids(&ids)?;
    check_id(&folder_id)?;
    write(&st, |c| notes::remove_from_folder(c, &ids, &folder_id))
}

/* Trash -------------------------------------------------------------------------------------------- */

#[tauri::command(async)]
fn note_trash(st: State<St>, ids: Vec<String>) -> R<()> {
    check_ids(&ids)?;
    write(&st, |c| notes::trash(c, &ids, capture::is_recording))
}

#[tauri::command(async)]
fn note_restore(st: State<St>, id: String) -> R<()> {
    check_id(&id)?;
    write(&st, |c| notes::restore(c, &id))
}

/// Rows, transcript, generations and the audio files, all gone.
#[tauri::command(async)]
fn note_delete_forever(st: State<St>, id: String) -> R<()> {
    check_id(&id)?;
    capture::stop(&id);
    write(&st, |c| notes::delete_forever(c, &id))?;
    let dir = st.0.audio_dir(&id);
    if dir.exists() {
        std::fs::remove_dir_all(dir).map_err(|e| format!("The note is deleted, but its audio files could not be removed: {e}"))?;
    }
    Ok(())
}

/* Share and search --------------------------------------------------------------------------------- */

#[tauri::command(async)]
fn note_copy_markdown(st: State<St>, id: String) -> R<String> {
    check_id(&id)?;
    read(&st, |c| notes::markdown(c, &id))
}

#[tauri::command(async)]
fn note_email_draft(st: State<St>, id: String) -> R<String> {
    check_id(&id)?;
    read(&st, |c| notes::email_draft(c, &id))
}

#[derive(Serialize)]
struct Index {
    notes: Vec<notes::IndexEntry>,
    folders: Vec<Folder>,
}

#[tauri::command(async)]
fn search(st: State<St>) -> R<Index> {
    read(&st, |c| Ok(Index { notes: notes::search_index(c)?, folders: notes::folders(c)? }))
}

// read, not write: refreshing the index must not send "changed", or open screens would reload on every keystroke
#[tauri::command(async)]
fn search_notes(st: State<St>, q: String) -> R<Vec<notes::SearchHit>> {
    read(&st, |c| notes::search_notes(c, &q))
}

#[derive(Serialize)]
struct ChatResult {
    citations: Vec<chat::Citation>,
}

#[tauri::command(async)]
fn chat_send(st: State<St>, scope_ids: Option<Vec<String>>, text: String, on_token: Channel<String>) -> R<ChatResult> {
    if let Some(ids) = &scope_ids {
        check_ids(ids)?;
    }
    let text = text.trim().to_string();
    if text.is_empty() || text.chars().count() > 4000 {
        return Err("Ask a question of up to 4000 characters.".into());
    }
    let (ctx, llm) = read(&st, |c| {
        let llm = jobs::llm(c)?;
        Ok((chat::context(c, scope_ids.as_deref(), &text, llm.window())?, llm))
    })?;
    let citations = chat::answer(&llm, &ctx, &text, |t| on_token.send(t.to_string()).is_ok()).map_err(err)?;
    Ok(ChatResult { citations })
}

/* Settings ----------------------------------------------------------------------------------------- */

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    llm_provider: String,
    llm_model: String,
    /// Read-only, filled by settings_get: whether Apple's model can run here, and whether a Groq key is saved.
    #[serde(default)]
    apple_status: String,
    #[serde(default)]
    groq_key_saved: bool,
    summary_length: String,
    audio_retention: String,
    markdown_mirror_dir: Option<String>,
    user_name: Option<String>,
    user_role: Option<String>,
    user_context: Option<String>,
    jargon: Vec<String>,
    languages: Vec<String>,
}

#[tauri::command(async)]
fn settings_get(st: State<St>) -> R<Settings> {
    read(&st, |c| {
        Ok(c.query_row(
            "select llm_provider, llm_model, summary_length, audio_retention, markdown_mirror_dir, user_name, user_role, user_context, jargon, languages from settings",
            [],
            |r| {
                let (j, l): (String, String) = (r.get(8)?, r.get(9)?);
                Ok(Settings {
                    llm_provider: r.get(0)?, llm_model: r.get(1)?, summary_length: r.get(2)?, audio_retention: r.get(3)?,
                    markdown_mirror_dir: r.get(4)?, user_name: r.get(5)?, user_role: r.get(6)?, user_context: r.get(7)?,
                    apple_status: apple::status().into(), groq_key_saved: enhance::groq_key().is_some_and(|k| !k.is_empty()),
                    jargon: serde_json::from_str(&j).unwrap_or_default(), languages: serde_json::from_str(&l).unwrap_or_default(),
                })
            },
        )?)
    })
}

#[tauri::command(async)]
fn settings_update(st: State<St>, s: Settings) -> R<()> {
    let short = |v: &Option<String>, n: usize| v.as_ref().is_none_or(|x| x.chars().count() <= n);
    if s.llm_model.trim().is_empty() {
        return Err("Enter a model name.".into());
    }
    if s.llm_model.len() > 200 {
        return Err("Keep the model name under 200 characters.".into());
    }
    if s.jargon.len() > 30 || s.jargon.iter().any(|j| j.chars().count() > 60) {
        return Err("Up to 30 words, each under 60 characters.".into());
    }
    if s.languages.len() > 10 || !short(&s.user_context, 2000) || !short(&s.user_name, 200) || !short(&s.user_role, 200) {
        return Err("Some settings are too long.".into());
    }
    if let Some(d) = &s.markdown_mirror_dir {
        if !std::path::Path::new(d).is_dir() {
            return Err("That folder does not exist.".into());
        }
    }
    // provider, length and retention values are checked by the table's check constraints
    write(&st, |c| {
        c.execute(
            "update settings set llm_provider = ?1, llm_model = ?2, summary_length = ?3, audio_retention = ?4, markdown_mirror_dir = ?5,
               user_name = ?6, user_role = ?7, user_context = ?8, jargon = ?9, languages = ?10, updated_at = ?11 where id = 1",
            params![s.llm_provider, s.llm_model.trim(), s.summary_length, s.audio_retention, s.markdown_mirror_dir,
                s.user_name, s.user_role, s.user_context, serde_json::to_string(&s.jargon)?, serde_json::to_string(&s.languages)?, now_ms()],
        )?;
        Ok(())
    })
}

/// Saves the Groq key in the Keychain; an empty key removes it.
#[tauri::command(async)]
fn groq_key_set(key: String) -> R<()> {
    let key = key.trim();
    if !key.is_empty() && (key.len() > 200 || key.chars().any(|c| c.is_whitespace() || c.is_control())) {
        return Err("That does not look like a Groq API key. Copy it again from console.groq.com/keys.".into());
    }
    enhance::set_groq_key(key).map_err(err)
}

#[tauri::command(async)]
fn mic_permission() -> String {
    capture::mic_permission().to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Permissions {
    mic: String,
    system_audio: String,
}

#[tauri::command(async)]
fn permissions_get() -> Permissions {
    Permissions { mic: capture::mic_permission().into(), system_audio: capture::system_audio_permission().into() }
}

#[tauri::command(async)]
fn permission_request(st: State<St>, kind: String) -> R<Permissions> {
    capture::request_permission(&kind).map_err(err)?;
    (st.0.notify)();
    Ok(permissions_get())
}

#[derive(Serialize)]
struct Export {
    dir: String,
    count: usize,
}

/// Every note not in the trash as one markdown file, in a new dated folder under ~/Documents.
#[tauri::command(async)]
fn notes_export(st: State<St>) -> R<Export> {
    let home = std::env::var("HOME").map_err(|_| "Could not find your home folder.".to_string())?;
    let stamp = chrono::Local::now().format("%Y-%m-%d %H%M");
    let base = std::path::Path::new(&home).join("Documents");
    let mut dir = base.join(format!("Meeting notes {stamp}"));
    let mut n = 2;
    while dir.exists() { dir = base.join(format!("Meeting notes {stamp} ({n})")); n += 1; } // two exports in one minute get two folders
    read(&st, |c| {
        let count = notes::export_all(c, &dir)?;
        Ok(Export { dir: dir.to_string_lossy().into(), count })
    })
}

/* S20 meeting notification ------------------------------------------------------------------------- */

/// "Start notes" in the pop-up: the note for that meeting, recording on, the call link opened, the main window on the note.
#[tauri::command(async)]
fn meeting_take_notes(app: tauri::AppHandle, window: tauri::Window, st: State<St>, event_id: String) -> R<String> {
    let note = note_open_for_event(st.clone(), event_id.clone())?;
    recording_start(st.clone(), note.id.clone())?;
    let link: Option<String> =
        read(&st, |c| Ok(c.query_row("select video_link from calendar_events where id = ?1", [&event_id], |r| r.get(0)).optional()?.flatten()))?;
    if let Some(l) = link.filter(|l| l.starts_with("https://")) {
        use tauri_plugin_opener::OpenerExt;
        let _ = app.opener().open_url(l, None::<&str>); // the notes still start if the browser does not open
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
        let _ = main.emit("navigate", format!("/note/{}", note.id));
    }
    let _ = window.close();
    Ok(note.id)
}

#[tauri::command]
fn meeting_dismiss(window: tauri::Window) {
    let _ = window.close();
}

/// Every 15 s: a small always-on-top window, top right, for each meeting about to start.
fn spawn_notifier(app: tauri::AppHandle, core: Arc<Core>) {
    std::thread::spawn(move || {
        let mut shown = std::collections::HashSet::new();
        loop {
            let due = notify::due(&core.db.lock().unwrap(), now_ms(), &shown).unwrap_or_else(|e| {
                eprintln!("notifier: {e}");
                vec![]
            });
            for (i, d) in due.into_iter().enumerate() {
                shown.insert(d.id.clone());
                let h = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let (w, h_px) = (360.0, 128.0);
                    let x = h.primary_monitor().ok().flatten().map(|m| m.size().width as f64 / m.scale_factor() - w - 16.0).unwrap_or(40.0);
                    let url = tauri::WebviewUrl::App(format!("index.html#/toast/{}", d.id).into());
                    let built = tauri::WebviewWindowBuilder::new(&h, format!("toast-{}", d.id), url)
                        .title("Meeting starting")
                        .inner_size(w, h_px)
                        .position(x, 40.0 + i as f64 * (h_px + 12.0))
                        .decorations(false)
                        .resizable(false)
                        .always_on_top(true)
                        .skip_taskbar(true)
                        .focused(false)
                        .build();
                    if let Err(e) = built {
                        eprintln!("notifier window: {e}");
                    }
                });
            }
            std::thread::sleep(std::time::Duration::from_secs(15));
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let conn = db::open(&data.join("app.db"))?;
            jobs::recover(&conn)?;
            let handle = app.handle().clone();
            let core = Arc::new(Core { db: Mutex::new(conn), data, notify: Box::new(move || { let _ = handle.emit("changed", ()); }) });
            jobs::spawn(core.clone());
            jobs::spawn_auto_stop(core.clone());
            spawn_notifier(app.handle().clone(), core.clone());
            app.manage(St(core));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_notes, groq_key_set,
            calendar_upcoming, calendar_sources_list, calendar_add_source, calendar_source_delete,
            note_create, note_open_for_event, notes_list, note_get, note_update_own,
            recording_start, recording_stop, generate_notes,
            transcript_delete_segment, transcript_copy_all, transcript_retry,
            templates_list, template_save, template_delete,
            folders_tree, folder_save, folder_delete, notes_add_to_folder, notes_remove_from_folder,
            note_trash, note_restore, note_delete_forever,
            note_copy_markdown, note_email_draft, search, chat_send,
            settings_get, settings_update, mic_permission, permissions_get, permission_request, notes_export,
            meeting_take_notes, meeting_dismiss,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the app")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                for id in capture::recording_ids() {
                    capture::stop(&id); // the last segment reaches the disk before quitting
                }
                jobs::release_model();
            }
        });
}
