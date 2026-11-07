# Fixes and angle: Granola clone

Date: 2026-11-07
Sample: 253 reviews after dedupe. App Store 187 (iOS app id6739429409, official RSS feed, most recent 500 cap), Hacker News 49 comments (Algolia API, May 2024 onward, job posts removed), Product Hunt 13 excerpts, Trustpilot 2 (the page holds only 2).
Ratings: 189 rated. App Store split: 143 five-star, 12 four, 7 three, 6 two, 19 one.
Failed or blocked: Reddit (fetch tool blocked), G2 and Capterra (HTTP 403), Google Play (page did not render reviews), Mac desktop app has no store listing.

Limits of this sample, read before trusting any rank:
1. The only rated source is the iOS app, and the clone is desktop. Many low-star reviews are about iPhone, iPad and Apple Watch. Desktop pain is under-represented.
2. Hacker News hits are noisy. About a third mention Granola only in passing or while launching their own product. They count as signal for "people want a local version", not as reviews.
3. Product Hunt rows are excerpts capped at 125 characters by the fetch tool, with no ratings or exact dates.
4. Most low-star reviews matched no theme in reviews.py. The lists below come from reading all 30 one-to-three star reviews by hand, so counts are hand counts, stated per item.

## 1. What they hate

1. Recording or transcript silently fails, and the meeting is gone. 10 reviews, 1 source (App Store, mostly iOS). The strongest theme in the sample.
   "Can’t trust it. Randomly my called failed to upload. It was an important work call and isn’t recoverable." https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-14534300838
   "Had an important meeting and the transcript failed.  I can get better and more consistent notes from the voice recorder on my phone." https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-14498265047
   Related: "Annoying I cannot tell if my notes are stuck or it’s just taking awhile. Should be a status bar." https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-14632129571

2. Forced to sign in with Google or Microsoft to use it at all. 6 reviews, 1 source (App Store).
   "It wants my google login just to take notes? No thanks." https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-13448652220
   "This is a AI note taking system.  It shouldn’t require you to have a Google account." https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-13143729579

3. AI notes that change the meaning, with no way to check. 5 reviews, 3 sources (App Store, Hacker News, Product Hunt via speaker errors). Thin per source.
   "the AI notes are often hallucinating and change the meaning, making the whole note less usable, and understandable." https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-14026182836
   "They often miss important things, overemphasize the wrong things, etc." https://news.ycombinator.com/item?id=47061601

4. Speaker attribution is wrong. 11 matches by reviews.py, 3 sources, about 4 clearly about Granola.
   "Speaker attribution on a four person call is still a coin flip." https://www.producthunt.com/products/granola/reviews
   "it’s not able to distinguish different speakers." https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-12927530285

5. Trust and data: where notes go and who can see them. 4 comments, 2 sources (Hacker News, App Store). Thin.
   "I was extremely disturbed to find out that Granola was automatically making each of my notes folders public to the entire organization ." https://news.ycombinator.com/item?id=44736878
   "Also very concerned about information they may continue to hold onto after I delete my account." https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-13788202346

6. Free plan cripples export and history. 3 reviews, 2 sources. Thin.
   "the free version is setup so that if you export, or copy/paste, you lose 100% of the formatting and end up with  a massive unreadable block of text." https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-14529420071
   "I was getting tired of paying a subscription for Granola." https://news.ycombinator.com/item?id=48518760
   Pricing and billing complaints (14 matches, including "There’s no option to cancel the subscription on iPhone", review-14724711463) go to /replica-launch.

## 2. What is missing

1. Edit the raw notes and control how heavy the summary is. 1 review. Thin, but it matches item 3 above.
   "I wish there was possibility to edit the raw note and also set the button how heavy should the AI summary be when creating the note." https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-14026182836
2. Keep the original recording. 1 review. Thin. Granola deletes audio by design.
   "I also wish it kept the original recordings too." https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-14500805628
3. Sign in with Apple, or no account. 2 reviews, plus item 2 of the hate list.
   "No Sign in with Apple?. I thought that this was required when Google is available?" https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-14744318498
4. Show how long a meeting lasted. 1 review. Thin, trivial to build.
   "the fact that you can’t ask or see how long a meeting lasted is absurd" https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-13656690485
5. Visible processing status. 1 review (quoted above, review-14632129571). Thin.
6. Inbound phone calls, Android, iPad integrations. 4 reviews. All mobile, outside the clone's platforms. Skipped.

## 3. What is unsolved

1. People who will not hand meeting audio and notes to a cloud service or to Google. Evidence: hate items 2 and 5, plus Hacker News threads where people build their own local versions (https://news.ycombinator.com/item?id=48518760, https://news.ycombinator.com/item?id=49091245 "Granola terrifies me."). About 10 rows across 2 sources. This is the clone's natural audience.
2. Organisations that must keep accurate minutes (nonprofit boards, councils). 1 review: "I wanted to try an AI to transcribe meetings for my nonprofit, since it is legally required" https://apps.apple.com/us/app/id6739429409?see-all=reviews#review-14529420071. Thin. Fits a German-language minutes angle, but one review is not a market.
3. Windows and Linux users. Only 1 review in this sample, so not proven by reviews. Granola does ship on Windows; Linux is not supported.

Competition note from the same Hacker News data: at least five people have posted local or open-source Granola-style apps (MacParakeet, OpenWhispr, Biscotti, CallBro and the one in item?id=48518760). "Local Granola" alone is not a differentiator. Reliability and checkable notes are less crowded.

## 4. Fix plan

Ranked by evidence times cheapness.

1. Never lose a meeting. Write both audio channels to disk in short crash-safe segments while recording, transcribe from those files, and keep the audio until the user deletes it (setting: keep for N days or delete after transcript). A failed transcription can always be re-run. Size M. Skill: /replica-build (capture module), /replica-test for kill-the-app tests. Evidence: hate 1 (10 reviews), missing 2.
2. Always show the state. A visible pipeline on every note: recording, saved, transcribing x%, writing notes, done, failed with a Retry button. Size S. Skill: /replica-build. Evidence: hate 1, missing 5.
3. No account needed. Read meetings from the OS calendar (EventKit on macOS, Windows calendar or an ICS URL), with Google and Microsoft as optional extras. Already a must row. Size S on macOS, M on Windows. Skill: /replica-architect, /replica-backend. Evidence: hate 2 (6 reviews), missing 3.
4. Checkable notes. Every line of the enhanced note links to the transcript timestamps it came from; clicking plays that audio. The user's own lines stay editable and visually separate. Size M. Skill: /replica-build. Evidence: hate 3, missing 1.
5. Summary length control. A short / normal / detailed switch on regenerate. Size S. Skill: /replica-build. Evidence: missing 1 (thin).
6. Plain files you own. Notes saved as markdown files in a folder the user picks, with no history limit and no export paywall. Size S. Skill: /replica-architect (storage decision). Evidence: hate 6, Hacker News export rows.
7. Private by default, always. Nothing is shared unless the user acts per note; no org-wide folder visibility. Already the case for a local app; state it in the UI. Size S. Evidence: hate 5 (thin).
8. Meeting duration and timestamps on every note. Size S. Evidence: missing 4 (thin).

Speaker attribution (hate 4) is not on the list: it is real but expensive. Ship me/them from the two channels first and revisit diarization later.

## 5. The angle

Option A, reliability:
For people in important calls who have lost a meeting to a note app that failed silently, [app] records to your own disk first, so a meeting is never lost and every note can be checked against the audio.
Evidence: recording failures, 10 reviews on 1 source, plus checkable notes, 5 reviews on 3 sources.

Option B, privacy and no account:
For people who will not give a cloud service or Google their meeting audio, [app] runs entirely on your Mac or PC, with no account, no upload and notes as plain files.
Evidence: forced sign-in 6 reviews, trust and data 4 comments, local-build threads on Hacker News; 2 sources. Crowded by other local clones.

Option C, minutes you can stand behind:
For teams that must keep accurate meeting minutes, [app] links every line of the summary to the moment it was said.
Evidence: 1 review. Too thin to lead with.

Recommendation: Option A with B as the proof. Lead with "never lose a meeting, check every line", and use local-first and no account as the reason it can promise that. It is the strongest theme in the sample and the least crowded among the existing local clones.

Do not use the original's name in the app name, ads or store listing. Reviewer quotes are research, not testimonials.
