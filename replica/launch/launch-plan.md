# Launch plan: Footnote

Date: 2026-11-08  Status: not shippable yet (parity.md: 15 of 35 must-haves open; most close with a real-call run and a signed build). This plan is what happens once those are done.

## 0. Before anything public

Blocking, in this order:
1. One real call through the desktop app (Ollama installed, mic plus system audio, notes, export). test-plan.md manual pass items 1-8.
2. Signed and notarised macOS build (Developer ID). Direct download first; the Mac App Store needs the app sandbox, and system-audio capture under the sandbox is not tested.
3. Logo and app icon from the brief in brand.md (Tauri default icons today).
4. Trademark, handle and domain checks for Footnote (brand.md section 2), then buy the domain.
5. Privacy policy and support page on the site (short: nothing is collected; how to reach you; how to delete data = delete the app folder).
6. Set CTA_URL in site/index.html to the waitlist, later the download.

## 1. Waitlist before launch

A free hosted list (Buttondown or Tally; the user creates the account), linked from the site's buttons via CTA_URL. One field: email. One promise on the form: "One email when Footnote is ready. Nothing else." Send exactly that.

## 2. Analytics and errors

The app sends nothing, and that is part of the pitch. Keep it that way:
1. App: no analytics, no crash reporting by default. If crash reports are added, opt-in in Settings, showing the report before it is sent.
2. Site: a cookieless counter (Plausible or GoatCounter) for visits and button clicks. No cookie banner needed with those.
3. Feedback: a "Send feedback" item that opens a pre-filled email or a GitHub issue, so problems come back without tracking.

## 3. Where the unhappy users are

From the research (fixes.md, feedback.md). Read the threads, answer questions where someone asks for this, never spam a thread.
1. Hacker News threads where people build their own local meeting notes: https://news.ycombinator.com/item?id=48518760, https://news.ycombinator.com/item?id=49091245, and the folder-visibility complaint https://news.ycombinator.com/item?id=44736878.
2. Reddit could not be fetched during research. To find by hand: r/macapps, r/LocalLLaMA (Ollama users), r/productivity, r/ObsidianMD (Markdown export). Check each subreddit's self-promotion rules first.
3. Ollama and local-AI communities (Ollama Discord, GitHub discussions): Footnote is a real use for a local model.
4. People who take minutes because they must (boards, councils, nonprofits): fixes.md unsolved item 2. Thin evidence; try a few by hand before investing.

## 4. Launch posts

Lead with the fix, not with the original. Do not name the original in titles or ads.
1. Show HN: "Show HN: Footnote – meeting notes on your Mac where every line links to when it was said". First comment: why (lost meetings, summaries you cannot check), what runs locally (whisper, Ollama, SQLite), what is not there yet (Windows, named speakers), and that it is free.
2. Product Hunt, a week later: same angle; gallery = the S09 note with sources, the status chip with Try again, the Settings retention choice. Tagline (60 max): "Meeting notes you can check, kept on your Mac".
3. A short screen recording (60-90 s): start a note from the pop-up, type, stop, click a timestamp, land in the transcript.

## 5. The first ten users, by hand

Talk to each one on a call or by email, watch them use it, write down what breaks.
1. 3 people from the Hacker News threads above who said they were building their own local version.
2. 3 people from your own network who sit in many calls (job interviews, client calls); Footnote has a job interview template.
3. 2 people who must keep minutes (a club, a board, a student council).
4. 2 developers who already run Ollama.
Ask them: did any meeting go missing; did a line ever say something that was not said; what did they look for and not find.
Real quotes from these users, with their permission, can go in the empty proof section on the site. Not before.

## 6. Store listing (when the App Store build exists)

Text: replica/launch/listing.json, checked with listing.py (0 errors, 0 warnings on 2026-11-08).
Still to prepare: Mac screenshots at the sizes App Store Connect asks for on upload day (16:10, for example 2880x1800), showing the fixes first (sources, status, no account); privacy label "Data Not Collected"; age rating 4+; privacy policy and support URLs; review notes saying no account is needed and how to test without a call (open a note, type, Start recording with any audio playing).
Guideline 4.1 (copycats): the name, palette, voice and the first lines of the description are Footnote's own and lead with the fixes; the screenshots must too.
