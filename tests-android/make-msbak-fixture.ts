/** Builds a real v1 .msbak (tiny encrypted db) for UI file-input tests. Usage: npx tsx tests-android/make-msbak-fixture.ts OUT */
import crypto from 'node:crypto'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { writeBackup } from '../backend/src/modules/settings/backupFormat';
const out = process.argv[2]!; const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-'));
const key = crypto.randomBytes(32); const db = new Database(path.join(tmp, 'a.db'));
db.pragma("cipher = 'sqlcipher'"); db.pragma(`key = "x'${key.toString('hex')}'"`); db.exec('CREATE TABLE t(a)'); db.close();
writeBackup({ dbPath: path.join(tmp, 'a.db'), outPath: out, key, password: 'fixture-pass-1' });
console.log('fixture', out, fs.statSync(out).size);
