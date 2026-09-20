// Builds the app for the end-to-end tests: separate output folder, pointing at the test backend (port 8120).
const { spawnSync } = require("child_process");
const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", shell: true, env: { ...process.env, NEXT_DIST_DIR: ".next-e2e", API_ORIGIN: "http://127.0.0.1:8120", NEXT_PUBLIC_E2E: "1" } });
process.exit(r.status ?? 1);
