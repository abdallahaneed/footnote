//! Calendars without an account: an ICS link (Google, Outlook and iCloud all offer a private one).
//! Recurring meetings are expanded with their time zone, so they stay right across daylight saving changes.
use crate::db::{now_ms, uid};
use crate::notes::Person;
use chrono::{NaiveDateTime, TimeZone};
use rrule::{RRule, Tz, Unvalidated};
use rusqlite::{params, Connection};
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq)]
pub struct Ev {
    pub uid: String,
    pub title: String,
    pub start: i64,
    pub end: i64,
    pub invitees: Vec<Person>,
    pub organiser: Option<String>,
    pub video: Option<String>,
    pub series: Option<String>,
    pub cancelled: bool,
}

/// ICS lines are folded at 75 bytes; a line starting with a space continues the one before.
fn unfold(ics: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for raw in ics.split('\n') {
        let l = raw.trim_end_matches('\r');
        if (l.starts_with(' ') || l.starts_with('\t')) && !out.is_empty() {
            out.last_mut().unwrap().push_str(&l[1..]);
        } else {
            out.push(l.to_string());
        }
    }
    out
}

fn unescape(v: &str) -> String {
    v.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")
}

fn param<'a>(params: &'a str, key: &str) -> Option<&'a str> {
    params.split(';').find_map(|p| p.split_once('=').filter(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v.trim_matches('"')))
}

/// A DTSTART/DTEND/EXDATE value. All-day dates return None: they are not meetings.
fn when(params: &str, value: &str) -> Option<chrono::DateTime<Tz>> {
    if param(params, "VALUE") == Some("DATE") || value.len() == 8 {
        return None;
    }
    if let Some(v) = value.strip_suffix('Z') {
        let n = NaiveDateTime::parse_from_str(v, "%Y%m%dT%H%M%S").ok()?;
        return Some(Tz::UTC.from_utc_datetime(&n));
    }
    let n = NaiveDateTime::parse_from_str(value, "%Y%m%dT%H%M%S").ok()?;
    // Unknown zone names (Outlook's Windows names) fall back to the computer's zone.
    let tz = param(params, "TZID").and_then(|z| z.parse::<chrono_tz::Tz>().ok()).map(Tz::Tz).unwrap_or(Tz::LOCAL);
    tz.from_local_datetime(&n).earliest()
}

fn video_link(text: &str) -> Option<String> {
    text.split(|c: char| c.is_whitespace() || c == '<' || c == '>' || c == '"' || c == ',')
        .find(|w| w.starts_with("https://") && ["meet.google.", "zoom.us", "teams.microsoft.", "teams.live.", "whereby.com", "webex.com"].iter().any(|h| w.contains(h)))
        .map(str::to_string)
}

/// The calendar's own name (X-WR-CALNAME), so two links from one provider are not both called "calendar.google.com".
pub fn cal_name(ics: &str) -> Option<String> {
    let line = unfold(ics).into_iter().take_while(|l| l != "BEGIN:VEVENT").find(|l| l.starts_with("X-WR-CALNAME"))?;
    let raw = line.split_once(':')?.1;
    let name = raw.replace("\\,", ",").replace("\\;", ";").replace("\\n", " ").replace("\\N", " ").replace("\\\\", "\\");
    let name: String = name.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(100).collect();
    (!name.is_empty()).then_some(name)
}

/// Turns a calendar's meetings and pop-ups on or off; its events stay stored.
pub fn set_enabled(conn: &Connection, id: &str, enabled: bool) -> anyhow::Result<()> {
    let n = conn.execute("update calendar_sources set enabled = ?2, updated_at = ?3 where id = ?1", params![id, enabled as i64, now_ms()])?;
    anyhow::ensure!(n == 1, "This calendar was removed.");
    Ok(())
}

/// Events overlapping [from, to), recurring ones expanded.
// shortcut: moved or edited single instances of a series (RECURRENCE-ID) show at their original time; handle them if people report it.
pub fn parse(ics: &str, from: i64, to: i64) -> Vec<Ev> {
    let mut out = Vec::new();
    let mut props: Vec<(String, String, String)> = Vec::new();
    let mut inside = false;
    for line in unfold(ics) {
        match line.as_str() {
            "BEGIN:VEVENT" => { inside = true; props.clear(); continue; }
            "END:VEVENT" => { inside = false; out.extend(expand(&props, from, to)); continue; }
            _ if !inside => continue,
            _ => {}
        }
        let Some((head, value)) = line.split_once(':') else { continue };
        let (name, params) = head.split_once(';').unwrap_or((head, ""));
        props.push((name.to_ascii_uppercase(), params.to_string(), value.to_string()));
    }
    out
}

fn expand(props: &[(String, String, String)], from: i64, to: i64) -> Vec<Ev> {
    let get = |k: &str| props.iter().find(|(n, _, _)| n == k);
    if get("RECURRENCE-ID").is_some() {
        return Vec::new();
    }
    let Some((_, sp, sv)) = get("DTSTART") else { return Vec::new() };
    let Some(start) = when(sp, sv) else { return Vec::new() };
    let length = get("DTEND").and_then(|(_, p, v)| when(p, v)).map(|e| (e - start).num_milliseconds()).unwrap_or(30 * 60_000).max(0);
    let uid = get("UID").map(|p| p.2.clone()).unwrap_or_else(|| format!("{}-{}", get("SUMMARY").map(|p| p.2.as_str()).unwrap_or(""), start.timestamp()));
    let invitees: Vec<Person> = props
        .iter()
        .filter(|(n, _, _)| n == "ATTENDEE")
        .filter_map(|(_, p, v)| {
            let email = v.split_once(':').map(|(_, e)| e).unwrap_or(v).trim().to_string();
            email.contains('@').then(|| Person { name: param(p, "CN").map(unescape).unwrap_or_else(|| email.clone()), email })
        })
        .collect();
    let text = |k: &str| get(k).map(|p| unescape(&p.2)).unwrap_or_default();
    let base = Ev {
        uid: uid.clone(),
        title: { let t = text("SUMMARY"); if t.is_empty() { "Untitled meeting".into() } else { t } },
        start: 0, end: 0,
        organiser: get("ORGANIZER").map(|(_, _, v)| v.split_once(':').map(|(_, e)| e).unwrap_or(v).to_string()),
        video: get("X-GOOGLE-CONFERENCE").map(|p| p.2.clone()).or_else(|| video_link(&format!("{} {} {}", text("URL"), text("LOCATION"), text("DESCRIPTION")))),
        series: None,
        cancelled: text("STATUS").eq_ignore_ascii_case("CANCELLED"),
        invitees,
    };
    let starts: Vec<i64> = match get("RRULE") {
        None => vec![start.timestamp_millis()],
        Some((_, _, rule)) => {
            let Ok(r) = rule.parse::<RRule<Unvalidated>>() else { return Vec::new() };
            let Ok(mut set) = r.build(start) else { return Vec::new() };
            for (_, p, v) in props.iter().filter(|(n, _, _)| n == "EXDATE") {
                for one in v.split(',') {
                    if let Some(d) = when(p, one) {
                        set = set.exdate(d);
                    }
                }
            }
            let lo = Tz::UTC.timestamp_millis_opt(from - length).single().unwrap_or(start);
            let hi = Tz::UTC.timestamp_millis_opt(to).single().unwrap_or(start);
            set.after(lo).before(hi).all(500).dates.iter().map(|d| d.timestamp_millis()).collect()
        }
    };
    let series = get("RRULE").map(|_| uid.clone());
    starts
        .into_iter()
        .filter(|s| *s < to && s + length > from)
        .map(|s| Ev { start: s, end: s + length, series: series.clone(), ..base.clone() })
        .collect()
}

pub fn validate_url(url: &str) -> anyhow::Result<String> {
    let url = url.trim();
    let url = url.strip_prefix("webcal://").map(|r| format!("https://{r}")).unwrap_or_else(|| url.to_string());
    anyhow::ensure!(url.starts_with("https://") || url.starts_with("http://"), "Paste the calendar's ICS link. It starts with https:// or webcal://.");
    anyhow::ensure!(url.len() <= 2000 && !url.contains(char::is_whitespace), "That link does not look right.");
    Ok(url)
}

pub fn fetch(url: &str) -> anyhow::Result<String> {
    let resp = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(30)).build()?.get(url).send()?;
    anyhow::ensure!(resp.status().is_success(), "The calendar link answered with error {}.", resp.status().as_u16());
    let body = resp.text()?;
    anyhow::ensure!(body.contains("BEGIN:VCALENDAR"), "That link is not a calendar (no ICS data).");
    Ok(body)
}

/// Replaces this source's events in the window with what the feed says now.
pub fn store(conn: &Connection, source_id: &str, events: &[Ev], from: i64, to: i64) -> anyhow::Result<usize> {
    let now = now_ms();
    let tx = conn.unchecked_transaction()?;
    let mut keep = HashSet::new();
    for e in events {
        let invitees = serde_json::to_string(&e.invitees)?;
        tx.execute(
            "insert into calendar_events (id, source_id, provider_event_id, recurring_series_id, title, organiser_email, invitees, start_at, end_at, video_link, cancelled, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
             on conflict(source_id, provider_event_id, start_at) do update set
               recurring_series_id = ?4, title = ?5, organiser_email = ?6, invitees = ?7, end_at = ?9, video_link = ?10, cancelled = ?11, updated_at = ?12",
            params![uid(), source_id, e.uid, e.series, e.title, e.organiser, invitees, e.start, e.end, e.video, e.cancelled, now],
        )?;
        keep.insert((e.uid.clone(), e.start));
    }
    let existing: Vec<(String, String, i64)> = {
        let mut st = tx.prepare("select id, provider_event_id, start_at from calendar_events where source_id = ?1 and start_at >= ?2 and start_at < ?3")?;
        st.query_map(params![source_id, from, to], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<Result<_, _>>()?
    };
    for (id, p, s) in existing {
        if !keep.contains(&(p, s)) {
            tx.execute("delete from calendar_events where id = ?1", [id])?;
        }
    }
    tx.execute("update calendar_sources set last_sync_at = ?2, last_error = null, updated_at = ?2 where id = ?1", params![source_id, now])?;
    tx.commit()?;
    Ok(events.len())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Upcoming {
    id: String,
    title: String,
    start_at: i64,
    end_at: i64,
    invitees: Vec<Person>,
    #[serde(skip_serializing_if = "Option::is_none")]
    video_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note_id: Option<String>,
}

pub fn upcoming(conn: &Connection, now: i64, days: i64) -> anyhow::Result<Vec<Upcoming>> {
    let mut st = conn.prepare(
        "select e.id, e.title, e.start_at, e.end_at, e.invitees, e.video_link,
           (select n.id from notes n where n.calendar_event_id = e.id and n.deleted_at is null)
         from calendar_events e join calendar_sources s on s.id = e.source_id and s.enabled = 1
         where e.cancelled = 0 and e.end_at > ?1 and e.start_at < ?2 order by e.start_at limit 200",
    )?;
    let rows = st.query_map(params![now, now + days.clamp(1, 60) * 86_400_000], |r| {
        let inv: String = r.get(4)?;
        Ok(Upcoming {
            id: r.get(0)?, title: r.get(1)?, start_at: r.get(2)?, end_at: r.get(3)?, invitees: serde_json::from_str(&inv).unwrap_or_default(),
            video_link: r.get(5)?, note_id: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    id: String,
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_sync_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_error: Option<String>,
    events: i64,
    enabled: bool,
}

pub fn sources(conn: &Connection) -> anyhow::Result<Vec<Source>> {
    let mut st = conn.prepare(
        "select s.id, s.label, s.last_sync_at, s.last_error, (select count(*) from calendar_events e where e.source_id = s.id), s.enabled
         from calendar_sources s order by s.created_at",
    )?;
    let rows = st.query_map([], |r| {
        Ok(Source { id: r.get(0)?, label: r.get(1)?, last_sync_at: r.get(2)?, last_error: r.get(3)?, events: r.get(4)?, enabled: r.get::<_, i64>(5)? == 1 })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn add_source(conn: &Connection, url: &str) -> anyhow::Result<String> {
    let url = validate_url(url)?;
    let host = url.split("://").nth(1).and_then(|r| r.split('/').next()).unwrap_or("calendar").to_string();
    let id = uid();
    let now = now_ms();
    conn.execute(
        "insert into calendar_sources (id, kind, label, ics_url, created_at, updated_at) values (?1, 'ics', ?2, ?3, ?4, ?4)",
        params![id, host, url, now],
    )?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn day(y: i32, m: u32, d: u32) -> i64 {
        NaiveDate::from_ymd_opt(y, m, d).unwrap().and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis()
    }

    const ICS: &str = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:weekly-1\r\nSUMMARY:Weekly planning\\, team\r\n\
DTSTART;TZID=Europe/Berlin:20261020T100000\r\nDTEND;TZID=Europe/Berlin:20261020T103000\r\n\
RRULE:FREQ=WEEKLY;BYDAY=TU\r\nEXDATE;TZID=Europe/Berlin:20261103T100000\r\n\
ATTENDEE;CN=Mara Okafor;ROLE=REQ-PARTICIPANT:mailto:mara@x.test\r\nATTENDEE:mailto:jonas@x.test\r\n\
DESCRIPTION:Join at https://meet.google.com/abc-defg-hij please\r\nEND:VEVENT\r\n\
BEGIN:VEVENT\r\nUID:one\r\nSUMMARY:Supplier call with a really long title that goes on and o\r\n n\r\n\
DTSTART:20261105T130000Z\r\nDTEND:20261105T134500Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\n\
BEGIN:VEVENT\r\nUID:allday\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20261106\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    #[test]
    fn reads_the_calendar_name_and_turns_calendars_off() {
        let ics = "BEGIN:VCALENDAR\r\nX-WR-CALNAME:Hiring\\, EMEA\r\nBEGIN:VEVENT\r\nX-WR-CALNAME:not this\r\nEND:VEVENT\r\n";
        assert_eq!(cal_name(ics).as_deref(), Some("Hiring, EMEA"));
        assert_eq!(cal_name("BEGIN:VCALENDAR\r\nX-WR-CALNAME: \r\n"), None);
        assert_eq!(cal_name("BEGIN:VCALENDAR\r\nX-WR-CALNAME;VALUE=TEXT:Team\r\n").as_deref(), Some("Team"));
        assert_eq!(cal_name(&format!("X-WR-CALNAME:{}", "x".repeat(300))).map(|n| n.len()), Some(100));

        let c = crate::db::mem();
        let id = add_source(&c, "https://calendar.example.test/a.ics").unwrap();
        let now = now_ms();
        c.execute("insert into calendar_events (id, source_id, provider_event_id, title, invitees, start_at, end_at, cancelled, created_at, updated_at)
                   values ('e', ?1, 'e', 'Sync', '[]', ?2, ?2 + 1800000, 0, 0, 0)", params![id, now + 3_600_000]).unwrap();
        assert_eq!(upcoming(&c, now, 2).unwrap().len(), 1);
        set_enabled(&c, &id, false).unwrap();
        assert!(upcoming(&c, now, 2).unwrap().is_empty(), "off: no meetings on Home");
        assert!(!sources(&c).unwrap()[0].enabled);
        assert_eq!(sources(&c).unwrap()[0].events, 1, "events kept for when it is turned back on");
        set_enabled(&c, &id, true).unwrap();
        assert_eq!(upcoming(&c, now, 2).unwrap().len(), 1);
        assert!(set_enabled(&c, "gone", true).is_err());
    }

    #[test]
    fn parses_recurring_events_across_dst() {
        let evs = parse(ICS, day(2026, 10, 19), day(2026, 11, 12));
        let weekly: Vec<&Ev> = evs.iter().filter(|e| e.uid == "weekly-1").collect();
        // 20 Oct, 27 Oct, (3 Nov excluded), 10 Nov
        assert_eq!(weekly.len(), 3);
        assert_eq!(weekly[0].start, day(2026, 10, 20) + 8 * 3_600_000); // 10:00 CEST = 08:00 UTC
        assert_eq!(weekly[1].start, day(2026, 10, 27) + 9 * 3_600_000); // after DST ends: 10:00 CET = 09:00 UTC
        assert_eq!(weekly[0].end - weekly[0].start, 30 * 60_000);
        assert_eq!(weekly[0].title, "Weekly planning, team");
        assert_eq!(weekly[0].invitees[0], Person { name: "Mara Okafor".into(), email: "mara@x.test".into() });
        assert_eq!(weekly[0].invitees[1].name, "jonas@x.test");
        assert_eq!(weekly[0].video.as_deref(), Some("https://meet.google.com/abc-defg-hij"));
        assert_eq!(weekly[0].series.as_deref(), Some("weekly-1"));

        let one = evs.iter().find(|e| e.uid == "one").unwrap();
        assert!(one.cancelled);
        assert!(one.title.ends_with("and on"), "folded line joined: {}", one.title);
        assert!(!evs.iter().any(|e| e.uid == "allday"));
    }

    #[test]
    fn stores_and_replaces_window() {
        let c = crate::db::mem();
        let src = add_source(&c, "webcal://calendar.example.test/x.ics").unwrap();
        let (from, to) = (day(2026, 10, 19), day(2026, 11, 12));
        let evs = parse(ICS, from, to);
        store(&c, &src, &evs, from, to).unwrap();
        store(&c, &src, &evs, from, to).unwrap(); // idempotent
        let n: i64 = c.query_row("select count(*) from calendar_events", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 4);
        store(&c, &src, &evs[..1], from, to).unwrap(); // gone from the feed -> gone here
        let n: i64 = c.query_row("select count(*) from calendar_events", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        assert_eq!(upcoming(&c, day(2026, 10, 19), 14).unwrap().len(), 1);
        assert!(validate_url("ftp://x").is_err());
    }
}
