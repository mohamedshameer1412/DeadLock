// Live check of backtracking: two topics, every answer wrong -> "Checking the basics" must appear. Deletes nothing; run cleanup after.
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, "..", "..");
const py = path.join(root, ".venv", "Scripts", "python.exe");
const BASE = "http://127.0.0.1:3000";
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(BASE + "/register");
  await page.getByLabel("Username").fill("flow" + Date.now().toString().slice(-7));
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByLabel("Repeat password").fill("correct horse battery");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("button", { name: "New subject" }).first().click();
  await page.getByLabel("Name").fill("Back");
  await page.getByRole("button", { name: "Create subject" }).click();
  await page.locator("#main").getByRole("link", { name: "Back" }).click();
  await page.locator("#file-input").setInputFiles(path.join(__dirname, "..", "e2e", "fixtures", "ds.txt"));
  await page.getByText(/Added/).waitFor();
  const base = page.url().replace(/\/materials$/, "");
  execFileSync(py, [path.join(__dirname, "seed-mcq.py"), "Back", "two"], { cwd: root, env: { ...process.env, PYTHONPATH: root } });
  await page.goto(base + "/quiz");
  await page.getByRole("button", { name: /^Start quiz/ }).click();
  let total0 = null, sawBasics = 0, asked = 0;
  for (let n = 0; n < 16; n++) {
    await page.getByText(/Question \d+ of \d+/).waitFor();
    const head = await page.getByText(/Question \d+ of \d+/).innerText();
    if (total0 === null) total0 = Number(head.match(/of (\d+)/)[1]);
    if (await page.getByText("Checking the basics.").count()) sawBasics++;
    asked++;
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /Next question|Finish quiz/ }).click();
    await page.waitForTimeout(600);
    if (/result$/.test(page.url())) break;
  }
  await page.waitForURL(/result$/, { timeout: 15000 });
  console.log(`questions at start: ${total0}, asked: ${asked}, shown as "Checking the basics": ${sawBasics}`);
  console.log("RESULT:", (await page.locator("main").innerText()).replace(/\s+/g, " ").match(/Your result.{0,60}/)[0], "| step-back note on result:", /asked as a step back/.test(await page.locator("main").innerText()));
  await page.goto(base + "/progress");
  await page.waitForLoadState("networkidle");
  console.log("PROGRESS:", (await page.locator("main").innerText()).replace(/\s+/g, " ").match(/Overall confidence.{0,80}/)?.[0]);
  console.log(errors.length ? "PAGE ERRORS: " + errors.join(" | ") : "NO PAGE ERRORS");
  await browser.close();
})();
