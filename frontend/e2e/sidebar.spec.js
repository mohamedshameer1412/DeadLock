// @ts-check
// Toggleable sidebar + navbar: desktop collapse (remembered), phone drawer (focus, Escape, closes on navigation), links, accessibility.
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

async function clean(page, label) {
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact || "")).map((v) => `${v.id}: ${v.nodes[0]?.html?.slice(0, 90)}`), `axe: ${label}`).toEqual([]);
}
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("sidebar and navbar", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/register");
  await page.getByLabel("Username").fill("side" + Date.now().toString().slice(-6));
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await page.getByLabel("Repeat password").fill("correct horse battery");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("button", { name: "New subject" }).first().click();
  await page.getByLabel("Name").fill("Side Subject");
  await page.getByRole("button", { name: "Create subject" }).click();

  // desktop: open by default, with the links
  const side = page.locator("#app-sidebar");
  await expect(side).toBeVisible();
  const nav = side.getByRole("navigation", { name: "Main" });
  for (const l of ["Dashboard", "All subjects", "Side Subject", "Account"]) await expect(nav.getByRole("link", { name: l })).toBeVisible();
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
  await clean(page, "sidebar expanded");

  // links work and mark the current page
  await nav.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Side Subject" }).click();
  await expect(page).toHaveURL(/\/subjects\/\d+\/materials$/);
  await nav.getByRole("link", { name: "Ask", exact: true }).click();
  await expect(page).toHaveURL(/\/ask$/);
  await expect(nav.getByRole("link", { name: "Ask", exact: true })).toHaveAttribute("aria-current", "page");
  for (const l of ["Materials", "Practice", "Quiz", "Progress"]) await expect(nav.getByRole("link", { name: l, exact: true })).toBeVisible();

  // collapse to icons: still reachable by name, narrower, remembered after reload
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
  expect((await side.boundingBox())?.width).toBeLessThan(80);
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
  expect((await nav.getByRole("link", { name: "Dashboard" }).boundingBox())?.width).toBeLessThan(60); // icon only, label kept for screen readers
  await expect(nav.getByRole("link", { name: "Side Subject" })).toHaveCount(0); // the subject list needs room
  await clean(page, "sidebar collapsed");
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  expect((await side.boundingBox())?.width).toBeGreaterThan(200);

  // tablet and phone: no sidebar, a menu button opens a drawer
  for (const width of [768, 390, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.locator("#app-sidebar")).toHaveCount(0);
    await expect.poll(() => noScroll(page), { message: `no horizontal scroll at ${width}px` }).toBe(true);
  }
  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await clean(page, "drawer open");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await page.getByRole("dialog").getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("dialog")).toBeHidden(); // closes after navigating
  await menu.click();
  await page.mouse.click(350, 400); // the backdrop
  await expect(page.getByRole("dialog")).toBeHidden();

  // back at desktop width the sidebar returns
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("#app-sidebar")).toBeVisible();
});
