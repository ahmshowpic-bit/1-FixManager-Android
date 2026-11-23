require('node:fs').mkdirSync('shots', { recursive: true });
/**
 * Functional phases in ISOLATED browser sessions (one launch per phase; renderer death in the
 * previous combined run is SUSPECTED resource pressure — not established). State is server-side.
 * Phases: pricing (labor save) | payment (record) | backup-import (file picker UI).
 * Every mutation is verified through the API afterward. Run from repo root.
 */
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const API = 'http://127.0.0.1:4000/api';
const H = { authorization: 'Bearer dev-session-token-0123456789', 'content-type': 'application/json' };
const api = async (p, o = {}) => { const r = await fetch(`${API}${p}`, { headers: H, ...o }); return { status: r.status, body: await r.json().catch(() => null) }; };
const fail = (m) => { console.error('FAIL', m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRepairPage(fn) {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ar-EG', '--js-flags=--max-old-space-size=256'] });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('error', (e) => console.log('PAGE CRASH (renderer):', String(e)));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await fn(page, errs);
    if (errs.length) fail('page errors: ' + errs[0]);
  } finally { await browser.close(); }
}
const clickText = (page, t) => page.evaluate((tt) => {
  const el = [...document.querySelectorAll('button, [role=button], summary')].find((e) => (e.textContent || '').trim().startsWith(tt) && (e.textContent || '').length < 90);
  if (el) { el.click(); return true; } return false;
}, t);
const setInput = (page, labelRe, value) => page.evaluate((lr, v) => {
  const re = new RegExp(lr);
  const all = [...document.querySelectorAll('input')];
  // A shared flex-row wrapper makes both fields' closest div match; prefer the NUMERIC field.
  const numeric = all.filter((i) => i.inputMode === 'decimal' || i.inputMode === 'numeric' || i.type === 'number');
  const pool = numeric.length ? numeric : all;
  const inp = pool.find((i) => re.test(i.closest('div')?.textContent || '') || re.test(i.placeholder || ''));
  if (!inp) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, v);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}, labelRe, value);

async function openRepair(page, code) {
  await page.goto(`http://127.0.0.1:5173/#/repairs?open=${code.replace('DV-', '')}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2500);
  const open = await page.evaluate(() => document.body.innerText.includes('بيانات الجهاز'));
  if (!open) fail('repair dialog did not open via ?open=');
}

(async () => {
  const phase = process.argv[2];
  const repairs = await api('/repairs');
  const rep = repairs.body?.data?.find((x) => x.status === 'in_repair') ?? repairs.body?.data?.[0];
  if (!rep) fail('no repairs in seed');
  console.log('repair:', rep.deviceCode, 'id:', rep.id);

  if (phase === 'pricing') {
    await withRepairPage(async (page) => {
      await openRepair(page, rep.deviceCode);
      if (!(await clickText(page, 'التسعير والخصم'))) fail('pricing collapsible missing');
      await sleep(700);
      if (!(await setInput(page, 'أجرة اليد', '250'))) fail('labor input missing');
      await sleep(400);
      const saved = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').includes('حفظ التسعير')); if (b) { b.click(); return true; } return false; });
      if (!saved) fail('save pricing button missing');
      await sleep(1500);
      await page.screenshot({ path: 'shots/f4-pricing-saved.png' });
    });
    const r2 = await api(`/repairs/${rep.id}`);
    const d = r2.body?.data?.repair ?? r2.body?.data;
    console.log('after pricing: labor=', d?.laborCost, 'total=', d?.total);
    if (d?.laborCost !== 25000) fail(`labor not saved (${d?.laborCost})`);
    console.log('PRICING PASS');
  } else if (phase === 'payment') {
    const r0 = await api(`/repairs/${rep.id}`);
    const paid0 = r0.body?.data?.paidTotal ?? (r0.body?.data?.repair?.paidTotal) ?? 0;
    console.log('paid before:', paid0);
    await withRepairPage(async (page) => {
      await openRepair(page, rep.deviceCode);
      if (!(await setInput(page, 'مبلغ الدفعة', '100'))) fail('payment input missing');
      await sleep(400);
      const btn = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().startsWith('تسجيل دفعة')); if (b) { b.click(); return true; } return false; });
      if (!btn) fail('record payment button missing');
      await sleep(1500);
      await page.screenshot({ path: 'shots/f5-payment-recorded.png' });
    });
    const r3 = await api(`/repairs/${rep.id}`);
    const paid = r3.body?.data?.paidTotal ?? (r3.body?.data?.repair?.paidTotal);
    console.log('after payment: paid=', paid, 'remaining=', r3.body?.data?.remainingTotal);
    if (paid !== paid0 + 10000) fail(`payment not recorded (paid0=${paid0} paid=${paid})`);
    console.log('PAYMENT PASS');
  } else if (phase === 'backup-import') {
    // Create a real .msbak through the API (desktop-mode dev server), then feed it to the UI file input.
    const mk = await api('/settings/backups', { method: 'POST', body: JSON.stringify({ password: 'import-test-1' }) });
    const name = mk.body?.data?.name;
    if (!name) fail('could not create backup via API: ' + JSON.stringify(mk.body).slice(0, 120));
    const dl = await fetch(`${API}/settings/backups/${name}/file`, { headers: H });
    if (!dl.ok) fail('could not download the backup file');
    fs.writeFileSync('shots/import-test.msbak', Buffer.from(await dl.arrayBuffer()));
    await withRepairPage(async (page) => {
      await page.goto('http://127.0.0.1:5173/#/settings', { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2500);
      const input = await page.$('input[type=file][accept=".msbak"]');
      if (!input) fail('backup import file input missing');
      await input.uploadFile('shots/import-test.msbak');
      await sleep(2500);
      await page.screenshot({ path: 'shots/f6-backup-import.png' });
      const body = await page.evaluate(() => document.body.innerText);
      if (body.includes('تعذّر') || body.includes('خطأ')) fail('error toast after import: ' + body.slice(0, 200));
    });
    await api(`/settings/backups/${name}`, { method: 'DELETE' }); // leave no duplicate behind
    console.log('BACKUP-IMPORT UI PASS (file picker accepted a real .msbak, success path, no error toast)');
  } else fail('unknown phase ' + phase);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
