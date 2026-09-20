// LIVE: the assessment face check against fake webcams that show REAL faces (a bundled public-domain portrait): one face must be accepted,
// two faces must end the assessment. Also the "Test my camera" button. Uses throwaway accounts.
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("@playwright/test");
const root = path.resolve(__dirname, "..", "..");
const py = path.join(root, ".venv", "Scripts", "python.exe");
const BASE = "http://127.0.0.1:3000";

async function run(label, video, expectEnd) {
  const browser = await chromium.launch({ channel: "msedge", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${video}`] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["camera"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  await page.goto(BASE + "/register");
  await page.getByLabel("Username").fill("chk" + Date.now().toString().slice(-7));
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByLabel("Repeat password").fill("correct horse battery");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("button", { name: "New subject" }).first().click();
  await page.getByLabel("Name").fill("Face");
  await page.getByRole("button", { name: "Create subject" }).click();
  await page.locator("#main").getByRole("link", { name: "Face" }).click();
  await page.waitForURL(/\/subjects\/\d+\/materials$/);
  const base = page.url().replace(/\/materials$/, "");
  await page.locator("#file-input").setInputFiles(path.join(__dirname, "..", "e2e", "fixtures", "ds.txt"));
  await page.getByText(/Added/).first().waitFor();
  execFileSync(py, [path.join(__dirname, "seed-mcq.py"), "Face", "two"], { cwd: root, env: { ...process.env, PYTHONPATH: root } });
  await page.goto(base + "/quiz");
  await page.getByRole("radio", { name: /Assessment/ }).check();
  // the camera test on the start page
  await page.getByRole("button", { name: "Test my camera" }).click();
  const test = await page.getByText(/face detected|No face detected|More than one face detected|Starting the camera/i).first().waitFor({ timeout: 40000 }).then(async () => {
    await page.waitForTimeout(4000);
    return (await page.locator("[role=status]").allInnerTexts()).filter((t) => /face|camera/i.test(t)).join(" | ");
  }).catch(() => "no status shown");
  console.log(`[${label}] camera test says: ${test}`);
  await page.getByRole("button", { name: /Stop the camera test/ }).click();
  await page.getByRole("checkbox", { name: /allow the camera/i }).check();
  await page.getByRole("button", { name: /Start assessment/ }).click();
  await page.getByText(/Question 1 of/).waitFor({ timeout: 30000 });
  const t0 = Date.now();
  let seen = "";
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    if (/result$/.test(page.url())) break;
    const s = (await page.locator("p[role=status]").allInnerTexts()).filter((t) => /face|camera/i.test(t)).join(" | ");
    if (s && s !== seen) { seen = s; console.log(`[${label}] +${Math.round((Date.now() - t0) / 1000)}s status: ${s}`); }
  }
  const ended = /result$/.test(page.url());
  let why = "";
  if (ended) why = (await page.getByRole("status").filter({ hasText: "ended early" }).allInnerTexts()).join(" ").replace(/\s+/g, " ");
  console.log(`[${label}] after ~20s: ${ended ? "ENDED: " + why : "still running (accepted)"} | expected ${expectEnd ? "to end" : "to keep running"} => ${ended === expectEnd ? "PASS" : "FAIL"}`);
  console.log(errors.length ? `[${label}] PAGE ERRORS: ${errors.join(" | ")}` : `[${label}] no page errors`);
  await browser.close();
}

(async () => {
  const only = process.argv[2];
  if (!only || only === "one") await run("one face", path.join(__dirname, "..", ".e2e", "faces", "one-face.y4m"), false);
  if (!only || only === "two") await run("two faces", path.join(__dirname, "..", ".e2e", "faces", "two-faces.y4m"), true);
})();
