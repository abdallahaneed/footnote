// Apple's on-device model (FoundationModels, macOS 26+) for Rust: src/apple.rs calls these three C functions.
// The framework is weak-linked (build.rs), so the app still starts on macOS 14 and 15.
import Foundation
import FoundationModels

public typealias FmToken = @convention(c) (UnsafePointer<CChar>, UnsafeMutableRawPointer?) -> Bool

/// 0 available, 1 Mac cannot run it, 2 Apple Intelligence off, 3 model still downloading, 4 macOS too old, 5 other.
@_cdecl("fm_status")
public func fm_status() -> Int32 {
    guard #available(macOS 26.0, *) else { return 4 }
    switch SystemLanguageModel.default.availability {
    case .available: return 0
    case .unavailable(.deviceNotEligible): return 1
    case .unavailable(.appleIntelligenceNotEnabled): return 2
    case .unavailable(.modelNotReady): return 3
    default: return 5
    }
}

private final class Box: @unchecked Sendable {
    var out = ""
    var fail: String?
}

/// Blocks until the answer is complete. Calls `cb` with each new piece of text; `cb` returning false stops early.
/// Returns the whole answer (free it with fm_free), or nil with `err` set.
@_cdecl("fm_respond")
public func fm_respond(_ system: UnsafePointer<CChar>, _ user: UnsafePointer<CChar>, _ cb: FmToken,
                       _ ctx: UnsafeMutableRawPointer?, _ err: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>) -> UnsafeMutablePointer<CChar>? {
    guard #available(macOS 26.0, *) else {
        err.pointee = strdup("Apple's built-in model needs macOS 26 or later.")
        return nil
    }
    let sys = String(cString: system), prompt = String(cString: user)
    let box = Box()
    let done = DispatchSemaphore(value: 0)
    Task.detached {
        do {
            let session = LanguageModelSession(instructions: sys)
            var sent = 0
            for try await snap in session.streamResponse(to: prompt, options: GenerationOptions(temperature: 0.2)) {
                let text = snap.content
                box.out = text
                guard text.count > sent else { continue }
                let piece = String(text.dropFirst(sent))
                sent = text.count
                if !piece.withCString({ cb($0, ctx) }) { break }
            }
        } catch let e as LanguageModelSession.GenerationError {
            switch e {
            case .exceededContextWindowSize: box.fail = "The text was too long for Apple's built-in model."
            case .guardrailViolation: box.fail = "Apple's built-in model refused this text because of its safety filter. Switch to Groq in Settings to write this note."
            case .unsupportedLanguageOrLocale: box.fail = "Apple's built-in model does not support this language yet. Switch to Groq in Settings."
            default: box.fail = "Apple's built-in model failed: \(e.localizedDescription)"
            }
        } catch {
            box.fail = "Apple's built-in model failed: \(error.localizedDescription)"
        }
        done.signal()
    }
    done.wait()
    if let f = box.fail {
        err.pointee = strdup(f)
        return nil
    }
    return strdup(box.out)
}

@_cdecl("fm_free")
public func fm_free(_ p: UnsafeMutablePointer<CChar>?) {
    free(p)
}
