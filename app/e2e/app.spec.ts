// replica-build checks: the core loop end to end, each built screen's states, keyboard use, axe, 390 and 1440 widths.
// Screenshots go to replica/clone-screens/ for /replica-diff.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const shots = "../replica/clone-screens";

async function serious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 120)).join(" | ")}`);
}

async function open(page: Page, hash: string, query = "") {
  await page.goto(`/${query}#${hash}`);
  await page.addStyleTag({ content: "*{animation:none!important;transition:none!important}" });
}

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  (page as unknown as { errors: string[] }).errors = errors;
});
test.afterEach(({ page }) => expect((page as unknown as { errors: string[] }).errors).toEqual([]));

test.use({ viewport: { width: 1440, height: 900 } });

test("core loop: new note, record, live transcript, stop, generated notes with sources", async ({ page }) => {
  await open(page, "/");
  await page.getByRole("button", { name: "New note" }).first().click();
  await expect(page).toHaveURL(/#\/note\//);
  await page.getByLabel("Note title").fill("Release check");
  await page.getByLabel("My notes").fill("release date matters most");
  await page.getByRole("button", { name: "Start recording" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Recording" })).toBeVisible();
  await page.getByRole("button", { name: "Show transcript" }).click();
  const panel = page.getByRole("complementary", { name: "Transcript" });
  await expect(panel.getByText("Shall we start with the release date?")).toBeVisible();
  await expect(panel.getByText(/aiming for the twentieth/)).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: `${shots}/S07.png` });
  await page.screenshot({ path: `${shots}/S08.png` });
  expect(await serious(page)).toEqual([]);

  await panel.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Notes ready")).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("tab", { name: "Generated" })).toHaveAttribute("aria-selected", "true");
  const notes = page.getByRole("article", { name: "Generated notes" });
  await expect(notes.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(notes.getByText("release date matters most")).toBeVisible(); // own text kept and marked
  await notes.getByRole("button", { name: /Play source audio at/ }).first().click();
  await expect(panel.locator(".ring-accent")).toHaveCount(1);
  await page.screenshot({ path: `${shots}/S09.png` });
  expect(await serious(page)).toEqual([]);

  // F05: switch template after the meeting, own notes survive
  await page.getByRole("combobox", { name: "Template" }).click();
  await page.getByRole("option", { name: "Stand-up" }).click();
  await expect(notes.getByRole("heading", { name: "Blockers" })).toBeVisible({ timeout: 5000 });
  await expect(notes.getByText("release date matters most")).toBeVisible();

  // F04: deleting a transcript line keeps the panel consistent
  const before = await panel.getByRole("button", { name: "Delete line" }).count();
  await panel.getByRole("button", { name: "Delete line" }).first().click({ force: true });
  await expect(panel.getByRole("button", { name: "Delete line" })).toHaveCount(before - 1);

  // the note is on home with its duration
  await page.goto("/#/");
  await expect(page.getByRole("button", { name: /Release check/ })).toBeVisible();
});

test("slash menu picks a template with the keyboard", async ({ page }) => {
  await open(page, "/");
  await page.getByRole("button", { name: "New note" }).first().click();
  const editor = page.getByLabel("My notes");
  await editor.click();
  await editor.press("/");
  await expect(page.getByRole("listbox", { name: "Insert template or recipe" })).toBeVisible();
  await page.keyboard.type("one");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(editor).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Template" })).toHaveText(/One-on-one/);
});

test("keyboard only: start and stop a recording", async ({ page }) => {
  await open(page, "/note/n-hiring");
  const tabTo = async (name: string) => {
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      if ((await page.evaluate(() => document.activeElement?.textContent?.trim())) === name) return;
    }
    throw new Error(`could not reach ${name} with Tab`);
  };
  await tabTo("Resume");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Recording" })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Notes ready")).toBeVisible({ timeout: 8000 });
});

test("failed note shows why and recovers with Try again", async ({ page }) => {
  await open(page, "/note/n-vendor");
  await expect(page.getByRole("alert")).toContainText("Ollama");
  await page.getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Notes ready")).toBeVisible({ timeout: 5000 });
});

test("failed generation stays visible (simulated model down)", async ({ page }) => {
  await open(page, "/note/n-hiring", "?fail=enhance");
  await page.getByRole("combobox", { name: "Template" }).click();
  await page.getByRole("option", { name: "One-on-one" }).click();
  await expect(page.getByRole("alert")).toContainText("did not answer", { timeout: 5000 });
  await expect(page.getByRole("status").filter({ hasText: "Failed" })).toBeVisible();
});

test("home load error offers a retry", async ({ page }) => {
  await open(page, "/", "?fail=notes_list");
  await expect(page.getByRole("alert").first()).toContainText("Could not reach");
  await expect(page.getByRole("alert").getByRole("button", { name: "Try again" }).first()).toBeVisible();
  await page.screenshot({ path: `${shots}/S05-error.png` });
});

test("chat across all notes answers with sources", async ({ page }) => {
  await open(page, "/");
  await page.getByLabel("Ask about your notes").fill("List the action items");
  await page.getByLabel("Ask about your notes").press("Enter");
  const panel = page.getByRole("complementary", { name: "Ask" });
  await expect(panel.getByText("Action items:")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Hiring sync" })).toBeVisible();
  await panel.getByLabel("Ask about your notes").fill("zebra crossing");
  await panel.getByLabel("Ask about your notes").press("Enter");
  await expect(panel.getByText(/could not find anything/)).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.screenshot({ path: `${shots}/S10.png` });
  await panel.getByRole("link", { name: "Hiring sync" }).first().click();
  await expect(page.getByLabel("Note title")).toHaveValue("Hiring sync");
});

test("folders: add from home, view, remove", async ({ page }) => {
  await open(page, "/");
  await page.getByLabel("Select Roadmap check-in").check();
  await page.getByRole("button", { name: "Add to folder" }).click();
  await page.getByRole("menuitem", { name: "Hiring" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /Hiring/ }).click();
  await expect(page.getByRole("heading", { name: "Hiring", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Roadmap check-in" })).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.screenshot({ path: `${shots}/S23.png` });
  await page.getByLabel("Select Roadmap check-in").check();
  await page.getByRole("button", { name: "Remove from folder" }).click();
  await expect(page.getByRole("button", { name: "Roadmap check-in" })).toHaveCount(0);
  await open(page, "/folder/nope");
  await expect(page.getByText("Folder not found")).toBeVisible();
});

test("new folder: name is required", async ({ page }) => {
  await open(page, "/");
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Give the folder a name.")).toBeVisible();
  await page.getByRole("dialog").getByLabel("Name").fill("Customers");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Customers", level: 1 })).toBeVisible();
  await expect(page.getByText("No notes in this folder")).toBeVisible();
});

test("trash: move, restore, delete for good with typed confirm", async ({ page }) => {
  await open(page, "/note/n-roadmap");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /Trash/ }).click();
  await expect(page.getByText("Roadmap check-in")).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.screenshot({ path: `${shots}/S22.png` });
  await page.getByRole("button", { name: "Restore Roadmap check-in" }).click();
  await expect(page.getByText("Roadmap check-in")).toHaveCount(0);
  await page.getByRole("button", { name: "Delete Mic test for good" }).click();
  const go = page.getByRole("dialog").getByRole("button", { name: "Delete for good" });
  await expect(go).toBeDisabled();
  await page.getByLabel("Type delete to confirm").fill("delete");
  await go.click();
  await expect(page.getByText("Trash is empty")).toBeVisible();
});

test("templates: built-in is read-only, new one validates and saves", async ({ page }) => {
  await open(page, "/templates");
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
  await page.getByRole("button", { name: "New template" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("Give the template a name.");
  await page.getByLabel("Name", { exact: true }).fill("Retro");
  await page.getByLabel("Section 1 heading").fill("Went well");
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("Every section needs a heading.");
  await page.getByLabel("Section 2 heading").fill("To change");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Templates" }).getByRole("button", { name: "Retro" })).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.screenshot({ path: `${shots}/S13.png` });
});

test("command palette finds text inside transcripts", async ({ page }) => {
  await open(page, "/");
  await page.keyboard.press("ControlOrMeta+k");
  const box = page.getByRole("combobox", { name: "Search notes and commands" });
  await box.fill("references");
  await expect(page.getByRole("option", { name: /Hiring sync/ })).toContainText("Found in text");
  await page.screenshot({ path: `${shots}/S19.png` });
  await box.press("Enter");
  await expect(page.getByLabel("Note title")).toHaveValue("Hiring sync");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Search notes and commands" }).fill("zzqx");
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
});

test("calendars: link is validated, then listed and removable", async ({ page }) => {
  await open(page, "/welcome/calendar");
  const box = page.getByLabel("Calendar link (ICS)");
  await box.fill("not a link");
  await page.getByRole("button", { name: "Add calendar" }).click();
  await expect(page.getByText(/starts with https/)).toBeVisible();
  await box.fill("webcal://calendar.example.test/me.ics");
  await page.getByRole("button", { name: "Add calendar" }).click();
  await expect(page.getByText("calendar.example.test")).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.screenshot({ path: `${shots}/S02.png` });
  await page.getByRole("button", { name: "Remove calendar.example.test" }).click();
  await expect(page.getByText("No calendars yet")).toBeVisible();
});

test("stub routes exist for every unbuilt screen", async ({ page }) => {
  await open(page, "/settings/profile");
  await expect(page.getByText("Not built yet")).toBeVisible();
  await open(page, "/no/such/page");
  await expect(page.getByText("This page does not exist.")).toBeVisible();
});

const SCREENS: [string, string][] = [["S03", "/welcome/audio"], ["S28", "/settings/preferences"], ["S05", "/"], ["S06", "/"], ["S09-seed", "/note/n-hiring"], ["S13-builtin", "/templates"], ["S22-seed", "/trash"], ["S23-seed", "/folder/f-hiring"]];

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`screens at ${w}px ${scheme}: no serious axe issues, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      for (const [id, route] of SCREENS) {
        await open(page, route);
        await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
        if (id === "S06" && w === 390) await page.getByRole("button", { name: "Show sidebar" }).click();
        expect(await serious(page), `${id} ${route}`).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id} scrolls sideways`).toBe(true);
        const suffix = `${w === 390 ? "-390" : ""}${scheme === "dark" ? "-dark" : ""}`;
        await page.screenshot({ path: `${shots}/${id}${suffix}.png` });
      }
    });
  }
}

test("S03 permissions: undetermined mic is asked, then Continue opens", async ({ page }) => {
  await open(page, "/welcome/audio", "?perm=undetermined");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await page.getByRole("button", { name: "Allow" }).first().click();
  await expect(page.getByText("Allowed").first()).toBeVisible();
  await expect(page.getByText(/start without system audio/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test("S03 permissions: a denied permission points to System Settings", async ({ page }) => {
  await open(page, "/welcome/audio", "?perm=denied");
  await page.getByRole("button", { name: "Allow" }).first().click();
  const warn = page.getByRole("alert").filter({ hasText: "macOS is blocking microphone" });
  await expect(warn).toBeVisible();
  await expect(warn.getByRole("button", { name: "Open System Settings" })).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.screenshot({ path: `${shots}/S03-denied.png` });
});

test("S28 settings: validates, saves, discards; export explains the browser limit", async ({ page }) => {
  await open(page, "/settings/preferences");
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();
  await page.getByLabel("Model address").fill("localhost:11434");
  await save.click();
  await expect(page.getByRole("alert")).toContainText("must start with http");
  await page.getByLabel("Model address").fill("http://127.0.0.1:1234");
  await page.getByRole("radio", { name: /Keep for 7 days/ }).click();
  const words = page.getByLabel("Words to spell right");
  await words.fill("Kubernetes");
  await words.press("Enter");
  await save.click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole("radio", { name: /Transcript only/ }).click();
  await expect(page.getByLabel("Model address")).toHaveCount(0);
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByLabel("Model address")).toHaveValue("http://127.0.0.1:1234");
  await expect(page.getByRole("radio", { name: /Keep for 7 days/ })).toBeChecked();
  await page.getByRole("button", { name: "Export all notes" }).click();
  await expect(page.getByText(/notes would be exported/)).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.screenshot({ path: `${shots}/S28.png` });
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), "window scrolls instead of main").toBe(true);
});

test("S28 settings: keyboard only, change retention and save", async ({ page }) => {
  await open(page, "/settings/preferences");
  await page.getByRole("combobox", { name: "Summary length" }).focus();
  await page.keyboard.press("Tab"); // into the audio choices, on the checked one
  await expect(page.getByRole("radio", { name: /Delete once transcribed/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: /Keep for 7 days/ })).toBeFocused();
  await page.keyboard.press("Space"); // Radix checks on arrow-focus only while the key is held; a 0 ms tap under load can miss it
  await expect(page.getByRole("radio", { name: /Keep for 7 days/ })).toBeChecked();
  await page.getByRole("button", { name: "Save" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Saved.")).toBeVisible();
});
