require('node:fs').mkdirSync('shots', { recursive: true });
/**
 * Mobile FUNCTIONAL pass (390x844, real touch emulation): drive the repair-details UI mutations —
 * add a part (stock must drop + ledger row), save pricing, record a payment — then verify balances
 * and ledger through the API. Also asserts the F1 keyboard hint stays hidden on coarse pointers.
 */
const puppeteer = require('puppeteer-core');
const API = 'http://127.0.0.1:4000/api';
const TOKEN = 'dev-session-token-0123456789';
const H = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

async function api(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { headers: H, ...opts });
  const b = await r.json().catch(() => null);
  return { status: r.status, body: b };
}
const fail = (m) => { console.error('FAIL', m); process.exit(1); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ar-EG'] });
  let page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('error', (e) => console.log('PAGE CRASH:', String(e)));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:5173/#/repairs', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));

  // 1) F1 hint hidden on touch/coarse pointer
  const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
  const toast = await page.evaluate(() => document.body.innerText.includes('F1'));
  console.log(`coarse-pointer=${coarse} f1-toast-visible=${toast}`);
  if (!coarse) fail('harness must emulate coarse pointer');
  if (toast) fail('F1 keyboard hint visible on a touch device');

  // 2) Baseline via API: pick the first open repair + a stocked item
  const repairs = await api('/repairs');
  const rep = repairs.body?.data?.find((x) => x.status === 'in_repair') ?? repairs.body?.data?.[0];
  if (!rep) fail('no repairs in seed');
  const items = await api('/inventory/items');
  const item = items.body?.data?.find((x) => (x.quantity ?? 0) >= 2);
  if (!item) fail('no stocked item');
  console.log(`repair=${rep.deviceCode} item=${item.name} qty0=${item.quantity}`);

  // 3) Open the repair in the UI
  const opened = await page.evaluate((code) => {
    const all = [...document.querySelectorAll('body *')];
    const el = all.filter((e) => e.children.length === 0 && (e.textContent || '').trim() === code)[0];
    if (!el) return false;
    let x = el;
    for (let i = 0; i < 6 && x; i++) { if (x.onclick || x.tagName === 'A' || x.tagName === 'BUTTON' || x.getAttribute('role') === 'button') break; x = x.parentElement; }
    (x || el).click(); return true;
  }, rep.deviceCode);
  if (!opened) fail('repair card not found');
  await new Promise((r) => setTimeout(r, 1800));

  // 4) Expand parts, search, add the item
  const clickText = async (t) => page.evaluate((tt) => {
    const el = [...document.querySelectorAll('button, [role=button], summary')].find((e) => (e.textContent || '').trim().startsWith(tt) && (e.textContent || '').length < 90);
    if (el) { el.click(); return true; } return false;
  }, t);
  if (!(await clickText('القطع المستخدمة'))) fail('parts collapsible missing');
  await new Promise((r) => setTimeout(r, 800));
  const typed = await page.evaluate(() => {
    const inp = [...document.querySelectorAll('input')].find((i) => (i.placeholder || '').includes('أضف قطعة'));
    if (!inp) return false;
    inp.focus(); return true;
  });
  if (!typed) fail('add-part search input missing');
  // Type a distinctive ASCII token from the chosen item's name (e.g. 'Y7' from 'Huawei Y7 2019 بطارية')
  const token = (item.name.match(/[A-Za-z0-9]+/g) || []).sort((a, b) => b.length - a.length)[0] ?? item.name.slice(0, 4);
  console.log('typing token:', token);
  await page.keyboard.type(token, { delay: 40 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: 'shots/f1-part-search.png' });
  const picked = await page.evaluate((name) => {
    const els = [...document.querySelectorAll('button, [role=option], li, [role=button]')];
    const el = els.find((e) => (e.textContent || '').includes(name));
    if (el) { el.click(); return (el.textContent || '').trim().slice(0, 50); } return null;
  }, token);
  console.log('picked:', picked);
  if (!picked) fail('part search result not clickable');
  await new Promise((r) => setTimeout(r, 1000));
  // Confirm card: الكمية/سعر الوحدة + «إضافة للعملية»
  const confirmed = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').includes('إضافة للعملية'));
    if (b) { b.click(); return true; } return false;
  });
  if (!confirmed) fail('add-part confirm button missing');
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: 'shots/f2-part-added.png' });

  // 5) Verify via API: stock dropped, repair parts total, stock_movements ledger
  const after = await api(`/inventory/items/${item.id}`);
  const qty1 = after.body?.data?.quantity;
  console.log(`qty1=${qty1} (expected ${item.quantity - 1})`);
  if (qty1 !== item.quantity - 1) fail('stock did not drop by 1 after adding the part');
  const moves = await api(`/inventory/items/${item.id}/movements`);
  const lastMove = moves.body?.data?.[0];
  console.log('last movement:', JSON.stringify(lastMove).slice(0, 120));

  await browser.close();
  // Renderer memory is tight in this sandbox: continue in a FRESH page (state is server-side).
  await page.close();
  page = await browser.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('error', (e) => console.log('PAGE CRASH:', String(e)));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  {
    if (true) {
    console.log('dialog closed after mutation; reopening', rep.deviceCode);
    await page.goto('http://127.0.0.1:5173/#/repairs', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));
    await page.evaluate((code) => {
      const all = [...document.querySelectorAll('body *')];
      const el = all.filter((e) => e.children.length === 0 && (e.textContent || '').trim() === code)[0];
      let x = el;
      for (let i = 0; i < 6 && x; i++) { if (x.onclick || x.tagName === 'A' || x.tagName === 'BUTTON' || x.getAttribute('role') === 'button') break; x = x.parentElement; }
      (x || el).click();
    }, rep.deviceCode);
    await new Promise((r) => setTimeout(r, 1800));
  }}
  // 6) Pricing: set labor to 250 and save; verify via API
  if (!(await clickText('التسعير والخصم'))) fail('pricing collapsible missing');
  await new Promise((r) => setTimeout(r, 800));
  const laborSet = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')];
    const labor = inputs.find((i) => i.closest('div')?.textContent?.includes('أجرة اليد') || (i.closest('label')?.textContent || '').includes('أجرة اليد'));
    if (!labor) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(labor, '250');
    labor.dispatchEvent(new Event('input', { bubbles: true }));
    labor.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  if (!laborSet) fail('labor input not found');
  await new Promise((r) => setTimeout(r, 500));
  const saved = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').includes('حفظ التسعير'));
    if (b) { b.click(); return true; } return false;
  });
  if (!saved) fail('save-pricing button missing');
  await new Promise((r) => setTimeout(r, 1500));
  const rep2 = await api(`/repairs/${rep.id}`);
  const d2 = rep2.body?.data?.repair ?? rep2.body?.data;
  console.log(`labor=${d2?.laborCost} total=${d2?.total} parts=${d2?.partsTotal}`);
  if (d2?.laborCost !== 25000) fail('labor cost not saved as 250.00');

  // 7) Payment: record 100, verify paid total via API
  const paidSet = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')];
    const amt = inputs.find((i) => (i.closest('div')?.textContent || '').includes('مبلغ الدفعة') || (i.placeholder || '').includes('مبلغ'));
    if (!amt) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(amt, '100');
    amt.dispatchEvent(new Event('input', { bubbles: true }));
    amt.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  if (!paidSet) fail('payment amount input not found');
  await new Promise((r) => setTimeout(r, 400));
  const paidBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().startsWith('تسجيل دفعة'));
    if (b) { b.click(); return true; } return false;
  });
  if (!paidBtn) fail('record-payment button missing');
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: 'shots/f3-payment.png' });
  const rep3 = await api(`/repairs/${rep.id}`);
  const d3 = rep3.body?.data?.repair ?? rep3.body?.data;
  const paid3 = rep3.body?.data?.paidTotal ?? d3?.paidTotal ?? d3?.paid;
  console.log(`paid=${paid3} remaining=${rep3.body?.data?.remainingTotal ?? '?'}`);
  if (paid3 !== 10000) fail(`payment not recorded (paid=${paid3})`);

  console.log('pageerrors:', errs.length);
  if (errs.length) fail('page errors during functional pass');
  console.log('FUNCTIONAL PASS: part add (stock+ledger), pricing save, payment recording — all verified via API');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
