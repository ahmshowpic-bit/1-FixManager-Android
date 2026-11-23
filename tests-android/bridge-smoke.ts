/**
 * Bridge-level smoke tests (parent's named risk areas): transaction atomicity through the API,
 * FTS5-trigram fallback parity, and license guard rejection — all through MiniRouter dispatch
 * against the REAL container on an encrypted SQLCipher file (NodeADb harness).
 * Run from backend/: npx tsx ../tests-android/bridge-smoke.ts   (routerFactory swapped to .mini first)
 */
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { buildContainer } from '../backend/src/container';
import { openDatabase } from '../backend/src/core/database/connection';
import { migrate } from '../backend/src/core/database/migrator';
import { NodeADb } from '../backend/src/core/database/adb-node';
import { sessionTokenGuard } from '../backend/src/core/middleware/auth';
import { createErrorHandler, notFoundHandler } from '../backend/src/core/errors/errorHandler';
import { MiniRouter, dispatch } from '../backend/src/bridge/miniexpress';
import { licenseGuardAsync } from '../backend/src/bridge/licenseGuardAsync';
import { AsyncLicenseService, type AsyncLicenseStorage } from '../backend/src/core/license/licenseService.web';
import { createLicenseRouter } from '../backend/src/modules/license/license.routes';
import { LICENSE_PUBLIC_KEY } from '../backend/src/core/license/publicKey';
import { makeDeviceIdAsync } from '../backend/src/core/license/licenseWeb';
import { seedItems, seedRepairs } from '../backend/src/dev/seed';

const token = 'dev-session-token-0123456789';
const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); cond ? pass++ : fail++; };

function boot(dataDir: string, fts5Trigram: boolean) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const database = openDatabase({ path: path.join(dataDir, 'shop.db'), key: crypto.randomBytes(32) });
  migrate({ db: database.db, dir: path.join(process.cwd(), 'src/migrations'), capabilities: database.capabilities });
  const adb = new NodeADb(database.db);
  const capabilities = { ...database.capabilities, fts5Trigram };
  const c = buildContainer({ db: adb, capabilities });
  const api = new MiniRouter();
  api.use(sessionTokenGuard(token) as never);
  for (const [prefix, router] of Object.entries(c.routers)) api.use(prefix, router as never);
  api.use(notFoundHandler as never);
  const app = new MiniRouter();
  app.use('/api', api);
  app.use(createErrorHandler({ error: () => {} }) as never);
  return { app, api, c, adb, capabilities };
}
type Res = { status: number; body: any };
const api = (app: MiniRouter, method: string, p: string, body?: unknown) => dispatch(app, method, p, body, auth) as Promise<Res>;

// ---------- 1) FTS5 trigram ON vs OFF: identical search results ----------
{
  const on = boot(path.join(os.tmpdir(), 'bridge-smoke-fts-on'), true);
  const off = boot(path.join(os.tmpdir(), 'bridge-smoke-fts-off'), false);
  await seedItems(on.c, on.adb, on.capabilities); await seedRepairs(on.c);
  await seedItems(off.c, off.adb, off.capabilities); await seedRepairs(off.c);
  // Same ROWS must come back regardless of the FTS path; timestamps differ between the two DBs, so compare ids+count.
  const shape = (r: Res): string => {
    const d = (r.body as any)?.data;
    const rows = Array.isArray(d) ? d : Array.isArray(d?.rows) ? d.rows : [];
    return JSON.stringify({ status: r.status, total: (r.body as any)?.total ?? d?.total ?? rows.length, ids: rows.map((x: any) => x?.id ?? x?.deviceCode ?? x?.code).sort() });
  };
  for (const q of ['/api/customers?q=أحمد&page=1&pageSize=5', '/api/inventory/items/search?q=a12', '/api/repairs?page=1&pageSize=3', '/api/repairs?q=أحمد&page=1&pageSize=5']) {
    const [a, b] = await Promise.all([api(on.app, 'GET', q), api(off.app, 'GET', q)]);
    check(`fts parity ${q}`, a.status === 200 && shape(a) === shape(b), `on=${shape(a)} off=${shape(b)}`);
  }
}

// ---------- 2) Atomicity: a repair create that fails AFTER the customer insert must not leave orphans ----------
{
  const { app } = boot(path.join(os.tmpdir(), 'bridge-smoke-atomic'), true);
  const phone = '01099988777';
  const bad = await api(app, 'POST', '/api/repairs', {
    customer: { name: 'اختبار ذرية', phone }, deviceType: 'موبايل', deviceModel: 'X', problem: 'y',
    parts: [{ itemId: 999999, qty: 1 }], laborCost: 1000, discount: 0, paidNow: 0, notes: null,
  });
  check('failing create-repair rejected', bad.status >= 400 && bad.body?.success === false, `status=${bad.status}`);
  const find = await api(app, 'GET', `/api/customers?q=${phone}&page=1&pageSize=5`);
  const rows = (find.body?.data ?? []) as unknown[];
  check('no orphaned customer row after failed create', find.status === 200 && rows.length === 0, `rows=${rows.length}`);
}

// ---------- 3) License guard: no license -> data routes 403, /license open, garbage code rejected ----------
{
  const { api: apiRouter } = boot(path.join(os.tmpdir(), 'bridge-smoke-license'), true);
  const storage: AsyncLicenseStorage = {
    readLicense: async () => null, writeLicense: async () => {},
    readLastSeen: async () => null, writeLastSeen: async () => {},
  };
  const service = await AsyncLicenseService.open({ deviceId: await makeDeviceIdAsync('bridge-smoke-device'), storage, pub: LICENSE_PUBLIC_KEY });
  const guarded = new MiniRouter();
  guarded.use(licenseGuardAsync(service));
  guarded.use('/license', createLicenseRouter(service as never) as never);
  guarded.use('/api', apiRouter);
  guarded.use(createErrorHandler({ error: () => {} }) as never);

  const status = await dispatch(guarded, 'GET', '/license/status', undefined, auth);
  check('license status reachable without activation', status.status === 200 && (status.body as any)?.data?.state !== undefined, `state=${(status.body as any)?.data?.state}`);
  const blocked = await dispatch(guarded, 'GET', '/api/settings', undefined, auth);
  check('data route blocked (LICENSE_REQUIRED)', blocked.status === 403 && (blocked.body as any)?.error?.code === 'LICENSE_REQUIRED', `status=${blocked.status}`);
  const garbage = await dispatch(guarded, 'POST', '/license/activate', { code: 'LIC1.garbage.not-a-real-license-code' }, auth);
  check('garbage activation code rejected', garbage.status === 422 && (garbage.body as any)?.success === false, `status=${garbage.status}`);
  const stillBlocked = await dispatch(guarded, 'GET', '/api/settings', undefined, auth);
  check('still blocked after failed activation', stillBlocked.status === 403);

  // Full bootstrap journey with a TEST keypair (owner key stays private): status shows device id,
  // a correctly signed code for THIS device activates, and data routes unlock.
  const kp = await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const testPub = await globalThis.crypto.subtle.exportKey('jwk', kp.publicKey) as typeof LICENSE_PUBLIC_KEY;
  const svc2 = await AsyncLicenseService.open({ deviceId: await makeDeviceIdAsync('bridge-smoke-device'), storage, pub: testPub });
  const guarded2 = new MiniRouter();
  guarded2.use(licenseGuardAsync(svc2));
  guarded2.use('/license', createLicenseRouter(svc2 as never) as never);
  guarded2.use('/api', apiRouter);
  guarded2.use(createErrorHandler({ error: () => {} }) as never);
  const st0 = await dispatch(guarded2, 'GET', '/license/status', undefined, auth);
  const deviceId = (st0.body as any)?.data?.deviceId as string;
  check('fresh install: status exposes device code', typeof deviceId === 'string' && deviceId.length > 8, `deviceId=${deviceId}`);
  const b64u = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as Uint8Array).toString('base64url');
  const payload = { v: 1, d: deviceId, n: 'Test Shop', i: '2026-11-23', e: '2027-11-23', k: 1 };
  const p64 = b64u(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await globalThis.crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(p64));
  const act = await dispatch(guarded2, 'POST', '/license/activate', { code: `LIC1.${p64}.${b64u(sig)}` }, auth);
  check('valid code activates', act.status === 200 && (act.body as any)?.data?.state === 'active', `status=${act.status} state=${(act.body as any)?.data?.state}`);
  const unlocked = await dispatch(guarded2, 'GET', '/api/settings', undefined, auth);
  check('data routes unlock after activation', unlocked.status === 200, `status=${unlocked.status}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
