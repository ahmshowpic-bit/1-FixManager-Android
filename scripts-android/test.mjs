// Node-only regression suite. Not a native-device test.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
function run(file, cwd = root) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', file], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${file} failed with status ${result.status}`);
}
for (const test of ['backup-router-proof', 'backup-format-proof', 'license-interop', 'license-web-proof', 'adb-proof']) run(`tests-android/${test}.ts`);
run('../tests-android/backup-v2-proof.ts', root + 'backend');
const factory = root + 'backend/src/core/http/routerFactory.ts';
const original = fs.readFileSync(factory);
try {
  fs.copyFileSync(root + 'backend/src/core/http/routerFactory.mini.ts', factory);
  run('../tests-android/bridge-smoke.ts', root + 'backend');
} finally { fs.writeFileSync(factory, original); }
