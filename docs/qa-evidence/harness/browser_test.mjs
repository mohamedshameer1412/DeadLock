// REAL BROWSER test: Microsoft Edge (headless=new) driven over the Chrome DevTools Protocol.
// Every click below is a real DOM click and every fetch() is the page's own JavaScript.
// usage: node browser_test.mjs <base-url> <edge.exe> <profile-dir> <screenshot-dir>
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';

const [BASE, EDGE, PROFILE, SHOTS] = process.argv.slice(2);
const PORT = 9333;
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rec(name, pass, evidence) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ::  ${String(evidence).replace(/\s+/g, ' ').slice(0, 170)}`);
}

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });

async function getJSON(url) {
  for (let i = 0; i < 75; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await sleep(200);
  }
  throw new Error('browser did not start: ' + url);
}

const jsErrors = [];
let ws, seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res) => {
  const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 200));
  return r.result.result.value;
};
const waitFor = async (expr, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = await ev(expr); if (v) return v; } catch {} await sleep(200); }
  return false;
};
const text = () => ev('document.body.innerText');
const goto = async (path) => { await send('Page.navigate', { url: BASE + path }); await sleep(300); await waitFor("document.readyState==='complete'"); };
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64'));
};
const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing'; e.click(); return 'clicked';})()`);
const linkClick = (label) => ev(`(()=>{const a=[...document.querySelectorAll('a')].find(x=>x.textContent.trim()===${JSON.stringify(label)}); if(!a) return 'missing'; a.click(); return 'clicked';})()`);
const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); return e.value.length;})()`);

async function main() {
  const targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') jsErrors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 160));
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') jsErrors.push('console.error: ' + JSON.stringify(d.params.args).slice(0, 120));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });

  const ua = (await ev('navigator.userAgent')).match(/Edg\/[\d.]+/)?.[0];
  rec('0  a real browser is executing the page', !!ua, `userAgent has ${ua}; JS engine available`);

  // ---- 1-3 open, enter source, generate
  await goto('/');
  const t1 = await text();
  rec('1  open the application', t1.includes('Study Pack Generator') && (await ev("!!document.getElementById('source')")), 'heading + textarea present: ' + t1.split('\n')[0]);
  rec('1b mode banner is honest', /Mode:\s*fixture \(scripted replies - no model is called\)/.test(t1), t1.match(/Mode:[^\n]*/)?.[0]);
  await click('#sample-btn');
  const n = await ev("document.getElementById('source').value.length");
  rec('2  "Use sample text" click ran its JavaScript and filled the box', n > 500, `${n} characters in the textarea`);
  await setVal('#title', 'Photosynthesis (browser QA)');
  await ev("document.getElementById('scenario').value='revise'");
  await shot('01_input');
  await click('#gen-btn');
  const went = await waitFor("location.pathname.startsWith('/run/')", 20000);
  rec('3  submit generation -> JS fetch() -> redirect to the run page', !!went, 'location: ' + (await ev('location.pathname')));
  const runPath = await ev('location.pathname');
  const runId = runPath.split('/')[2];

  // ---- 4-8 content, validator, revision, final state
  await waitFor("document.body.innerText.includes('Quiz')");
  const t2 = await text();
  await shot('02_run_page');
  rec('4  generated NOTES are shown', /Notes\s+.\s+Photosynthesis/.test(t2) && t2.includes('Photosynthesis converts light energy'), 'notes section with the title and first note');
  rec('5  QUIZ is shown with options, marked answer, explanation, source', t2.includes('Q1.') && t2.includes('marked correct') && t2.includes('Why:') && t2.includes('quote found in source'), `Q1..Q3 present: ${['Q1.', 'Q2.', 'Q3.'].every((q) => t2.includes(q))}`);
  // NOTE: the strip labels are upper-cased by CSS (text-transform), and innerText returns the transformed text.
  rec('6  VALIDATOR result is shown', /Validator\s+APPROVED \(0 issue\(s\)\)/i.test(t2), t2.match(/Validator\s+APPROVED[^\n]*/i)?.[0]);
  rec('7a REVISION info on the content page', /Revision\s+1 of 3/i.test(t2), t2.match(/Revision\s+1 of 3/i)?.[0]);
  rec('8  FINAL state is shown', /Workflow state\s+APPROVED/i.test(t2) && /Outcome\s+approved by validator/i.test(t2), t2.match(/Outcome\s+approved by validator/i)?.[0]);

  await linkClick('Revision'); await waitFor("location.pathname.endsWith('/revision')");
  const t3 = await text(); await shot('03_revision');
  rec('7b REVISION screen: draft 1 rejected with feedback, what changed, the limit', t3.includes('Draft 1') && t3.includes('REJECTED') && t3.includes('quote_not_in_source') && /Changed from draft 1: questions\[1\], questions\[2\]/.test(t3) && t3.includes('1 of 3 revisions used'), 'Draft 1 REJECTED; "Changed from draft 1"; "1 of 3 revisions used"');
  await linkClick('Trace'); await waitFor("location.pathname.endsWith('/trace')");
  const t4 = await text(); await shot('04_trace');
  rec('7c TRACE screen shows the events and the state path', t4.includes('Execution Trace') && t4.includes('REJECTED') && t4.includes('APPROVED') && /drafting -> gating -> drafting -> gating -> complete/.test(t4), t4.match(/Path:[^\n]*/)?.[0]);

  // ---- 9-10 feedback
  await linkClick('Content'); await waitFor("document.body.innerText.includes('Was this study material useful?')");
  rec('9a feedback form is shown on the finished run', (await ev("!!document.getElementById('fb-submit')")), 'form present');
  rec('9b submit is disabled until Yes/No is chosen', (await ev("document.getElementById('fb-submit').disabled")) === true, 'disabled=true before choosing');
  await click("[data-useful='no']");
  rec('9c choosing "No" (real click handler) enables Submit', (await ev("document.getElementById('fb-submit').disabled")) === false, 'disabled=false after click');
  await setVal('#fb-improve', 'Question 3 was too easy'); await setVal('#fb-confusing', 'the note about ATP was unclear');
  await setVal('#fb-who', 'browser-qa'); await ev("document.getElementById('fb-rating').value='2'");
  await click('#fb-submit');
  const saved = await waitFor("document.body.innerText.includes('Feedback so far (1)')", 15000);
  const t5 = await text(); await shot('05_feedback_saved');
  rec('9d submit -> fetch POST -> page reloads showing the saved feedback', !!saved && t5.includes('browser-qa') && t5.includes('Question 3 was too easy') && t5.includes('2/5'), t5.match(/Feedback so far[^\n]*\n[^\n]*/)?.[0]);
  await goto(`/run/${runId}/trace`);
  const t6 = await text();
  rec('10 feedback appears in the trace (after a fresh page load)', /TESTER FEEDBACK\s+\(browser-qa\): NOT useful/.test(t6), t6.match(/TESTER FEEDBACK[^\n]*/)?.[0]);
  const api = await ev(`fetch('/api/run/${runId}/feedback').then(r=>r.json())`);
  rec('10b feedback is retrievable from the API by run id', api.feedback.length === 1 && api.feedback[0].run_id === runId && api.feedback[0].tester === 'browser-qa', JSON.stringify(api.feedback[0]).slice(0, 150));

  // ---- human review through the UI
  await goto('/'); await click('#sample-btn'); await ev("document.getElementById('scenario').value='stuck'"); await click('#gen-btn');
  await waitFor("location.pathname.startsWith('/run/')");
  await waitFor("document.body.innerText.includes('Human review required')");
  const t7 = await text(); await shot('06_human_review');
  rec('11a revision limit reached -> HUMAN REVIEW REQUIRED with the review form', t7.includes('HUMAN REVIEW REQUIRED') && t7.includes('Approve this draft') && /Revision\s+3 of 3/i.test(t7), t7.match(/Workflow state\s+HUMAN REVIEW REQUIRED/i)?.[0]);
  await setVal('#who', 'qa-lead'); await setVal('#notes', 'approved in the browser test');
  await click("[data-decision='APPROVE']");
  await waitFor("document.body.innerText.includes('approved by human:qa-lead')");
  const t8 = await text();
  rec('11b clicking Approve completes the run and attributes it to the human', /Workflow state\s+APPROVED/i.test(t8) && t8.includes('approved by human:qa-lead'), t8.match(/Outcome\s+approved by human:qa-lead/i)?.[0]);

  // ---- error handling in the UI
  await goto('/');
  await click('#gen-btn');
  const invalid = await ev("document.getElementById('source').validity.valueMissing");
  rec('12a empty source: the browser blocks submission (required field)', invalid === true && (await ev("location.pathname")) === '/', 'validity.valueMissing=true; still on /');
  await setVal('#source', 'too short to study'); await click('#gen-btn');
  await waitFor("location.pathname.startsWith('/run/')");
  await waitFor("document.body.innerText.includes('input_too_short')");
  const t9 = await text();
  rec('12b too-short source: run page shows the failure reason, no fake content', t9.includes('FAILED') && t9.includes('input_too_short') && !t9.includes('Quiz'), t9.match(/input_too_short[^\n]*/)?.[0]);

  rec('13 no JavaScript errors were thrown in the browser during the whole session', jsErrors.length === 0, jsErrors.length ? jsErrors.join(' | ') : 'exceptionThrown/console.error count = 0');
  console.log(`\nBROWSER RESULT: ${results.filter((r) => r.pass).length}/${results.length} checks passed`);
  console.log('RUN_ID=' + runId);
}

main().catch((e) => { console.log('HARNESS ERROR: ' + e.message); }).finally(() => {
  try { execSync(`taskkill /F /T /PID ${edge.pid}`, { stdio: 'ignore' }); } catch {}
  process.exit(0);
});
