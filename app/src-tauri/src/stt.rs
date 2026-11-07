//! Local speech to text with whisper.cpp, ported from Quietkey's stt.rs. Returns timed pieces so each
//! transcript line keeps its place in the meeting.
use std::path::{Path, PathBuf};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState};

/// The model used until Settings lets people pick one. Multilingual base, 60 MB.
pub const MODEL_FILE: &str = "ggml-base-q5_1.bin";

/// Downloads the model into `dir` once (a .part file, renamed when complete).
// shortcut: checks the byte count, not a checksum; a corrupt file fails at load. Add sha256 if that happens.
pub fn ensure_model(dir: &Path, progress: impl Fn(u64, u64)) -> anyhow::Result<PathBuf> {
    use std::io::{Read, Write};
    let dest = dir.join(MODEL_FILE);
    if dest.exists() {
        return Ok(dest);
    }
    std::fs::create_dir_all(dir)?;
    let url = format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{MODEL_FILE}");
    let mut resp = reqwest::blocking::Client::builder().timeout(None).build()?.get(&url).send()?.error_for_status()?;
    let total = resp.content_length().unwrap_or(0);
    let part = dir.join(format!("{MODEL_FILE}.part"));
    let mut out = std::fs::File::create(&part)?;
    let (mut done, mut buf, mut last) = (0u64, vec![0u8; 1 << 16], 0u64);
    loop {
        let n = resp.read(&mut buf)?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n])?;
        done += n as u64;
        if done - last >= total / 100 + 1 {
            last = done;
            progress(done, total);
        }
    }
    out.sync_all()?;
    if total > 0 && done != total {
        let _ = std::fs::remove_file(&part);
        anyhow::bail!("model download stopped at {done} of {total} bytes");
    }
    std::fs::rename(&part, &dest)?;
    Ok(dest)
}

pub struct Stt {
    _ctx: WhisperContext,
    state: WhisperState,
}

/// One timed piece of speech, times in ms from the start of the clip.
pub struct Piece {
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

impl Stt {
    pub fn load(model: &Path) -> anyhow::Result<Self> {
        let path = model.to_str().ok_or_else(|| anyhow::anyhow!("model path is not UTF-8"))?;
        let mut cp = WhisperContextParameters::default();
        cp.flash_attn(true);
        let ctx = WhisperContext::new_with_params(path, cp).map_err(|e| anyhow::anyhow!("model load failed: {e}"))?;
        let state = ctx.create_state().map_err(|e| anyhow::anyhow!("{e}"))?;
        Ok(Self { _ctx: ctx, state })
    }

    /// `samples` are 16 kHz mono. `prompt` biases spelling (jargon list).
    pub fn transcribe(&mut self, samples: &[f32], language: Option<&str>, prompt: &str) -> anyhow::Result<Vec<Piece>> {
        let mut p = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        p.set_language(language.or(Some("auto")));
        p.set_n_threads(std::thread::available_parallelism().map(|n| n.get() as i32).unwrap_or(4).min(8));
        p.set_no_context(true);
        p.set_no_timestamps(false);
        p.set_suppress_blank(true);
        p.set_print_special(false);
        p.set_print_progress(false);
        p.set_print_realtime(false);
        p.set_print_timestamps(false);
        if !prompt.is_empty() {
            p.set_initial_prompt(prompt);
        }
        let mut audio = samples.to_vec();
        if audio.len() < 16_000 {
            audio.resize(16_000 + 1600, 0.0); // whisper invents words on very short clips
        }
        self.state.full(p, &audio).map_err(|e| anyhow::anyhow!("transcribe failed: {e}"))?;
        Ok(self
            .state
            .as_iter()
            .filter_map(|seg| {
                let text = clean_whisper_text(&seg.to_str_lossy().ok()?);
                // timestamps are in centiseconds
                (!text.is_empty()).then(|| Piece { start_ms: seg.start_timestamp() * 10, end_ms: seg.end_timestamp() * 10, text })
            })
            .collect())
    }
}

const NON_SPEECH: &[&str] = &["music", "laughs", "laughter", "silence", "applause", "inaudible", "coughs", "coughing", "sighs", "noise", "blank_audio"];

/// Drops whisper's non-speech tags ("[BLANK_AUDIO]", "(music)") and tidies whitespace.
pub fn clean_whisper_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(i) = rest.find(['[', '(']) {
        let close = if rest.as_bytes()[i] == b'[' { ']' } else { ')' };
        let Some(j) = rest[i..].find(close).map(|j| i + j) else { break };
        let inner = rest[i + 1..j].trim().to_lowercase();
        out.push_str(&rest[..i]);
        if close == ')' && !NON_SPEECH.contains(&inner.as_str()) {
            out.push_str(&rest[i..=j]);
        }
        rest = &rest[j + 1..];
    }
    out.push_str(rest);
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::clean_whisper_text;

    #[test]
    fn strips_tags() {
        assert_eq!(clean_whisper_text(" [BLANK_AUDIO]"), "");
        assert_eq!(clean_whisper_text(" Hello  world. (music) Bye"), "Hello world. Bye");
        assert_eq!(clean_whisper_text("Check this (see above) now"), "Check this (see above) now");
    }
}
