require('node:fs').mkdirSync('shots', { recursive: true });
/** Mobile visual pass: repair details (parts/labor/payment) at 390x844 against the seeded dev server. */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ar-EG'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:5173/#/repairs', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  const shot = (n) => page.screenshot({ path: `shots/${n}.png` });
  await shot('02-repairs-list');
  const opened = await page.evaluate(() => {
    const all = [...document.querySelectorAll('body *')];
    const code = all.filter((e) => e.children.length === 0 && /^DV-\d+$/.test((e.textContent || '').trim()))[0];
    if (!code) return null;
    let el = code;
    for (let i = 0; i < 6 && el; i++) {
      if (el.onclick || el.getAttribute('role') === 'button' || el.tagName === 'A' || el.tagName === 'BUTTON') break;
      el = el.parentElement;
    }
    (el || code).click();
    return code.textContent.trim();
  });
  await new Promise((r) => setTimeout(r, 2000));
  console.log('opened:', opened);
  await shot('03-repair-details-top');
  const expand = async (title, name) => {
    const r = await page.evaluate((t) => {
      const nodes = [...document.querySelectorAll('button, [role=button], summary')];
      const el = nodes.find((e) => (e.textContent || '').trim().startsWith(t) && (e.textContent || '').length < 80);
      if (!el) return 'not-found';
      el.click();
      el.scrollIntoView({ block: 'start' });
      return 'clicked';
    }, title);
    await new Promise((r2) => setTimeout(r2, 900));
    await shot(name);
    return r;
  };
  console.log('parts:', await expand('القطع المستخدمة', '06-parts-panel'));
  console.log('pricing:', await expand('التسعير والخصم', '07-pricing-panel'));
  console.log('pageerrors:', errs.length, errs.slice(0, 2).join(' | '));
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
