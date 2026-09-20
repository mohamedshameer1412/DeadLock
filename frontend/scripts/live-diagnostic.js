// LIVE: level "Intermediate" -> ten questions of different difficulty written by the local model -> diagnostic quiz -> conclusion.
const path = require("path");
const { chromium } = require("@playwright/test");
const BASE = "http://127.0.0.1:3000";
(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(BASE + "/register");
  await page.getByLabel("Username").fill("chk" + Date.now().toString().slice(-7));
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByLabel("Repeat password").fill("correct horse battery");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("button", { name: "New subject" }).first().click();
  await page.getByLabel("Name").fill("Diag");
  await page.getByRole("button", { name: "Create subject" }).click();
  await page.locator("#main").getByRole("link", { name: "Diag" }).click();
  await page.waitForURL(/\/subjects\/\d+\/materials$/);
  await page.locator("#file-input").setInputFiles(path.join(__dirname, "..", "e2e", "fixtures", "ds.txt"));
  await page.getByRole("heading", { name: /How well do you know Diag/ }).waitFor();
  await page.getByRole("radio", { name: /Professional/ }).check();
  await page.getByRole("button", { name: /Continue and take the diagnostic/ }).click();
  await page.getByText(/Writing ten questions/).waitFor();
  console.log("writing questions...");
  await page.getByRole("button", { name: "Start the diagnostic test" }).waitFor({ timeout: 540000 });
  console.log("questions ready after", Math.round((Date.now() - t0) / 1000), "s:", (await page.getByText(/questions? ready/).innerText()).trim());
  await page.screenshot({ path: "e2e-screenshots/diag-ready.png" });
  await page.getByRole("button", { name: "Start the diagnostic test" }).click();
  await page.getByText(/Question 1 of/).waitFor();
  const seen = [];
  for (let n = 0; n < 14; n++) {
    if (/result$/.test(page.url())) break;
    seen.push((await page.locator("legend").innerText()).slice(0, 90));
    await page.getByRole("radio").nth(n % 2).check();
    await page.getByRole("button", { name: /Next question|Finish quiz/ }).click();
    await page.waitForTimeout(600);
  }
  await page.waitForURL(/result$/, { timeout: 20000 });
  await page.getByRole("heading", { name: "Your diagnostic conclusion" }).waitFor();
  await page.screenshot({ path: "e2e-screenshots/diag-result.png", fullPage: true });
  console.log("QUESTIONS:\n - " + seen.join("\n - "));
  console.log("CONCLUSION:", (await page.locator("#diag-h").locator("xpath=..").innerText()).replace(/\s+/g, " ").slice(0, 700));
  console.log(errors.length ? "PAGE ERRORS: " + errors.join(" | ") : "NO PAGE ERRORS");
  await browser.close();
})();
