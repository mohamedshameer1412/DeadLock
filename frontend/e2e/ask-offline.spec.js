// @ts-check
// Ask as a chat, with NO model available (the E2E backend has none): honest replies, nothing invented.
const path = require("path");
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

test.skip(!!process.env.E2E_REAL_MODEL, "this spec needs the model to be off");

test("ask chat without a model: not-answered, closest passages, delete, a11y, no overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/register");
  await page.getByLabel("Username").fill("askoff" + Date.now().toString().slice(-6));
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByLabel("Repeat password").fill("correct horse battery");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("button", { name: "New subject" }).first().click();
  await page.getByLabel("Name").fill("Data Structures");
  await page.getByRole("button", { name: "Create subject" }).click();
  await page.locator("#main").getByRole("link", { name: "Data Structures" }).click();

  // no material yet
  await page.locator("nav[aria-label='Subject sections']:visible").getByRole("link", { name: "Ask" }).click();
  await expect(page.getByText("Upload some material first")).toBeVisible();

  await page.locator("nav[aria-label='Subject sections']:visible").getByRole("link", { name: "Materials" }).click();
  await page.locator("#file-input").setInputFiles(path.join(__dirname, "fixtures", "ds.txt"));
  await expect(page.getByText(/Added .ds./)).toBeVisible();
  await page.locator("nav[aria-label='Subject sections']:visible").getByRole("link", { name: "Ask" }).click();
  await expect(page.getByText("I answer only from your uploaded materials")).toBeVisible();

  await page.getByLabel("Your question").fill("hi");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("Type your question first.")).toBeVisible();

  // Enter sends; the reply appears in the same conversation
  await page.getByLabel("Your question").fill("what is photosynthesis in plants");
  await page.getByLabel("Your question").press("Enter");
  await expect(page.getByText("Not answered: nothing was guessed")).toBeVisible();
  await page.getByLabel("Your question").fill("how does the enqueue operation work in a queue");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("No model: matching passages only")).toBeVisible();
  await expect(page.getByText("adds an element at the rear", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("what is photosynthesis in plants")).toBeVisible();

  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.html?.slice(0, 90)}`)).toEqual([]);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `no horizontal scroll at ${width}px` }).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // the full-view page of one answer
  await page.getByRole("listitem").filter({ hasText: "how does the enqueue operation work" }).getByRole("link", { name: "Open full view" }).click();
  await expect(page).toHaveURL(/\/ask\/\d+$/);
  await expect(page.getByRole("heading", { name: "Passages that match" })).toBeVisible();
  await page.getByRole("link", { name: "Ask", exact: true }).first().click();

  const turn = page.getByRole("listitem").filter({ hasText: "what is photosynthesis in plants" });
  await turn.getByRole("button", { name: "Delete this question" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("what is photosynthesis in plants")).toHaveCount(0);
});
