//! S11/S12 recipes: saved chat prompts run with /shortcut. "single" ones need one meeting, "multiple" ones work
//! on any set of notes.
use crate::db::{now_ms, uid};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Recipe {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub prompt: String,
    pub scope: String,
    #[serde(default)]
    pub built_in: bool,
}

fn row(r: &rusqlite::Row) -> rusqlite::Result<Recipe> {
    Ok(Recipe { id: r.get(0)?, slug: r.get(1)?, name: r.get(2)?, prompt: r.get(3)?, scope: r.get(4)?, built_in: r.get::<_, i64>(5)? == 1 })
}

const COLS: &str = "id, slug, name, prompt, scope, built_in";

pub fn list(conn: &Connection) -> anyhow::Result<Vec<Recipe>> {
    let mut st = conn.prepare(&format!("select {COLS} from recipes order by built_in desc, lower(name)"))?;
    let rows = st.query_map([], row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// "Follow-up Email!" -> "follow-up-email": what can follow the "/".
pub fn slugify(s: &str) -> String {
    let mut out = String::new();
    for c in s.trim().trim_start_matches('/').chars().flat_map(char::to_lowercase) {
        match c {
            'ä' => out.push('a'),
            'ö' => out.push('o'),
            'ü' => out.push('u'),
            'ß' => out.push_str("ss"),
            c if c.is_ascii_alphanumeric() => out.push(c),
            _ if !out.ends_with('-') && !out.is_empty() => out.push('-'),
            _ => {}
        }
    }
    out.trim_end_matches('-').chars().take(40).collect::<String>().trim_end_matches('-').to_string()
}

pub fn save(conn: &Connection, r: &Recipe) -> anyhow::Result<Recipe> {
    let name = r.name.trim();
    anyhow::ensure!(!name.is_empty() && name.chars().count() <= 40, "Give the recipe a name of up to 40 characters.");
    let slug = slugify(if r.slug.trim().is_empty() { name } else { &r.slug });
    anyhow::ensure!(!slug.is_empty(), "The shortcut needs at least one letter or number.");
    let prompt = r.prompt.trim();
    anyhow::ensure!(!prompt.is_empty(), "Write what the recipe should ask.");
    anyhow::ensure!(prompt.chars().count() <= 4000, "Keep the prompt under 4,000 characters.");
    anyhow::ensure!(r.scope == "single" || r.scope == "multiple", "Pick one meeting or several.");
    let taken: Option<String> = conn.query_row("select name from recipes where slug = ?1 and id <> ?2", params![slug, r.id], |x| x.get(0)).optional()?;
    if let Some(other) = taken {
        anyhow::bail!("\"{other}\" already uses /{slug}. Pick another shortcut.");
    }
    let now = now_ms();
    if r.id.is_empty() {
        let id = uid();
        conn.execute(
            "insert into recipes (id, slug, name, prompt, scope, built_in, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)",
            params![id, slug, name, prompt, r.scope, now],
        )?;
        return get(conn, &id);
    }
    let built_in: bool = conn.query_row("select built_in = 1 from recipes where id = ?1", [&r.id], |x| x.get(0)).optional()?
        .ok_or_else(|| anyhow::anyhow!("This recipe was deleted."))?;
    anyhow::ensure!(!built_in, "Built-in recipes cannot be changed. Duplicate it to make your own.");
    conn.execute("update recipes set slug = ?2, name = ?3, prompt = ?4, scope = ?5, updated_at = ?6 where id = ?1", params![r.id, slug, name, prompt, r.scope, now])?;
    get(conn, &r.id)
}

fn get(conn: &Connection, id: &str) -> anyhow::Result<Recipe> {
    Ok(conn.query_row(&format!("select {COLS} from recipes where id = ?1"), [id], row)?)
}

pub fn delete(conn: &Connection, id: &str) -> anyhow::Result<()> {
    let built_in: Option<bool> = conn.query_row("select built_in = 1 from recipes where id = ?1", [id], |x| x.get(0)).optional()?;
    anyhow::ensure!(built_in != Some(true), "Built-in recipes cannot be deleted.");
    conn.execute("delete from recipes where id = ?1", [id])?; // old chat messages keep their text; recipe_id goes null
    Ok(())
}

/// "/follow-up mention the budget" -> the recipe and the question to ask. Text without a leading "/" is not a
/// recipe (None). `one_note` is whether the chat is about exactly one meeting.
pub fn resolve(conn: &Connection, text: &str, one_note: bool) -> anyhow::Result<Option<(Recipe, String)>> {
    let Some(rest) = text.trim().strip_prefix('/') else { return Ok(None) };
    let (slug, extra) = rest.split_once(char::is_whitespace).unwrap_or((rest, ""));
    let r = conn.query_row(&format!("select {COLS} from recipes where slug = ?1"), [slug.to_lowercase()], row).optional()?
        .ok_or_else(|| anyhow::anyhow!("There is no recipe called /{slug}. Your recipes are under Recipes in the sidebar."))?;
    anyhow::ensure!(r.scope != "single" || one_note, "/{} works on one meeting. Open a note and ask there.", r.slug);
    let q = if extra.trim().is_empty() { r.prompt.clone() } else { format!("{}\n\nAlso: {}", r.prompt, extra.trim()) };
    Ok(Some((r, q)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new(name: &str, slug: &str, scope: &str) -> Recipe {
        Recipe { id: String::new(), slug: slug.into(), name: name.into(), prompt: "List the risks.".into(), scope: scope.into(), built_in: false }
    }

    #[test]
    fn shortcuts_are_clean_and_unique() {
        assert_eq!(slugify("Follow-up Email!"), "follow-up-email");
        assert_eq!(slugify("/Über  Größe"), "uber-grosse");
        assert_eq!(slugify("🎉"), "");
        assert_eq!(slugify(&"a".repeat(60)).len(), 40);
        let c = crate::db::mem();
        assert_eq!(list(&c).unwrap().iter().filter(|r| r.built_in).count(), 4, "starter recipes");
        let r = save(&c, &new("Risks", "", "multiple")).unwrap();
        assert_eq!(r.slug, "risks");
        assert!(save(&c, &new("Other", "risks", "single")).unwrap_err().to_string().contains("\"Risks\" already uses /risks"));
        assert!(save(&c, &new("Clash", "decisions", "single")).unwrap_err().to_string().contains("already uses /decisions"));
        assert!(save(&c, &new("", "", "single")).is_err());
        assert!(save(&c, &new("Emoji", "🎉", "single")).unwrap_err().to_string().contains("at least one letter"));
        assert!(save(&c, &Recipe { prompt: " ".into(), ..new("Empty", "", "single") }).is_err());
        assert!(save(&c, &new("Bad scope", "", "everything")).is_err());
        // edit own, keep its own shortcut
        let edited = save(&c, &Recipe { prompt: "List risks and owners.".into(), ..r.clone() }).unwrap();
        assert_eq!((edited.slug.as_str(), edited.prompt.as_str()), ("risks", "List risks and owners."));
        // built-ins are read-only
        let b = list(&c).unwrap().into_iter().find(|r| r.slug == "decisions").unwrap();
        assert!(save(&c, &Recipe { prompt: "x".into(), ..b.clone() }).unwrap_err().to_string().contains("Duplicate"));
        assert!(delete(&c, &b.id).is_err());
        delete(&c, &r.id).unwrap();
        assert!(save(&c, &edited).unwrap_err().to_string().contains("deleted"));
    }

    #[test]
    fn slash_runs_a_recipe_and_checks_its_scope() {
        let c = crate::db::mem();
        assert!(resolve(&c, "what did we decide?", true).unwrap().is_none());
        let (r, q) = resolve(&c, "/decisions", true).unwrap().unwrap();
        assert_eq!((r.slug.as_str(), q), ("decisions", r.prompt.clone()));
        let (_, q) = resolve(&c, "  /Follow-up mention the budget ", true).unwrap().unwrap();
        assert!(q.ends_with("Also: mention the budget"));
        assert!(resolve(&c, "/follow-up", false).unwrap_err().to_string().contains("works on one meeting"));
        assert!(resolve(&c, "/weekly-update", false).unwrap().is_some());
        assert!(resolve(&c, "/weekly-update", true).unwrap().is_some(), "several-meeting recipes also work on one");
        assert!(resolve(&c, "/nope", true).unwrap_err().to_string().contains("no recipe called /nope"));
    }
}
