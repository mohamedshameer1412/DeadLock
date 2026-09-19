// REAL BROWSER test of StudyHub Phase A1: Edge (headless) driving the real server with real form posts.
// usage: node browser_a1.mjs <base-url> <edge.exe> <profile-dir> <screenshot-dir>
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';

const [BASE, EDGE, PROFILE, SHOTS] = process.argv.slice(2);
const PORT = 9335;
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
const goto = async (p) => { await send('Page.navigate', { url: BASE + p }); await sleep(250); await waitFor("document.readyState==='complete'"); };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); e.value=${JSON.stringify(v)}; return e.value.length;})()`);
const submit = (formSel) => ev(`(()=>{const f=document.querySelector(${JSON.stringify(formSel)}); f.querySelector('button').click(); return 'clicked';})()`);
const cookies = async () => (await send('Network.getCookies', { urls: [BASE] })).result.cookies;
const sessionCookie = async () => (await cookies()).find((c) => c.name === 'sh_session');

async function signUp(user, pw) {
  await goto('/register');
  await setVal('#username', user); await setVal('#password', pw); await setVal('#password2', pw);
  await submit("form[action='/register']");
  return waitFor("location.pathname==='/subjects'", 15000);
}
async function signIn(user, pw) {
  await goto('/login');
  await setVal('#username', user); await setVal('#password', pw);
  await submit("form[action='/login']");
}
async function addSubject(name, desc) {
  await goto('/subjects');
  await setVal("form[action='/subjects'] #name", name); await setVal("form[action='/subjects'] #description", desc);
  await submit("form[action='/subjects']");
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
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 900, deviceScaleFactor: 1, mobile: false });
  const PW = 'correct horse battery';

  rec('0  a real browser', !!(await ev('navigator.userAgent')).match(/Edg\/[\d.]+/), (await ev('navigator.userAgent')).match(/Edg\/[\d.]+/)?.[0]);

  await goto('/');
  rec('1  signed out, the home page sends you to the login page', (await path()) === '/login' && (await text()).includes('Log in'), 'location: ' + await path());
  await shot('01_login');

  // ---- register alice at PRODUCTION scrypt cost
  const t0 = Date.now();
  const ok = await signUp('alice', PW);
  rec('2  register -> lands on Your subjects, signed in as alice', !!ok && (await text()).includes('Signed in as alice') && (await text()).includes('No subjects yet'), `${Date.now() - t0} ms incl. real scrypt`);
  const c = await sessionCookie();
  rec('3  the session cookie is HttpOnly, SameSite=Lax, path /', !!c && c.httpOnly === true && c.sameSite === 'Lax' && c.path === '/', JSON.stringify({ httpOnly: c?.httpOnly, sameSite: c?.sameSite, path: c?.path, secure: c?.secure }));
  rec('3b JavaScript in the page cannot read the session cookie', !(await ev('document.cookie')).includes('sh_session'), 'document.cookie = ' + JSON.stringify(await ev('document.cookie')));

  // ---- subjects
  await addSubject('Databases', 'SQL and design');
  await waitFor("location.pathname.startsWith('/subjects/')");
  const dbSubject = await path();
  rec('4  create a subject -> its own page', /^\/subjects\/\d+$/.test(dbSubject) && (await text()).includes('Databases') && (await text()).includes('SQL and design'), dbSubject);
  await addSubject('<img src=x onerror=alert(1)>', '<script>alert(2)</script>');
  await waitFor("location.pathname.startsWith('/subjects/')");
  await goto('/subjects');
  const imgs = await ev("document.querySelectorAll('img').length");
  rec('5  a hostile subject name is shown as text, never executed', (await text()).includes('<img src=x onerror=alert(1)>') && imgs === 0 && (await ev('document.scripts.length')) === 0, `img elements: ${imgs}, script elements: ${await ev('document.scripts.length')}`);
  await shot('02_subjects');
  await goto(dbSubject);
  await setVal("form[action$='/edit'] #name", 'Database Systems');
  await submit("form[action$='/edit']");
  await waitFor("document.querySelector('h1').innerText==='Database Systems'");
  rec('6  rename a subject', (await ev("document.querySelector('h1').innerText")) === 'Database Systems', 'h1 = Database Systems');
  await shot('03_subject');

  // ---- logout, and replay of the old cookie
  const oldToken = (await sessionCookie()).value;
  await ev("document.querySelector(\"form[action='/logout'] button\").click()");
  await waitFor("location.pathname==='/login'");
  rec('7  logout -> login page, cookie removed by the browser', (await path()) === '/login' && !(await sessionCookie()), 'sh_session present: ' + !!(await sessionCookie()));
  await goto('/subjects');
  rec('7b signed out again, /subjects sends you to the login page', (await path()) === '/login', await path());
  await send('Network.setCookie', { name: 'sh_session', value: oldToken, url: BASE, httpOnly: true, sameSite: 'Lax' });
  await goto('/subjects');
  rec('8  REPLAY: putting the old cookie back does not log you in (server-side logout)', (await path()) === '/login', 'location after replay: ' + await path());
  await send('Network.deleteCookies', { name: 'sh_session', url: BASE });

  // ---- wrong password
  await signIn('alice', 'wrong-password-1');
  await waitFor("document.body.innerText.includes('Invalid username or password.')");
  const bad = await text();
  rec('9  wrong password -> generic error, still on the login page, nothing echoed', bad.includes('Invalid username or password.') && (await path()) === '/login' && !(await ev("document.querySelector('#password').value")), 'message shown; password field empty');
  await signIn('nobody-here', 'wrong-password-1');
  await waitFor("document.body.innerText.includes('Invalid username or password.')");
  rec('9b unknown user gets the identical message', (await text()).includes('Invalid username or password.') && !(await text()).toLowerCase().includes('no such user'), 'same text');

  // ---- bob cannot see alice's data
  await signUp('bobby', PW);
  const bobList = await text();
  rec('10 a second user starts with nothing and sees none of alice\'s subjects', bobList.includes('No subjects yet') && !bobList.includes('Database'), 'Bob\'s subjects page: "No subjects yet"');
  await goto(dbSubject);
  const nav = await ev("performance.getEntriesByType('navigation')[0].responseStatus");
  const nf = await text();
  rec('11 bob opening alice\'s subject URL gets a 404 page that reveals nothing', nav === 404 && nf.includes('Not found') && !nf.includes('Database Systems') && !nf.includes('SQL and design'), `HTTP ${nav}: ` + nf.split('\n')[0]);
  await shot('04_bob_404');
  const csrfless = await ev(`fetch('/subjects', {method:'POST', body:new URLSearchParams({name:'sneaky'})}).then(r=>r.status)`);
  rec('12 a POST without the CSRF token is refused (403)', csrfless === 403, 'HTTP ' + csrfless);
  const hdr = await ev(`fetch('/login').then(r=>[r.headers.get('content-security-policy'), r.headers.get('x-frame-options'), r.headers.get('x-content-type-options')])`);
  rec('13 security headers reach the browser (CSP forbids scripts, no framing, nosniff)', hdr[0].includes("script-src 'none'") && hdr[1] === 'DENY' && hdr[2] === 'nosniff', hdr.join(' | ').slice(0, 150));

  // ---- alice logs back in and finds her own data
  await ev("document.querySelector(\"form[action='/logout'] button\").click()"); await waitFor("location.pathname==='/login'");
  await signIn('alice', PW);
  await waitFor("location.pathname==='/subjects'");
  const back = await text();
  rec('14 alice logs in again and finds her subjects, and only hers', back.includes('Database Systems') && back.includes('<img src=x onerror=alert(1)>') && !back.includes('sneaky'), 'Database Systems present, "sneaky" absent');
  rec('15 no JavaScript errors in the session', jsErrors.length === 0, jsErrors.join('|') || '0 errors');
  console.log(`\nBROWSER RESULT: ${results.filter((r) => r.pass).length}/${results.length} passed`);
}
main().catch((e) => console.log('HARNESS ERROR: ' + e.message)).finally(() => { try { execSync(`taskkill /F /T /PID ${edge.pid}`, { stdio: 'ignore' }); } catch {} process.exit(0); });
