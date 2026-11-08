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
  await expect(page.getByRole("textbox", { name: "My notes" })).toHaveValue("Grüße 👋");
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
  await expect(page.getByRole("textbox", { name: "My notes" })).toHaveValue("typed just before leaving");
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
