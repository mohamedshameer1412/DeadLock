const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");
const root = path.join(__dirname, "..");
const mime = { ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm", ".html": "text/html", ".png": "image/png", ".tflite": "application/octet-stream" };
(async () => {
  const b = await chromium.launch({ channel: "msedge", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${path.join(root, ".e2e", "faces", "two-faces.y4m")}`] });
  const p = await (await b.newContext({ permissions: ["camera"] })).newPage();
  await p.route("http://localhost:9999/**", async (route) => {
    const file = path.join(root, decodeURIComponent(new URL(route.request().url()).pathname));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "no" });
    route.fulfill({ status: 200, contentType: mime[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
  });
  p.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text().slice(0, 200)); });
  await p.goto("http://localhost:9999/.e2e/faces/debug2.html");
  await p.waitForFunction(() => window.__out, null, { timeout: 90000 });
  console.log(JSON.stringify(await p.evaluate(() => window.__out), null, 1));
  await b.close();
})();
