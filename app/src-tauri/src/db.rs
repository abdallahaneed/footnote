use rusqlite::Connection;
use std::path::Path;

const MIGRATIONS: &[&str] = &[include_str!("../migrations/0001_init.sql"), include_str!("../migrations/0002_templates.sql"),
    include_str!("../migrations/0003_interviews.sql"), include_str!("../migrations/0004_search.sql"),
    include_str!("../migrations/0005_models.sql"),
];

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "wal")?;
    conn.pragma_update(None, "foreign_keys", "on")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

pub fn uid() -> String {
    uuid::Uuid::now_v7().to_string()
}

#[cfg(test)]
pub fn mem() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    c.pragma_update(None, "foreign_keys", "on").unwrap();
    migrate(&c).unwrap();
    c
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_apply_once_and_seed_templates() {
        let c = mem();
        migrate(&c).unwrap();
        let n: i64 = c.query_row("select count(*) from templates where built_in = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 5);
        let d: String = c.query_row("select default_template_id from settings", [], |r| r.get(0)).unwrap();
        assert_eq!(d, "t-standard");
        // 0003: transcript only, audio removed once transcribed
        let keep: String = c.query_row("select audio_retention from settings", [], |r| r.get(0)).unwrap();
        assert_eq!(keep, "delete_after_transcript");
    }

    #[test]
    fn schema_constraints_hold() {
        let c = mem();
        c.execute("insert into calendar_sources (id, kind, label, ics_url, created_at, updated_at) values ('s','ics','x','https://a',0,0)", []).unwrap();
        c.execute("insert into calendar_events (id, source_id, provider_event_id, title, start_at, end_at, created_at, updated_at) values ('e','s','p','t',0,1,0,0)", []).unwrap();
        let note = |id: &str| c.execute("insert into notes (id, calendar_event_id, meeting_at, created_at, updated_at) values (?1,'e',0,0,0)", [id]);
        note("n1").unwrap();
        assert!(note("n2").is_err(), "one note per calendar event");
        assert!(c.execute("update notes set pipeline_status='failed' where id='n1'", []).is_err(), "failed needs a reason");
        c.execute("insert into folders (id, name, created_at, updated_at) values ('a','A',0,0)", []).unwrap();
        c.execute("insert into folders (id, parent_folder_id, name, created_at, updated_at) values ('b','a','B',0,0)", []).unwrap();
        assert!(c.execute("insert into folders (id, parent_folder_id, name, created_at, updated_at) values ('c','b','C',0,0)", []).is_err());
    }
}
