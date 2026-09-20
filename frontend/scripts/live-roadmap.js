// LIVE (local Ollama, no cloud): quizzes of every kind -> skill gaps by kind of test -> roadmap -> coach paragraph.
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, "..", "..");
const py = path.join(root, ".venv", "Scripts", "python.exe");
const BASE = "http://127.0.0.1:3000";
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(BASE + "/register");
  await page.getByLabel("Username").fill("chk" + Date.now().toString().slice(-7));
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByLabel("Repeat password").fill("correct horse battery");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("button", { name: "New subject" }).first().click();
  await page.getByLabel("Name").fill("Road");
  await page.getByRole("button", { name: "Create subject" }).click();
  await page.locator("#main").getByRole("link", { name: "Road" }).click();
  await page.waitForURL(/\/subjects\/\d+\/materials$/);
  const base = page.url().replace(/\/materials$/, "");
  await page.locator("#file-input").setInputFiles(path.join(__dirname, "..", "e2e", "fixtures", "ds.txt"));
  await page.getByText(/Added/).first().waitFor();
  await page.getByRole("radio", { name: /Intermediate/ }).check().catch(() => {});
  await page.getByRole("button", { name: "Ask me later" }).click().catch(() => {});
  execFileSync(py, [path.join(__dirname, "seed-mcq.py"), "Road", "two"], { cwd: root, env: { ...process.env, PYTHONPATH: root } });
  const quiz = async (kind, pickIndex) => {
    await page.goto(base + "/quiz");
    await page.getByRole("radio", { name: new RegExp(kind) }).first().check();
    await page.getByRole("button", { name: /^Start/ }).click();
    await page.getByText(/Question 1 of/).waitFor();
    for (let n = 0; n < 16; n++) {
      if (/result$/.test(page.url())) break;
      const has = await page.getByText(/Question \d+ of \d+/).first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
      if (!has) break; // the quiz ended and the page is moving to the result
      const before = await page.getByText(/Question \d+ of \d+/).first().innerText();
      await page.getByRole("radio").nth(pickIndex).check();
      await page.getByRole("button", { name: /Next question|Finish quiz/ }).click();
      await page.waitForFunction((b) => /result$/.test(location.pathname) || !(document.body.innerText.includes(b)), before, { timeout: 15000 });
    }
    await page.waitForURL(/result$/, { timeout: 20000 });
  };
  await quiz("Diagnostic test", 0);   // all wrong
  await quiz("Standard quiz", 1);     // all right
  await page.goto(base + "/roadmap");
  await page.getByRole("heading", { name: /Study roadmap for Road/ }).waitFor();
  await page.getByRole("heading", { name: "Skill gaps" }).waitFor();
  await page.getByRole("heading", { name: "Your roadmap" }).waitFor();
  await page.getByLabel("Goal (optional)").fill("Pass the unit test");
  await page.getByRole("button", { name: "Update plan" }).click();
  await page.getByText("Roadmap updated").first().waitFor();
  console.log("GAPS:", (await page.locator("#gaps-h").locator("xpath=..").innerText()).replace(/\s+/g, " ").slice(0, 500));
  console.log("WEEK 1:", (await page.locator("#road-h").locator("xpath=..").locator("ol > li").first().innerText()).replace(/\s+/g, " ").slice(0, 400));
  await page.screenshot({ path: "e2e-screenshots/roadmap.png", fullPage: true });
  await page.getByRole("button", { name: /Ask the coach/ }).click();
  await page.getByText(/The coach is writing/).waitFor();
  console.log("coach requested (local model)...");
  await page.getByText(/Written by|Worked out from your numbers/).waitFor({ timeout: 420000 });
  console.log("COACH:", (await page.getByRole("heading", { name: /Your coach/ }).locator("xpath=..").innerText()).replace(/\s+/g, " ").slice(0, 600));
  console.log(errors.length ? "PAGE ERRORS: " + errors.join(" | ") : "NO PAGE ERRORS");
  await browser.close();
})();
