// REAL BROWSER test of StudyHub Phase A2: real file-picker uploads (TXT, PDF, DOCX, a real-world PDF, a scan, an .exe) and search.
// usage: node browser_a2.mjs <base-url> <edge.exe> <profile-dir> <screenshot-dir> <files-dir>
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';

const [BASE, EDGE, PROFILE, SHOTS, FILES] = process.argv.slice(2);
const PORT = 9336;
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rec(name, pass, evidence) {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ::  ${String(evidence).replace(/\s+/g, ' ').slice(0, 170)}`);
}
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
  while (Date.now() < end) { try { const v = await ev(expr); if (v) return v; } catch {} await sleep(150); }
  return false;
};
const text = () => ev('document.body.innerText');
const path = () => ev('location.pathname');
const status = () => ev("performance.getEntriesByType('navigation')[0].responseStatus");
const goto = async (p) => { await send('Page.navigate', { url: BASE + p }); await sleep(250); await waitFor("document.readyState==='complete'"); };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); e.value=${JSON.stringify(v)}; return e.value.length;})()`);
const clickIn = (formSel) => ev(`(()=>{document.querySelector(${JSON.stringify(formSel)}).querySelector('button').click(); return 1;})()`);

async function chooseFile(file) {                       // the real file picker path: DOM.setFileInputFiles, then a real form submit
  const doc = await send('DOM.getDocument', { depth: 1 });
  const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: "input[type=file]" });
  await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [`${FILES}/${file}`] });
  const chosen = await ev("document.querySelector('input[type=file]').files[0]?.name");
  await clickIn("form[enctype='multipart/form-data']");
  return chosen;
}
async function upload(sid, file) {
  await goto(`/subjects/${sid}`);
  const chosen = await chooseFile(file);
  await waitFor("document.readyState==='complete'");
  await sleep(600);
  return chosen;
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

  // ---- account + subject
  await goto('/register');
  await setVal('#username', 'alice'); await setVal('#password', PW); await setVal('#password2', PW);
  await clickIn("form[action='/register']");
  await waitFor("location.pathname==='/subjects'");
  await setVal("form[action='/subjects'] #name", 'Data Structures');
  await clickIn("form[action='/subjects']");
  await waitFor("/^\\/subjects\\/\\d+$/.test(location.pathname)");
  const sid = (await path()).split('/').pop();
  rec('1  account and subject created in the browser', /^\d+$/.test(sid) && (await text()).includes('No materials yet'), `subject ${sid}`);

  // ---- TXT
  let chosen = await upload(sid, 'data-structures.txt');
  let t = await text();
  const txtDoc = await path();
  rec('2  TXT chosen in the file picker and uploaded -> document page with 3 passages and its headings',
    chosen === 'data-structures.txt' && /materials\/\d+$/.test(txtDoc) && t.includes('3 passages') && t.includes('Data Structures › Stacks') && t.includes('last-in first-out'),
    `${chosen} -> ${txtDoc}`);
  await shot('01_txt_document');

  // ---- PDF with an outline
  await upload(sid, 'course-notes.pdf');
  t = await text();
  rec('3  PDF with bookmarks: title from metadata, 2 pages, passages show page numbers', t.includes('Course notes') && t.includes('2 pages') && t.includes('p. 1') && t.includes('p. 2'), t.split('\n').slice(0, 4).join(' | '));

  // ---- DOCX
  await upload(sid, 'networks.docx');
  t = await text();
  rec('4  DOCX: heading styles and the table row are extracted', t.includes('Networks › Layers') && t.includes('Transport | Delivery') && t.includes('router forwards packets'), t.split('\n').slice(0, 3).join(' | '));

  // ---- real-world PDF
  await upload(sid, 'real-world.pdf');
  t = await text();
  const passages = +(t.match(/(\d+) passages/) || [0, 0])[1];
  const pages = +(t.match(/(\d+) pages/) || [0, 0])[1];
  rec('5  a real-world PDF (69 KB, from this repo) is read: pages and passages found', pages > 0 && passages > 0 && !t.includes('scanned'), `${pages} pages, ${passages} passages, title "${t.split('\n')[1]}"`);
  await shot('02_real_pdf_document');

  // ---- scanned PDF
  await upload(sid, 'scan.pdf');
  t = await text();
  rec('6  a scanned PDF is reported, not silently empty', t.includes('scanned PDF') && t.includes('OCR is not supported') && t.includes('0 passages'), 'warning shown on the document page');
  await shot('03_scanned_warning');

  // ---- wrong type
  await goto(`/subjects/${sid}`);
  await chooseFile('program.exe');
  await waitFor("document.body.innerText.includes('Only PDF')");
  t = await text();
  rec('7  an .exe picked anyway is refused with a message, on the subject page (HTTP 400)', t.includes('Only PDF, Word (.docx) and plain-text files are supported.') && (await status()) === 400, `HTTP ${await status()}`);

  // ---- duplicate
  await upload(sid, 'data-structures.txt');
  rec('8  the same file again is recognised as a duplicate', (await text()).includes('already in this subject') && (await ev('location.search')) === '?dup=1', await ev('location.search'));

  // ---- subject page lists everything
  await goto(`/subjects/${sid}`);
  t = await text();
  const docs = await ev("document.querySelectorAll('a[href*=\"/materials/\"]').length");
  rec('9  the subject page lists the 5 documents and the topics found', docs === 5 && t.includes('Topics found') && t.includes('Data Structures › Trees') && t.includes('Search your materials'), `${docs} document links`);
  await shot('04_subject_with_materials');

  // ---- search
  await setVal("form[action$='/search'] input[name=q]", 'how does inorder traversal of a binary tree work');
  await clickIn("form[action$='/search']");
  await waitFor("location.pathname.endsWith('/search')");
  t = await text();
  const first = await ev("document.querySelector('.passage')?.innerText");
  rec('10 search returns the right passage first, with its document and heading', /Inorder traversal visits the left subtree/.test(first || '') && t.includes('Data Structures › Trees'), (first || '').slice(0, 90));
  await shot('05_search_results');
  await goto(`/subjects/${sid}/search?q=` + encodeURIComponent('routing tables'));
  t = await text();
  rec('11 the DOCX passage is found by its own words', t.includes('router forwards packets between networks using routing tables'), 'found in networks.docx');
  await goto(`/subjects/${sid}/search?q=` + encodeURIComponent('photosynthesis chlorophyll'));
  rec('12 a question the materials do not cover returns nothing (no guessing)', (await text()).includes('No passage in this subject matches') && (await ev("document.querySelectorAll('.passage').length")) === 0, 'no passages');
  await goto(`/subjects/${sid}/search?q=` + encodeURIComponent('a" OR "b AND ( NEAR'));
  rec('13 search syntax typed by a user does not break the search page', (await status()) === 200, 'HTTP ' + await status());

  // ---- hostile file
  await upload(sid, 'hostile.txt');
  const hostilePath = await path();
  const html = await ev('document.documentElement.outerHTML');
  rec('14 a file whose text contains <script> and <img onerror> is displayed as text, never executed',
    (await ev('document.querySelectorAll("img").length')) === 0 && (await ev('document.scripts.length')) === 0 && (await text()).includes('<img src=x onerror=alert(2)>'), 'img: 0, script: 0');

  // ---- remove a material
  await ev("document.querySelector(\"form[action$='/delete'] button\").click()");
  await waitFor(`location.pathname==='/subjects/${sid}'`);
  const left = await ev("document.querySelectorAll('a[href*=\"/materials/\"]').length");
  await goto(hostilePath);
  rec('15 removing a material works, and its page is gone (404)', left === 5 && (await status()) === 404, `${left} documents left; old page HTTP ${await status()}`);

  // ---- second user
  await goto(`/subjects/${sid}`);
  await ev("document.querySelector(\"form[action='/logout'] button\").click()"); await waitFor("location.pathname==='/login'");
  await goto('/register');
  await setVal('#username', 'bobby'); await setVal('#password', PW); await setVal('#password2', PW);
  await clickIn("form[action='/register']");
  await waitFor("location.pathname==='/subjects'");
  await goto(txtDoc);
  const nf1 = (await status()) === 404 && !(await text()).includes('last-in first-out');
  await goto(`/subjects/${sid}/search?q=stack`);
  const nf2 = (await status()) === 404 && !(await text()).includes('last-in first-out');
  await goto(`/subjects/${sid}`);
  const nf3 = (await status()) === 404;
  rec('16 another account gets 404 for alice\'s document, search and subject, and no text leaks', nf1 && nf2 && nf3, `document ${nf1}, search ${nf2}, subject ${nf3}`);
  await shot('06_bob_404');
  rec('17 no JavaScript errors in the session', jsErrors.length === 0, jsErrors.join('|') || '0 errors');
  console.log(`\nBROWSER RESULT: ${results.filter((r) => r.pass).length}/${results.length} passed`);
}
main().catch((e) => console.log('HARNESS ERROR: ' + e.message)).finally(() => { try { execSync(`taskkill /F /T /PID ${edge.pid}`, { stdio: 'ignore' }); } catch {} process.exit(0); });
