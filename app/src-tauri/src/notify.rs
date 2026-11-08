//! S20 meeting notification: which calendar events should get a pop-up right now.

use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashSet;

/// How far ahead to look. The checker runs every 15 s, so a 75 s window catches every event about a minute early.
pub const LEAD_MS: i64 = 75_000;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Due {
    pub id: String,
    pub title: String,
    pub start_at: i64,
    pub video_link: Option<String>,
}

/// Events starting within LEAD_MS (or started less than a minute ago), from an enabled calendar, not cancelled,
/// with 2+ invitees, not already shown, and with no note for them that is recording.
pub fn due(conn: &Connection, now: i64, shown: &HashSet<String>) -> anyhow::Result<Vec<Due>> {
    let mut st = conn.prepare(
        "select e.id, e.title, e.start_at, e.video_link from calendar_events e
         join calendar_sources s on s.id = e.source_id and s.enabled = 1
         where e.cancelled = 0 and e.start_at > ?1 - 60000 and e.start_at <= ?1 + ?2
           and json_array_length(e.invitees) >= 2
           and not exists (select 1 from notes n where n.calendar_event_id = e.id and n.deleted_at is null and n.pipeline_status = 'recording')
         order by e.start_at",
    )?;
    let rows = st.query_map(params![now, LEAD_MS], |r| Ok(Due { id: r.get(0)?, title: r.get(1)?, start_at: r.get(2)?, video_link: r.get(3)? }))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?.into_iter().filter(|d| !shown.contains(&d.id)).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::mem;

    fn event(c: &Connection, id: &str, start: i64, invitees: usize, cancelled: i64) {
        let people: Vec<_> = (0..invitees).map(|i| serde_json::json!({ "email": format!("p{i}@x.test"), "name": format!("P{i}") })).collect();
        c.execute(
            "insert into calendar_events (id, source_id, provider_event_id, title, invitees, start_at, end_at, cancelled, created_at, updated_at)
             values (?1, 's', ?1, ?1, ?2, ?3, ?3 + 1800000, ?4, 0, 0)",
            params![id, serde_json::to_string(&people).unwrap(), start, cancelled],
        )
        .unwrap();
    }

    #[test]
    fn picks_only_events_about_to_start_with_two_or_more_people() {
        let c = mem();
        c.execute("insert into calendar_sources (id, kind, label, ics_url, created_at, updated_at) values ('s','ics','x','https://a',0,0)", []).unwrap();
        let now = 10_000_000;
        event(&c, "soon", now + 60_000, 2, 0);
        event(&c, "solo", now + 60_000, 1, 0); // just you, or one other person
        event(&c, "later", now + 10 * 60_000, 3, 0);
        event(&c, "cancelled", now + 30_000, 2, 1);
        event(&c, "just-started", now - 30_000, 2, 0);
        event(&c, "long-started", now - 5 * 60_000, 2, 0);
        let ids = |shown: &HashSet<String>| due(&c, now, shown).unwrap().into_iter().map(|d| d.id).collect::<Vec<_>>();
        assert_eq!(ids(&HashSet::new()), ["just-started", "soon"]);
        assert_eq!(ids(&HashSet::from(["soon".to_string()])), ["just-started"]);

        // already taking notes for it: no pop-up
        let n = crate::notes::create(&c, Some("soon")).unwrap();
        c.execute("update notes set pipeline_status = 'recording' where id = ?1", [&n]).unwrap();
        assert_eq!(ids(&HashSet::new()), ["just-started"]);

        // calendar turned off: nothing
        c.execute("update calendar_sources set enabled = 0", []).unwrap();
        assert!(ids(&HashSet::new()).is_empty());
    }
}
