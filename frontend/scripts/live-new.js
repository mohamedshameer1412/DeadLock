// Walk of the newest features on the LIVE app as a throwaway user. Prints errors only. Clean the user up afterwards.
const path = require("path");
const { chromium } = require("@playwright/test");
const BASE = "http://127.0.0.1:3000";
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  let where = "start";
  page.on("pageerror", (e) => problems.push(`[${where}] PAGEERROR ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|odml|XNNPACK/.test(m.text() + m.location().url)) problems.push(`[${where}] console ${m.text().slice(0, 200)}`); });
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`[${where}] HTTP ${r.status()} ${r.url()}`); });
  const step = async (name, fn) => { where = name; try { await fn(); console.log("ok  ", name); } catch (e) { problems.push(`[${name}] ${String(e.message).split("\n")[0]}`); console.log("FAIL", name); } };

  await step("register", async () => {
    await page.goto(BASE + "/register");
    await page.getByLabel("Username").fill("chk" + Date.now().toString().slice(-7));
    await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
    await page.getByLabel("Repeat password").fill("correct horse battery");
    await page.getByRole("button", { name: "Register" }).click();
    await page.getByRole("button", { name: "New subject" }).first().click();
    await page.getByLabel("Name").fill("Newcheck");
    await page.getByRole("button", { name: "Create subject" }).click();
    await page.locator("#main").getByRole("link", { name: "Newcheck" }).click();
  });
  await page.waitForURL(/\/subjects\/\d+\/materials$/);
  const base = page.url().replace(/\/materials$/, "");
  await step("level prompt hidden before any upload", async () => { await page.waitForTimeout(800); if (await page.getByText(/How well do you know/).count()) throw new Error("prompt shown with no material"); });
  await step("upload text + PDF", async () => {
    await page.locator("#file-input").setInputFiles(path.join(__dirname, "..", "e2e", "fixtures", "ds.txt"));
    await page.getByText(/Added/).first().waitFor();
  });
  await step("level prompt appears after upload", async () => {
    await page.screenshot({ path: "e2e-screenshots/level-check.png" }); await page.getByRole("heading", { name: /How well do you know Newcheck/ }).waitFor({ timeout: 10000 }); });
  await step("choose New learner", async () => {
    await page.getByRole("radio", { name: /New learner/ }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("heading", { name: /How well do you know/ }).waitFor({ state: "detached", timeout: 10000 });
  });
  await step("web page (real fetch)", async () => {
    await page.getByLabel("Web address").fill("https://en.wikipedia.org/wiki/Queue_(abstract_data_type)");
    await page.getByRole("button", { name: "Add page" }).click();
    await page.getByText(/Added .*passage|could not|not a public|error/i).first().waitFor({ timeout: 30000 });
    console.log("    web page result:", (await page.locator("[role=status], [role=alert], [data-sonner-toast]").allInnerTexts()).join(" | ").replace(/\s+/g, " ").slice(0, 200));
  });
  await step("private address refused", async () => {
    await page.getByLabel("Web address").fill("http://169.254.169.254/latest/meta-data/");
    await page.getByRole("button", { name: "Add page" }).click();
    await page.getByText(/not a public web page/i).waitFor({ timeout: 10000 });
  });
  await step("notes: create, edit, preview", async () => {
    await page.goto(base + "/notes");
    await page.getByRole("button", { name: "New note" }).click();
    await page.getByLabel("Title").fill("My stacks note");
    await page.getByLabel("Note", { exact: true }).fill("# Stacks\n- LIFO\n**pop** removes the top.");
    await page.getByRole("button", { name: "Save note" }).click();
    await page.getByText("Note saved").first().waitFor();
    await page.getByRole("button", { name: /Preview/ }).click();
    await page.getByRole("heading", { name: "Stacks" }).waitFor();
  });
  await step("ask: notes button + documents viewer", async () => {
    await page.goto(base + "/ask");
    await page.getByRole("button", { name: /Show my documents/ }).click();
    await page.getByRole("complementary", { name: "Your document" }).waitFor();
  });
  await step("forgot password page", async () => { await page.goto(BASE + "/forgot-password"); await page.getByRole("heading", { name: "Reset your password" }).waitFor(); });
  await step("account: email card", async () => { await page.goto(BASE + "/account"); await page.getByRole("heading", { name: "Email", exact: true }).waitFor(); });
  await step("offline page + service worker", async () => {
    await page.goto(BASE + "/offline");
    await page.getByRole("heading", { name: "You are offline" }).waitFor();
    await page.goto(BASE + "/dashboard");
    await page.waitForTimeout(1500);
    const reg = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
    if (!reg) throw new Error("service worker not registered");
  });
  await step("works offline for a page opened before", async () => {
    await page.goto(base + "/notes"); await page.getByText("My stacks note").first().waitFor();
    await page.waitForTimeout(1500);
    await ctx.setOffline(true);
    await page.reload();
    await page.getByText("My stacks note").first().waitFor({ timeout: 10000 });
    await page.getByText(/You are offline/).first().waitFor({ timeout: 5000 });
    await ctx.setOffline(false);
  });
  console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "NO PROBLEMS");
  await browser.close();
})();
