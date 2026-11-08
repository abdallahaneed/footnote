//! Recording. Each channel (mic now, system audio later) is cut into 30 s WAV files while recording, each file
//! synced to disk before its row is written, so a crash loses at most the last unfinished segment (fix #1).
//! "mic" is you; "system" is everything the Mac plays (Zoom, Teams, Meet, a browser call), which is the other side.
//! System audio uses ScreenCaptureKit on macOS (Screen & System Audio Recording permission). Windows loopback: not built.
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const RATE: u32 = 16_000;
const SEG_SECS: usize = 30;

pub struct SegmentFile {
    pub channel: &'static str,
    pub seq: i64,
    pub file_name: String,
    pub start_ms: i64,
    pub duration_ms: i64,
    pub bytes: i64,
}

pub type OnSegment = Arc<dyn Fn(&str, SegmentFile) + Send + Sync>;

struct Session {
    since: i64,
    base_ms: i64,
    stop: mpsc::Sender<()>,
    done: mpsc::Receiver<()>,
}

static SESSIONS: Mutex<Option<HashMap<String, Session>>> = Mutex::new(None);

fn with<R>(f: impl FnOnce(&mut HashMap<String, Session>) -> R) -> R {
    f(SESSIONS.lock().unwrap().get_or_insert_with(HashMap::new))
}

/// (wall clock start, audio recorded before this session) while `note_id` is recording.
pub fn live(note_id: &str) -> Option<(i64, i64)> {
    with(|m| m.get(note_id).map(|s| (s.since, s.base_ms)))
}

pub fn recording_ids() -> Vec<String> {
    with(|m| m.keys().cloned().collect())
}

pub fn is_recording(note_id: &str) -> bool {
    live(note_id).is_some()
}

/// A source pushes mono samples at its own rate into a shared buffer until `stop` fires.
struct Chan {
    name: &'static str,
    buf: Arc<Mutex<Vec<f32>>>,
    rate: u32,
    _stop: mpsc::Sender<()>, // dropping it ends the source thread
}

#[cfg(target_os = "macos")]
#[link(name = "AVFoundation", kind = "framework")]
unsafe extern "C" {}

/// Microphone permission as macOS reports it: granted | denied | undetermined.
#[cfg(target_os = "macos")]
pub fn mic_permission() -> &'static str {
    use objc2::msg_send;
    use objc2::runtime::AnyClass;
    let Some(cls) = AnyClass::get(c"AVCaptureDevice") else { return "unknown" };
    let audio = objc2_foundation::NSString::from_str("soun"); // AVMediaTypeAudio
    let status: isize = unsafe { msg_send![cls, authorizationStatusForMediaType: &*audio] };
    match status {
        0 => "undetermined",
        1 | 2 => "denied",
        3 => "granted",
        _ => "unknown",
    }
}

#[cfg(not(target_os = "macos"))]
pub fn mic_permission() -> &'static str {
    "granted"
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// Screen & System Audio Recording, which ScreenCaptureKit needs for the "Them" side.
/// macOS only reports granted or not, so "not granted" covers both never-asked and denied.
#[cfg(target_os = "macos")]
pub fn system_audio_permission() -> &'static str {
    if unsafe { CGPreflightScreenCaptureAccess() } { "granted" } else { "denied" }
}

#[cfg(not(target_os = "macos"))]
pub fn system_audio_permission() -> &'static str {
    "granted"
}

/// Shows the OS prompt. The mic prompt appears the first time an input stream opens, so open one briefly.
pub fn request_permission(kind: &str) -> anyhow::Result<()> {
    match kind {
        "mic" => {
            let device = cpal::default_host().default_input_device().ok_or_else(|| anyhow::anyhow!("No microphone found."))?;
            let config = device.default_input_config()?;
            let stream = match config.sample_format() {
                cpal::SampleFormat::I16 => device.build_input_stream(config.into(), |_: &[i16], _: &_| {}, |_| {}, None)?,
                _ => device.build_input_stream(config.into(), |_: &[f32], _: &_| {}, |_| {}, None)?,
            };
            stream.play()?;
            std::thread::sleep(std::time::Duration::from_millis(300));
            Ok(())
        }
        #[cfg(target_os = "macos")]
        "system_audio" => {
            unsafe { CGRequestScreenCaptureAccess() };
            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        "system_audio" => Ok(()),
        _ => anyhow::bail!("Unknown permission."),
    }
}

fn push_mono(data: impl Iterator<Item = f32>, channels: usize, buf: &Mutex<Vec<f32>>) {
    let data: Vec<f32> = data.collect();
    let mono = data.chunks(channels.max(1)).map(|f| f.iter().sum::<f32>() / f.len() as f32);
    buf.lock().unwrap().extend(mono);
}

/// Opens the microphone on its own thread (cpal streams are not Send on macOS).
fn mic(want: Option<String>) -> anyhow::Result<Chan> {
    let buf = Arc::new(Mutex::new(Vec::new()));
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (ready_tx, ready_rx) = mpsc::channel::<anyhow::Result<u32>>();
    let b = buf.clone();
    std::thread::spawn(move || {
        let run = || -> anyhow::Result<(cpal::Stream, u32)> {
            let host = cpal::default_host();
            let name = |d: &cpal::Device| d.description().ok().map(|x| x.name().to_string());
            let chosen = want.as_ref().and_then(|w| host.input_devices().ok()?.find(|d| name(d).as_deref() == Some(w.as_str())));
            let device = match chosen {
                Some(d) => d,
                None => host.default_input_device().ok_or_else(|| anyhow::anyhow!("No microphone found."))?,
            };
            let config = device.default_input_config()?;
            let channels = config.channels() as usize;
            let rate = config.sample_rate();
            let err = |e| eprintln!("audio stream error: {e}");
            let stream = match config.sample_format() {
                cpal::SampleFormat::F32 => {
                    let b = b.clone();
                    device.build_input_stream(config.into(), move |d: &[f32], _: &_| push_mono(d.iter().copied(), channels, &b), err, None)?
                }
                cpal::SampleFormat::I16 => {
                    let b = b.clone();
                    device.build_input_stream(
                        config.into(),
                        move |d: &[i16], _: &_| push_mono(d.iter().map(|s| *s as f32 / i16::MAX as f32), channels, &b),
                        err,
                        None,
                    )?
                }
                other => anyhow::bail!("unsupported sample format {other:?}"),
            };
            stream.play()?;
            Ok((stream, rate))
        };
        match run() {
            Ok((stream, rate)) => {
                let _ = ready_tx.send(Ok(rate));
                let _ = stop_rx.recv(); // returns when the sender is dropped
                drop(stream);
            }
            Err(e) => {
                let _ = ready_tx.send(Err(e));
            }
        }
    });
    let rate = ready_rx.recv_timeout(Duration::from_secs(8)).map_err(|_| anyhow::anyhow!("The microphone did not start. Try again."))??;
    Ok(Chan { name: "mic", buf, rate, _stop: stop_tx })
}

/// Dev builds only: replays a WAV file in real time as a channel, so the whole pipeline can be tested without
/// speaking or a second app playing audio. MEETING_NOTES_TEST_MIC_WAV / MEETING_NOTES_TEST_SYSTEM_WAV.
#[cfg(debug_assertions)]
fn wav_source(name: &'static str, path: &str) -> anyhow::Result<Chan> {
    let mut r = hound::WavReader::open(path)?;
    let spec = r.spec();
    let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => r.samples::<f32>().collect::<Result<_, _>>()?,
        hound::SampleFormat::Int => r.samples::<i32>().map(|s| s.map(|v| v as f32 / max)).collect::<Result<_, _>>()?,
    };
    let mono: Vec<f32> = raw.chunks(spec.channels as usize).map(|f| f.iter().sum::<f32>() / f.len() as f32).collect();
    let buf = Arc::new(Mutex::new(Vec::new()));
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let b = buf.clone();
    let rate = spec.sample_rate;
    std::thread::spawn(move || {
        for chunk in mono.chunks((rate / 10) as usize) {
            if !matches!(stop_rx.recv_timeout(Duration::from_millis(100)), Err(mpsc::RecvTimeoutError::Timeout)) {
                return;
            }
            b.lock().unwrap().extend_from_slice(chunk);
        }
    });
    Ok(Chan { name, buf, rate, _stop: stop_tx })
}

fn sources(mic_id: Option<String>) -> anyhow::Result<Vec<Chan>> {
    #[cfg(debug_assertions)]
    {
        let mut test = Vec::new();
        if let Ok(p) = std::env::var("MEETING_NOTES_TEST_MIC_WAV") {
            test.push(wav_source("mic", &p)?);
        }
        if let Ok(p) = std::env::var("MEETING_NOTES_TEST_SYSTEM_WAV") {
            test.push(wav_source("system", &p)?);
        }
        if !test.is_empty() {
            return Ok(test);
        }
    }
    anyhow::ensure!(
        mic_permission() != "denied",
        "Microphone access is off. Turn it on in System Settings, Privacy & Security, Microphone, then try again."
    );
    // System audio first: if its permission is missing, fail before the mic indicator turns on.
    let them = system()?;
    Ok(vec![mic(mic_id)?, them])
}

/// Everything the Mac plays, as one mono channel. Our own app's sound is left out.
#[cfg(target_os = "macos")]
fn system() -> anyhow::Result<Chan> {
    use screencapturekit::prelude::*;
    const RATE_IN: u32 = 48_000;
    struct Audio(Arc<Mutex<Vec<f32>>>);
    impl SCStreamOutputTrait for Audio {
        fn did_output_sample_buffer(&self, sample: CMSampleBuffer, kind: SCStreamOutputType) {
            if !matches!(kind, SCStreamOutputType::Audio) {
                return;
            }
            let Ok(list) = sample.audio_buffer_list() else { return };
            let chans: Vec<Vec<f32>> = (&list)
                .into_iter()
                .map(|b| b.data().chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect())
                .collect();
            let Some(n) = chans.iter().map(Vec::len).min().filter(|n| *n > 0) else { return };
            let mut buf = self.0.lock().unwrap();
            buf.extend((0..n).map(|i| chans.iter().map(|c| c[i]).sum::<f32>() / chans.len() as f32));
        }
    }
    /// ScreenCaptureKit always sends video too; this one takes and drops it.
    struct Ignore;
    impl SCStreamOutputTrait for Ignore {
        fn did_output_sample_buffer(&self, _: CMSampleBuffer, _: SCStreamOutputType) {}
    }

    let buf = Arc::new(Mutex::new(Vec::new()));
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (ready_tx, ready_rx) = mpsc::channel::<anyhow::Result<()>>();
    let b = buf.clone();
    std::thread::spawn(move || {
        let run = || -> anyhow::Result<SCStream> {
            let denied = "The other side of the call cannot be heard: turn on this app in System Settings, Privacy & Security, \
                          Screen & System Audio Recording, then try again.";
            let content = SCShareableContent::get().map_err(|_| anyhow::anyhow!(denied))?;
            let display = content.displays().into_iter().next().ok_or_else(|| anyhow::anyhow!("No display found."))?;
            let filter = SCContentFilter::create().with_display(&display).with_excluding_windows(&[]).build()?;
            let config = SCStreamConfiguration::new()
                .with_width(2) // video cannot be turned off; keep it tiny and rare
                .with_height(2)
                .with_minimum_frame_interval(&CMTime::new(1, 1))
                .with_captures_audio(true)
                .with_excludes_current_process_audio(true)
                .with_sample_rate(RATE_IN as i32)
                .with_channel_count(1);
            let mut stream = SCStream::new(&filter, &config)?;
            stream.add_output_handler(Audio(b.clone()), SCStreamOutputType::Audio)?;
            stream.add_output_handler(Ignore, SCStreamOutputType::Screen)?;
            stream.start_capture().map_err(|_| anyhow::anyhow!(denied))?;
            Ok(stream)
        };
        match run() {
            Ok(stream) => {
                let _ = ready_tx.send(Ok(()));
                let _ = stop_rx.recv();
                let _ = stream.stop_capture();
            }
            Err(e) => {
                let _ = ready_tx.send(Err(e));
            }
        }
    });
    ready_rx.recv_timeout(Duration::from_secs(10)).map_err(|_| anyhow::anyhow!("System audio did not start. Try again."))??;
    Ok(Chan { name: "system", buf, rate: RATE_IN, _stop: stop_tx })
}

#[cfg(not(target_os = "macos"))]
fn system() -> anyhow::Result<Chan> {
    // shortcut: Windows WASAPI loopback not written yet; build it with the Windows port.
    anyhow::bail!("Recording the other side of a call is only available on macOS so far.")
}

pub fn resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || input.is_empty() {
        return input.to_vec();
    }
    let ratio = from as f64 / to as f64;
    let out_len = (input.len() as f64 / ratio).floor() as usize;
    (0..out_len)
        .map(|i| {
            let start = (i as f64 * ratio) as usize;
            let end = (((i + 1) as f64 * ratio) as usize).clamp(start + 1, input.len());
            input[start..end].iter().sum::<f32>() / (end - start) as f32
        })
        .collect()
}

/// Writes 16 kHz mono 16-bit samples and syncs the file to disk. Returns the byte size.
pub fn write_wav(path: &Path, samples: &[f32]) -> anyhow::Result<i64> {
    let spec = hound::WavSpec { channels: 1, sample_rate: RATE, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut w = hound::WavWriter::create(path, spec)?;
    for s in samples {
        w.write_sample((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)?;
    }
    w.finalize()?;
    let f = std::fs::File::open(path)?;
    f.sync_all()?;
    Ok(f.metadata()?.len() as i64)
}

pub fn read_wav(path: &Path) -> anyhow::Result<Vec<f32>> {
    let mut r = hound::WavReader::open(path)?;
    Ok(r.samples::<i16>().map(|s| s.map(|v| v as f32 / i16::MAX as f32)).collect::<Result<_, _>>()?)
}

/// Roughly: is anyone talking in this clip. Silent segments skip whisper, which would invent words.
pub fn has_speech(samples: &[f32]) -> bool {
    samples.chunks(320).any(|w| (w.iter().map(|s| s * s).sum::<f32>() / w.len() as f32).sqrt() > 0.006)
}

/// Starts recording into `dir`. `base_ms` = audio already recorded for this note (resume), `next_seq` = first
/// free segment number. `on_segment` runs on the writer thread for every finished file.
pub fn start(note_id: &str, dir: PathBuf, base_ms: i64, next_seq: i64, mic_id: Option<String>, on_segment: OnSegment) -> anyhow::Result<()> {
    anyhow::ensure!(!is_recording(note_id), "This note is already recording.");
    std::fs::create_dir_all(&dir)?;
    let chans = sources(mic_id)?;
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (done_tx, done_rx) = mpsc::channel::<()>();
    let id = note_id.to_string();
    std::thread::spawn(move || {
        let mut written: Vec<usize> = vec![0; chans.len()]; // source samples per channel already in files
        let mut seq = next_seq;
        let mut flush = |chans: &[Chan], written: &mut [usize], last: bool| {
            for (i, c) in chans.iter().enumerate() {
                let per = SEG_SECS * c.rate as usize;
                loop {
                    let take: Vec<f32> = {
                        let mut b = c.buf.lock().unwrap();
                        let n = if b.len() >= per { per } else if last && b.len() >= c.rate as usize / 3 { b.len() } else { 0 };
                        if n == 0 { break; }
                        b.drain(..n).collect()
                    };
                    let file_name = format!("{}-{seq:05}.wav", c.name);
                    let samples = resample(&take, c.rate, RATE);
                    match write_wav(&dir.join(&file_name), &samples) {
                        Ok(bytes) => on_segment(&id, SegmentFile {
                            channel: c.name, seq, file_name, bytes,
                            start_ms: base_ms + (written[i] as i64 * 1000) / c.rate as i64,
                            duration_ms: (take.len() as i64 * 1000) / c.rate as i64,
                        }),
                        Err(e) => eprintln!("could not write audio segment: {e}"),
                    }
                    seq += 1;
                    written[i] += take.len();
                }
            }
        };
        while let Err(mpsc::RecvTimeoutError::Timeout) = stop_rx.recv_timeout(Duration::from_millis(250)) {
            flush(&chans, &mut written, false);
        }
        flush(&chans, &mut written, true);
        drop(chans);
        let _ = done_tx.send(());
    });
    with(|m| m.insert(note_id.to_string(), Session { since: crate::db::now_ms(), base_ms, stop: stop_tx, done: done_rx }));
    Ok(())
}

/// Stops and waits until the last segment is on disk and reported.
pub fn stop(note_id: &str) {
    let Some(s) = with(|m| m.remove(note_id)) else { return };
    let _ = s.stop.send(());
    let _ = s.done.recv_timeout(Duration::from_secs(15));
}

/// Audio tests share env vars and the sound output: they take this lock to run one at a time.
#[cfg(test)]
pub static AUDIO_TEST: Mutex<()> = Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_roundtrip_and_resample() {
        let dir = std::env::temp_dir().join(format!("mn-test-{}", crate::db::uid()));
        std::fs::create_dir_all(&dir).unwrap();
        let tone: Vec<f32> = (0..16_000).map(|i| (i as f32 * 0.05).sin() * 0.5).collect();
        let bytes = write_wav(&dir.join("a.wav"), &tone).unwrap();
        assert_eq!(bytes, 44 + 32_000);
        let back = read_wav(&dir.join("a.wav")).unwrap();
        assert_eq!(back.len(), 16_000);
        assert!(has_speech(&back) && !has_speech(&vec![0.0; 16_000]));
        assert_eq!(resample(&vec![0.1; 48_000], 48_000, 16_000).len(), 16_000);
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// Real ScreenCaptureKit: plays a spoken sentence through the speakers and checks the "system" channel heard
    /// it, through whisper. Needs Screen & System Audio Recording permission for the terminal running it.
    /// Run: cargo test -- --ignored system_audio
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore]
    fn system_audio_hears_the_mac() {
        let _one = AUDIO_TEST.lock().unwrap_or_else(|e| e.into_inner());
        let dir = std::env::temp_dir().join(format!("mn-sys-{}", crate::db::uid()));
        std::fs::create_dir_all(&dir).unwrap();
        let clip = dir.join("q.aiff");
        assert!(std::process::Command::new("say").args(["-o", clip.to_str().unwrap(), "Tell me about a project you are proud of."]).status().unwrap().success());
        let chan = system().unwrap();
        std::thread::sleep(Duration::from_millis(500));
        assert!(std::process::Command::new("afplay").args(["-v", "0.3", clip.to_str().unwrap()]).status().unwrap().success());
        std::thread::sleep(Duration::from_millis(500));
        let samples = resample(&chan.buf.lock().unwrap(), chan.rate, RATE);
        drop(chan);
        assert!(has_speech(&samples), "system channel was silent ({} samples)", samples.len());
        let model = crate::stt::ensure_model(&std::path::PathBuf::from(std::env::var("HOME").unwrap())
            .join("Library/Application Support/dev.abdallah.quietkey/models"), |_, _| {}).unwrap();
        let mut stt = crate::stt::Stt::load(&model).unwrap();
        let text: String = stt.transcribe(&samples, Some("en"), "").unwrap().into_iter().map(|p| p.text).collect::<Vec<_>>().join(" ");
        drop(stt); // free before exit (Metal)
        assert!(text.to_lowercase().contains("project"), "heard: {text}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(debug_assertions)]
    #[test]
    fn records_segments_from_a_test_wav() {
        let _one = AUDIO_TEST.lock().unwrap_or_else(|e| e.into_inner());
        let dir = std::env::temp_dir().join(format!("mn-rec-{}", crate::db::uid()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("src.wav");
        write_wav(&src, &vec![0.2; 16_000 * 2]).unwrap(); // 2 s
        unsafe { std::env::set_var("MEETING_NOTES_TEST_MIC_WAV", &src) };
        let got: Arc<Mutex<Vec<(i64, i64, i64)>>> = Arc::default();
        let g = got.clone();
        start("n1", dir.join("n1"), 5_000, 3, None, Arc::new(move |_, s| g.lock().unwrap().push((s.seq, s.start_ms, s.duration_ms)))).unwrap();
        assert!(is_recording("n1") && start("n1", dir.clone(), 0, 0, None, Arc::new(|_, _| {})).is_err());
        std::thread::sleep(Duration::from_millis(2500));
        stop("n1");
        unsafe { std::env::remove_var("MEETING_NOTES_TEST_MIC_WAV") };
        let got = got.lock().unwrap();
        assert_eq!(got.len(), 1, "short recording -> one final segment");
        assert_eq!((got[0].0, got[0].1), (3, 5_000));
        assert!((1_900..=2_000).contains(&got[0].2), "{:?}", got[0]);
        assert!(dir.join("n1/mic-00003.wav").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
