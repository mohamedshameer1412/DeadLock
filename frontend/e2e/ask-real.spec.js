// @ts-check
// Run with a REAL local model:  E2E_REAL_MODEL=1 npx playwright test ask-real   (needs Ollama with the configured model pulled)
const path = require("path");
const fs = require("fs");
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

test.skip(!process.env.E2E_REAL_MODEL, "needs E2E_REAL_MODEL=1 and a running local model");
test.setTimeout(420_000);

const norm = (t) => t.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

test("a real model answers from the uploaded file: every quote on screen is in the file", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/register");
  await page.getByLabel("Username").fill("reala");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByLabel("Repeat password").fill("correct horse battery");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("button", { name: "New subject" }).first().click();
  await page.getByLabel("Name").fill("Data Structures");
  await page.getByRole("button", { name: "Create subject" }).click();
  await page.locator("#main").getByRole("link", { name: "Data Structures" }).click();
  await page.locator("#file-input").setInputFiles(path.join(__dirname, "fixtures", "ds.txt"));
  await expect(page.getByText(/Added “ds”/)).toBeVisible();

  await page.getByRole("navigation", { name: "Subject sections" }).first().getByRole("link", { name: "Ask" }).click();
  await page.getByLabel("Your question").fill("What does the pop operation do on a stack?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("Reading your materials").first()).toBeVisible();
  await expect(page.getByText("Answered from your materials")).toBeVisible({ timeout: 360_000 });

  const source = norm(fs.readFileSync(path.join(__dirname, "fixtures", "ds.txt"), "utf8"));
  const quotes = await page.locator("blockquote").allTextContents();
  expect(quotes.length).toBeGreaterThan(0);
  for (const q of quotes) expect(source, `quote not in the uploaded file: ${q}`).toContain(norm(q));

  await page.getByRole("button", { name: "Show source 1" }).first().click();
  await expect(page.locator("[id^='src-'][id$='-1']")).toBeFocused();
  await expect(page.getByText("These exact words were found in your material.").first()).toBeVisible();
  await page.getByRole("button", { name: "This helped" }).click();
  await expect(page.getByText("Thanks, noted")).toBeVisible();

  await page.getByRole("link", { name: "Open full view" }).first().click();
  await expect(page.getByRole("heading", { name: "Answer", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sources and evidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verification" })).toBeVisible();
  await expect(page.getByText("You marked this “helpful”.")).toBeVisible();
  await page.locator("summary", { hasText: "How this was produced" }).click();
  await expect(page.getByText("Checked every quote against the passages")).toBeVisible();

  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `no horizontal scroll at ${width}px` }).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(__dirname, "..", "e2e-screenshots", "answer-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: path.join(__dirname, "..", "e2e-screenshots", "answer-360.png"), fullPage: true });
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact || "")).map((v) => `${v.id}: ${v.nodes[0]?.html?.slice(0, 80)}`)).toEqual([]);
});
