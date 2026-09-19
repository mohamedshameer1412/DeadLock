// REAL BROWSER + REAL LOCAL MODEL: Edge -> FastAPI (LLM_PROVIDER=ollama) -> llama3.1.
// usage: node browser_live.mjs <base-url> <edge.exe> <profile-dir> <screenshot-dir>
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';

const [BASE, EDGE, PROFILE, SHOTS] = process.argv.slice(2);
const PORT = 9334;
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rec(name, pass, evidence) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ::  ${String(evidence).replace(/\s+/g, ' ').slice(0, 190)}`);
}
const SOURCE = 'Photosynthesis is the process by which green plants convert light energy into chemical energy. Chlorophyll absorbs light energy. Carbon dioxide and water are used to produce glucose and oxygen.';

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
async function getJSON(url) {
  for (let i = 0; i < 75; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {} await sleep(200); }
  throw new Error('browser did not start');
}
const jsErrors = [];
let ws, seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 200));
  return r.result.result.value;
};
const waitFor = async (expr, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = await ev(expr); if (v) return v; } catch {} await sleep(500); }
  return false;
};
const text = () => ev('document.body.innerText');
const goto = async (path) => { await send('Page.navigate', { url: BASE + path }); await sleep(400); await waitFor("document.readyState==='complete'"); };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing'; e.click(); return 'clicked';})()`);
const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); return e.value.length;})()`);

async function main() {
  const targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') jsErrors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 160));
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') jsErrors.push('console.error');
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });
  rec('0  real browser', !!(await ev('navigator.userAgent')).match(/Edg\/[\d.]+/), (await ev('navigator.userAgent')).match(/Edg\/[\d.]+/)?.[0]);

  await goto('/');
  const t1 = await text();
  rec('1  home page shows the LIVE mode (not fixture)', /Mode:\s*ollama: llama3\.1:latest/i.test(t1) && !(await ev("!!document.getElementById('scenario')")), t1.match(/Mode:[^\n]*/i)?.[0]);
  await setVal('#title', 'Photosynthesis (live browser QA)'); await setVal('#source', SOURCE);
  const t0 = Date.now();
  await click('#gen-btn');
  rec('2  generate click -> redirected to the run page immediately (no blocked request)', !!(await waitFor("location.pathname.startsWith('/run/')", 15000)), `after ${((Date.now() - t0) / 1000).toFixed(1)}s at ${await ev('location.pathname')}`);
  const runId = (await ev('location.pathname')).split('/')[2];

  await sleep(1500);
  const tw = await text(); await shot('L1_working');
  rec('3  LOADING state is visible while the local model works', /Working - currently/i.test(tw) && (await ev("!!document.querySelector('meta[http-equiv=refresh]')")), tw.match(/Working - currently[^\n]*/i)?.[0]);
  rec('3b state strip shows an in-progress state', /Workflow state\s+(GENERATING|VALIDATING)/i.test(tw), tw.match(/Workflow state\s+\w+/i)?.[0]);

  // wait for the run to finish (page polls itself every 3s)
  const done = await waitFor(`fetch('/api/run/${runId}').then(r=>r.json()).then(d=>!d.active && ['complete','failed','awaiting_expert'].includes(d.state))`, 540000);
  const waited = ((Date.now() - t0) / 1000).toFixed(0);
  rec('4  run finished by itself (page polled; no manual refresh)', !!done, `finished after ${waited}s`);
  await sleep(3500);                                   // let the meta-refresh land on the final page
  const api = await ev(`fetch('/api/run/${runId}').then(r=>r.json())`);
  const t2 = await text(); await shot('L2_final');
  rec('5  generated NOTES are shown', /Notes/.test(t2) && api.draft && api.draft.notes.every((n) => t2.includes(n)), `${api.draft?.notes.length} notes, all present on the page`);
  rec('6  QUIZ shown (options, marked answer, explanation, source proof)', api.draft && api.draft.questions.every((q) => t2.includes(q.question)) && t2.includes('marked correct') && /quote found in source/.test(t2), `${api.draft?.questions.length} questions`);
  rec('7  VALIDATOR result shown', /Validator\s+(APPROVED|REJECTED)/i.test(t2), t2.match(/Validator\s+\w+[^\n]*/i)?.[0]);
  rec('8  REVISION info shown', /Revision\s+\d of 3/i.test(t2), t2.match(/Revision\s+\d of 3/i)?.[0]);
  rec('9  FINAL state shown', /Workflow state\s+(APPROVED|FAILED|HUMAN REVIEW REQUIRED)/i.test(t2), `${api.state}; ` + (t2.match(/Outcome\s+[^\n]*/i)?.[0] || ''));
  rec('9b pipeline was the real one: generator + validator produced the records', api.summary.path.includes('gating') && api.mode.startsWith('ollama'), `path=${api.summary.path}; mode=${api.mode}; tokens=${api.summary.tokens}`);

  await goto(`/run/${runId}/trace`);
  const t3 = await text(); await shot('L3_trace');
  rec('10 TRACE shows real per-step timings and tokens', /drafting -> gating\s+[\d,]+ tok\s+[\d.]+s/.test(t3), t3.match(/drafting -> gating\s+[\d,]+ tok\s+[\d.]+s/)?.[0]);

  await goto(`/run/${runId}`);
  await waitFor("document.body.innerText.includes('Was this study material useful?')");
  await click("[data-useful='yes']"); await setVal('#fb-improve', 'Q2 says byproducts but glucose is a product'); await setVal('#fb-confusing', 'wording of question 2'); await setVal('#fb-who', 'live-browser-qa'); await ev("document.getElementById('fb-rating').value='4'");
  await click('#fb-submit');
  const saved = await waitFor("document.body.innerText.includes('Feedback so far (1)')", 15000);
  await shot('L4_feedback');
  rec('11 real tester feedback on the REAL model output is saved and displayed', !!saved && (await text()).includes('live-browser-qa'), 'Feedback so far (1) ... live-browser-qa');
  const fb = await ev(`fetch('/api/run/${runId}/feedback').then(r=>r.json())`);
  rec('11b feedback row is attached to this run and to the draft the tester saw', fb.feedback.length === 1 && fb.feedback[0].draft === api.summary.drafts && fb.feedback[0].run_state === api.state, JSON.stringify(fb.feedback[0]).slice(0, 170));
  rec('12 no JavaScript errors in the whole live session', jsErrors.length === 0, jsErrors.join('|') || '0 errors');
  console.log(`\nLIVE BROWSER RESULT: ${results.filter((r) => r.pass).length}/${results.length} passed`);
  console.log('RUN_ID=' + runId);
}
main().catch((e) => console.log('HARNESS ERROR: ' + e.message)).finally(() => { try { execSync(`taskkill /F /T /PID ${edge.pid}`, { stdio: 'ignore' }); } catch {} process.exit(0); });
