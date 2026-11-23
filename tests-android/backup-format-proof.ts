/**
 * .msbak cross-compatibility proof (Node level): the desktop (sync, node:crypto) and the Android bridge
 * (async, WebCrypto+scryptsy) implementations must read each other's files byte-identically.
 * Run from backend/: npx tsx ../tests-android/backup-format-proof.ts
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeBackup, extractBackup, readBackupHeader } from '../backend/src/modules/settings/backupFormat';
import { packBackup, extractBackupBytes, readBackupHeaderBytes } from '../backend/src/modules/settings/backupFormat.async';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); cond ? pass++ : fail++; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'msbak-xcompat-'));
const key = crypto.randomBytes(32);
const password = 'كلمة سر قوية 123';
// stand-in database image (real one is a SQLCipher file; format layer only sees bytes)
const dbBytes = crypto.randomBytes(3 * 1024 * 1024 + 17);
const dbPath = path.join(tmp, 'shop.db');
fs.writeFileSync(dbPath, dbBytes);

// 1) desktop writes -> android extracts
const desktopOut = path.join(tmp, 'desktop.msbak');
const h1 = writeBackup({ dbPath, outPath: desktopOut, key, password });
const fileBytes = new Uint8Array(fs.readFileSync(desktopOut));
const x1 = await extractBackupBytes(fileBytes, password);
check('android reads desktop file: key matches', Buffer.from(x1.key).equals(key));
check('android reads desktop file: db bytes match', Buffer.from(x1.dbBytes).equals(dbBytes));
check('android reads desktop header: sha + size', x1.header.dbSha256 === h1.dbSha256 && x1.header.dbBytes === h1.dbBytes);

// 2) android packs -> desktop extracts
const packed = await packBackup({ dbBytes: new Uint8Array(dbBytes), key: new Uint8Array(key), password });
const androidOut = path.join(tmp, 'android.msbak');
fs.writeFileSync(androidOut, packed.bytes);
const x2 = extractBackup(androidOut, password, path.join(tmp, 'restored.db'));
check('desktop reads android file: key matches', x2.key.equals(key));
check('desktop reads android file: restored db matches', fs.readFileSync(path.join(tmp, 'restored.db')).equals(dbBytes));

// 3) header readers agree both ways
const hd = readBackupHeader(desktopOut); const ha = readBackupHeaderBytes(new Uint8Array(fs.readFileSync(androidOut)));
check('headers parse both ways', hd.header.dbSha256 === h1.dbSha256 && ha.header.dbSha256 === packed.header.dbSha256 && ha.dataOffset + ha.header.dbBytes === packed.bytes.length);

// 4) wrong password rejected on both sides
let androidRejected = false;
try { await extractBackupBytes(fileBytes, 'wrong-password'); } catch (e: any) { androidRejected = e?.status === 422; }
let desktopRejected = false;
try { extractBackup(androidOut, 'wrong-password', path.join(tmp, 'nope.db')); } catch (e: any) { desktopRejected = e?.status === 422; }
check('wrong password rejected: android impl', androidRejected);
check('wrong password rejected: desktop impl', desktopRejected);

// 5) tampered db bytes rejected by integrity check (android impl)
const tampered = new Uint8Array(fileBytes); tampered[tampered.length - 1]! ^= 1;
let tamperRejected = false;
try { await extractBackupBytes(tampered, password); } catch (e: any) { tamperRejected = e?.status === 422; }
check('tampered db bytes rejected (android impl)', tamperRejected);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
