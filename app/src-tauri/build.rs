fn main() {
    // whisper.cpp's Metal code uses @available checks. With the macOS 12 deployment target of release builds they
    // become runtime calls to __isPlatformVersionAtLeast, which lives in clang's runtime; rustc does not link it.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        if let Ok(out) = std::process::Command::new("clang").arg("--print-resource-dir").output() {
            let dir = String::from_utf8_lossy(&out.stdout).trim().to_string();
            println!("cargo:rustc-link-search=native={dir}/lib/darwin");
            println!("cargo:rustc-link-lib=static=clang_rt.osx");
        }
    }
    // screencapturekit's Swift bridge needs libswiftCompatibility*.a. Its build script only looks inside a full
    // Xcode; with just the Command Line Tools they live under `xcode-select -p`/usr/lib/swift/macosx.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        if let Ok(out) = std::process::Command::new("xcode-select").arg("-p").output() {
            let dev = String::from_utf8_lossy(&out.stdout).trim().to_string();
            for dir in [format!("{dev}/usr/lib/swift/macosx"), format!("{dev}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx")] {
                if std::path::Path::new(&dir).exists() {
                    println!("cargo:rustc-link-search=native={dir}");
                }
            }
        }
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }
    // Apple's on-device model: apple/fm.swift as a static library. FoundationModels is weak-linked so the app
    // still opens on macOS 14 and 15 (fm_status then reports "macOS too old").
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
        let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() { "aarch64" => "arm64".to_string(), a => a.to_string() };
        let ok = std::process::Command::new("xcrun")
            .args(["swiftc", "-emit-library", "-static", "-parse-as-library", "-swift-version", "5", "-O", "-module-name", "fmbridge"])
            .args(["-target", &format!("{arch}-apple-macos14.0"), "-Xfrontend", "-disable-autolink-framework", "-Xfrontend", "FoundationModels"])
            .arg("apple/fm.swift")
            .arg("-o")
            .arg(out.join("libfmbridge.a"))
            .status()
            .expect("xcrun swiftc not found; install the Xcode Command Line Tools");
        assert!(ok.success(), "swiftc failed on apple/fm.swift");
        println!("cargo:rustc-link-search=native={}", out.display());
        println!("cargo:rustc-link-lib=static=fmbridge");
        println!("cargo:rustc-link-arg=-Wl,-weak_framework,FoundationModels");
        println!("cargo:rerun-if-changed=apple/fm.swift");
    }
    tauri_build::build()
}
