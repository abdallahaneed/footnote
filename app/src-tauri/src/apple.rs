//! Apple's on-device model through the Swift bridge in apple/fm.swift. Nothing to download: it ships with
//! Apple Intelligence on macOS 26+.
use std::ffi::{c_char, c_void, CStr, CString};

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn fm_status() -> i32;
    fn fm_respond(system: *const c_char, user: *const c_char, cb: extern "C" fn(*const c_char, *mut c_void) -> bool,
        ctx: *mut c_void, err: *mut *mut c_char) -> *mut c_char;
    fn fm_free(p: *mut c_char);
}

/// "available", "not_eligible", "not_enabled", "not_ready", "old_macos" or "unavailable".
pub fn status() -> &'static str {
    #[cfg(target_os = "macos")]
    let code = unsafe { fm_status() };
    #[cfg(not(target_os = "macos"))]
    let code = 1;
    match code {
        0 => "available",
        1 => "not_eligible",
        2 => "not_enabled",
        3 => "not_ready",
        4 => "old_macos",
        _ => "unavailable",
    }
}

fn why_not(status: &str) -> &'static str {
    match status {
        "not_eligible" => "This Mac cannot run Apple's built-in model. Switch to Groq in Settings.",
        "not_enabled" => "Turn on Apple Intelligence in System Settings to use the built-in model, or switch to Groq in Settings.",
        "not_ready" => "Apple's built-in model is still downloading. Try again in a few minutes.",
        "old_macos" => "Apple's built-in model needs macOS 26 or later. Switch to Groq in Settings.",
        _ => "Apple's built-in model is not available right now. Switch to Groq in Settings.",
    }
}

/// Streams the answer into `on_token` (returning false stops it) and returns the whole text.
pub fn respond(system: &str, user: &str, mut on_token: impl FnMut(&str) -> bool) -> anyhow::Result<String> {
    let s = status();
    anyhow::ensure!(s == "available", why_not(s));
    respond_ffi(system, user, &mut on_token)
}

#[cfg(target_os = "macos")]
fn respond_ffi<F: FnMut(&str) -> bool>(system: &str, user: &str, on_token: &mut F) -> anyhow::Result<String> {
    extern "C" fn tramp<F: FnMut(&str) -> bool>(t: *const c_char, ctx: *mut c_void) -> bool {
        let f = unsafe { &mut *(ctx as *mut F) };
        f(&unsafe { CStr::from_ptr(t) }.to_string_lossy())
    }
    let (sys, usr) = (CString::new(system.replace('\0', ""))?, CString::new(user.replace('\0', ""))?);
    let mut err: *mut c_char = std::ptr::null_mut();
    let out = unsafe { fm_respond(sys.as_ptr(), usr.as_ptr(), tramp::<F>, on_token as *mut F as *mut c_void, &mut err) };
    let take = |p: *mut c_char| {
        let s = unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned();
        unsafe { fm_free(p) };
        s
    };
    if out.is_null() {
        anyhow::bail!(if err.is_null() { "Apple's built-in model failed.".to_string() } else { take(err) });
    }
    Ok(take(out))
}

#[cfg(not(target_os = "macos"))]
fn respond_ffi<F: FnMut(&str) -> bool>(_: &str, _: &str, _: &mut F) -> anyhow::Result<String> {
    anyhow::bail!(why_not("not_eligible"))
}

#[cfg(test)]
mod tests {
    /// Real call to Apple's model. Needs macOS 26 with Apple Intelligence on. Run: cargo test -- --ignored apple
    #[test]
    #[ignore]
    fn apple_answers_and_streams() {
        assert_eq!(super::status(), "available");
        let mut pieces = 0;
        let all = super::respond("Answer with one word.", "What colour is the sky on a clear day?", |_| { pieces += 1; true }).unwrap();
        assert!(all.to_lowercase().contains("blue"), "{all}");
        assert!(pieces >= 1);
    }
}
