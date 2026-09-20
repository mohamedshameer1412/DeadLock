// Walks the LIVE app (3000) as a throwaway user and prints every console error / uncaught exception per page.
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("@playwright/test");

const root = path.resolve(__dirname, "..", "..");
const py = path.join(root, ".venv", "Scripts", "python.exe");
const BASE = process.env.BASE || "http://127.0.0.1:3000";

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let where = "start";
  const problems = [];
  page.on("pageerror", (e) => problems.push(`[${where}] PAGEERROR ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`[${where}] console.error ${m.text().slice(0, 200)} @ ${m.location().url}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("/api/v1/session")) problems.push(`[${where}] HTTP ${r.status()} ${r.url()}`); });
  const step = async (name, fn) => { where = name; try { await fn(); } catch (e) { problems.push(`[${name}] STEP FAILED ${String(e.message).split("\n")[0]}`); } };

  const user = "chk" + Date.now().toString().slice(-7);
  await step("register", async () => {
    await page.goto(BASE + "/register");
    await page.getByLabel("Username").fill(user);
    await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
    await page.getByLabel("Repeat password").fill("correct horse battery");
    await page.getByRole("button", { name: "Register" }).click();
    await page.getByRole("button", { name: "New subject" }).first().click();
    await page.getByLabel("Name").fill("Check");
    await page.getByRole("button", { name: "Create subject" }).click();
    await page.locator("#main").getByRole("link", { name: "Check" }).click();
    await page.locator("#file-input").setInputFiles(path.join(__dirname, "..", "e2e", "fixtures", "ds.txt"));
    await page.getByText(/Added/).waitFor();
  });
  const base = page.url().replace(/\/materials$/, "");
  execFileSync(py, [path.join(__dirname, "seed-mcq.py"), "Check"], { cwd: root, env: { ...process.env, PYTHONPATH: root } });
  for (const p of ["/dashboard", "/subjects", "/account", base + "/materials", base + "/ask", base + "/practice", base + "/quiz", base + "/progress"]) {
    await step(p, async () => { await page.goto(p.startsWith("http") ? p : BASE + p); await page.waitForLoadState("networkidle"); await page.waitForTimeout(600); });
  }
  await step("start assessment", async () => {
    await page.goto(base + "/quiz");
    await page.getByRole("radio", { name: /Assessment/ }).check();
    await page.getByLabel("I understand and want an assessment").check();
    await page.getByRole("button", { name: "Start assessment" }).click();
    await page.getByText("Question 1 of").waitFor();
    await page.waitForTimeout(800);
  });
  await step("quiz answers", async () => {
    for (let n = 1; n <= 3; n++) {
      await page.getByRole("radio").nth(1).check();
      await page.getByRole("button", { name: /Next question|Finish quiz/ }).click();
      await page.waitForTimeout(700);
    }
    await page.waitForURL(/result$|quiz\/\d+$/, { timeout: 15000 });
    await page.waitForTimeout(1500);
  });
  console.log("URL at end:", page.url());
  console.log("BODY:", (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
  console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "NO PROBLEMS FOUND");
  await browser.close();
})();
