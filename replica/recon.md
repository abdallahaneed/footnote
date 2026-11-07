# Recon map: Granola (macOS + Windows desktop)

Scope: everything public on the desktop apps. Mobile, Apple Watch, billing and the enterprise compliance layer are recorded but marked could or skip.
For: a free open-source clone. Local-first, no paid APIs, local transcription and local LLM by default (same stance as Quietkey).
Date: 2026-11-07

## Rules applied

Public sources only. No account was used, no app binary or JS bundle was opened, no network calls were logged.
Granola User Terms (updated 19 Dec 2025, https://docs.granola.ai/help-center/policies/terms-of-service/user-terms-of-service.md) forbid crawling or scraping the Services, copying a significant portion of its content, and reverse engineering "the source code or underlying ideas". No explicit non-compete clause was found in the User or Application Terms. The Platform Terms PDF (https://go.granola.so/platform-tos) was not read and may add one.
Consequence: if Abdallah has or creates a Granola account, use it only to look at screens with his own eyes, take a handful of manual screenshots into replica/screens/, and copy no text, templates, recipes or prompts. All of Granola's built-in template and recipe text is their content: write our own.
replica/screens/ is empty. No screenshots were taken in this pass (no browser session with an account). The App Store listing (id6739429409) has screenshots worth viewing manually.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | help center index | https://docs.granola.ai/help-center | ~200 articles, full list at https://docs.granola.ai/llms.txt |
| 2 | setup guide | https://docs.granola.ai/help-center/getting-started/setting-up-granola-for-the-first-time | onboarding steps, macOS 14+ |
| 3 | Granola 101 | https://docs.granola.ai/help-center/getting-started/granola-101 | home screen layout |
| 4 | transcription | https://docs.granola.ai/help-center/taking-notes/transcription | start/stop rules, transcript panel, auto-stop |
| 5 | templates | https://docs.granola.ai/help-center/taking-notes/customise-notes-with-templates | slash menu, regenerate, sharing |
| 6 | notifications | https://docs.granola.ai/help-center/taking-notes/notifications | meeting detection pop-ups |
| 7 | deleting notes | https://docs.granola.ai/help-center/taking-notes/deleting-notes | trash, 30-day purge |
| 8 | chat | https://docs.granola.ai/help-center/getting-more-from-your-notes/chatting-with-your-meetings | scopes, rewrite, models |
| 9 | recipes | https://docs.granola.ai/help-center/getting-more-from-your-notes/recipes | saved prompts |
| 10 | spaces and folders | https://docs.granola.ai/help-center/sharing/folders/spaces-and-folders | roles, link access, auto-add |
| 11 | sharing notes | https://docs.granola.ai/help-center/sharing/sharing-notes | viewer/collaborator, request access |
| 12 | sharing controls | https://docs.granola.ai/help-center/consent-security-privacy/sharing-controls | default link sharing |
| 13 | people and companies | https://docs.granola.ai/help-center/people-and-companies | auto CRM from attendees |
| 14 | integrations | https://docs.granola.ai/help-center/sharing/integrations/integrations-with-granola | Slack, Notion, CRMs, Zapier, MCP |
| 15 | profile and preferences | https://docs.granola.ai/help-center/customising-granola/profile-and-preferences | settings tabs, jargon |
| 16 | workspaces | https://docs.granola.ai/help-center/workspaces | members, roles, danger zone |
| 17 | privacy FAQ | https://docs.granola.ai/help-center/consent-security-privacy/security-privacy-data-faqs | audio not stored, retention |
| 18 | transcription issues | https://docs.granola.ai/help-center/troubleshooting/transcription-issues | error states, mic picker |
| 19 | mobile getting started | https://docs.granola.ai/help-center/ios/getting-started | mobile differences |
| 20 | marketing site | https://www.granola.ai | pitch, before/during/after |
| 21 | pricing | https://www.granola.ai/pricing | Basic $0, Business $14, Enterprise $35, full compare table |
| 22 | enterprise | https://www.granola.ai/enterprise | admin, SSO, consent features |
| 23 | security | https://www.granola.ai/security | storage, providers, training |
| 24 | changelog | https://www.granola.ai/updates | May 2024 to Sep 2026 |
| 25 | public API spec | https://docs.granola.ai/api-reference/openapi.json | data model, best evidence |
| 26 | MCP | https://www.granola.ai/mcp | server at mcp.granola.ai/mcp, OAuth |
| 27 | App Store | https://apps.apple.com/us/app/granola-ai-meeting-notes/id6739429409 | 4.96 from 14,681 ratings, not read |

Not read yet, worth a second pass before building those areas: voice typing articles, pre-meeting briefs, follow-up emails, AI-enhanced notes, writing your own notes, exporting notes, speaker attribution, multi-language, calendar sync, webhooks and audit docs.

## Core loop

Open the note for a calendar meeting, type a few rough notes while Granola captures mic and system audio without a bot, and when the call ends your rough notes are merged with the transcript into structured "Enhanced" notes in a chosen template, which you can then chat with and share.

Before, during and after framing (marketing site): a brief before the meeting, own notes plus live transcript during, enhanced notes, actions and follow-up email after.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Sign-in | first launch | sign in with Google, Microsoft or SSO via browser | provider buttons, browser hand-off | default, waiting for browser, error |
| S02 | Calendar permission | after sign-in | grant calendar read (attendees, time, title) | calendar list with "Select all", continue | default, partial selection |
| S03 | Audio permissions | after S02, macOS only | mic and system audio prompts | OS prompts, explainer | granted, denied (recovery via System Settings) |
| S04 | Demo meeting | first sign-in, once | 2-minute guided tutorial note | video, sample note | playing, skipped |
| S05 | Home | default view | upcoming meetings and all notes | "Coming up" list (next 14 days), "Your notes" list, "+ New Note" top right, "Ask anything" bar, sidebar | empty (only demo note), filled, offline |
| S06 | Sidebar | left of home, ⌘S / Ctrl+S | navigate spaces and folders | "My notes" space, team space, custom spaces, folders with icons, "+" per space, Views icon, workspace menu bottom-left, Trash at bottom | collapsed, open, auto-closes when a note opens, Trash hidden when empty |
| S07 | Note, live | click a meeting, a notification, or New Note | type own notes while transcribing | title, attendees, rich text editor, "/" menu (templates), green dancing bars, transcript button (waveform), "Ask anything" bar | before start, recording, stopped, orange "trouble transcribing" banner |
| S08 | Transcript panel | waveform button in S07/S09 | read and control the transcript | chat-bubble chunks (grey = them left, green = me right), speaker names, Stop/Resume, Copy all, chunk copy/delete, search, mic selector ("Auto" + list) | live streaming, paused, ended, empty, hidden while chat open |
| S09 | Note, enhanced | after meeting ends | AI-written notes from own notes + transcript | "My notes" / "Enhanced" tabs, template dropdown on Enhanced tab, own text visually distinct from AI text, "Shared" button, three-dots menu, images, attachments | generating ("Enhancing notes"), done, regenerating, failed |
| S10 | Chat | "Ask anything" bar on any screen | ask questions scoped to where you are | input, scope chip (all notes, meeting, folder, selection, person, company), model dropdown, attach file, suggested actions ("List actions", "Write follow-up email"), thread history with trash | empty, streaming answer, answer with citations, rewrite applied to note, model locked |
| S11 | Recipes | "/" in chat or recipes tab | browse saved prompts | tabs Discover / My recipes / Workspace recipes, search, Remix | empty, filled |
| S12 | Recipe editor | "Create a recipe" or pencil | write a saved prompt | name (= slash shortcut), prompt, scope type (single / multiple meetings), advanced model, sharing (Private / workspace / link), delete | new, edit, validation error |
| S13 | Templates | "Manage templates", "All templates…" | create and edit note templates | list, editor with name, description, sections, visibility "private to me" / organization | default set by user type, custom, shared |
| S14 | Share dialog | "Shared" button on S09 | control who sees a note | invite by email, Viewer / Collaborator, "Copy link" + link access dropdown, people with access | private, shared, external invitee defaults to Viewer |
| S15 | Locked note | open a link without access | ask for access | message box, "Request access"; owner side banner "Grant access" | requested, granted |
| S16 | People | Views icon > People, ⌘K "Go to people" | auto list of everyone you met | search, avatar, job title, company | empty, filled |
| S17 | Companies | Views icon > Companies | auto list of companies from attendee domains | search, logo, name | empty, filled |
| S18 | Person / company detail | click a row in S16/S17 | all notes with that person or company, scoped chat | header, note list, chat bar | filled, wrong enrichment |
| S19 | Command palette | ⌘K / Ctrl+K | jump anywhere, search notes | search input, results, commands | empty query, results, no results |
| S20 | Meeting notification | 1 min before a calendar event with 2+ attendees, or mic-use detection | start notes | Granola's own pop-up top right, "Take Notes", title "Meeting detected" / "Huddle detected" / "Call detected", solid bar (calendar) vs dashed (ad-hoc) | shown, dismissed |
| S21 | Live meeting indicator | while transcribing, app not focused | floating pill on right screen edge | waveform, click to return | recording, hidden by setting |
| S22 | Trash | sidebar bottom | restore or delete | note list, restore arrow, delete forever | hidden when empty, filled, 30-day purge |
| S23 | Folder view | click a folder | notes in folder, folder chat, auto-post | header with icon and description, "Integrations" button, share settings, note list with checkboxes, "Auto-add future meetings?" prompt | empty, filled, "folder not found" for non-members |
| S24 | Folder share settings | folder header | members and link access | space, members add by email, link access (Invited only / Everyone at workspace / Anyone with link), owner vs member | private, shared |
| S25 | Pre-meeting brief | open an upcoming external meeting / on join | context before a call | attendees, last discussion, what matters now | generating, ready, no history |
| S26 | Follow-up email | suggested action after a meeting | draft email to attendees | draft text, copy, open in Gmail / Outlook | generating, ready |
| S27 | Settings: Profile | workspace menu > Settings | identity and AI context | name, job title, user type, context, "Delete Account" | default |
| S28 | Settings: Preferences | Settings | app behaviour | General (Live meeting indicator, Reposition Granola for meetings), Data & sharing (model training opt-out, default link sharing, transcript auto-deletion), Language (jargon up to 30 terms, language), Labs (beta) | toggles, confirm dialog "Update all notes" / "New notes only" |
| S29 | Settings: Notifications | Settings | which pop-ups appear | per-app toggles, all off | default |
| S30 | Settings: Workspace | Settings | team admin | General (name, logo, auto-join by domain, discoverable, workspace jargon up to 50), Members (list, Admin/Member, copy invite link, remove with typed confirm), Data security (export, transfer, move), Danger zone (leave, transfer notes, delete with typed confirm) | admin view, member view |
| S31 | Settings: Spaces | Settings > Spaces, admin only | custom spaces | create (name, icon, description, members), "Allow Granola API access", delete | empty, filled |
| S32 | Settings: Connectors | Settings | integrations and API keys | Slack, Notion, CRMs, Zapier connect buttons; API keys (create, edit scopes Personal/Public, revoke, Revoked section); MCP setup | not connected, connected, revoked key |
| S33 | Settings: Troubleshooting | Settings | self-diagnosis | "Run check" network connectivity, copyable report | pass, fail |
| S34 | Settings: Billing | Settings | plan per workspace | plan, upgrade | skip in clone |
| S35 | Workspace switcher | workspace name bottom-left | switch or "Add workspace" | list, create form (name, picture, auto-join domain) | one workspace, many |
| S36 | Web note viewer | open a shared link in a browser | read a shared note without the app | enhanced notes only, no transcript, chat | public, restricted, request access |
| S37 | Voice typing overlay | global hotkey in any app | dictate text into any app | floating mic indicator, dictation history | listening, inserting, error |
| S38 | Integration pickers | three-dots > Slack / Notion / CRM | post a note to a tool | channel / database / record picker, auto-post per folder | connected, not connected, posted |

## Flows

```
F01 First run
    S01 sign in -> S02 calendar -> S03 audio permissions (macOS) -> S04 demo -> S05 home
    happy path clicks: about 6 (provider, browser approve, Select all, continue, Allow x2)
    edge: on-prem Exchange not supported, mic or system audio denied, browser sign-in blocked by cookies, macOS below 14

F02 Take notes in a calendar meeting (the core loop)
    S20 notification "Take Notes" (opens video link + note, starts capture) -> S07 type notes -> call ends, auto-stop -> S09 enhanced notes generate
    happy path clicks: 1 (Take Notes). Everything else is automatic.
    edge: no notification (event has 1 attendee), back-to-back calls merge, 15 min silence stops capture, computer sleeps, network drops (orange banner), wrong mic, Bluetooth headset quality, macOS < 14.2 needs manual stop, meeting app not supported on Windows

F03 Ad-hoc note
    S05 "+ New Note" -> S07 -> stop manually in S08 -> S09
    or S20 "Meeting detected" / "Huddle detected" from mic-use detection
    happy path clicks: 2
    edge: detection within 15 min of a calendar event links to that event

F04 Pause, resume and edit a transcript
    S07 -> S08 Stop -> Resume -> click a chunk -> delete or copy -> regenerate notes in S09
    edge: resume on an ended note appends audio, deleted chunks must disappear from regenerated notes

F05 Switch template after the fact
    S09 Enhanced tab dropdown -> pick template -> notes regenerate
    also during the call: "/" in S07 -> pick template
    happy path clicks: 2
    edge: own notes must survive regeneration, template removed or unshared

F06 Chat with one meeting, then rewrite the notes
    S09 "Ask anything" -> question -> answer -> "rewrite the action items as a table" -> note section replaced
    edge: highlighted text scopes the rewrite, undo, meeting still live

F07 Chat across meetings
    S05 "Ask anything" (scope all notes) or S23 folder chat or S18 person chat or multi-select notes -> question -> answer with links to notes
    edge: history window (30 days on free), no matching notes, very large corpus

F08 Create and use a recipe
    S11 -> S12 Create a recipe (name, prompt, scope) -> Save -> in S10 type "/name"
    happy path clicks: 4
    edge: scope mismatch (single-meeting recipe on home), remix someone else's recipe

F09 Organise into folders
    S05 hover note -> checkbox -> "Add to folder" -> S23 -> "Auto-add future meetings?" -> Auto-add
    edge: note in several folders, subfolder only one level, member cannot remove others' notes

F10 Share a note
    S09 "Shared" -> S14 invite email or Copy link with access level -> recipient opens S36 or app
    happy path clicks: 3
    edge: external invitee gets Viewer, recipient locked out -> S15 request -> owner "Grant access", tightening default sharing asks "Update all notes" or "New notes only"

F11 Post to a tool
    S32 connect Slack/Notion/CRM -> S09 three-dots -> S38 pick channel or record -> posted
    or S23 "Integrations" -> auto-post every new note in folder
    edge: token expired, record not matched, desktop-only

F12 Prepare for a meeting
    S05 click upcoming external meeting -> S25 brief (attendees, last time, open items)
    edge: first meeting with this person, no calendar attendees

F13 Find something
    S19 ⌘K -> type -> open note / go to people / go to companies
    edge: offline search over local cache

F14 Delete and recover
    S05 three dots -> move to trash -> S22 restore or delete forever
    edge: 30-day auto purge, transcript auto-deletion policy, delete account

F15 Team setup
    S35 Add workspace -> S30 Members invite / copy link -> S31 create space -> S24 share folder
    edge: auto-join by domain, removing a member, delete workspace only when alone

F16 Voice typing in any app
    global hotkey -> S37 speak -> text inserted at cursor
    edge: permissions, app blocks paste, jargon spelling (this overlaps Quietkey entirely)

F17 Connect an AI tool via MCP or API
    S32 create API key or authorise MCP via browser OAuth -> external client queries notes
    edge: revoke key, scope personal vs public, rate limit 5 rps burst 25
```

Number to beat: F02 is one click from notification to finished notes.

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger, icon | default, hover, focus, disabled, loading | all |
| Sidebar tree | space, folder, subfolder (1 level), trash | collapsed, expanded, drag target, selected | S06 |
| Note list row | calendar, ad-hoc, shared-with-me | default, hover with checkbox, selected, multi-select range | S05, S16-S18, S22, S23 |
| Upcoming meeting row | external, internal, live now | default, live | S05 |
| Rich text editor | own notes, enhanced notes | editing, read-only (viewer), AI text vs human text styling | S07, S09 |
| Slash menu | templates, recipes | open, filtered, empty | S07, S10 |
| Tabs | My notes / Enhanced, recipe tabs, settings tabs | active, inactive, with dropdown | S09, S11, S27-S34 |
| Recording indicator | inline bars, floating pill | recording, paused, warning | S07, S21 |
| Transcript bubble | me (right), them (left), named speaker | default, hover (copy, delete), search match | S08 |
| Chat bar ("Ask anything") | home, note, folder, person | idle, focused, streaming, scope chip | S05, S07, S09, S18, S23 |
| Chat message | user, assistant, with note citations | streaming, done, error | S10 |
| Model dropdown | Auto, standard, thinking | enabled, locked | S10, S12 |
| Notification toast | calendar (solid bar), ad-hoc (dashed bar) | shown, dismissed, auto-hide | S20 |
| Banner | warning (orange), info, request access | shown, dismissed | S07, S09, S15 |
| Share popover | note, folder | private, shared, link access levels | S14, S24 |
| Role select | Viewer / Collaborator, Owner / Member, Admin / Member | default, disabled | S14, S24, S30 |
| Avatar | person, company logo, workspace logo | image, initials fallback | S05, S14, S16-S18 |
| Command palette | | empty, results, no results | S19 |
| Modal | confirm, typed confirm (danger), form | open, submitting, error | S12, S13, S28, S30, S31 |
| Toggle | | on, off, disabled | S28, S29, S31 |
| Tag input | jargon terms | empty, at limit (30 / 50) | S28, S30 |
| Mic selector | Auto + device list | selected, device missing | S08 |
| Empty state | no notes, no people, empty folder, no recipes | | S05, S11, S16, S17, S23 |
| Integration card | Slack, Notion, CRM, Zapier, MCP, API key | not connected, connected, error | S32, S38 |

## Inferred data model

The public API spec (source 25) is the strongest evidence. IDs there use prefixes (not_, fol_, spa_, att_, whe_).

```
User        id, name, email, avatar_url, job_title, user_type, profile_context, model_training_opt_out,
            default_link_access, transcript_retention_days, jargon (<=30), locale
            evidence: S27, S28, API User {name, email}
            confidence: high

Workspace   id, name, logo_url, auto_join_domain, discoverable, jargon (<=50), sharing_policy, retention_policy
            evidence: S30, workspaces article
            confidence: high

Membership  workspace_id, user_id, role (admin | member), joined_at
            evidence: S30 Members
            confidence: high

Space       id, workspace_id, name, icon, description, kind (personal | team | custom), api_access (bool)
            evidence: S06, S31, API Space {id, name}
            confidence: high

Folder      id, space_id, parent_folder_id (one level), name, icon, description, owner_id,
            link_access (invited | workspace | anyone), auto_add_rule (recurring calendar series id)
            evidence: S23, S24, API Folder {id, name, parent_folder_id, space_id}
            confidence: high

FolderMember folder_id, user_id, role (owner | member)
            evidence: folders article roles
            confidence: high

CalendarEvent  id, provider (google | microsoft), provider_event_id, title, organiser, invitees [email],
            start_at, end_at, video_link, recurring_series_id
            evidence: S05, API CalendarEvent {event_title, invitees, organiser, scheduled_start_time, scheduled_end_time}
            confidence: high (recurring_series_id is a guess from auto-add)

Note        id, workspace_id, owner_id, title, calendar_event_id (nullable), template_id,
            private_notes_md (own notes), summary_md (enhanced), status (draft | recording | processing | done | failed),
            meeting_at, created_at, updated_at, deleted_at, link_access
            evidence: S07, S09, API Note {summary_markdown, private_notes_markdown, calendar_event, deleted_at}, search completion_status
            confidence: high

NoteFolder  note_id, folder_id   (many-to-many, "notes can be in many folders")
            evidence: folders article, API folder_membership[]
            confidence: high

Attendee    note_id, person_id, email, name
            evidence: API attendees[]
            confidence: high

TranscriptSegment  id, note_id, source (microphone | speaker), attribution (me | them),
            diarization_label, speaker_name, text, start_time, end_time, deleted (bool)
            evidence: S08, API Transcript + Speaker
            confidence: high

Attachment  id, note_id, type (photo | file), url, width, height
            evidence: API NoteAttachment, changelog "Add images", "Upload files"
            confidence: high

Template    id, workspace_id, owner_id, name, description, sections [{heading, instructions}],
            visibility (private | organization), built_in (bool), for_user_type
            evidence: S13, templates article
            confidence: medium (section shape is a guess)

Recipe      id, owner_id, workspace_id, name (slash shortcut), prompt, scope (single | multiple),
            model, visibility (private | workspace | link), remixed_from_id
            evidence: S11, S12, recipes article
            confidence: high

ChatThread  id, user_id, scope_type (all | note | folder | space | selection | person | company), scope_ids, model, created_at
ChatMessage id, thread_id, role (user | assistant), content, cited_note_ids, created_at
            evidence: S10, chat article (history private per user, delete thread)
            confidence: medium (citations are a guess)

Person      id, workspace_id, email, name, job_title, avatar_url, company_id
Company     id, workspace_id, domain, name, logo_url
            evidence: S16-S18, auto-populated from attendees and enriched
            confidence: high for fields, enrichment source unknown

NoteShare   note_id, user_email, role (viewer | collaborator), invited_at
AccessRequest  note_id, requester_id, message, status (pending | granted)
            evidence: S14, S15
            confidence: high

Integration id, workspace_id, user_id, kind (slack | notion | hubspot | attio | affinity | salesforce | zapier),
            credentials (encrypted), config
FolderAutoPost  folder_id, integration_id, target (channel id, database id)
            evidence: S32, S38, folder "Integrations"
            confidence: medium

ApiKey      id, user_id or workspace_id, name, scopes (personal | public), created_at, revoked_at
            evidence: S32, API docs
            confidence: high

WebhookEndpoint  id, url, events (note.generated | note.edited | note.access_granted), folder_ids, scopes, signing_secret, enabled
            evidence: API spec
            confidence: high (could for the clone)

Dictation   id, user_id, text, app_name, created_at
            evidence: voice typing "dictation history" article title
            confidence: guess
```

Relationships: Workspace 1-n Space 1-n Folder 1-n (one level) Folder. Folder n-n Note. Workspace n-n User via Membership. Note 0-1 CalendarEvent. Note 1-n TranscriptSegment, 1-n Attachment, n-n Person via Attendee. Person n-1 Company. Note 0-1 Template. User 1-n ChatThread 1-n ChatMessage. User 1-n Recipe.

Not in their model but needed for a local-first clone: local SQLite as the source of truth, optional sync later. Granola itself caches notes locally for offline use and keeps the master copy on AWS US.

## Feature matrix

See features.csv. 111 rows. Must: 39, should: 37, could: 23, skip: 12.

## Out of scope (cannot or should not be cloned)

1. Granola's built-in templates, recipes, prompts, demo video and copy: their content. Write our own.
2. Their brand, the name, the green bubble look, the "g" icon, marketing claims.
3. SOC 2, HIPAA BAA, GDPR DPA, EU AI Act alignment: certifications of a company, not features.
4. Hosted cloud models and other paid LLMs as defaults: conflicts with free and no paid APIs. Offer a bring-your-own-key option at most.
5. Hosted transcription providers (Deepgram, AssemblyAI): replace with local whisper.cpp or similar.
6. People and company enrichment from a data vendor (photos, job titles, logos): needs a paid data source. Use attendee names and favicon by domain only.
7. Billing, plans, seats: a free tool has nothing to bill.
8. Enterprise SSO with 30+ IdPs, SCIM, audit API, legal holds, admin analytics: needs a hosted multi-tenant backend.
9. The CRM partner integrations' approved-app status (HubSpot marketplace, Salesforce AppExchange): each needs its own developer app and review.
10. Google Calendar sensitive-scope verification is not a clone problem but it is a cost: a public OAuth app needs Google verification, or users bring their own client ID, or read ICS / the OS calendar (EventKit on macOS) instead.
11. Mobile apps, Apple Watch, iOS Live Activity, Android tile: outside the chosen platforms.
12. Their user base, shared-with-me network effect, MCP connector listings in other vendors' directories.

## Size

Screens 38, flows 17, entities 22.

Hard parts:
1. System audio capture on two OSes, separated from the mic. macOS: ScreenCaptureKit audio or Core Audio process taps (14.2+), with the Screen & System Audio permission. Windows: WASAPI loopback, plus the help center admits some Windows meeting apps fail.
2. Real-time local transcription with me/them split and named speakers. Two channels give me vs them for free; naming remote speakers needs diarization or reading the meeting app's active-speaker UI, which Granola does for Meet, Zoom and Teams.
3. Meeting detection: mic-in-use detection per app, calendar matching within 15 minutes, auto-stop on silence, sleep and call end.
4. Enhancement quality with a local LLM: merging sparse human notes with a long transcript into a template, keeping human text distinct, within a laptop's context window. Needs chunking and a fallback BYO-key path.
5. Chat across all meetings: local embeddings and retrieval over months of transcripts, with citations.
6. Calendar sync for Google and Microsoft without a hosted backend.
7. Sharing, workspaces, web viewer and request-access need a server. That breaks "local-first, free". Options: export and paste only, or an optional self-hosted sync server.

Size: XL as scoped ("everything public"). Rescope.

Proposed cut:
Milestone 1 (L, a quarter): single user, local-first. F01-F08, F13, F14, F16. Calendar, capture, transcript, enhancement with templates, chat and recipes, folders, search, trash, export to markdown and clipboard, voice typing reused from Quietkey.
Milestone 2 (M): integrations that need no server (Notion, Slack webhooks, Zapier webhook, MCP server running locally over stdio).
Milestone 3 (L): optional self-hosted sync server for workspaces, sharing, web viewer, people and companies across a team.
