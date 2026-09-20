// @ts-check
const path = require("path");
const fs = require("fs");
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const fx = (name) => path.join(__dirname, "fixtures", name);
const SHOTS = path.join(__dirname, "..", "e2e-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const PW = "correct horse battery";

test.describe.configure({ mode: "serial" });

/** @type {import('@playwright/test').Page} */
let page;
/** @type {import('@playwright/test').BrowserContext} */
let ctx;
const consoleErrors = [];
let subjectUrl = "";
let docUrl = "";

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" }); // the app honours it; keeps axe from measuring half-faded toasts
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
});
test.afterAll(async () => {
  await ctx.close();
});

async function axe(where) {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.html?.slice(0, 80)}`), `axe on ${where}`).toEqual([]);
}
const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("a signed-out visitor is sent to the login page, and it ships a nonce CSP without unsafe-inline", async () => {
  const response = await page.goto("/subjects");
  await expect(page).toHaveURL(/\/login$/);
  const csp = (await page.request.get("/login")).headers()["content-security-policy"];
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"));
  expect(scriptSrc).toMatch(/'nonce-[^']+'/);
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(response).toBeTruthy();
});

test("register: validation messages, then success lands on the empty subjects page", async () => {
  await page.goto("/register");
  await page.getByLabel("Username").fill("al");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Repeat password").fill("different");
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByText("Use 3 to 32 letters")).toBeVisible();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(page.getByText("The two passwords do not match.")).toBeVisible();
  await axe("register with errors");
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByLabel("Repeat password").fill(PW);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL(/\/subjects$/);
  await expect(page.getByRole("heading", { name: "No subjects yet" })).toBeVisible();
  await axe("empty subjects");
});

test("create a subject in a dialog (duplicate refused), open its workspace", async () => {
  await page.getByRole("button", { name: "New subject" }).first().click();
  await page.getByLabel("Name").fill("Data Structures");
  await page.getByLabel("Description (optional)").fill("Stacks, queues and trees");
  await page.getByRole("button", { name: "Create subject" }).click();
  await expect(page.getByText("Created “Data Structures”")).toBeVisible();
  await expect(page.locator("#main").getByRole("link", { name: "Data Structures" })).toBeVisible();
  await page.getByRole("button", { name: "New subject" }).click();
  await page.getByLabel("Name").fill("data structures");
  await page.getByRole("button", { name: "Create subject" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already have a subject" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("#main").getByRole("link", { name: "Data Structures" }).click();
  await expect(page).toHaveURL(/\/subjects\/\d+\/materials$/);
  subjectUrl = new URL(page.url()).pathname.replace(/\/materials$/, "");
  await expect(page.getByRole("heading", { name: "Data Structures", level: 1 })).toBeVisible();
  for (const tab of ["Materials", "Ask", "Practice", "Quiz", "Progress"]) await expect(page.getByRole("navigation", { name: "Subject sections" }).first().getByRole("link", { name: tab })).toBeVisible();
  await page.goto(`${subjectUrl}/practice`);
  await expect(page.getByText("Upload some material first")).toBeVisible();
  await page.goto(`${subjectUrl}/materials`);
});

test("upload TXT, duplicate, scanned PDF (warning), and a refused .exe", async () => {
  await page.locator("#file-input").setInputFiles(fx("ds.txt"));
  await expect(page.getByText("Added “ds” (3 passages)")).toBeVisible();
  await expect(page.getByRole("link", { name: "ds", exact: true })).toBeVisible();
  await expect(page.getByText("Data Structures › Stacks · 1")).toBeVisible();
  await page.locator("#file-input").setInputFiles(fx("ds.txt"));
  await expect(page.getByText("is already in this subject")).toBeVisible();
  await page.locator("#file-input").setInputFiles(fx("scan.pdf"));
  await expect(page.getByText(/scanned PDF, and OCR is not supported/)).toBeVisible();
  await page.locator("#file-input").setInputFiles(fx("evil.exe"));
  await expect(page.getByRole("alert").filter({ hasText: "Only PDF, Word (.docx) and plain-text files" })).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "materials-1280.png"), fullPage: true });
  await axe("materials");
});

test("hostile file text is shown as text and nothing runs", async () => {
  await page.locator("#file-input").setInputFiles(fx("hostile.txt"));
  await expect(page.getByText("Added “hostile”")).toBeVisible();
  await page.getByRole("link", { name: "hostile", exact: true }).click();
  await expect(page.getByText("<img src=x onerror=", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => /** @type {any} */ (window).__pwned)).toBeUndefined();
  expect(await page.locator("main img, main script").count()).toBe(0);
  await page.goBack();
});

test("search highlights matched words and says so when nothing matches", async () => {
  await page.getByRole("textbox", { name: "Search your materials" }).fill("how does inorder traversal of a binary tree work");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.locator("mark").first()).toBeVisible();
  await expect(page.getByText("Inorder traversal visits the left subtree", { exact: false })).toBeVisible();
  await expect(page.getByText("matched: inorder, traversal, binary, tree", { exact: false })).toBeVisible();
  await page.getByRole("textbox", { name: "Search your materials" }).fill("photosynthesis");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Nothing is guessed")).toBeVisible();
  await page.getByRole("textbox", { name: "Search your materials" }).fill(`<script>window.__pwned=1</script> a" OR "b`);
  await page.getByRole("button", { name: "Search" }).click();
  expect(await page.evaluate(() => /** @type {any} */ (window).__pwned)).toBeUndefined();
});

test("document page lists passages with sections, and removing asks first", async () => {
  await page.getByRole("link", { name: "ds", exact: true }).click();
  await expect(page).toHaveURL(/\/materials\/\d+$/);
  docUrl = new URL(page.url()).pathname;
  await expect(page.getByText("Data Structures › Trees")).toBeVisible();
  await axe("document page");
  await page.getByRole("button", { name: "Remove material" }).click();
  await expect(page.getByRole("dialog")).toContainText("This cannot be undone");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Remove material" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page).toHaveURL(/\/materials$/);
  await expect(page.getByText("Material removed")).toBeVisible();
  await page.locator("#file-input").setInputFiles(fx("ds.txt")); // keep material for the next checks
  await expect(page.getByText("Added “ds” (3 passages)")).toBeVisible();
});

test("account page: consent is off, can be switched on, and is remembered", async () => {
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Account" }).click();
  const box = page.getByRole("checkbox", { name: "Use cloud models first, with this computer as the backup" });
  await expect(box).not.toBeChecked();
  await expect(page.getByText("sent to OpenRouter")).toBeVisible();
  await box.check();
  await expect(page.getByText("Cloud fallback allowed")).toBeVisible();
  await page.reload();
  await expect(box).toBeChecked();
  await box.uncheck();
  await axe("account");
});

test("another user gets the same Not found for alice's subject and document, and sees none of her data", async ({ browser }) => {
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await c2.newPage();
  await p2.goto("/register");
  await p2.getByLabel("Username").fill("bobby");
  await p2.getByLabel("Password", { exact: true }).fill(PW);
  await p2.getByLabel("Repeat password").fill(PW);
  await p2.getByRole("button", { name: "Register" }).click();
  await expect(p2.getByRole("heading", { name: "No subjects yet" })).toBeVisible();
  await p2.goto(`${subjectUrl}/materials`);
  await expect(p2.getByRole("heading", { name: "Not found" })).toBeVisible();
  await p2.goto(docUrl);
  await expect(p2.getByRole("heading", { name: "Not found" })).toBeVisible();
  const api = await p2.request.get(`/api/v1${subjectUrl.replace("/subjects", "/subjects")}/materials`);
  expect(api.status()).toBe(404);
  expect(await p2.content()).not.toContain("Stacks");
  await c2.close();
});

test("responsive: no horizontal scroll at 360, 390, 768 and 1280; bottom tabs on phones, top tabs otherwise", async () => {
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
    for (const url of ["/subjects", `${subjectUrl}/materials`, docUrl, "/account"]) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      expect(await noHorizontalScroll(), `${url} at ${width}px`).toBe(true);
    }
    await page.goto(`${subjectUrl}/materials`);
    await expect(page.getByRole("heading", { name: "Data Structures", level: 1 })).toBeVisible();
    const navs = page.locator('nav[aria-label="Subject sections"]'); // a CSS locator: role queries skip display:none elements
    const visible = [];
    for (let i = 0; i < (await navs.count()); i++) visible.push(await navs.nth(i).isVisible());
    if (width < 640) expect(visible).toEqual([false, true]);
    else expect(visible).toEqual([true, false]);
    await page.screenshot({ path: path.join(SHOTS, `materials-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/subjects");
  await page.getByRole("button", { name: "New subject" }).first().click();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box.y + box.height).toBeGreaterThan(700); // a bottom sheet on phones
  await axe("phone dialog");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("light theme always: a system set to dark still gets the light UI, and it stays readable (axe)", async ({ browser }) => {
  const c = await browser.newContext({ colorScheme: "dark", viewport: { width: 1280, height: 800 }, storageState: await ctx.storageState() });
  const p = await c.newPage();
  for (const url of ["/subjects", `${subjectUrl}/materials`, docUrl]) {
    await p.goto(url);
    await p.waitForLoadState("networkidle");
    expect(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), `page background at ${url}`).toBe("rgb(234, 246, 253)");
    expect(await p.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
    const r = await new AxeBuilder({ page: p }).analyze();
    expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact || "")).map((v) => `${v.id}: ${v.nodes[0]?.html?.slice(0, 80)}`), `axe ${url}`).toEqual([]);
  }
  await c.close();
});

test("logout, back button does not restore the session, wrong password is generic, login works", async () => {
  await page.goto("/subjects");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid username or password." })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/subjects$/);
  await expect(page.locator("#main").getByRole("link", { name: "Data Structures" })).toBeVisible();
});

test("no console errors anywhere in the journey", async () => {
  expect(consoleErrors.filter((e) => !/401|403|404|400/.test(e))).toEqual([]);
});
