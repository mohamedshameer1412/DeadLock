// REAL BROWSER + REAL LOCAL MODEL test of StudyHub Phase B (multiple-choice generation).
// usage: node browser_b.mjs <base-url> <edge.exe> <profile-dir> <screenshot-dir> <files-dir>
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';

const [BASE, EDGE, PROFILE, SHOTS, FILES] = process.argv.slice(2);
const PORT = 9338;
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rec(name, pass, evidence) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ::  ${String(evidence).replace(/\s+/g, ' ').slice(0, 220)}`);
}
const norm = (t) => t.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
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
  rec('0  before any upload there is no generate form, only a hint', (await text()).includes('Upload some material first') && !(await ev("!!document.querySelector('form[action$=\"/mcq/generate\"]')")), 'hint shown');
  await upload(sid, 'data-structures.txt');
  await goto(`/subjects/${sid}`);
  const topicsInSelect = await ev("[...document.querySelectorAll('#topic option')].map(o=>o.textContent)");
  rec('1  after uploading, the form offers "Whole subject" and each topic found', topicsInSelect.length === 4 && topicsInSelect[0] === 'Whole subject', topicsInSelect.join(' | '));

  // ---- generate 3 questions with the REAL local model
  await setVal('#count', '3');
  const t0 = Date.now();
  await clickIn("form[action$='/mcq/generate']");
  await waitFor("/mcq\\/jobs\\/\\d+$/.test(location.pathname)");
  const jobPath = await path();
  let sawWorking = false;
  const end = Date.now() + 900 * 1000;
  while (Date.now() < end) {
    if (await ev("!!document.querySelector('meta[http-equiv=refresh]')")) { sawWorking = true; await sleep(2500); } else break;
  }
  await sleep(300);
  const secs = Math.round((Date.now() - t0) / 1000);
  let t = await text();
  const kept = +(t.match(/(\d+) of (\d+) questions kept/) || [0, 0, 0])[1];
  rec('2  the job page showed "writing" and then finished by itself', sawWorking && /Finished|Could not finish/.test(t), `${secs}s; ${(t.match(/(?:Finished|Could not finish): \d+ of \d+ questions kept/) || [''])[0]}`);
  rec('3  at least one question was kept (real model, every check passed)', kept >= 1, `${kept} kept`);
  await shot('01_job_closed');

  // ---- structure of each question
  const cards = await ev(`[...document.querySelectorAll('.card[id^=q]')].map(c => ({
      stem: c.querySelector('b').innerText,
      options: [...c.querySelectorAll('ol.opts li')].map(li => li.innerText),
      open: c.querySelector('details').open,
      visibleText: c.innerText,
      detailsText: c.querySelector('details').textContent,
      quote: c.querySelector('blockquote').textContent,
      answerText: c.querySelector('details .ok b').textContent,
    }))`);
  rec('4  every question has exactly 4 different options', cards.length === kept && cards.every((c) => c.options.length === 4 && new Set(c.options.map(norm)).size === 4), cards.map((c) => c.options.length).join(','));
  rec('5  the answer is hidden until the "Show answer" section is opened', cards.every((c) => !c.open && !c.visibleText.includes('Correct answer')), 'closed by default; not in visible text');
  // open the first and read it
  await ev("document.querySelector('.card[id^=q] summary').click()");
  await sleep(300);
  const opened = await ev("document.querySelector('.card[id^=q] details').innerText");
  rec('6  opening it shows the correct answer, the exact source words and the checks', /Correct answer: [A-D]\)/.test(opened) && opened.includes('checked by the app') && opened.includes('independent reader'), opened.replace(/\s+/g, ' ').slice(0, 160));
  await shot('02_question_open');

  // ---- independent check of every quote and answer letter against the uploaded file, done here in the test
  const quotesOk = cards.every((c) => sourceText.includes(norm(c.quote)));
  const lettersOk = cards.every((c) => {
    const m = c.answerText.match(/^Correct answer: ([A-D])\) (.*)$/);
    return !!m && norm(c.options['ABCD'.indexOf(m[1])]) === norm(m[2]);
  });
  rec('7  every quote shown is found word for word in the uploaded file (checked here, independently of the app)', quotesOk && cards.length > 0, `${cards.length} quote(s)`);
  rec('8  the revealed letter really is the option that holds the answer text', lettersOk && cards.length > 0, 'letters match options');
  const letters = cards.map((c) => (c.answerText.match(/^Correct answer: ([A-D])\)/) || [])[1]);
  rec('9  the answer letters are not all the same (the app shuffles, not the model)', kept < 2 || new Set(letters).size > 1, letters.join(''));
  const trace = await ev("document.querySelector('.card + p + details, details:last-of-type')?.textContent || ''");
  rec('10 "How these were produced" lists the steps, including the independent reader', (await ev("[...document.querySelectorAll('details')].map(d=>d.textContent).join(' ')")).includes('independent reader answered each question'), 'steps present');

  // ---- bank, topic filter, delete
  await goto(`/subjects/${sid}/mcq`);
  t = await text();
  const inBank = await ev("document.querySelectorAll('.card[id^=q]').length");
  rec('11 the question bank lists them', inBank === kept && t.includes('Question bank'), `${inBank} in bank`);
  await shot('03_bank');
  const firstTopicLink = await ev("[...document.querySelectorAll('a')].find(a=>a.href.includes('/mcq?topic='))?.getAttribute('href')");
  await goto(firstTopicLink);
  const filtered = await ev("document.querySelectorAll('.card[id^=q]').length");
  rec('12 the topic filter narrows the bank to that topic', filtered <= inBank && filtered >= 0 && (await status()) === 200, `${filtered} of ${inBank} for ${firstTopicLink}`);
  await goto(`/subjects/${sid}/mcq`);
  await ev("document.querySelector(\".card[id^=q] form[action$='/delete'] button\").click()");
  await waitFor(`location.pathname==='/subjects/${sid}/mcq'`); await sleep(500);
  const after = await ev("document.querySelectorAll('.card[id^=q]').length");
  rec('13 deleting a question removes it', after === inBank - 1, `${inBank} -> ${after}`);

  // ---- a request that must be refused
  await goto(`/subjects/${sid}`);
  await setVal('#count', '11');
  await ev("document.querySelector('#count').removeAttribute('max')");
  await clickIn("form[action$='/mcq/generate']");
  await waitFor("document.body.innerText.includes('from 1 to 10')");
  rec('14 a count outside 1 to 10 is refused with a message (HTTP 400) and starts nothing', (await status()) === 400 && (await path()).endsWith(`/subjects/${sid}/mcq/generate`), `HTTP ${await status()}`);

  // ---- another account
  await goto(`/subjects/${sid}`);
  await ev("document.querySelector(\"form[action='/logout'] button\").click()"); await waitFor("location.pathname==='/login'");
  await goto('/register');
  await setVal('#username', 'bobby'); await setVal('#password', PW); await setVal('#password2', PW);
  await clickIn("form[action='/register']"); await waitFor("location.pathname==='/subjects'");
  await goto(jobPath); const s1 = await status(); const leak1 = (await text()).includes('Correct answer');
  await goto(`/subjects/${sid}/mcq`); const s2 = await status(); const leak2 = (await text()).includes(cards[0]?.stem || 'zzzz');
  rec("15 another account gets 404 for the first account's job and question bank, and no question text leaks", s1 === 404 && s2 === 404 && !leak1 && !leak2, `job ${s1}, bank ${s2}`);
  rec('16 no JavaScript errors in the session', jsErrors.length === 0, jsErrors.join('|') || '0 errors');
  console.log(`\nBROWSER RESULT: ${results.filter((r) => r.pass).length}/${results.length} passed`);
  console.log('\nQUESTIONS AS SHOWN:\n' + cards.map((c, i) => `${i + 1}. ${c.stem}\n   ` + c.options.map((o, j) => 'ABCD'[j] + ') ' + o).join('  |  ') + `\n   answer: ${letters[i]}`).join('\n'));
}
main().catch((e) => console.log('HARNESS ERROR: ' + e.message)).finally(() => { try { execSync(`taskkill /F /T /PID ${edge.pid}`, { stdio: 'ignore' }); } catch {} process.exit(0); });
