/**
 * Android bundle boot regression check (learned from a false-positive harness):
 * serves frontend/dist-android and loads it in headless Chrome. Asserts:
 *  1. the app MOUNTS (#root has children) — a passing vite build is not a booting app;
 *  2. ZERO page errors (e.g. the module-level `Buffer is not defined` crash);
 *  3. ZERO network requests — the bridge must be fully in-process / offline by construction;
 *  4. with the native plugin absent (plain Chrome) the user sees the honest BRIDGE_UNAVAILABLE
 *     message, not a fake "server unreachable" network error.
 * Run from repo root: node scripts-android/bundle-load-check.cjs
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..', 'frontend', 'dist-android');
const PORT = 5179;

const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent((req.url || '/').split('?')[0]));
  if (!p.startsWith(root)) p = root;
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  const ext = path.extname(p);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.sql': 'application/octet-stream' }[ext] || 'application/octet-stream';
  res.setHeader('content-type', mime);
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  const errors = [], failed = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('requestfailed', (r) => failed.push(r.url()));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 6000));
  const state = await page.evaluate(() => ({
    mounted: (document.getElementById('root')?.childElementCount ?? 0) > 0,
    alertText: document.querySelector('[role="alert"]')?.textContent ?? '',
  }));
  await browser.close();
  server.close();

  let bad = 0;
  const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) bad++; };
  check('app mounts', state.mounted);
  check('zero page errors', errors.length === 0, errors[0] ?? '');
  check('zero network requests (offline bridge)', failed.length === 0, failed[0] ?? '');
  check('plugin-absent message is honest (BRIDGE_UNAVAILABLE copy)', state.alertText.includes('تعذّر تشغيل قاعدة البيانات'), state.alertText.slice(0, 90));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); server.close(); process.exit(1); });
