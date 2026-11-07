Component specs: meeting-notes clone
Source: replica/recon.md components table and screens S01-S38, fixes.md #2 and #4.
Tokens: replica/design/tokens.json. Code: app/src/ui/base.tsx (generic, from Quietkey) and app/src/ui/notes.tsx (clone-specific).
Check page: app, npm run dev, http://localhost:1430. Tests: npm run test:e2e (axe light + dark, keyboard).
Date: 2026-11-07

Ground rules for every component
  colour     token classes only (bg-surface, text-muted, text-ai, border-input), never raw hex
  focus      2px accent outline, 2px offset, from :focus-visible in index.css. Never removed.
  motion     motion-fast 120ms for hover/press, motion-base 200ms for panels, all off under prefers-reduced-motion
  icons      Lucide (ISC licence). No icons, logos or illustrations from the original.
  font       system UI stack (SF Pro on macOS, Segoe UI on Windows). No licensed font.
  copy       all labels written fresh for this clone; none copied from the original
  colour is never the only signal: every tone also has an icon, a shape or text

Layout
  window     min 900 x 600, titlebar 52 (macOS traffic lights live in it)
  sidebar    240, collapses with Cmd/Ctrl+S, auto-closes when a note opens (S06)
  content    max 720 centred for note and editor views
  side panel 380 for transcript and chat; below a 1100 window it overlays the note instead of pushing it
  rows       40 high for note rows, 52 for meeting rows
  spacing    4px base: 4 8 12 16 20 24 32 48 64

Button
  variants  primary, secondary, ghost, danger
  sizes     sm 28px, md 32px, lg 40px
  states    default, hover (brightness or surface), active (1px press), focus-visible, disabled (40% opacity), loading (spinner, label stays)
  tokens    primary: bg accent, text on-accent. secondary: bg bg, border border. danger: bg danger, text on-accent. radius md, font base/500
  a11y      real <button>; loading sets aria-busy and disabled, label stays so screen readers still announce it
  used on   all
  code      base.tsx Button

Icon button
  variants  default; filled (send button in chat bar)
  sizes     28px square
  states    default, hover, focus-visible, disabled
  tokens    text muted, hover bg surface-2 text fg, radius md
  a11y      aria-label required by the type; Radix tooltip shows the same label after 400ms
  used on   all toolbars, transcript bubble actions, dismiss buttons
  code      base.tsx IconButton

Text input, text area
  states    default, focus (border accent), error (border danger + message), disabled, with counter (turns danger over the limit)
  tokens    bg bg, border border-input (3:1 checked), placeholder text-muted, radius md, height 32
  a11y      visible <label for>; error linked by aria-describedby, aria-invalid set; counter announced politely past 80%
  used on   S12, S13, S27, S28, S30, S31
  code      base.tsx TextInput, TextArea

Select (mic selector, model dropdown, role select, template picker)
  variants  plain, with leading icon (mic)
  states    closed, open, option highlighted, option disabled (missing device), whole select locked (model locked by settings)
  tokens    trigger bg bg border border, menu bg bg shadow pop, highlight accent-soft, check icon accent
  a11y      Radix Select: arrow keys, type-ahead, Escape closes, aria-label on trigger
  used on   S08 mic, S10/S12 model, S09 template, S14/S24/S30 roles
  code      base.tsx SelectMenu

Toggle (switch)
  states    on, off, disabled, locked (lock icon plus reason as label)
  tokens    off bg surface-2 border border-input, on bg accent; thumb white with shadow card
  a11y      Radix Switch, role switch, label for; description in muted text below the label
  used on   S28, S29, S31
  code      base.tsx Switch
  note      off-state edge moved from border to border-input on 2026-11-07: border failed 3:1 against bg

Checkbox
  states    unchecked, checked, focus-visible, disabled
  tokens    native input, accent-color accent
  a11y      native checkbox with a label (visible or sr-only)
  used on   S02 calendar list, S05/S23 multi-select rows
  code      base.tsx Checkbox

Tag input (jargon)
  states    empty, with tags, focus, at limit (input disabled, counter warning, placeholder says the limit)
  limits    30 per user (S28), 50 per workspace (S30)
  behaviour Enter or comma adds, duplicates ignored case-insensitively, Backspace on empty input removes the last tag, each tag has a remove button
  tokens    box border-input, chips bg surface-2 radius sm
  a11y      label for the input; counter aria-live polite; each remove button named "Remove <word>"
  used on   S28, S30
  code      notes.tsx TagInput

Tabs
  variants  plain, with trailing control (template select on the Generated tab)
  states    active (2px accent underline + semibold), inactive (muted), hover, focus-visible
  tokens    border-b border, active border accent
  a11y      Radix Tabs: tablist, arrow keys move between tabs, each tab controls its panel; the active panel must be passed as children
  used on   S09 My notes / Generated, S11 recipe tabs, S27-S34 settings
  code      notes.tsx Tabs

Sidebar tree
  variants  space or section (depth 0), folder (depth 0), subfolder (depth 1, one level only), trash
  states    default, hover, selected (bg surface-2, semibold, aria-current page), collapsed/expanded (chevron rotates), drag target (2px accent inset ring), Trash hidden when empty
  tokens    row 32, indent 16 per level, icon muted, count xs muted
  a11y      separate expand button with aria-expanded and a name; row is a button; nav landmark around the tree
  used on   S06
  code      notes.tsx SidebarItem

Meeting row (upcoming)
  variants  internal, external (adds "external" to the attendee line), live now
  states    default, hover, live (rec-coloured edge + animated bars + "Now" text)
  tokens    52 high, time in sm tabular-nums muted, title base/500
  a11y      whole row is one button; live state carries text, not just colour
  used on   S05
  code      notes.tsx MeetingRow

Note row
  variants  calendar, ad-hoc, shared with you
  states    default, hover (checkbox appears), selected (bg accent-soft), multi-select mode (all checkboxes visible), processing (status chip at the end unless done)
  tokens    40 high, title base/500, meta sm muted
  a11y      checkbox named "Select <title>" and reachable by keyboard even while hidden (shows on focus); title area is one button. Shift-click range select is screen logic, /replica-build.
  used on   S05, S16-S18, S22, S23
  code      notes.tsx NoteRow

Status chip (processing pipeline, fix #2)
  states    recording, audio saved, transcribing N%, writing notes, notes ready, failed + Retry
  tokens    pill, bg surface, xs text; done success, failed danger, busy muted with spinner
  a11y      role status, aria-live polite; failed reads the reason to screen readers; Retry is a real button
  rule      every note shows one of these until done. A note is never silently stuck.
  used on   S05 rows, S07, S09 header
  code      notes.tsx StatusChip

Recording indicator
  variants  inline bars (S07 header, rows), floating pill (S21, separate always-on-top window)
  states    recording (animated), paused (flat, muted), warning (flat, warning colour)
  tokens    bars rec / text-muted / warning; pill uses the bar-* roles (dark in both themes), 44 x 120, shadow bar
  a11y      bars are role img with the state as label; the pill is a button "Recording, return to note"; animation stops under reduced motion
  used on   S05, S07, S21
  code      notes.tsx RecordingBars, RecordingPill

Note text: own lines vs generated lines (fix #4)
  variants  own line, generated line with one or more source stamps
  states    editing, read-only; source stamp default, hover (accent-soft), playing (screen logic)
  tokens    note 15/24. Own: text fg, weight 500, 2px left rule in fg. Generated: text-ai (8.7:1), no rule, stamps mono xs on surface-2
  a11y      own lines prefixed "Your note:" for screen readers; each stamp is a button "Play source audio at 12:04"
  rule      the difference never relies on colour: rule + weight for own text, stamps for generated text
  editor    TipTap integration (custom marks for own/generated and source anchors) is /replica-build work; these are the target styles
  used on   S07, S09
  code      notes.tsx OwnLine, GeneratedLine

Slash menu
  variants  templates, recipes (hint text tells which)
  states    open, filtered, empty ("No templates or recipes match")
  tokens    width 256, bg bg, border, shadow pop, active option accent-soft
  a11y      listbox with options and aria-selected; the editor keeps focus and forwards arrow keys and Enter
  used on   S07, S10
  code      notes.tsx SlashMenu (popup only; trigger lives in the editor)

Transcript bubble
  variants  me (right, accent-soft, square bottom-right corner), them (left, surface-2, square bottom-left), named speaker
  states    default, hover or focus-within (copy and delete appear), search match (warning-soft mark + underline)
  tokens    radius bubble 14, max width 280, speaker line xs muted
  a11y      actions are icon buttons with names and also appear on keyboard focus; match uses <mark> and an underline, not colour alone
  used on   S08
  code      notes.tsx TranscriptBubble

Chat bar
  variants  home (all notes), note, folder, person; scope chip optional
  states    idle, focused (border accent), streaming (send becomes Stop), send disabled while empty
  tokens    44 high, bg bg, border, shadow card, radius lg
  a11y      input labelled "Ask about your notes"; Enter sends; chip remove button named "Remove scope <name>"
  used on   S05, S07, S09, S18, S23
  code      notes.tsx ChatBar

Chat message
  variants  user (right, surface-2 bubble), assistant (plain text), with citations
  states    streaming (caret, aria-busy), done, error (danger line + Try again)
  tokens    citations: xs links, accent text, border border
  a11y      citations are a list named "Sources" of real links to notes; error is role alert
  used on   S10
  code      notes.tsx ChatMessage

Meeting notification
  variants  calendar (solid accent edge, "Starting now"), detected call (dashed accent edge, "Call detected")
  states    shown, dismissed, auto-hide (screen logic)
  tokens    width 340, bg bg, border, shadow pop, radius lg
  a11y      region named "Meeting: <title>"; Start notes and Dismiss are buttons; the kind is also written as text, the edge is extra
  used on   S20 (separate always-on-top window)
  code      notes.tsx MeetingToast

Banner
  variants  warning (warning-soft bg), error, info, success
  states    shown, dismissible, with action
  tokens    radius md, sm text fg, tone icon in tone colour
  a11y      warning and error are role alert, others role status; icon per tone
  used on   S07 trouble transcribing, S09 failed, S15 read-only / request access
  code      base.tsx Banner

Avatar
  variants  person (round), company or workspace (square)
  states    image, initials fallback
  tokens    bg surface-2, text fg, initials 40% of size
  a11y      img alt is the name; fallback is role img with the name
  sources   no paid enrichment: initials, or a favicon by email domain for companies
  used on   S05, S14, S16-S18
  code      notes.tsx Avatar

Command palette
  states    empty query (all), results, no results ("Nothing matches …")
  tokens    width 560, top 15vh, input 44 high, active option accent-soft
  a11y      Radix Dialog (focus trap, Escape); combobox with aria-activedescendant into a listbox; arrows move, Enter picks and closes
  used on   S19 (Cmd/Ctrl+K)
  code      notes.tsx CommandPalette

Modal
  variants  confirm, typed confirm (danger), form
  states    open, submitting (primary button loading), error (inline under the field)
  tokens    width 440, radius lg, shadow pop, scrim black 30%
  a11y      Radix Dialog: title and description, focus trap, Escape closes, focus returns to the trigger
  typed     danger button stays disabled until the exact word is typed; field resets when closed
  used on   S12, S13, S22, S28, S30, S31
  code      base.tsx Modal, notes.tsx TypedConfirm

Dropdown menu (three dots)
  states    open, item highlighted, item disabled, danger item
  a11y      Radix DropdownMenu: arrow keys, Escape, type-ahead
  used on   S05 rows, S09 header, S38
  code      base.tsx Menu

Empty state
  variants  no meetings, no notes, empty folder, no people, no recipes
  tokens    dashed border, icon muted, title base/600, body sm muted
  a11y      plain text; the action is a real button
  used on   S05, S11, S16, S17, S23
  code      base.tsx EmptyState

Loading
  variants  skeleton rows
  a11y      role status, aria-busy, label "Loading"
  code      base.tsx SkeletonRows

Integration card
  variants  chat tool, docs tool, CRM, webhook, local MCP, API key
  states    not connected (Connect), connected (success text + Manage), error (danger text + Reconnect)
  tokens    radius lg, border, icon tile surface-2
  a11y      status as text with icon; error is role alert
  rule      neutral icons only; third-party logos only where their brand guidelines allow it
  used on   S32, S38
  code      notes.tsx IntegrationCard

Share popover, role select, folder share settings
  status    milestone 3 (self-hosted sync). Spec only, not built.
  build     Radix Popover holding: email TextInput + role SelectMenu + Button "Invite"; link access SelectMenu; people list of Avatar + name + role SelectMenu
  states    private, shared, external invitee defaults to Viewer, owner row role select disabled
  used on   S14, S24, S30
