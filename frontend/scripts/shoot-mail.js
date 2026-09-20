// Renders the two e-mail templates to PNG so they can be looked at (they are written by the Python side to e2e-screenshots/).
const path = require("path");
const { chromium } = require("@playwright/test");
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const p = await b.newPage({ viewport: { width: 700, height: 900 } });
  for (const n of ["otp", "digest"]) {
    await p.goto("file:///" + path.join(__dirname, "..", "e2e-screenshots", `mail-${n}.html`).replace(/\\/g, "/"));
    await p.screenshot({ path: path.join(__dirname, "..", "e2e-screenshots", `mail-${n}.png`), fullPage: true });
  }
  await b.close();
})();
