// Quick end-to-end walk of the new features on the LIVE app as a throwaway user. Prints errors only.
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, "..", "..");
const py = path.join(root, ".venv", "Scripts", "python.exe");
const BASE = "http://127.0.0.1:3000";

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const problems = [];
  let where = "start";
  page.on("pageerror", (e) => problems.push(`[${where}] PAGEERROR ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|odml|XNNPACK/.test(m.text() + m.location().url)) problems.push(`[${where}] console ${m.text().slice(0, 160)}`); });
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`[${where}] HTTP ${r.status()} ${r.url()}`); });
  const step = async (name, fn) => { where = name; try { await fn(); console.log("ok  ", name); } catch (e) { problems.push(`[${name}] ${String(e.message).split("\n")[0]}`); console.log("FAIL", name); } };

  await step("register+upload", async () => {
    await page.goto(BASE + "/register");
    await page.getByLabel("Username").fill("flow" + Date.now().toString().slice(-7));
    await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
    await page.getByLabel("Repeat password").fill("correct horse battery");
    await page.getByRole("button", { name: "Register" }).click();
    await page.getByRole("button", { name: "New subject" }).first().click();
    await page.getByLabel("Name").fill("Flow");
    await page.getByRole("button", { name: "Create subject" }).click();
    await page.locator("#main").getByRole("link", { name: "Flow" }).click();
    await page.locator("#file-input").setInputFiles(path.join(__dirname, "..", "e2e", "fixtures", "ds.txt"));
    await page.getByText(/Added/).waitFor();
  });
  const base = page.url().replace(/\/materials$/, "");
  execFileSync(py, [path.join(__dirname, "seed-mcq.py"), "Flow"], { cwd: root, env: { ...process.env, PYTHONPATH: root } });

  await step("standard quiz, all wrong (step back)", async () => {
    await page.goto(base + "/quiz");
    await page.getByRole("button", { name: /^Start quiz/ }).click();
    await page.getByText(/Question 1 of/).waitFor();
    for (let n = 0; n < 12; n++) {
      if (/result$/.test(page.url())) break;
      await page.getByRole("radio").first().check();
      await page.getByRole("button", { name: /Next question|Finish quiz/ }).click();
      await page.waitForTimeout(500);
    }
    await page.waitForURL(/result$/, { timeout: 15000 });
    console.log("RESULT:", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 160));
  });
  for (const route of ["/progress", "/report", "/quiz", "/practice/flashcards", "/practice"]) {
    await step(route, async () => { await page.goto(base + route); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500); console.log("   ", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 120)); });
  }
  await step("flashcard review", async () => {
    await page.goto(base + "/practice/flashcards");
    await page.getByRole("button", { name: "Show answer" }).click();
    await page.getByRole("button", { name: "Good" }).click();
    await page.waitForTimeout(400);
  });
  await step("revision quiz", async () => {
    await page.goto(base + "/quiz");
    await page.getByRole("radio", { name: /Revision quiz/ }).check();
    await page.getByRole("button", { name: /Start revision/ }).click();
    await page.getByText(/Question 1 of/).waitFor();
  });
  await step("palette", async () => {
    await page.goto(BASE + "/dashboard");
    await page.keyboard.press("Control+K");
    await page.getByRole("combobox", { name: "Search and jump" }).fill("queue");
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForURL(/search\?q=queue/);
    await page.getByText(/passage/).first().waitFor();
  });
  await step("account page", async () => { await page.goto(BASE + "/account"); await page.getByRole("heading", { name: "Change password" }).waitFor(); });
  console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "NO PROBLEMS");
  await browser.close();
})();
