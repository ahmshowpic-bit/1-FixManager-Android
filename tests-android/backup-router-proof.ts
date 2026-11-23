/**
 * Backup override router proof (Node): dispatch through createAndroidBackupRouter with a stub
 * AndroidBackupService — verifies route wiring, response envelope ({success,data}), the confirm
 * gate, password requirement, GET /settings backup-availability patch, and fall-through freedom
 * (unmatched /settings paths are NOT answered by this router).
 * Run from frontend/: npx tsx ../tests-android/backup-router-proof.ts
 */
import { MiniRouter, dispatch } from '../backend/src/bridge/miniexpress';
import { createErrorHandler } from '../backend/src/core/errors/errorHandler';
import { createAndroidBackupRouter } from '../frontend/src/bridge/backupRouter';
import type { BackupInfo } from '../frontend/src/bridge/backupAndroid';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); cond ? pass++ : fail++; };
const H = { authorization: 'Bearer t', 'content-type': 'application/json' };

const one: BackupInfo = { name: 'backup-2026-11-23T10-00-00.msbak', size: 1234, createdAt: '2026-11-23T10:00:00.000Z' };
const calls: string[] = [];
const stub = {
  list: async () => [one],
  create: async (pw: string) => { calls.push(`create:${pw}`); return one; },
  importBytes: async (b: Uint8Array) => { calls.push(`import:${b.length}`); return one; },
  restore: async (n: string, pw: string) => { calls.push(`restore:${n}:${pw}`); return { staged: true as const, name: n }; },
  verify: async (n: string, pw: string) => { calls.push(`verify:${n}:${pw}`); return { createdAt: one.createdAt, dbBytes: one.size }; },
  fileBase64: async (n: string) => { calls.push(`file:${n}`); return 'QUJD'; },
  remove: async (n: string) => { calls.push(`remove:${n}`); },
};

// Container's settings router: answers GET / with backup.available=false (the thing we patch).
const containerSettings = new MiniRouter();
containerSettings.get('/', (_rq, rs) => { rs.json({ success: true, data: { shopName: 'محل', backup: { available: false, canRestore: false, dir: null, lastBackupAt: null } } }); });

const api = new MiniRouter();
api.use('/settings', createAndroidBackupRouter(stub as never, containerSettings) as never);
api.use('/settings', containerSettings as never); // fall-through mount, as in runtime.ts
api.use(createErrorHandler({ error: () => undefined }) as never); // like runtime.ts: AppError -> status+Arabic body

let r = await dispatch(api, 'GET', '/settings/backups', undefined, H);
check('GET /backups lists from the service', r.status === 200 && (r.body as { data: BackupInfo[] }).data[0]?.name === one.name);

r = await dispatch(api, 'POST', '/settings/backups', { password: 'secret-1' }, H);
check('POST /backups creates (201, password passed through)', r.status === 201 && calls.includes('create:secret-1'));

r = await dispatch(api, 'POST', '/settings/backups', {}, H);
check('POST /backups without password rejected 422 Arabic', r.status === 422 && JSON.stringify(r.body).includes('كلمة المرور'));

r = await dispatch(api, 'POST', '/settings/backups/import', { fileBase64: 'QUJD' }, H);
check('POST /backups/import decodes base64 (3 bytes)', r.status === 201 && calls.includes('import:3'));

r = await dispatch(api, 'POST', `/settings/backups/${one.name}/restore`, { password: 'x' }, H);
check('restore without confirm:true rejected', r.status === 422 && !calls.some((c) => c.startsWith('restore:')));
r = await dispatch(api, 'POST', `/settings/backups/${one.name}/restore`, { password: 'x', confirm: true }, H);
check('restore with confirm:true reaches the service', r.status === 200 && calls.includes(`restore:${one.name}:x`));

r = await dispatch(api, 'POST', `/settings/backups/${one.name}/verify`, { password: 'pw' }, H);
check('verify reaches the service', r.status === 200 && calls.includes(`verify:${one.name}:pw`));

r = await dispatch(api, 'GET', `/settings/backups/${one.name}/file`, undefined, H);
check('file endpoint exposes TOP-LEVEL fileBase64 for handleApiDownload', r.status === 200 && (r.body as { fileBase64?: string }).fileBase64 === 'QUJD');

r = await dispatch(api, 'DELETE', `/settings/backups/${one.name}`, undefined, H);
check('DELETE reaches the service', r.status === 200 && calls.includes(`remove:${one.name}`));

r = await dispatch(api, 'GET', '/settings', undefined, H);
const b = (r.body as { data: { shopName: string; backup: { available: boolean; canRestore: boolean; lastBackupAt: string | null } } }).data;
check('GET /settings relays container fields', r.status === 200 && b.shopName === 'محل');
check('GET /settings patches backup availability from the Android service', b.backup.available === true && b.backup.canRestore === true && b.backup.lastBackupAt === one.createdAt);

r = await dispatch(api, 'GET', '/settings/staff', undefined, H);
check('unmatched /settings paths fall through to the container router (404 there, not swallowed)', r.status === 404);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
