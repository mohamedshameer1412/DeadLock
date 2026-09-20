// End-to-end tests: a real backend (FastAPI, temp database, no model) and the production Next.js build, driven in Microsoft Edge.
// Build first with the E2E backend address:  API_ORIGIN=http://127.0.0.1:8120 npm run build
const path = require("path");
const { defineConfig } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const py = process.env.NEXUS_PY || path.join(root, ".venv", "Scripts", "python.exe");
const tmp = path.join(__dirname, ".e2e");

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "./test-results",
  use: {
    baseURL: "http://127.0.0.1:3120", channel: "msedge", trace: "off", permissions: ["camera"],
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] }, // a test pattern instead of a real camera (it has no face)
  },
  webServer: [
    {
      command: `"${py}" -m uvicorn studyhub.web.app:app --port 8120 --log-level warning`,
      cwd: root,
      url: "http://127.0.0.1:8120/healthz",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PYTHONPATH: root,
        STUDYHUB_DB: path.join(tmp, "e2e.db"),
        STUDYHUB_UPLOADS: path.join(tmp, "uploads"),
        STUDYHUB_SCRYPT_N: "1024",
        STUDYHUB_LOCAL_MODEL: process.env.E2E_REAL_MODEL ? "on" : "off",
      },
    },
    { command: "npx next start -p 3120", env: { NEXT_DIST_DIR: ".next-e2e" }, url: "http://127.0.0.1:3120/login", reuseExistingServer: false, timeout: 60_000 },
  ],
});
