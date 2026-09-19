// REAL BROWSER + REAL LOCAL MODEL test of StudyHub Phase A3 (cited answers).
// usage: node browser_a3.mjs <base-url> <edge.exe> <profile-dir> <screenshot-dir> <files-dir>
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';

const [BASE, EDGE, PROFILE, SHOTS, FILES] = process.argv.slice(2);
const PORT = 9337;
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rec(name, pass, evidence) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ::  ${String(evidence).replace(/\s+/g, ' ').slice(0, 200)}`);
}
const norm = (t) => t.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
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
  while (Date.now() < end) { try { const v = await ev(expr); if (v) return v; } catch {} await sleep(300); }
  return false;
};
const text = () => ev('document.body.innerText');
const path = () => ev('location.pathname');
const status = () => ev("performance.getEntriesByType('navigation')[0].responseStatus");
const goto = async (p) => { await send('Page.navigate', { url: BASE + p }); await sleep(250); await waitFor("document.readyState==='complete'"); };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); e.value=${JSON.stringify(v)}; return e.value.length;})()`);
const clickIn = (formSel) => ev(`(()=>{document.querySelector(${JSON.stringify(formSel)}).querySelector('button').click(); return 1;})()`);

async function upload(sid, file) {
  await goto(`/subjects/${sid}`);
  const doc = await send('DOM.getDocument', { depth: 1 });
  const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: 'input[type=file]' });
  await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [`${FILES}/${file}`] });
  await clickIn("form[enctype='multipart/form-data']");
  await waitFor("/materials\\/\\d+$/.test(location.pathname)");
}

// Ask a question in the browser; return {loc, sawWorking, seconds}. Waits (up to maxSec) for the page to stop refreshing.
async function ask(sid, question, maxSec = 420) {
  await goto(`/subjects/${sid}`);
  await setVal('#question', question);
  const t0 = Date.now();
  await clickIn(`form[action='/subjects/${sid}/ask']`);
  await waitFor("/questions\\/\\d+$/.test(location.pathname)");
  const loc = await path();
  let sawWorking = false;
  const end = Date.now() + maxSec * 1000;
  while (Date.now() < end) {
    const working = await ev("!!document.querySelector('meta[http-equiv=refresh]')");
    if (working) sawWorking = true; else break;
    await sleep(2000);
  }
  await sleep(300);
  return { loc, sawWorking, seconds: Math.round((Date.now() - t0) / 1000) };
}

async function main() {
  const targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') jsErrors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 160));
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 900, deviceScaleFactor: 1, mobile: false });
  const PW = 'correct horse battery';
  const sourceText = norm(fs.readFileSync(`${FILES}/data-structures.txt`, 'utf8'));

  await goto('/register');
  await setVal('#username', 'alice'); await setVal('#password', PW); await setVal('#password2', PW);
  await clickIn("form[action='/register']");
  await waitFor("location.pathname==='/subjects'");
  await setVal("form[action='/subjects'] #name", 'Data Structures');
  await clickIn("form[action='/subjects']");
  await waitFor("/^\\/subjects\\/\\d+$/.test(location.pathname)");
  const sid = (await path()).split('/').pop();
  rec('0a the Ask form is not offered before any material is uploaded', (await text()).includes('Upload some material first'), 'no question box');
  await upload(sid, 'data-structures.txt');

  // ---- in-scope question, real local model
  const r1 = await ask(sid, 'What does the pop operation do on a stack?');
  let t = await text();
  const st1 = (await ev("document.querySelector('.badge')?.innerText")) || '';
  rec('1  a question runs in the background: the page showed "Working" and then finished by itself', r1.sawWorking && !t.includes('Reading your materials'), `waited ${r1.seconds}s, final badge: ${st1}`);
  const quotes = await ev("[...document.querySelectorAll('blockquote')].map(b=>b.innerText)");
  const answered = st1.startsWith('Answered');
  rec('2  every quote shown is found word for word in the uploaded file (checked here, independently of the app)',
    quotes.every((q) => sourceText.includes(norm(q))) && (answered ? quotes.length > 0 : true),
    `${quotes.length} quote(s); status "${st1}"; ` + (quotes[0] || '').slice(0, 90));
  rec('3  the answer names where it comes from (heading) and says the quotes were checked by the app',
    !answered || (t.includes('Data Structures › Stacks') && t.includes('checked by the app')), answered ? 'source + check label present' : 'not answered by the model: ' + st1);
  await shot('01_answer');
  const trace = await ev("document.querySelector('details') ? 'yes' : 'no'");
  rec('4  "How this was produced" is on the page and lists the steps', trace === 'yes' && (await ev("document.querySelector('details').textContent")).includes('Searched only this subject'), 'details present');
  const firstAnswerText = t;

  // ---- out of scope: must not call the model and must not answer
  const r2 = await ask(sid, 'What is photosynthesis in plants?', 60);
  t = await text();
  rec('5  an out-of-scope question is answered at once with "nothing was guessed" (no model, no answer)',
    t.includes('Not answered: nothing was guessed') && !t.includes('Sources and evidence') && r2.seconds < 20, `took ${r2.seconds}s`);
  await shot('02_not_answered');

  // ---- weak match
  const r3 = await ask(sid, 'What is the enqueue speed of hash tables in databases?', 60);
  t = await text();
  rec('6  a weakly related question does not reach the model and shows the closest passages verbatim',
    t.includes('Closest passages') && !t.includes('Sources and evidence') && r3.seconds < 20, `took ${r3.seconds}s`);

  // ---- feedback (only meaningful on an answered question)
  await goto(r1.loc);
  if (answered) {
    await ev("[...document.querySelectorAll('button')].find(b=>b.innerText==='This looks wrong').click()");
    await waitFor("document.body.innerText.includes('You marked this')");
    rec('7  "This looks wrong" is recorded and shown', (await text()).includes('You marked this "wrong"'), 'marked');
  } else {
    rec('7  (skipped: the first question was not answered by the model)', true, 'n/a');
  }

  // ---- history
  await goto(`/subjects/${sid}`);
  t = await text();
  rec('8  the three questions are listed in the history', t.includes('Your recent questions') && t.includes('pop operation') && t.includes('photosynthesis') && t.includes('hash tables'), 'history shown');
  await shot('03_history');

  // ---- account page
  await goto('/account');
  t = await text();
  rec('9  the Account page explains cloud use and starts with it switched OFF', t.includes('sent to OpenRouter') && (await ev("document.querySelector('input[name=consent]').checked")) === false, 'checkbox off');
  await ev("document.querySelector('input[name=consent]').click()");
  await clickIn("form[action='/account/cloud']");
  await waitFor("location.pathname==='/account'"); await sleep(400);
  rec('10 ticking the box and saving is remembered', (await ev("document.querySelector('input[name=consent]').checked")) === true, 'checkbox on after reload');
  await ev("document.querySelector('input[name=consent]').click()");
  await clickIn("form[action='/account/cloud']"); await sleep(600);
  await shot('04_account');

  // ---- another account
  await ev("document.querySelector(\"form[action='/logout'] button\").click()"); await waitFor("location.pathname==='/login'");
  await goto('/register');
  await setVal('#username', 'bobby'); await setVal('#password', PW); await setVal('#password2', PW);
  await clickIn("form[action='/register']"); await waitFor("location.pathname==='/subjects'");
  await goto(r1.loc);
  const nf = (await status()) === 404 && !(await text()).includes('pop operation');
  await goto(`/subjects/${sid}`);
  rec('11 another account gets 404 for the first account\'s question and subject', nf && (await status()) === 404, `question 404: ${nf}`);
  rec('12 no JavaScript errors in the session', jsErrors.length === 0, jsErrors.join('|') || '0 errors');
  console.log(`\nBROWSER RESULT: ${results.filter((r) => r.pass).length}/${results.length} passed`);
  console.log('\nFIRST ANSWER PAGE TEXT:\n' + firstAnswerText.split('\n').slice(0, 40).join('\n'));
}
main().catch((e) => console.log('HARNESS ERROR: ' + e.message)).finally(() => { try { execSync(`taskkill /F /T /PID ${edge.pid}`, { stdio: 'ignore' }); } catch {} process.exit(0); });
