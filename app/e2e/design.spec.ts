import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const shots = "../replica/design/screens";

async function seriousA11y(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 100)).join(" | ")}`);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  (page as any).__errors = errors;
  await page.goto("/#/design");
  await page.addStyleTag({ content: "*{animation:none!important}" });
});
test.afterEach(({ page }) => expect((page as any).__errors).toEqual([]));

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: no serious axe issues, screenshot`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await seriousA11y(page)).toEqual([]);
    await page.screenshot({ path: `${shots}/design-${scheme}.png`, fullPage: true });
  });
}

test("command palette: type, arrow, enter closes", async ({ page }) => {
  await page.getByRole("button", { name: /Search/ }).click();
  const box = page.getByRole("combobox", { name: "Search notes and commands" });
  await expect(box).toBeFocused();
  await box.fill("call");
  await expect(page.getByRole("option")).toHaveCount(1);
  await box.fill("zzzz");
  await expect(page.getByText("Nothing matches")).toBeVisible();
  await box.fill("");
  await box.press("ArrowDown");
  await expect(page.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  expect(await seriousA11y(page)).toEqual([]);
  await page.screenshot({ path: `${shots}/palette.png` });
  await box.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("tag input: enter adds, duplicates ignored, backspace removes", async ({ page }) => {
  const input = page.getByLabel("Words to spell right");
  await input.fill("Whisper");
  await input.press("Enter");
  await input.fill("whisper");
  await input.press("Enter");
  await expect(page.getByText("4/30", { exact: true })).toBeVisible();
  await input.press("Backspace");
  await expect(page.getByText("3/30", { exact: true })).toBeVisible();
});

test("typed confirm: danger button locked until the word is typed", async ({ page }) => {
  await page.getByRole("button", { name: "Typed confirm" }).click();
  const go = page.getByRole("dialog").getByRole("button", { name: "Delete forever" });
  await expect(go).toBeDisabled();
  await page.getByLabel("Type delete to confirm").fill("delete");
  await expect(go).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
