# Landing page: Footnote

Date: 2026-11-08  Built at site/index.html (static, one file, plus site/tokens.css and site/hero.png). Voice: brand.md section 5. Every claim below is something the app does today; see "Kept out on purpose".

## 1. Hero

Headline: Meeting notes you can check, kept on your Mac.
Under it: Footnote records to your own disk while you talk, writes notes on this computer, and links every line back to the moment it was said.
Button: Get Footnote for Mac (shows "Coming soon for Mac" until a waitlist or download link is set; see launch-plan.md).
Image: S09 generated notes with source timestamps (replica/clone-screens/S09-seed.png), real product, seed data.

## 2. The problem

1. A note app fails in the middle of an important call, and the meeting is gone. Often it does not even say so.
2. The summary says something nobody said, and there is no way to check it.

## 3. How it works

1. Open the meeting. Footnote shows today's calls from your calendar link, or start a blank note.
2. Write what matters to you. Footnote records your microphone and the call's audio, and saves it to disk every few seconds, at the pauses between sentences.
3. Stop. The transcript and the notes are made on your Mac, with each line pointing to the moment it came from.

## 4. What is different (each from fixes.md)

1. Never lose a meeting: audio is written to disk in short pieces as you talk. If the app or the Mac stops, the note finishes from what was saved. (hate 1)
2. See where every note is: each note shows its stage (saved, transcribing, writing, ready) and, if something fails, the reason and a Try again button. (hate 1, missing 5)
3. Check any line: every generated line carries the time it was said; one click opens that moment in the transcript. Your own lines are marked as yours. (hate 3)
4. No account, nothing uploaded: no sign-in, no cloud. Speech-to-text and note writing run on this Mac. (hate 2, hate 5)
5. Your words, your control: edit your own notes in a real editor, choose short, normal or detailed notes, see how long each meeting lasted. (missing 1, missing 4)
6. Free, with export that keeps formatting: one Markdown file per note, any time. (hate 6)

Also there (parity): templates and the "/" menu, a pop-up a minute before a meeting, transcript panel with delete and copy, search across everything, folders, ask questions about your notes, 30-day trash.

## 5. Pricing

Free. No account, no trial, no subscription. pricing.md has the reasoning.

## 6. FAQ

1. What do I need? A Mac with macOS 14 or later. Notes are written by Apple's built-in model on macOS 26 with Apple Intelligence, so there is nothing else to install. On older Macs, or for faster notes, add your own free Groq key; the transcript is then sent to Groq. The speech model is about 60 MB and downloads on first use.
2. Does anything leave my Mac? No. The only network use is reading your calendar link, if you add one, and downloading models when you choose to.
3. Does it join the call as a bot? No. It listens to your Mac's microphone and sound output.
4. Do I have to tell people? Yes, tell them you are taking notes. Recording rules depend on where you and they are.
5. Can it tell speakers apart? It separates you (microphone) from everyone else (call audio). Names for each person are not there yet.
6. Is there Windows? Not yet. Mac first.
7. Can I import notes from other meeting tools? Not yet. You can export everything from Footnote as Markdown at any time.
8. What happens to the audio? By default it is deleted once it is transcribed. You can keep it for 7 days, 30 days, or forever in Settings.

## 7. Final call

Headline: Your next important call, kept.
Button: same as the hero.

## Proof section

Left out. There are no users yet, and no invented numbers, quotes or logos go on this page. Add real beta users here, with their permission, after launch.

## Kept out on purpose

1. "Play the audio behind a line": the timestamp opens the transcript; audio playback is not built.
2. Named speakers, phone apps, sharing links, Slack or Notion: not built.
3. Speed or accuracy numbers: not measured.
4. Any comparison naming the original app: keeps the page about Footnote, and keeps it out of trademark trouble.

## Checks

1. Contrast: the page uses only token pairs from replica/design/tokens.json; contrast.py reports 0 AA failures (62 pairs). axe scan of the built page: see build-log.md.
2. Sweep: site/ is inside the project, so sweep.py covers it.
