//! Writing notes with a local model (fix #4: every generated line keeps the transcript lines it came from).
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
    (text.split_whitespace().collect::<Vec<_>>().join(" ").trim_end_matches([' ', ',']).to_string(), found)
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
        if let Some(k) = own_norm.iter().position(|o| *o == norm(&text)) {
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

#[derive(Clone, Debug)]
pub struct Llm {
    pub provider: String,
    pub url: String,
    pub model: String,
}

fn readable(e: reqwest::Error, llm: &Llm) -> anyhow::Error {
    if e.is_connect() || e.is_timeout() {
        anyhow::anyhow!("The local model did not answer. Check that Ollama is running, then try again.")
    } else {
        anyhow::anyhow!("The model at {} failed: {e}", llm.url)
    }
}

fn post(llm: &Llm, path: &str, body: &Value) -> anyhow::Result<reqwest::blocking::Response> {
    anyhow::ensure!(llm.provider != "none", "Note writing is turned off in Settings.");
    let url = format!("{}{path}", llm.url.trim_end_matches('/'));
    let resp = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(600)) // a long meeting on a laptop model takes minutes
        .build()?
        .post(url)
        .json(body)
        .send()
        .map_err(|e| readable(e, llm))?;
    let status = resp.status();
    if status.is_success() {
        return Ok(resp);
    }
    let text = resp.text().unwrap_or_default();
    if status.as_u16() == 404 && text.contains("not found") {
        anyhow::bail!("Ollama does not have the model {m}. Run \"ollama pull {m}\" in Terminal, then try again.", m = llm.model);
    }
    anyhow::bail!("The model answered with error {}: {}", status.as_u16(), text.chars().take(200).collect::<String>())
}

/// One full answer.
pub fn complete(llm: &Llm, system: &str, user: &str) -> anyhow::Result<String> {
    let msgs = json!([{ "role": "system", "content": system }, { "role": "user", "content": user }]);
    let out = if llm.provider == "openai_compatible" {
        let v: Value = post(llm, "/chat/completions", &json!({ "model": llm.model, "temperature": 0.2, "messages": msgs }))?.json()?;
        v["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string()
    } else {
        let body = json!({ "model": llm.model, "stream": false, "messages": msgs, "options": { "temperature": 0.2, "num_ctx": 8192 } });
        let v: Value = post(llm, "/api/chat", &body)?.json()?;
        v["message"]["content"].as_str().unwrap_or("").to_string()
    };
    anyhow::ensure!(!out.trim().is_empty(), "The model returned an empty answer. Try again.");
    Ok(out)
}

/// Streams tokens to `on_token` (Ollama). OpenAI-compatible servers get one non-streamed answer.
// shortcut: no streaming for openai_compatible; add SSE parsing if people use that path for chat.
pub fn stream(llm: &Llm, system: &str, user: &str, mut on_token: impl FnMut(&str) -> bool) -> anyhow::Result<String> {
    if llm.provider == "openai_compatible" {
        let a = complete(llm, system, user)?;
        on_token(&a);
        return Ok(a);
    }
    let msgs = json!([{ "role": "system", "content": system }, { "role": "user", "content": user }]);
    let body = json!({ "model": llm.model, "stream": true, "messages": msgs, "options": { "temperature": 0.2, "num_ctx": 8192 } });
    let resp = post(llm, "/api/chat", &body)?;
    let mut all = String::new();
    for line in std::io::BufReader::new(resp).lines() {
        let v: Value = serde_json::from_str(&line?).unwrap_or(Value::Null);
        if let Some(t) = v["message"]["content"].as_str() {
            all.push_str(t);
            if !on_token(t) {
                break; // the UI stopped listening
            }
        }
        if v["done"].as_bool() == Some(true) {
            break;
        }
    }
    Ok(all)
}

/// Transcript budget per model call, in characters (~5k tokens, leaves room in an 8k context).
const WINDOW: usize = 20_000;

/// Writes the notes. Long meetings are condensed window by window first (map), keeping [S#] references,
/// then written into the template (reduce).
pub fn write(llm: &Llm, input: &Input) -> anyhow::Result<String> {
    let (lines, ids) = numbered(input.segments);
    anyhow::ensure!(!lines.is_empty() || !input.own.trim().is_empty(), "Nothing to write up yet: there is no transcript and no notes of your own.");
    let mut windows: Vec<String> = vec![String::new()];
    for l in &lines {
        if windows.last().unwrap().len() + l.len() > WINDOW {
            windows.push(String::new());
        }
        let w = windows.last_mut().unwrap();
        w.push_str(l);
        w.push('\n');
    }
    let transcript = if windows.len() == 1 {
        windows.remove(0)
    } else {
        let sys = "List the important points of this part of a meeting transcript as short bullets starting with '- '. \
                   End each bullet with the reference numbers it is based on, like [S3]. Facts only.";
        windows.iter().map(|w| complete(llm, sys, w)).collect::<anyhow::Result<Vec<_>>>()?.join("\n")
    };
    let answer = complete(llm, SYSTEM, &user_prompt(input, &transcript))?;
    Ok(to_stored(&answer, input, &ids))
}

/// A one-shot HTTP server that answers like Ollama, to test the real request path without a model.
#[cfg(test)]
pub fn fake_ollama(reply: &'static str, status: u16) -> String {
    use std::io::{Read, Write};
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    std::thread::spawn(move || {
        let (mut s, _) = l.accept().unwrap();
        let mut buf = [0u8; 65536];
        let _ = s.read(&mut buf);
        let resp = format!("HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{reply}", reply.len());
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
        let answer = "## Summary\n- Release planned for the 20th [S1]\n- Budget is tight\n## next steps\n- Ask IT for laptops [S2, S9]\n";
        let md = to_stored(answer, &input, &["a".into(), "b".into()]);
        assert_eq!(
            md,
            "## Summary\n- price page [[own]]\n- Release planned for the 20th [[seg:a]]\n- budget is tight [[own]]\n\n## Next steps\n- Ask IT for laptops [[seg:b]]"
        );
        let lines = parse_md(&md);
        assert_eq!(lines[1], GenLine::Own { text: "price page".into() });
        assert_eq!(lines[2], GenLine::Ai { text: "Release planned for the 20th".into(), seg_ids: vec!["a".into()] });
        assert!(export_md(&md).contains("- Ask IT for laptops"));
        assert!(!export_md(&md).contains("[["));
    }

    #[test]
    fn empty_sections_and_nothing_to_write() {
        let t = tpl();
        let input = Input { title: "x", template: &t, own: "", segments: &[], context: "", length: "short" };
        assert_eq!(to_stored("garbage", &input, &[]), "## Summary\n- Nothing came up on this.\n\n## Next steps\n- Nothing came up on this.");
        let llm = Llm { provider: "ollama".into(), url: "http://127.0.0.1:9".into(), model: "m".into() };
        assert!(write(&llm, &input).unwrap_err().to_string().contains("Nothing to write up"));
    }

    #[test]
    fn talks_to_ollama_and_explains_failures() {
        use super::fake_ollama;
        let t = tpl();
        let segs = [seg("a", "them", "release on the 20th")];
        let input = Input { title: "x", template: &t, own: "", segments: &segs, context: "", length: "normal" };
        let url = fake_ollama(r###"{"message":{"content":"## Summary\n- Release on the 20th [S1]"}}"###, 200);
        let md = write(&Llm { provider: "ollama".into(), url, model: "m".into() }, &input).unwrap();
        assert!(md.starts_with("## Summary\n- Release on the 20th [[seg:a]]"));

        let url = fake_ollama(r#"{"error":"model 'm' not found"}"#, 404);
        let e = write(&Llm { provider: "ollama".into(), url, model: "m".into() }, &input).unwrap_err().to_string();
        assert!(e.contains("ollama pull m"), "{e}");

        let e = write(&Llm { provider: "ollama".into(), url: "http://127.0.0.1:9".into(), model: "m".into() }, &input).unwrap_err().to_string();
        assert!(e.contains("Ollama is running"), "{e}");
    }
}
