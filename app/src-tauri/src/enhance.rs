//! Writing notes with Apple's built-in model or Groq (fix #4: every generated line keeps the transcript lines it came from).
//! Stored format in notes.enhanced_md:  "## Heading", "- text [[seg:<id>]] [[seg:<id>]]", "- your line [[own]]".
use crate::notes::{Segment, Template};
use serde::Serialize;
use serde_json::{json, Value};
use std::io::BufRead;
use std::time::Duration;

#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(tag = "kind", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum GenLine {
    Heading { text: String },
    Own { text: String },
    Ai { text: String, seg_ids: Vec<String> },
}

/// Splits "text [[a]] [[b]]" into ("text", ["a", "b"]).
fn tags(line: &str) -> (String, Vec<String>) {
    let (mut text, mut found, mut rest) = (String::new(), Vec::new(), line);
    while let Some(i) = rest.find("[[") {
        let Some(j) = rest[i..].find("]]").map(|j| i + j) else { break };
        text.push_str(&rest[..i]);
        found.push(rest[i + 2..j].to_string());
        rest = &rest[j + 2..];
    }
    text.push_str(rest);
    (text.split_whitespace().collect::<Vec<_>>().join(" "), found)
}

pub fn parse_md(md: &str) -> Vec<GenLine> {
    md.lines()
        .filter_map(|l| {
            let l = l.trim();
            if let Some(h) = l.strip_prefix("## ") {
                return Some(GenLine::Heading { text: h.trim().into() });
            }
            let (text, t) = tags(l.strip_prefix("- ")?);
            Some(if t.iter().any(|x| x == "own") {
                GenLine::Own { text }
            } else {
                GenLine::Ai { text, seg_ids: t.iter().filter_map(|x| x.strip_prefix("seg:").map(str::to_string)).collect() }
            })
        })
        .collect()
}

/// Markdown for people: the tags removed.
pub fn export_md(md: &str) -> String {
    parse_md(md)
        .iter()
        .map(|l| match l {
            GenLine::Heading { text } => format!("\n## {text}"),
            GenLine::Own { text } | GenLine::Ai { text, .. } => format!("- {text}"),
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub struct Input<'a> {
    pub title: &'a str,
    pub template: &'a Template,
    pub own: &'a str,
    pub segments: &'a [Segment],
    pub context: &'a str,
    pub length: &'a str,
}

fn own_lines(own: &str) -> Vec<String> {
    own.lines().map(|l| l.trim().trim_start_matches(['-', '*', '•']).trim().to_string()).filter(|l| !l.is_empty()).collect()
}

fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}

/// "[S3]" style references from the model -> segment ids. Unknown numbers are dropped, so a made-up
/// reference never links anywhere.
fn anchors(line: &str, ids: &[String]) -> (String, Vec<String>) {
    let (mut text, mut found, mut rest) = (String::new(), Vec::new(), line);
    while let Some(i) = rest.find("[S") {
        let Some(j) = rest[i..].find(']').map(|j| i + j) else { break };
        let inner = &rest[i + 1..j];
        let nums: Vec<usize> = inner.split([',', ' ']).filter_map(|p| p.trim().trim_start_matches('S').parse().ok()).collect();
        if nums.is_empty() {
            text.push_str(&rest[..=j]);
        } else {
            text.push_str(&rest[..i]);
            for n in nums {
                if let Some(id) = n.checked_sub(1).and_then(|k| ids.get(k)) {
                    if !found.contains(id) {
                        found.push(id.clone());
                    }
                }
            }
        }
        rest = &rest[j + 1..];
    }
    text.push_str(rest);
    // "point [S3]." leaves "point ." once the reference is gone
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let text = [" .", " ,", " ?", " !", " ;", " :"].iter().fold(text, |t, p| t.replace(p, &p[1..]));
    let text = text.replace("?.", "?").replace("!.", "!");
    (text.trim_end_matches([' ', ',']).to_string(), found)
}

const SYSTEM: &str = "You write meeting notes from a transcript and the user's own rough notes. \
Use only facts from the transcript and the notes; never invent names, numbers or decisions. \
Write in the language of the transcript. Answer in Markdown only: each section starts with '## ' and the exact \
section heading given, followed by short bullet points starting with '- '. End every bullet that comes from the \
transcript with the reference numbers of the lines it is based on, like [S3] or [S3, S7]. \
Copy each of the user's own note lines word for word as its own bullet in the section where it fits best. \
If nothing fits a section, write '- Nothing came up on this.'";

/// The numbered transcript the model sees, and the segment id behind each number.
fn numbered(segs: &[Segment]) -> (Vec<String>, Vec<String>) {
    segs.iter()
        .filter(|s| !s.deleted)
        .enumerate()
        .map(|(i, s)| (format!("[S{}] {}: {}", i + 1, if s.side == "me" { "Me" } else { "Them" }, s.text), s.id.clone()))
        .unzip()
}

fn user_prompt(input: &Input, transcript: &str) -> String {
    let sections = input.template.sections.iter().map(|s| format!("## {}\n({})", s.heading, s.instructions)).collect::<Vec<_>>().join("\n");
    let length = match input.length {
        "short" => "Keep it short: at most 3 bullets per section.",
        "detailed" => "Be thorough: include every relevant point.",
        _ => "Use as many bullets as the content needs, no more.",
    };
    format!(
        "Meeting: {}\n{}\nSections to fill, in this order:\n{sections}\n\n{length}\n\nThe user's own notes:\n{}\n\nTranscript:\n{transcript}",
        crate::notes::title_of(input.title),
        if input.context.is_empty() { String::new() } else { format!("About the user: {}\n", input.context) },
        if input.own.trim().is_empty() { "(none)".to_string() } else { input.own.to_string() },
    )
}

/// Turns the model's answer into stored markdown: template headings in order, anchors checked, the user's own
/// lines marked (and added to the first section if the model dropped them).
pub fn to_stored(answer: &str, input: &Input, ids: &[String]) -> String {
    let headings: Vec<&str> = input.template.sections.iter().map(|s| s.heading.as_str()).collect();
    let mut buckets: Vec<Vec<String>> = vec![Vec::new(); headings.len()];
    let own = own_lines(input.own);
    let own_norm: Vec<String> = own.iter().map(|l| norm(l)).collect();
    let mut seen_own = vec![false; own.len()];
    let mut cur = 0usize;
    for line in answer.lines() {
        let l = line.trim();
        if let Some(h) = l.strip_prefix('#').map(|h| h.trim_start_matches('#').trim()) {
            if let Some(i) = headings.iter().position(|x| norm(x) == norm(h)) {
                cur = i;
            }
            continue;
        }
        let Some(body) = l.strip_prefix("- ").or_else(|| l.strip_prefix("* ")) else { continue };
        let (text, segs) = anchors(body, ids);
        if text.is_empty() || norm(&text) == norm("Nothing came up on this.") {
            continue;
        }
        // the model sometimes repeats an own line with a tag like "[user's note]" after it
        let n = norm(&text);
        if let Some(k) = own_norm.iter().position(|o| *o == n || (!o.is_empty() && n.starts_with(o.as_str()) && n.len() <= o.len() + 16)) {
            if !seen_own[k] {
                seen_own[k] = true;
                buckets[cur].push(format!("- {} [[own]]", own[k]));
            }
            continue;
        }
        let refs: String = segs.iter().map(|s| format!(" [[seg:{s}]]")).collect();
        buckets[cur].push(format!("- {text}{refs}"));
    }
    for (k, line) in own.iter().enumerate().rev() {
        if !seen_own[k] {
            buckets[0].insert(0, format!("- {line} [[own]]"));
        }
    }
    headings
        .iter()
        .zip(buckets)
        .map(|(h, b)| format!("## {h}\n{}", if b.is_empty() { "- Nothing came up on this.".into() } else { b.join("\n") }))
        .collect::<Vec<_>>()
        .join("\n\n")
}

/* The model ------------------------------------------------------------------------------------- */

/// "apple" (built into macOS 26+, on device), "groq" (the user's own free key, the transcript goes to Groq) or "none".
#[derive(Clone, Debug)]
pub struct Llm {
    pub provider: String,
    pub url: String,
    pub model: String,
    pub key: String,
}

impl Llm {
    /// Characters of transcript or notes per model call. Apple's model reads 4,096 tokens in total, prompt and
    /// answer included; Groq's free tier allows a few thousand tokens per minute, so ~5k tokens per call.
    pub fn window(&self) -> usize {
        if self.provider == "apple" { 6_000 } else { 20_000 }
    }
}

const KEYCHAIN_SERVICE: &str = "dev.abdallah.meetingnotes";
const KEYCHAIN_ACCOUNT: &str = "groq-api-key";

/// The Groq key lives in the macOS Keychain, never in the database.
pub fn groq_key() -> Option<String> {
    #[cfg(debug_assertions)]
    if let Ok(k) = std::env::var("MEETING_NOTES_TEST_GROQ_KEY") {
        return Some(k);
    }
    #[cfg(target_os = "macos")]
    return security_framework::passwords::get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).ok().and_then(|b| String::from_utf8(b).ok());
    #[cfg(not(target_os = "macos"))]
    None
}

/// Saves the key, or removes it when `key` is empty.
pub fn set_groq_key(key: &str) -> anyhow::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use security_framework::passwords::{delete_generic_password, set_generic_password};
        if key.is_empty() {
            let _ = delete_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT); // already gone is fine
        } else {
            set_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, key.as_bytes())?;
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    anyhow::bail!("Saving the key needs macOS.")
}

fn groq_post(llm: &Llm, body: &Value) -> anyhow::Result<reqwest::blocking::Response> {
    anyhow::ensure!(!llm.key.trim().is_empty(), "Add your Groq API key in Settings, or switch to Apple's built-in model.");
    let client = reqwest::blocking::Client::builder().timeout(Duration::from_secs(180)).build()?;
    let url = format!("{}/chat/completions", llm.url.trim_end_matches('/'));
    // the free tier answers 429 when the per-minute limit is used up; wait as told, a few times
    for attempt in 0..4 {
        let resp = client.post(&url).bearer_auth(llm.key.trim()).json(body).send().map_err(|e| {
            if e.is_connect() || e.is_timeout() { anyhow::anyhow!("Could not reach Groq. Check your internet connection, then try again.") } else { anyhow::anyhow!("Groq failed: {e}") }
        })?;
        let status = resp.status().as_u16();
        if resp.status().is_success() {
            return Ok(resp);
        }
        let wait = resp.headers().get("retry-after").and_then(|v| v.to_str().ok()?.parse::<f64>().ok()).unwrap_or(10.0).clamp(1.0, 60.0);
        let text = resp.text().unwrap_or_default();
        match status {
            429 if attempt < 3 => std::thread::sleep(Duration::from_secs_f64(wait)),
            429 => anyhow::bail!("Groq's free limit is used up for now. Try again in a few minutes."),
            401 | 403 => anyhow::bail!("Groq did not accept the API key. Check it in Settings."),
            404 | 400 if text.contains("model") && (text.contains("not found") || text.contains("decommissioned") || text.contains("does not exist")) => {
                anyhow::bail!("Groq no longer offers the model {}. Pick another model name in Settings.", llm.model)
            }
            413 => anyhow::bail!("This meeting is too long for one request on Groq's free tier."),
            _ => anyhow::bail!("Groq answered with error {status}: {}", text.chars().take(200).collect::<String>()),
        }
    }
    unreachable!("the last attempt returns or fails above")
}

fn turned_off(llm: &Llm) -> anyhow::Result<()> {
    anyhow::ensure!(llm.provider != "none", "Note writing is turned off in Settings.");
    Ok(())
}

/// One full answer.
pub fn complete(llm: &Llm, system: &str, user: &str) -> anyhow::Result<String> {
    turned_off(llm)?;
    let out = if llm.provider == "apple" {
        crate::apple::respond(system, user, |_| true)?
    } else {
        let msgs = json!([{ "role": "system", "content": system }, { "role": "user", "content": user }]);
        let v: Value = groq_post(llm, &json!({ "model": llm.model, "temperature": 0.2, "messages": msgs }))?.json()?;
        v["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string()
    };
    anyhow::ensure!(!out.trim().is_empty(), "The model returned an empty answer. Try again.");
    Ok(out)
}

/// Streams tokens to `on_token`; returning false stops reading.
pub fn stream(llm: &Llm, system: &str, user: &str, mut on_token: impl FnMut(&str) -> bool) -> anyhow::Result<String> {
    turned_off(llm)?;
    if llm.provider == "apple" {
        return crate::apple::respond(system, user, on_token);
    }
    let msgs = json!([{ "role": "system", "content": system }, { "role": "user", "content": user }]);
    let resp = groq_post(llm, &json!({ "model": llm.model, "temperature": 0.2, "stream": true, "messages": msgs }))?;
    let mut all = String::new();
    for line in std::io::BufReader::new(resp).lines() {
        let line = line?;
        let Some(data) = line.strip_prefix("data:").map(str::trim) else { continue };
        if data == "[DONE]" {
            break;
        }
        let v: Value = serde_json::from_str(data).unwrap_or(Value::Null);
        if let Some(t) = v["choices"][0]["delta"]["content"].as_str() {
            all.push_str(t);
            if !on_token(t) {
                break; // the UI stopped listening
            }
        }
    }
    Ok(all)
}

/// Writes the notes. Long meetings are condensed window by window first (map), keeping [S#] references,
/// then written into the template (reduce). Condensing repeats until the result fits one window.
pub fn write(llm: &Llm, input: &Input) -> anyhow::Result<String> {
    let (lines, ids) = numbered(input.segments);
    anyhow::ensure!(!lines.is_empty() || !input.own.trim().is_empty(), "Nothing to write up yet: there is no transcript and no notes of your own.");
    let window = llm.window();
    let sys = "List the important points of this part of a meeting transcript as short bullets starting with '- '. \
               End each bullet with the reference numbers it is based on, like [S3]. Facts only.";
    let mut parts = lines;
    let mut transcript = parts.join("\n");
    for _ in 0..3 {
        if transcript.len() <= window {
            break;
        }
        let mut windows: Vec<String> = vec![String::new()];
        for l in &parts {
            if !windows.last().unwrap().is_empty() && windows.last().unwrap().len() + l.len() > window {
                windows.push(String::new());
            }
            let w = windows.last_mut().unwrap();
            w.push_str(l);
            w.push('\n');
        }
        parts = windows.iter().map(|w| complete(llm, sys, w)).collect::<anyhow::Result<Vec<_>>>()?;
        transcript = parts.join("\n");
    }
    let answer = complete(llm, SYSTEM, &user_prompt(input, &transcript))?;
    Ok(to_stored(&answer, input, &ids))
}

/// A one-shot HTTP server that answers like Groq, to test the real request path without a network.
#[cfg(test)]
pub fn fake_server(reply: &'static str, status: u16) -> String {
    use std::io::{Read, Write};
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    std::thread::spawn(move || {
        let (mut s, _) = l.accept().unwrap();
        let mut buf = [0u8; 65536];
        let _ = s.read(&mut buf);
        let ct = if reply.starts_with("data:") { "text/event-stream" } else { "application/json" };
        let resp = format!("HTTP/1.1 {status} X\r\ncontent-type: {ct}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{reply}", reply.len());
        s.write_all(resp.as_bytes()).unwrap();
    });
    format!("http://127.0.0.1:{port}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::Section;

    fn seg(id: &str, side: &str, text: &str) -> Segment {
        Segment { id: id.into(), note_id: "n".into(), side: side.into(), speaker: String::new(), start_ms: 0, end_ms: 1, text: text.into(), deleted: false }
    }

    fn tpl() -> Template {
        Template {
            id: "t".into(), name: "T".into(), description: String::new(), built_in: true,
            sections: vec![Section { heading: "Summary".into(), instructions: String::new() }, Section { heading: "Next steps".into(), instructions: String::new() }],
        }
    }

    #[test]
    fn stores_checked_anchors_and_own_lines() {
        let t = tpl();
        let segs = [seg("a", "them", "release on the 20th"), seg("b", "me", "I'll ask IT for laptops")];
        let input = Input { title: "x", template: &t, own: "- budget is tight\nprice page", segments: &segs, context: "", length: "normal" };
        let answer = "## Summary\n- Release planned for the 20th [S1]\n- Budget is tight\n## next steps\n- Ask IT for laptops [S2, S9].\n- budget is tight [user's note].\n";
        let md = to_stored(answer, &input, &["a".into(), "b".into()]);
        assert_eq!(
            md,
            "## Summary\n- price page [[own]]\n- Release planned for the 20th [[seg:a]]\n- budget is tight [[own]]\n\n## Next steps\n- Ask IT for laptops. [[seg:b]]"
        );
        let lines = parse_md(&md);
        assert_eq!(lines[1], GenLine::Own { text: "price page".into() });
        assert_eq!(lines[2], GenLine::Ai { text: "Release planned for the 20th".into(), seg_ids: vec!["a".into()] });
        assert!(export_md(&md).contains("- Ask IT for laptops"));
        assert!(!export_md(&md).contains("[["));
    }

    fn groq(url: String) -> Llm {
        Llm { provider: "groq".into(), url, model: "m".into(), key: "k".into() }
    }

    #[test]
    fn empty_sections_and_nothing_to_write() {
        let t = tpl();
        let input = Input { title: "x", template: &t, own: "", segments: &[], context: "", length: "short" };
        assert_eq!(to_stored("garbage", &input, &[]), "## Summary\n- Nothing came up on this.\n\n## Next steps\n- Nothing came up on this.");
        assert!(write(&groq("http://127.0.0.1:9".into()), &input).unwrap_err().to_string().contains("Nothing to write up"));
    }

    #[test]
    fn talks_to_groq_and_explains_failures() {
        let t = tpl();
        let segs = [seg("a", "them", "release on the 20th")];
        let input = Input { title: "x", template: &t, own: "", segments: &segs, context: "", length: "normal" };
        let url = fake_server(r###"{"choices":[{"message":{"content":"## Summary\n- Release on the 20th [S1]"}}]}"###, 200);
        let md = write(&groq(url), &input).unwrap();
        assert!(md.starts_with("## Summary\n- Release on the 20th [[seg:a]]"));

        let url = fake_server(r#"{"error":{"message":"Invalid API Key"}}"#, 401);
        assert!(write(&groq(url), &input).unwrap_err().to_string().contains("did not accept the API key"));

        let url = fake_server(r#"{"error":{"message":"The model `m` has been decommissioned"}}"#, 400);
        assert!(write(&groq(url), &input).unwrap_err().to_string().contains("no longer offers the model m"));

        let e = write(&groq("http://127.0.0.1:9".into()), &input).unwrap_err().to_string();
        assert!(e.contains("Could not reach Groq"), "{e}");

        let no_key = Llm { key: String::new(), ..groq("http://127.0.0.1:9".into()) };
        assert!(write(&no_key, &input).unwrap_err().to_string().contains("Add your Groq API key"));

        let off = Llm { provider: "none".into(), ..groq("http://127.0.0.1:9".into()) };
        assert!(write(&off, &input).unwrap_err().to_string().contains("turned off"));
    }

    #[test]
    fn streams_from_groq() {
        let url = fake_server("data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\ndata: [DONE]\n\n", 200);
        let mut got = Vec::new();
        let all = stream(&groq(url), "s", "u", |t| { got.push(t.to_string()); true }).unwrap();
        assert_eq!((all.as_str(), got), ("Hello", vec!["Hel".to_string(), "lo".to_string()]));
    }

    #[test]
    fn long_meetings_condense_until_they_fit() {
        // 3 windows of transcript: one condensing call per window, then one call to write the notes
        let t = tpl();
        let segs: Vec<Segment> = (0..300).map(|i| seg(&format!("s{i}"), "them", &"word ".repeat(40))).collect();
        let input = Input { title: "x", template: &t, own: "", segments: &segs, context: "", length: "normal" };
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://127.0.0.1:{}", l.local_addr().unwrap().port());
        let c2 = calls.clone();
        std::thread::spawn(move || {
            use std::io::{Read, Write};
            for s in l.incoming() {
                let mut s = s.unwrap();
                let mut buf = vec![0u8; 1 << 20];
                let _ = s.read(&mut buf);
                c2.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let reply = r###"{"choices":[{"message":{"content":"## Summary\n- A point [S1]"}}]}"###;
                let _ = s.write_all(format!("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{reply}", reply.len()).as_bytes());
            }
        });
        let md = write(&groq(url), &input).unwrap();
        assert!(md.contains("[[seg:s0]]"));
        let n = calls.load(std::sync::atomic::Ordering::SeqCst);
        assert!(n >= 3, "condensed in windows, then written: {n} calls");
    }

    /// Real notes from Apple's model on a meeting longer than one window. Needs macOS 26 with Apple Intelligence.
    /// Run: cargo test -- --ignored apple_writes --nocapture
    #[test]
    #[ignore]
    fn apple_writes_notes() {
        let t = tpl();
        let said = ["We need to decide the release date for version two.", "I think the 20th of November works if QA finishes by the 15th.",
            "QA says they need the build by Monday.", "Then let's freeze features this Friday.", "Lena, can you send the new pricing page to the board?",
            "Yes, I will send it by Thursday.", "Marketing wants a launch post the same day.", "I'll ask Tom to draft the launch post."];
        let segs: Vec<Segment> = (0..40).map(|i| seg(&format!("s{i}"), if i % 2 == 0 { "me" } else { "them" }, &format!("{} Also some detail number {i} about the project timeline and budget.", said[i % said.len()]))).collect();
        let input = Input { title: "Release planning", template: &t, own: "- budget is tight", segments: &segs, context: "", length: "normal" };
        let llm = Llm { provider: "apple".into(), url: String::new(), model: String::new(), key: String::new() };
        let started = std::time::Instant::now();
        let md = write(&llm, &input).unwrap();
        println!("{:.1} s\n{md}", started.elapsed().as_secs_f64());
        assert!(md.starts_with("## Summary\n"));
        assert!(md.contains("## Next steps"));
        assert!(md.contains("budget is tight [[own]]"));
        assert!(md.contains("[[seg:s"), "at least one checked source");
    }
}
