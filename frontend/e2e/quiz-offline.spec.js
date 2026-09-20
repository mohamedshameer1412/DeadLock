// @ts-check
// Practice, Quiz (practice + assessment) and Progress, with seeded questions (no model needed).
const path = require("path");
const { execFileSync } = require("child_process");
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

test.skip(!!process.env.E2E_REAL_MODEL, "this spec needs the model to be off");

const root = path.resolve(__dirname, "..", "..");
const py = process.env.NEXUS_PY || path.join(root, ".venv", "Scripts", "python.exe");
const fx = (n) => path.join(__dirname, "fixtures", n);

async function clean(page, label) {
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact || "")).map((v) => `${v.id}: ${v.nodes[0]?.html?.slice(0, 90)}`), `axe: ${label}`).toEqual([]);
}
async function noScroll(page, label) {
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `${label} at ${width}px` }).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
const tab = (page, name) => page.locator("nav[aria-label='Subject sections']:visible").getByRole("link", { name }).click();

test("practice, quiz, assessment and progress", async ({ page }) => {
  page.on("console", (m) => { if (m.type() === "error" && !/odml|XNNPACK|404/.test(m.text())) console.log("BROWSER ERROR:", m.text().slice(0, 300)); });
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message.slice(0, 300)));
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/register");
  await page.getByLabel("Username").fill("quiz" + Date.now().toString().slice(-6));
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByLabel("Repeat password").fill("correct horse battery");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("button", { name: "New subject" }).first().click();
  await page.getByLabel("Name").fill("Quiz Subject");
  await page.getByRole("button", { name: "Create subject" }).click();
  await page.locator("#main").getByRole("link", { name: "Quiz Subject" }).click();

  // nothing yet: honest empty states
  await tab(page, "Quiz");
  await expect(page.getByText("No questions to be quizzed on yet")).toBeVisible();
  await tab(page, "Progress");
  await expect(page.getByText("No topics yet")).toBeVisible();

  await tab(page, "Materials");
  await page.locator("#file-input").setInputFiles(fx("ds.txt"));
  await expect(page.getByText(/Added .ds./)).toBeVisible();
  execFileSync(py, [path.join(__dirname, "..", "scripts", "seed-mcq.py"), "Quiz Subject"], {
    cwd: root, env: { ...process.env, PYTHONPATH: root, STUDYHUB_DB: path.join(__dirname, "..", ".e2e", "e2e.db") },
  });

  await page.reload(); // the questions were added behind the app's back, so drop its cached view

  // Practice: answers are hidden until asked for
  await tab(page, "Practice");
  await expect(page.getByRole("heading", { name: "Your questions (3)" })).toBeVisible();
  await expect(page.getByText("Correct answer")).toHaveCount(0);
  const first = page.getByRole("listitem").filter({ hasText: "What does enqueue do?" });
  await first.getByRole("radio").nth(2).check();
  await first.getByRole("button", { name: "Check answer" }).click();
  await expect(first.getByText("Not this time.")).toBeVisible();
  await expect(first.getByText("Correct answer")).toBeVisible();
  await expect(first.getByText("found word for word")).toBeVisible();
  await clean(page, "practice");
  await noScroll(page, "practice");
  await first.getByRole("button", { name: "Try again" }).click();
  await expect(first.getByText("Correct answer")).toHaveCount(0);

  // Quiz: practice mode, no monitoring
  await tab(page, "Quiz");
  await clean(page, "quiz home");
  await noScroll(page, "quiz home");
  await page.getByRole("button", { name: "Start quiz" }).click();
  await expect(page).toHaveURL(/\/quiz\/\d+$/);
  await expect(page.getByText("Question 1 of 3")).toBeVisible();
  await expect(page.getByText("Assessment mode")).toHaveCount(0);
  await clean(page, "quiz question");
  for (let n = 1; n <= 3; n++) {
    await expect(page.getByText(`Question ${n} of 3`)).toBeVisible();
    await page.getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: /Next question|Finish quiz/ }).click();
  }
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByText("3 of 3 correct")).toBeVisible();
  await expect(page.getByText("Focus events")).toHaveCount(0); // a practice quiz records nothing
  await expect(page.getByText(/trust/i)).toHaveCount(0);
  await clean(page, "quiz result");
  await noScroll(page, "quiz result");

  await page.evaluate(() => { localStorage.setItem("nexus.test.noFaceMs", "900000"); localStorage.setItem("nexus.test.manyFacesMs", "900000"); localStorage.setItem("nexus.test.graceMs", "2500"); });

  // Assessment: needs the acknowledgement, then counts a blocked copy
  await tab(page, "Quiz");
  await page.getByRole("radio", { name: /Assessment/ }).check();
  await expect(page.getByRole("button", { name: "Start assessment" })).toBeDisabled();
  await page.getByLabel("I understand and allow the camera").check();
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page).toHaveURL(/\/quiz\/\d+$/);
  await expect(page.getByText(/Assessment mode:/)).toBeVisible();
  // protection: text cannot be selected, copy / paste / right-click are blocked and counted, leaving the page is counted
  expect(await page.locator("legend").evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  const blocked = await page.evaluate(() => {
    const out = {};
    for (const t of ["copy", "cut", "paste", "contextmenu"]) { const e = new Event(t, { cancelable: true, bubbles: true }); document.dispatchEvent(e); out[t] = e.defaultPrevented; }
    return out;
  });
  expect(blocked).toEqual({ copy: true, cut: true, paste: true, contextmenu: true });
  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");
  await expect(page.getByText(/Focus events so far:/)).toContainText("5");
  await expect(page.getByText(/Focus events so far:/)).toContainText("3 copy attempts");
  await expect(page.getByText(/Focus events so far:/)).toContainText("2 paste attempts");
  await expect(page.getByRole("button", { name: "Enter full screen" }).or(page.getByText("Focus events so far:"))).toBeVisible();
  // resuming through "Continue" keeps the assessment rules (the mode is stored with the quiz, not in the address)
  await tab(page, "Quiz");
  await page.getByRole("link", { name: "Continue it" }).click();
  await expect(page.getByText(/Assessment mode:/)).toBeVisible();
  expect(await page.locator("legend").evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await page.keyboard.press("Control+C");
  await expect(page.getByText(/Focus events so far:/)).toContainText("1 copy attempts");
  await page.waitForTimeout(600);
  for (let n = 1; n <= 3; n++) {
    await expect(page.getByText(`Question ${n} of 3`)).toBeVisible();
    await page.getByRole("radio").nth(0).check();
    await page.getByRole("button", { name: /Next question|Finish quiz/ }).click();
  }
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByText("0 of 3 correct")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Focus events" })).toBeVisible();
  await expect(page.getByText("Copy attempts blocked")).toContainText("4");
  await expect(page.getByText("Paste attempts blocked")).toContainText("2");
  await expect(page.getByText("Right answer: B: The right answer").first()).toBeVisible();

  // The camera check really runs, and rule breaks end the assessment at once
  await tab(page, "Quiz");
  await page.getByRole("radio", { name: /Assessment/ }).check();
  await page.getByLabel("I understand and allow the camera").check();
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page.getByText("Question 1 of 3")).toBeVisible();
  await expect(page.getByText(/^(No face|Checking|Face detected)/).first()).toBeVisible({ timeout: 20_000 }); // the detector loaded (wasm + model under the CSP) and is looking
  await page.waitForTimeout(3000); // past the start-up grace
  await page.evaluate(() => window.dispatchEvent(new Event("blur"))); // leaving the page
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByRole("status").filter({ hasText: "ended early" })).toContainText("You left the assessment page");
  await expect(page.getByText("0 of 0 correct")).toBeVisible();

  await tab(page, "Quiz");
  await page.evaluate(() => { localStorage.setItem("nexus.test.noFaceMs", "1500"); localStorage.setItem("nexus.test.graceMs", "500"); localStorage.setItem("nexus.test.forceFaces", "0"); });
  await page.getByRole("radio", { name: /Assessment/ }).check();
  await page.getByLabel("I understand and allow the camera").check();
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page).toHaveURL(/\/result$/, { timeout: 30_000 }); // an empty room (simulated: the test camera is a pattern), so the assessment ends by itself
  await expect(page.getByRole("status").filter({ hasText: "ended early" })).toContainText("No face was visible to the camera");

  await tab(page, "Quiz");
  await page.evaluate(() => { localStorage.setItem("nexus.test.manyFacesMs", "1500"); localStorage.setItem("nexus.test.forceFaces", "2"); });
  await page.getByRole("radio", { name: /Assessment/ }).check();
  await page.getByLabel("I understand and allow the camera").check();
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page).toHaveURL(/\/result$/, { timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "ended early" })).toContainText("More than one face");
  await page.evaluate(() => { localStorage.setItem("nexus.test.noFaceMs", "900000"); localStorage.setItem("nexus.test.graceMs", "2500"); localStorage.removeItem("nexus.test.forceFaces"); });

  // Progress
  await tab(page, "Progress");
  await expect(page.getByText(/answered correctly/).first()).toBeVisible();
  await clean(page, "progress");
  await noScroll(page, "progress");

  // Dashboard: charts built from the two quizzes above (3 of 3, then 0 of 3)
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  for (const h of ["Activity, last 14 days", "Topic strength", "Quiz scores over time", "Accuracy by subject", "How your questions were answered", "Worth another look"]) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  await expect(page.getByText("Quizzes taken").locator("xpath=..").getByText("2", { exact: true })).toBeVisible();
  await expect(page.getByText("3 of 6 answers")).toBeVisible();
  await expect(page.getByRole("img", { name: "Scores: 100%, 0%." })).toBeVisible();
  await expect(page.getByRole("img", { name: /Activity over 14 days: 0 questions asked and 6 quiz answers/ })).toBeVisible();
  await page.getByText("Show the numbers").nth(2).click();
  await expect(page.getByRole("table", { name: "Quiz scores over time" })).toBeVisible();
  await clean(page, "dashboard");
  await page.screenshot({ path: path.join(__dirname, "..", "e2e-screenshots", "dashboard-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.screenshot({ path: path.join(__dirname, "..", "e2e-screenshots", "dashboard-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await noScroll(page, "dashboard");
});
