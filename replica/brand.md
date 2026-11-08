# Brand: Footnote

Date: 2026-11-08  Chosen by Abdallah from five screened names.
Angle (fixes.md option A, reliability, with local-first as the means): for people in important calls who have lost a meeting to a note app that failed silently, Footnote records to your own disk first, so a meeting is never lost and every line of the notes can be checked against what was said.
Why the name fits: every generated line carries its source, like a footnote. It is about proof, not food, so it shares no sound, look or meaning with the original.

## 1. Candidates

Twenty considered, by style:
1. Descriptive: Minutekeeper, Callnotes, Meetfile, Notelocal
2. Compound: Sourceline, Tapeback, Heardwise, Recallbook
3. Invented: Verilo, Tallo, Corlo, Notara
4. Metaphor: Footnote, Holdfast, Logbook, Keel, Docket, Ledger
5. Verb: Kept, Recall, Cite, Steno, Earshot

Cut on sight: anything food or breakfast (too near the original's meaning), Recall (Recall.ai, a meeting-bot API), Ledger (crypto wallets), Docket and Logbook (crowded generic words), Quill-like names (Quill Meetings exists), any "-ly" form.
Cut after checks on 2026-11-08: Tapeback (open-source local meeting recorder "tapeback" on AUR and GitHub), Steno (StenoAI, a local meeting notetaker), Earshot (a Mac local meeting transcription app), Holdfast (the game "Holdfast: Nations At War" sits in trademark class 9).

## 2. Checks on the five

Screening only, not legal clearance. Before money goes into the name (domain, icon, store listing), a trademark lawyer should run a full search in classes 9 and 42.

| check | Footnote (chosen) | Kept | Sourceline | Verilo | Holdfast |
| --- | --- | --- | --- | --- | --- |
| US trademark (tmsearch.uspto.gov, 9 and 42) | to run | to run | to run | to run | to run |
| EU trademark (EUIPO eSearch / TMview) | to run | to run | to run | to run | to run |
| Canada (ised-isde.canada.ca) | to run | to run | to run | to run | to run |
| WIPO Global Brand Database | to run | to run | to run | to run | to run |
| .com (whois, 2026-11-08) | registered | registered | registered | registered | registered |
| .app (whois, 2026-11-08) | no answer from whois; to run at a registrar | same | same | same | same |
| other domains run 2026-11-08 | — | keptnotes.com registered | sourceline.ai registered | — | — |
| App Store and Play, exact name | to run (web search showed no meeting app named Footnote) | to run (none seen) | to run (none seen) | to run (none seen) | to run |
| handles (X, Instagram, TikTok, GitHub) | to run | to run | to run | to run | to run |
| web, "name + category" (2026-11-08) | no meeting or notes product found | no meeting app found | old open-source VCS client SourceLine on SourceForge | no app found; spelling near Verilog (hardware language) | no notes app; war game in class 9 |

For Footnote, the next domain steps: footnote.app or getfootnote.com / footnoteapp.com at a registrar. footnote.com is taken.
Nearby products to keep distance from: Proofscribe (early access, links summary claims to source audio, the same idea as our angle), Hyprnote, StenoAI, Meetily (local meeting notetakers).

## 3. Palette

Primary hue: ink indigo. The original uses olive green (#5b6f00, from a third-party design file, approximate), acid lime and pink backgrounds (2026 identity by Ragged Edge). Indigo is a different family from all three, and it reads like ink, which suits notes you can stand behind.

| role | light | dark |
| --- | --- | --- |
| accent | #4b3fce | #aea6ff |
| accent-soft | #efedfd | #2a2652 |
| on-accent | #ffffff | #15122e |

Every other role (neutrals, danger, success, warning, rec) kept from replica-design; they were never the original's.
Contrast: `python3 ~/.claude/skills/replica-design/contrast.py replica/design/tokens.json`, 62 pairs, 0 failing AA (2026-11-08). The axe scans in the e2e suite pass in light and dark at 1440 and 390.
Type: system sans (no change). Do not adopt a slab serif; the original's identity is built on one (Quadrant).

## 4. Logo brief

Idea: a small raised mark that points back, like a footnote reference. The note is the page, the mark is the proof.
Mark type: symbol plus wordmark. The symbol alone is the app icon.
Direction: a superscript-style dot or numeral-like mark sitting at the top right of a short horizontal line (a line of text), in indigo on a near-white field. Wordmark "Footnote" in the system sans or a plain grotesk, sentence case, no slab serif.
Must work at 16px (favicon: the mark alone, no line if it muddies) and 1024px (app icon).
Deliverables: SVG (symbol, wordmark, lockup; light and dark), app icon 1024x1024 with no transparency for iOS and macOS, favicon set (16, 32, 180, 512), social image 1200x630.
Must not resemble the original's mark: no spiral, no hand-drawn rough line, no standalone G, no text cursor, no olive, lime or pink, no slab serif. Put the original's logo next to the drafts and check before choosing.
Current state: the app shows a lucide FileText glyph in indigo next to the name. Replace it when the mark exists. No icon files exist yet; Tauri still uses its default icons (src-tauri/icons).

## 5. Voice

Three words:
1. Plain, not dull. Short everyday words; still warm.
2. Steady, not stiff. Calm when something fails; says what is safe before what went wrong.
3. Exact, not technical. Says what happened and what to do, without internal names (no "core", "IPC", "pipeline").

Do and don't:
1. Do: "Your recording and transcript are saved." Don't: "An error occurred."
2. Do: "Starting soon" when it is a minute out. Don't: "Starting now" when it is not.
3. Do: "Nothing was lost. Try again." Don't: "Could not reach the app core."
4. Do: "Everything stays on this computer." Don't: "Privacy-first, end-to-end secure, enterprise-grade."
5. Do: "Give the folder a name." Don't: "Validation failed: name is required."

## 6. The ten most-seen strings

Checked against the voice on 2026-11-08. All were written for this app; none echo the original's wording.

| # | where | now | change |
| --- | --- | --- | --- |
| 1 | window title, sidebar, page title | Footnote | was "Meeting Notes", "Notes" and "Design system" (index.html) |
| 2 | main button (S05) | New note | kept |
| 3 | record button (S07) | Start recording / Resume / Stop | kept |
| 4 | status chip | Notes ready | kept |
| 5 | failure banner (S09) | "{reason} Your recording and transcript are saved." + Try again | kept: says what is safe |
| 6 | core error (every screen) | "Footnote could not finish that ({command}). Nothing was lost. Try again." | was "Could not reach the app core ({command})." (technical) |
| 7 | home empty (S05) | "No notes yet" / "Open a meeting above or start a blank note. Everything stays on this computer." | kept |
| 8 | meeting pop-up (S20) | Starting soon | was "Starting now" from a minute before the start (test-plan to-check item 10) |
| 9 | permissions (S03) | "Both stay on this computer. Audio is turned into text here and then deleted, unless you choose to keep it in Settings." | kept |
| 10 | search (S19) | "Search notes and commands…" / "Nothing matches “…”" | kept |

## 7. Sweep

`python3 ~/.claude/skills/replica-brand/sweep.py . --config replica/brand.json`
Before the folder rename, the only real hit was a comment in migrations/0001_init.sql (fixed); every other hit was a build path under src-tauri/target/ containing the old folder name. Result after the rename: see build-log.md.
Note for the sweep tool: it skips build folders by name but not Cargo's target/, so Rust projects need `cargo clean` (or a skip for target) before a sweep.

By eye, still to do: favicon and app icon (Tauri defaults today), the OG image (none yet), email templates (none; Email to attendees uses the user's own mail app).
Not changed on purpose: the bundle identifier dev.abdallah.meetingnotes (changing it moves the app's data folder and orphans the dev database; set the release identifier in /replica-deploy) and the Cargo crate name meeting-notes (internal, never shown).
