// replica-test edge and negative cases (replica/test-plan.md). Case IDs in each test name.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function open(page: Page, hash: string, query = "") {
  await page.goto(`/${query}#${hash}`);
  await page.addStyleTag({ content: "*{animation:none!important;transition:none!important}" });
}

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));
  (page as unknown as { errors: string[] }).errors = errors;
});
test.afterEach(({ page }) => expect((page as unknown as { errors: string[] }).errors).toEqual([]));
test.use({ viewport: { width: 1440, height: 900 } });

const newNote = async (page: Page) => {
  await page.getByRole("button", { name: "New note" }).first().click();
  await expect(page).toHaveURL(/#\/note\//);
};

test("F03-E1 double click on New note makes one note", async ({ page }) => {
  await open(page, "/");
  const rows = page.getByRole("button", { name: /Untitled note/ });
  const before = await rows.count();
  await page.getByRole("button", { name: "New note" }).first().dblclick();
  await expect(page).toHaveURL(/#\/note\//);
  await page.goto("/#/");
  await expect(rows).toHaveCount(before + 1);
});

test("F03-E2 emoji, accents and a 250-char title are kept, clipped at 200", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  const t = "Café ✨ Überprüfung — 会议 ".padEnd(250, "x");
  await page.getByLabel("Note title").fill(t);
  await expect(page.getByLabel("Note title")).toHaveValue(t.slice(0, 200));
  await page.getByRole("textbox", { name: "My notes" }).fill("Grüße 👋");
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByLabel("Note title")).toHaveValue(t.slice(0, 200));
  await expect(page.getByRole("textbox", { name: "My notes" })).toHaveText("Grüße 👋");
});

test("F03-E3 title typed then back button right away is saved", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await page.getByLabel("Note title").fill("Quick back");
  await page.goBack();
  await expect(page.getByRole("button", { name: /Quick back/ })).toBeVisible();
});

test("F03-E4 own notes typed then back button right away are saved", async ({ page }) => {
  await open(page, "/");
  await page.getByRole("button", { name: /Hiring sync/ }).click(); // in-app history, so Back stays in the app
  await page.getByRole("tab", { name: "My notes" }).click();
  await page.getByRole("textbox", { name: "My notes" }).fill("typed just before leaving");
  await page.goBack();
  await open(page, "/note/n-hiring");
  await page.getByRole("tab", { name: "My notes" }).click();
  await expect(page.getByRole("textbox", { name: "My notes" })).toHaveText("typed just before leaving");
});

test("F02-E1 back button mid-recording keeps recording, home shows it", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await page.getByLabel("Note title").fill("Still going");
  await page.getByRole("button", { name: "Start recording" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Recording" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("region", { name: "Today" }).getByRole("status").filter({ hasText: "Recording" })).toBeVisible();
  await page.getByRole("button", { name: /Still going/ }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
});

test("F02-E2 refresh mid-recording finishes the note from what was saved", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await page.getByRole("button", { name: "Start recording" }).first().click();
  await page.getByRole("button", { name: "Show transcript" }).click();
  await expect(page.getByRole("complementary", { name: "Transcript" }).getByText(/release date/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Notes ready")).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("article", { name: "Generated notes" })).toBeVisible();
});

test("F14-N1 trashing a selection that includes a live recording trashes nothing", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await page.getByLabel("Note title").fill("Live one");
  await page.getByRole("button", { name: "Start recording" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Recording" })).toBeVisible();
  await page.goto("/#/");
  await page.getByLabel("Select Live one").check();
  await page.getByLabel("Select Roadmap check-in").check();
  await page.getByRole("toolbar", { name: "Selected notes" }).getByRole("button", { name: "Move to trash" }).click();
  await expect(page.getByRole("alert")).toContainText("Stop recording");
  await page.waitForTimeout(2000); // let a transcript tick commit
  await expect(page.getByRole("button", { name: "Roadmap check-in" })).toBeVisible();
  await page.goto("/#/trash");
  await expect(page.getByText("Roadmap check-in")).toHaveCount(0);
});

test("F14-N2 a trashed note opened by link cannot record; unknown id shows a way back", async ({ page }) => {
  await open(page, "/note/n-roadmap");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await open(page, "/note/n-roadmap");
  await page.getByRole("button", { name: "Resume" }).first().click();
  await expect(page.getByRole("alert")).toContainText("Restore this note");
  await open(page, "/note/does-not-exist");
  await expect(page.getByText("Could not open this note")).toBeVisible();
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test("F04-E1 a deleted transcript line is gone from regenerated notes and copied transcript", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "/note/n-hiring");
  await page.getByRole("button", { name: "Show transcript" }).click();
  const panel = page.getByRole("complementary", { name: "Transcript" });
  const line = (await panel.locator("[id^=seg-]").first().innerText()).split("\n").pop()!;
  await panel.getByRole("button", { name: "Delete line" }).first().click({ force: true });
  await expect(panel.getByText(line, { exact: false })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Template" }).click();
  await page.getByRole("option", { name: "One-on-one" }).click();
  await expect(page.getByText("Notes ready")).toBeVisible({ timeout: 5000 });
  await panel.getByRole("button", { name: "Copy all" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain(line);
});

test("F04-E2 Transcribe again while busy does not run twice", async ({ page }) => {
  await open(page, "/note/n-hiring");
  await page.getByRole("button", { name: "Show transcript" }).click();
  const panel = page.getByRole("complementary", { name: "Transcript" });
  await panel.getByRole("button", { name: "Transcribe again" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Transcribing/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Transcribe again" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Resume" })).toBeDisabled();
});

test("F06-E1 chat: empty question does nothing, Stop ends a streaming answer", async ({ page }) => {
  await open(page, "/note/n-hiring");
  const bar = page.getByLabel("Ask about your notes");
  await bar.press("Enter");
  await expect(page.getByRole("complementary", { name: "Ask" })).toHaveCount(0);
  await bar.fill("Draft a follow-up email");
  await bar.press("Enter");
  const panel = page.getByRole("complementary", { name: "Ask" });
  await panel.getByRole("button", { name: /Stop/ }).click();
  await expect(panel.getByRole("button", { name: /Stop/ })).toHaveCount(0);
  const text = await panel.locator(".whitespace-pre-wrap").last().innerText();
  expect(text).not.toContain("Best"); // cut off before the end
});

test("F07-E1 chat ignores trashed notes", async ({ page }) => {
  await open(page, "/note/n-hiring");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await page.getByLabel("Ask about your notes").fill("List the action items");
  await page.getByLabel("Ask about your notes").press("Enter");
  const panel = page.getByRole("complementary", { name: "Ask" });
  await expect(panel.getByText(/Action items|no action items/)).toBeVisible();
  await expect(panel.getByRole("link", { name: "Hiring sync" })).toHaveCount(0);
});

test("F13-E1 palette search: accents match, trashed notes do not", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await page.getByLabel("Note title").fill("Réunion café");
  await page.getByLabel("Note title").blur();
  await page.keyboard.press("ControlOrMeta+k");
  const box = page.getByRole("combobox", { name: "Search notes and commands" });
  await box.fill("CAFÉ");
  await expect(page.getByRole("option", { name: /Réunion café/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Search notes and commands" }).fill("réunion");
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
});

test("F09-E1 one note in two folders", async ({ page }) => {
  await open(page, "/");
  await page.getByLabel("Select Roadmap check-in").check();
  await page.getByRole("button", { name: "Add to folder" }).click();
  await page.getByRole("menuitem", { name: "Hiring" }).click();
  await expect(page.getByRole("toolbar", { name: "Selected notes" })).toHaveCount(0);
  await page.getByLabel("Select Roadmap check-in").check();
  await page.getByRole("button", { name: "Add to folder" }).click();
  await page.getByRole("menuitem", { name: "Product" }).click();
  await open(page, "/folder/f-hiring");
  await expect(page.getByRole("button", { name: "Roadmap check-in" })).toBeVisible();
  await open(page, "/folder/f-product");
  await expect(page.getByRole("button", { name: "Roadmap check-in" })).toBeVisible();
});

test("F09-N1 folder name over 40 characters is refused", async ({ page }) => {
  await open(page, "/");
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("x".repeat(41));
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toContainText(/40 characters/);
});

test("X-E1 390px keyboard only: palette, new note, type; no axe issues, no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("New note");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/note\//);
  await page.getByLabel("Note title").focus();
  await page.keyboard.type("Phone note");
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

/* S03 permissions, S28 settings, export (build 797c5af) */

test("S28-E1 unsaved settings are not lost silently when leaving", async ({ page }) => {
  await open(page, "/settings/preferences");
  await page.getByRole("radio", { name: /Keep for 30 days/ }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Home" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("radio", { name: /Keep for 30 days/ })).toBeChecked();
});

test("S28-E2 Transcript only saves even if the hidden Groq model name was left empty", async ({ page }) => {
  await open(page, "/settings/preferences");
  await page.getByRole("radio", { name: /Groq/ }).click();
  await page.getByLabel("Groq model").fill("");
  await page.getByRole("radio", { name: /Transcript only/ }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("S28-E3 a 201-character model name gets a message about length", async ({ page }) => {
  await open(page, "/settings/preferences");
  await page.getByRole("radio", { name: /Groq/ }).click();
  await page.getByLabel("Groq model").fill("m".repeat(201));
  await expect(page.getByRole("alert")).toContainText(/too long|characters/);
});

test("S28-E4 word list: duplicates ignored, stops at 30", async ({ page }) => {
  await open(page, "/settings/preferences");
  const box = page.getByLabel("Words to spell right");
  for (const w of ["Kafka", "kafka", ...Array.from({ length: 29 }, (_, i) => `w${i}`)]) { await box.fill(w); await box.press("Enter"); }
  await expect(page.getByText("30/30")).toBeVisible();
  await expect(box).toBeDisabled();
  await expect(page.getByRole("button", { name: /Remove kafka/i })).toHaveCount(1);
});

test("S28-N1 settings that cannot load offer a retry", async ({ page }) => {
  await open(page, "/settings/preferences", "?fail=settings_get");
  await expect(page.getByRole("alert").first()).toContainText("could not finish that");
  await expect(page.getByRole("button", { name: "Try again" }).first()).toBeVisible();
});

test("S28-N2 a failed save keeps the edits and says why", async ({ page }) => {
  await open(page, "/settings/preferences", "?fail=settings_update");
  await page.getByRole("radio", { name: /Keep for 7 days/ }).click();
  await expect(page.getByRole("alert")).toContainText("could not finish that");
  await expect(page.getByRole("radio", { name: /Keep for 7 days/ })).toBeChecked();
});

test("S28-N3 a failed export says why", async ({ page }) => {
  await open(page, "/settings/preferences", "?fail=notes_export");
  await page.getByRole("button", { name: "Export all notes" }).click();
  await expect(page.getByRole("alert")).toContainText("could not finish that");
});

test("S03-N1 permissions that cannot load offer a retry", async ({ page }) => {
  await open(page, "/welcome/audio", "?fail=permissions_get");
  await expect(page.getByRole("alert").first()).toContainText("could not finish that");
});

test("S03-N2 a failed request shows the reason and keeps Allow", async ({ page }) => {
  await open(page, "/welcome/audio", "?perm=undetermined&fail=permission_request");
  await page.getByRole("button", { name: "Allow" }).first().click();
  await expect(page.getByRole("alert").first()).toContainText("could not finish that");
  await expect(page.getByRole("button", { name: "Allow" }).first()).toBeVisible();
});

test("S03-E1 keyboard only: Tab to Allow, Enter, Continue", async ({ page }) => {
  await open(page, "/welcome/audio", "?perm=undetermined");
  await expect(page.getByRole("button", { name: "Allow" }).first()).toBeVisible();
  for (let i = 0; i < 30 && (await page.evaluate(() => document.activeElement?.textContent)) !== "Allow"; i++) await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Allowed").first()).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/$/);
});

test("S03-E2 Open System Settings in the browser preview does not break the page", async ({ page }) => {
  await open(page, "/welcome/audio", "?perm=denied");
  await page.getByRole("button", { name: "Allow" }).first().click();
  await page.getByRole("button", { name: "Open System Settings" }).first().click();
  await expect(page.getByRole("heading", { name: "Microphone and system audio" })).toBeVisible();
});

test("S28-E5 removing a word does not save the form behind your back", async ({ page }) => {
  await open(page, "/settings/preferences");
  await page.getByRole("radio", { name: /Groq/ }).click();
  await page.getByLabel("Groq model").fill("");
  const box = page.getByLabel("Words to spell right");
  await box.fill("Kafka");
  await box.press("Enter");
  await page.getByRole("button", { name: "Remove Kafka" }).click();
  await expect(page.getByRole("button", { name: "Remove Kafka" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Enter a model name"); // the model name error stays shown, nothing else breaks
});

/* S20 meeting pop-up (build b721afe) */

test("S20-E1 a 60+ character title fits the pop-up and is still readable in full", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 128 });
  await open(page, "/toast/e-quarterly");
  const pop = page.getByRole("region", { name: "Meeting: Quarterly planning with the regional sales and marketing leads" });
  await expect(pop).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(pop.getByRole("button", { name: "Start notes" })).toBeInViewport();
});

test("S20-E2 Dismiss creates no note", async ({ page }) => {
  await open(page, "/toast/e-design");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("button", { name: /Design review/ })).toHaveCount(1); // the meeting row only
});

test("S20-E3 Start notes on a meeting that is already recording keeps one note and one recording", async ({ page }) => {
  await open(page, "/");
  await page.getByRole("button", { name: /Design review/ }).click();
  await page.getByRole("button", { name: "Start recording" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Recording" })).toBeVisible();
  await open(page, "/toast/e-design");
  await page.getByRole("button", { name: "Start notes" }).click();
  await expect(page.getByLabel("Note title")).toHaveValue("Design review");
  await expect(page.getByRole("status").filter({ hasText: "Recording" })).toBeVisible();
  await page.goto("/#/");
  await expect(page.getByRole("button", { name: /Design review/ })).toHaveCount(2);
});

test("S20-N1 recording that cannot start says why and Start notes works again", async ({ page }) => {
  await open(page, "/toast/e-design", "?fail=recording_start");
  await page.getByRole("button", { name: "Start notes" }).click();
  await expect(page.getByRole("alert")).toContainText("could not finish that");
  await expect(page).toHaveURL(/#\/toast\//);
  await expect(page.getByRole("button", { name: "Start notes" })).toBeEnabled();
});

test("S20-E4 a meeting whose old note is in the trash gets a fresh note", async ({ page }) => {
  await open(page, "/");
  await page.getByRole("button", { name: /Design review/ }).click();
  await page.getByLabel("Note title").fill("Old design notes");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await open(page, "/toast/e-design");
  await page.getByRole("button", { name: "Start notes" }).click();
  await expect(page.getByLabel("Note title")).toHaveValue("Design review");
});

test("S20-E5 the card fills the pop-up window, so no square frame shows around rounded corners", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 128 });
  await open(page, "/toast/e-design");
  const card = page.getByRole("region", { name: "Meeting: Design review" });
  const box = (await card.boundingBox())!;
  expect([box.x, box.y, Math.round(box.width)]).toEqual([0, 0, 360]);
  expect(await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("0px");
});

test("S07 own notes: Markdown shortcuts make a list and bold text that survive a reload", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  const editor = page.getByRole("textbox", { name: "My notes" });
  await editor.click();
  await page.keyboard.type("## Agenda");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- budget ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("final");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("Enter");
  await page.keyboard.type("hiring");
  await page.waitForTimeout(600);
  await page.reload();
  await expect(editor.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await expect(editor.getByRole("listitem")).toHaveText(["budget final", "hiring"]);
  await expect(editor.locator("strong")).toHaveText("final");
});

test("S07 own notes saved as plain lines open as separate lines", async ({ page }) => {
  await open(page, "/note/n-hiring");
  await page.getByRole("tab", { name: "My notes" }).click();
  const editor = page.getByRole("textbox", { name: "My notes" });
  await expect(editor).toContainText("backend role: 3 left");
  const box = await editor.boundingBox();
  expect(box!.height).toBeGreaterThan(40); // two lines, not merged into one
  await expect(editor.locator("br, p")).not.toHaveCount(1);
});

// Round 4: own-notes editor (TipTap, stored as Markdown). Copy as Markdown shows what was saved.
const typeNotes = async (page: Page, lines: string[]) => {
  await page.getByRole("textbox", { name: "My notes" }).click();
  for (const [i, l] of lines.entries()) { if (i) await page.keyboard.press("Enter"); await page.keyboard.type(l); }
  await page.waitForTimeout(600);
};
const copied = async (page: Page) => {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Copy as Markdown" }).click();
  let text = "";
  await expect.poll(async () => (text = await page.evaluate(() => navigator.clipboard.readText()))).not.toBe("");
  return text;
};

test("F03-E5 characters Markdown uses come back exactly as typed", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  const line = "3 * 4 = 12, a_b_c, #tag, <b>hi</b>, [x](y), 50% off & 1. 2. 3"; // backticks are a code shortcut on purpose
  await typeNotes(page, [line]);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "My notes" })).toHaveText(line);
});

test("F03-E6 blank lines between notes do not save as &nbsp;", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "/");
  await newNote(page);
  await typeNotes(page, ["first", "", "second"]);
  const md = await copied(page);
  expect(md).toContain("first");
  expect(md).not.toContain("&nbsp;");
});

test("F03-E7 clearing all notes saves empty and shows the hint again", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "/");
  await newNote(page);
  await typeNotes(page, ["temp"]);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(600);
  await page.reload();
  const ed = page.getByRole("textbox", { name: "My notes" });
  await expect(ed).toHaveText("");
  await expect(ed.locator("[data-placeholder]")).toHaveAttribute("data-placeholder", /Type \/ to pick a template/);
});

test("F03-E8 pasted plain text with line breaks keeps its lines", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "/");
  await newNote(page);
  await page.evaluate(() => navigator.clipboard.writeText("one\ntwo\nthree"));
  await page.getByRole("textbox", { name: "My notes" }).click();
  await page.keyboard.press("ControlOrMeta+v");
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "My notes" })).toHaveText(/one\s*two\s*three/);
  expect((await page.getByRole("textbox", { name: "My notes" }).innerText()).split("\n").filter(Boolean)).toEqual(["one", "two", "three"]);
});

test("F03-E9 a typed link does not navigate the app when clicked", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await typeNotes(page, ["see https://example.com now"]);
  const url = page.url();
  await page.getByRole("textbox", { name: "My notes" }).getByRole("link", { name: "https://example.com" }).click();
  await page.waitForTimeout(300);
  expect(page.url()).toBe(url);
  expect(page.context().pages()).toHaveLength(1);
});

test("F03-E10 keyboard only: Tab leaves the editor when not in a list", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await typeNotes(page, ["plain line"]);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).not.toBe("My notes");
  await expect(page.getByRole("textbox", { name: "My notes" })).toHaveText("plain line");
});

test("F03-E11 Tab in a list indents the item instead of leaving", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await typeNotes(page, ["- parent", "child"]);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "My notes" }).locator("li li")).toHaveText("child");
});

test("F05-E1 slash menu: Escape closes it and keeps the slash; slash mid-line does not open it", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  const ed = page.getByRole("textbox", { name: "My notes" });
  await ed.click();
  await page.keyboard.type("/");
  await expect(page.getByRole("listbox", { name: "Insert template or recipe" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(ed).toHaveText("/");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("and/or");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("F05-E2 slash menu inside a list item picks a template and leaves the item", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await typeNotes(page, ["- keep me", "/one"]);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Template" })).toHaveText(/One-on-one/);
  await expect(page.getByRole("textbox", { name: "My notes" }).getByRole("listitem").first()).toHaveText("keep me");
});

test("F05-E3 formatted own notes show in generated notes without Markdown marks", async ({ page }) => {
  await open(page, "/note/n-hiring");
  await page.getByRole("tab", { name: "My notes" }).click();
  const ed = page.getByRole("textbox", { name: "My notes" });
  await ed.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("## Agenda");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("budget");
  await page.waitForTimeout(600);
  await page.getByRole("combobox", { name: "Template" }).click();
  await page.getByRole("option", { name: /Stand-up/ }).click();
  await page.getByRole("tab", { name: "Generated" }).click();
  const gen = page.getByRole("article", { name: "Generated notes" });
  await expect(gen.getByRole("paragraph").filter({ hasText: /^Your note: budget$/ })).toBeVisible({ timeout: 5000 });
  await expect(gen).not.toContainText("**");
  await expect(gen).not.toContainText("##");
});

test("F03-E12 very long notes (2000 lines pasted) save and reopen", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "/");
  await newNote(page);
  await page.evaluate(() => navigator.clipboard.writeText(Array.from({ length: 2000 }, (_, i) => `line ${i + 1}`).join("\n")));
  await page.getByRole("textbox", { name: "My notes" }).click();
  await page.keyboard.press("ControlOrMeta+v");
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "My notes" })).toContainText("line 2000");
});

test("F03-E13 notes typed right before a refresh are saved", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await page.getByRole("textbox", { name: "My notes" }).click();
  await page.keyboard.type("typed then refresh");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "My notes" })).toHaveText("typed then refresh");
});

test("F03-E14 title typed right before a refresh is saved", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await page.getByLabel("Note title").fill("Refresh title");
  await page.reload();
  await expect(page.getByLabel("Note title")).toHaveValue("Refresh title");
});

test("F13-E2 palette search: word starts, any order, no accents needed, own notes say where they matched", async ({ page }) => {
  await open(page, "/");
  await newNote(page);
  await page.getByLabel("Note title").fill("Réunion café");
  await page.getByRole("textbox", { name: "My notes" }).click();
  await page.keyboard.type("- quarterly budget is final");
  await page.waitForTimeout(600);
  await page.keyboard.press("ControlOrMeta+k");
  const box = page.getByRole("combobox", { name: "Search notes and commands" });
  await box.fill("cafe reun");
  await expect(page.getByRole("option", { name: /Réunion café/ })).toBeVisible();
  await box.fill("fin quart");
  await expect(page.getByRole("option", { name: /Réunion café/ })).toContainText("In your notes: quarterly budget is final");
  await box.fill("udget"); // inside a word: not a match, like FTS5
  await expect(page.getByRole("option", { name: /Réunion café/ })).toHaveCount(0);
  await box.fill('"* OR NEAR(');
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
});

test("F13-N1 palette search: a core error shows no results instead of crashing", async ({ page }) => {
  await open(page, "/", "?fail=search_notes");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Search notes and commands" }).fill("hiring");
  await expect(page.getByRole("option", { name: "Go to home" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /Hiring sync/ })).toHaveCount(0);
});

test("S23-E1 folder icon: pick by keyboard, kept after edit, no axe issues in the dialog at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/");
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await page.getByRole("button", { name: "New folder" }).click();
  const dialog = page.getByRole("dialog", { name: "New folder" });
  await dialog.getByLabel("Name").fill("Customer calls ✨ with a long name x");
  await dialog.getByRole("radio", { name: "Folder" }).focus();
  await expect(dialog.getByRole("radio", { name: "Folder" })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("radio", { name: "Team" })).toBeChecked();
  const axe = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../replica/clone-screens/S23-icon-picker-390.png" });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/#\/folder\//);
  await page.getByRole("button", { name: "Folder actions" }).click();
  await page.getByRole("menuitem", { name: "Edit folder" }).click();
  const edit = page.getByRole("dialog", { name: "Edit folder" });
  await expect(edit.getByRole("radio", { name: "Team" })).toBeChecked();
  await edit.getByLabel("Name").fill("Customer calls");
  await edit.getByRole("button", { name: "Save" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Folder actions" }).click();
  await page.getByRole("menuitem", { name: "Edit folder" }).click();
  await expect(page.getByRole("dialog", { name: "Edit folder" }).getByRole("radio", { name: "Team" })).toBeChecked();
});

// Round 5: full-text search (F13) and folder icons (F09 folders).
const palette = async (page: Page) => {
  await page.keyboard.press("ControlOrMeta+k");
  return page.getByRole("combobox", { name: "Search notes and commands" });
};

test("F13-E3 search follows edits: new words found, removed words gone, restored notes back", async ({ page }) => {
  await open(page, "/note/n-roadmap");
  await page.getByRole("tab", { name: "My notes" }).click();
  await page.getByRole("textbox", { name: "My notes" }).click();
  await page.keyboard.type("zebracorn plan");
  await page.waitForTimeout(600);
  let box = await palette(page);
  await box.fill("zebracorn");
  await expect(page.getByRole("option", { name: /Roadmap check-in/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page).toHaveURL(/#\/$/);
  box = await palette(page);
  await box.fill("zebracorn");
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
  await page.keyboard.press("Escape");
  await open(page, "/trash");
  await page.getByRole("button", { name: /Restore/ }).first().click();
  box = await palette(page);
  await box.fill("zebracorn");
  await expect(page.getByRole("option", { name: /Roadmap check-in/ })).toBeVisible();
});

test("F13-E4 deleted transcript lines are not found", async ({ page }) => {
  await open(page, "/note/n-hiring");
  await page.getByRole("button", { name: "Show transcript" }).click();
  const panel = page.getByRole("complementary", { name: "Transcript" });
  const line = panel.getByText(/check references/);
  await line.hover();
  await panel.getByRole("button", { name: /Delete/ }).first().click();
  await page.getByRole("button", { name: "Hide transcript" }).click();
  const box = await palette(page);
  await box.fill("references");
  // generated notes still quote it until they are regenerated, so it may match there, never in the transcript
  await expect(page.getByRole("option", { name: /Hiring sync/ })).not.toContainText("In transcript");
});

test("F13-E5 keyboard only: arrow to a text match, Enter opens the note", async ({ page }) => {
  await open(page, "/");
  const box = await palette(page);
  await box.fill("references");
  await expect(page.getByRole("option", { name: /Hiring sync/ })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/note\/n-hiring/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("F13-E6 390px: long snippets stay on one line, no sideways scroll, no axe issues", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/");
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await page.getByRole("button", { name: /Search/ }).first().click();
  const box = page.getByRole("combobox", { name: "Search notes and commands" });
  await box.fill("the");
  await expect(page.getByRole("option").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box2 = await page.getByRole("listbox", { name: "Results" }).boundingBox();
  expect(box2!.x + box2!.width).toBeLessThanOrEqual(390);
  const axe = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: "../replica/clone-screens/S19-390.png" });
});

test("F13-E7 emoji, punctuation and a very long query show no results instead of failing", async ({ page }) => {
  await open(page, "/");
  const box = await palette(page);
  for (const q of ["👋", "?!", "-", "x".repeat(600)]) {
    await box.fill(q);
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
  }
});

test("F13-E8 typing fast shows the results for the last query, not an earlier one", async ({ page }) => {
  await open(page, "/");
  const box = await palette(page);
  await box.pressSequentially("references", { delay: 15 });
  await box.press("Backspace");
  await box.pressSequentially("s", { delay: 0 });
  await box.fill("roadmap");
  await expect(page.getByRole("option", { name: /Roadmap check-in/ })).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.getByRole("option", { name: /Hiring sync/ })).toHaveCount(0);
});

test("F09-E1 folder dialog: double click on Save makes one folder", async ({ page }) => {
  await open(page, "/");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /^Hiring/ })).toBeVisible();
  const before = await page.getByRole("navigation", { name: "Main" }).getByRole("button").count();
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Once");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).dblclick();
  await expect(page).toHaveURL(/#\/folder\//);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /^Once/ })).toHaveCount(1);
  expect(await page.getByRole("navigation", { name: "Main" }).getByRole("button").count()).toBe(before + 1);
});

test("F09-E2 folder dialog: Cancel keeps the old icon; Enter in the name saves the chosen icon", async ({ page }) => {
  await open(page, "/folder/f-hiring");
  await page.getByRole("button", { name: "Folder actions" }).click();
  await page.getByRole("menuitem", { name: "Edit folder" }).click();
  let d = page.getByRole("dialog", { name: "Edit folder" });
  await expect(d.getByRole("radio", { name: "Team" })).toBeChecked();
  await d.getByRole("radio", { name: "Ideas" }).check({ force: true });
  await d.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Folder actions" }).click();
  await page.getByRole("menuitem", { name: "Edit folder" }).click();
  d = page.getByRole("dialog", { name: "Edit folder" });
  await expect(d.getByRole("radio", { name: "Team" })).toBeChecked();
  await d.getByRole("radio", { name: "Ideas" }).check({ force: true });
  await d.getByLabel("Name").press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Folder actions" }).click();
  await page.getByRole("menuitem", { name: "Edit folder" }).click();
  await expect(page.getByRole("dialog", { name: "Edit folder" }).getByRole("radio", { name: "Ideas" })).toBeChecked();
});

test("F09-E3 folder name over 40 characters says why and keeps the dialog open", async ({ page }) => {
  await open(page, "/");
  await page.getByRole("button", { name: "New folder" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Name").fill("x".repeat(60));
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeVisible();
  await expect(d.getByText(/40 characters/)).toBeVisible();
});

/* S28 note writing: Apple and Groq (b9e32f7) */

test("S28-E6 at 390px the Groq key and model fields fit without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/settings/preferences");
  await page.getByRole("radio", { name: /Groq/ }).click();
  await expect(page.getByLabel("Groq API key")).toBeVisible();
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth)).toBeLessThanOrEqual(390);
  const save = await page.getByRole("button", { name: "Save key" }).boundingBox();
  expect(save!.x + save!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "../replica/clone-screens/S28-groq-390.png", fullPage: true });
});

test("S28-E7 a Mac that cannot run Apple's model: option disabled, reason shown, Groq still works by keyboard", async ({ page }) => {
  await open(page, "/settings/preferences", "?apple=old_macos");
  await expect(page.getByRole("radio", { name: /Built into your Mac/ })).toBeDisabled();
  await expect(page.getByText("needs macOS 26 or later")).toBeVisible();
  await page.getByRole("radio", { name: /Groq/ }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: /Groq/ })).toBeChecked();
  await page.getByLabel("Groq API key").focus();
  await page.keyboard.type("  gsk_spaces_around  ");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Groq key saved in your Keychain.")).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

test("S28-E8 Remove key brings the key field back and survives leaving the page", async ({ page }) => {
  await open(page, "/settings/preferences");
  await page.getByRole("radio", { name: /Groq/ }).click();
  await page.getByLabel("Groq API key").fill("gsk_one");
  await page.getByRole("button", { name: "Save key" }).click();
  await page.getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByLabel("Groq API key")).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Home" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Groq API key")).toBeVisible();
  await expect(page.getByText("Groq key saved")).toHaveCount(0);
});

/* F02 auto-stop (core checks every 15 s; the fake stops after 2 s) */

test("F02-E9 recording that stops on its own says why, and Resume clears the message", async ({ page }) => {
  await open(page, "/", "?autostop=call_ended");
  await newNote(page);
  await page.getByRole("button", { name: "Start recording" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Recording" })).toBeVisible();
  const why = page.getByText("Recording stopped on its own: the call ended.");
  await expect(why).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(why).toHaveCount(0);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(why).toHaveCount(0); // stopped by hand: no message
});

test("F02-E10 silence auto-stop explains the 15 minutes", async ({ page }) => {
  await open(page, "/", "?autostop=silence");
  await newNote(page);
  await page.getByRole("button", { name: "Start recording" }).first().click();
  await expect(page.getByText(/after 15 minutes without anyone speaking/)).toBeVisible({ timeout: 5000 });
});

test("S20-E6 Esc dismisses the pop-up without a note; Tab reaches Start notes", async ({ page }) => {
  await open(page, "/toast/e-design");
  await page.getByRole("button", { name: "Start notes" }).waitFor();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Start notes" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("button", { name: /Design review/ })).toHaveCount(1);
});
