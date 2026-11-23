require('node:fs').mkdirSync('shots', { recursive: true });
/**
 * Backup-import UI plumbing in the ANDROID bundle (browser, no native plugins): select a real .msbak
 * fixture -> read -> base64 -> bridge request. Expected here: the bridge reports plugin-unavailable,
 * the UI shows an ERROR and never a success toast. Native import/restore is NOT covered.
 * Needs SERVE_ROOT=frontend/dist-android node scripts-android/serve-static.mjs (PORT=5174) on :5174.
 */
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.goto('http://127.0.0.1:5174/#/settings', { waitUntil: 'networkidle2' }); await sleep(2500);
  const input = await p.$('input[type=file][accept=".msbak"]');
  let r = [];
  if (!input) r.push('NOTE: settings page did not render the backup card (bridge unavailable => settings query fails)');
  else { await input.uploadFile('shots/fixture.msbak'); await sleep(2500); }
  const txt = await p.evaluate(() => document.body.innerText);
  await p.screenshot({ path: 'shots/f7-import-android.png' });
  console.log(r.join('\n'), '\nsuccess-toast:', txt.includes('تم استيراد'), 'error-visible:', /تعذّر|خطأ/.test(txt), 'pageerrors:', errs.length);
  await b.close();
})();
