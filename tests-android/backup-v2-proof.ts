/**
 * v2 backup proof at Node level, exercising the EXACT production code:
 *   backend/src/modules/settings/backupFormat.async.ts (packBackupV2/checkBackupV2/makeV2Kdf/deriveKeyHex)
 *   backend/src/modules/settings/backupCopy.ts (userTables/prefixCreate/copyTablesInto/replaceMainFrom)
 * against a REAL migrated schema (all 13 migrations, incl. items_fts FTS5) on encrypted
 * better-sqlite3-multiple-ciphers files. The steps mirror AndroidBackupService 1:1
 * (ATTACH KEY + schema replay + row copy); Filesystem cache paths are plain Node fs here.
 * Device-native steps (plugin Filesystem, native SQLCipher) stay on the on-device checklist.
 * Run from backend/: npx tsx ../tests-android/backup-v2-proof.ts
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { openDatabase } from '../backend/src/core/database/connection';
import { migrate } from '../backend/src/core/database/migrator';
import { NodeADb } from '../backend/src/core/database/adb-node';
import { packBackupV2, checkBackupV2, makeV2Kdf, deriveKeyHex, readBackupHeaderAny } from '../backend/src/modules/settings/backupFormat.async';
import { userTables, prefixCreate, copyTablesInto, replaceMainFrom } from '../backend/src/modules/settings/backupCopy';
import { writeBackup, extractBackup } from '../backend/src/modules/settings/backupFormat';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); cond ? pass++ : fail++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'msbak-v2-'));
const keyHex = (b: Uint8Array | Buffer) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const openKeyed = (p: string, hex: string): Database.Database => {
  const db = new Database(p);
  db.pragma("cipher = 'sqlcipher'");
  db.pragma(`key = "x'${hex}'"`);
  db.prepare('SELECT count(*) FROM sqlite_master').get(); // forces key verification
  return db;
};

// 1) A live db: real migrations + real seeded content, encrypted with a random device key.
const deviceKey = crypto.randomBytes(32);
const livePath = path.join(tmp, 'live.db');
const liveRaw = openDatabase({ path: livePath, key: deviceKey });
migrate({ db: liveRaw.db, dir: path.join(process.cwd(), 'src/migrations'), capabilities: liveRaw.capabilities });
const live = new NodeADb(liveRaw.db);
liveRaw.db.prepare("INSERT INTO categories (name) VALUES ('قطع غيار')").run();
liveRaw.db.prepare("INSERT INTO items (name, name_norm, category_id, sell_price, quantity, search_text) VALUES ('شاشة سامسونج A52', 'شاشة سامسونج a52', 1, 900, 4, 'شاشة سامسونج a52 سامسونج')").run();
liveRaw.db.prepare("UPDATE settings SET value = ? WHERE key = 'shop_name'").run('"محل التست"');
const ftsCount = (d: Database.Database, q: string) => (d.prepare('SELECT count(*) AS n FROM items_fts WHERE items_fts MATCH ?').get(q) as { n: number }).n;

// 2) EXPORT — mirror of AndroidBackupService.exportDbKeyed: ATTACH a fresh file with the
//    password-derived key, replay prefixed CREATEs, copy rows in one transaction.
const password = 'backup-pass-123';
const kdf = makeV2Kdf();
const exportKey = deriveKeyHex(password, kdf);
const imagePath = path.join(tmp, 'image.db');
await live.pragma('wal_checkpoint(TRUNCATE)');
await live.exec(`ATTACH DATABASE '${imagePath}' AS msbak_export KEY "x'${exportKey}'"`);
const tables = await userTables(live);
await (async () => { for (const t of tables) await live.exec(prefixCreate(t.sql, 'msbak_export')); })();
await copyTablesInto(live, 'msbak_export', tables);
await live.exec('DETACH DATABASE msbak_export');
check('export produces an encrypted image file', fs.statSync(imagePath).size > 4096 && !fs.readFileSync(imagePath).subarray(0, 16).toString('utf8').startsWith('SQLite format 3'));
const imageDb = openKeyed(imagePath, exportKey);
const imageRows = (imageDb.prepare('SELECT name, quantity FROM items').all() as { name: string; quantity: number }[]);
check('image opens with the derived key and holds the live rows', imageRows.length === 1 && imageRows[0].name.includes('A52'));
check('image carries the real migrated schema (settings + repairs present)',
  !!imageDb.prepare("SELECT 1 FROM sqlite_master WHERE name='settings'").get() && !!imageDb.prepare("SELECT 1 FROM sqlite_master WHERE name='repairs'").get());
check('image FTS5 index rebuilt and searchable', ftsCount(imageDb, 'شاشة') === 1);
imageDb.close();

// 3) PACK + CHECK with the SAME kdf (regression: a second makeV2Kdf here would corrupt restores).
const { bytes } = packBackupV2({ encryptedDbBytes: new Uint8Array(fs.readFileSync(imagePath)), password, kdf });
check('header reads as v2', readBackupHeaderAny(bytes).header.v === 2);
const chk = checkBackupV2(bytes);
check('checkBackupV2 passes (size + sha256)', chk.header.v === 2 && chk.dbBytes.length === chk.header.dbBytes);
const tampered = new Uint8Array(bytes); tampered[tampered.length - 100] ^= 1;
let tamperRejected = false; try { checkBackupV2(tampered); } catch { tamperRejected = true; }
check('tampered image rejected', tamperRejected);

// 4) PROBE wrong vs right password (mirror of probeOpen).
const probePath = path.join(tmp, 'probe.db');
fs.writeFileSync(probePath, Buffer.from(chk.dbBytes));
let wrongRejected = false;
try { openKeyed(probePath, deriveKeyHex('wrong-password', chk.header.kdf)).close(); } catch { wrongRejected = true; }
check('wrong backup password cannot open the image', wrongRejected);
check('right backup password opens the image', (() => { try { openKeyed(probePath, deriveKeyHex(password, chk.header.kdf)).close(); return true; } catch { return false; } })());

// 5) RESTORE into a differently-keyed live db holding DIFFERENT content (mirror of importIntoLive).
const live2Path = path.join(tmp, 'live2.db');
const live2Key = crypto.randomBytes(32);
const live2Raw = openDatabase({ path: live2Path, key: live2Key });
migrate({ db: live2Raw.db, dir: path.join(process.cwd(), 'src/migrations'), capabilities: live2Raw.capabilities });
const live2 = new NodeADb(live2Raw.db);
live2Raw.db.prepare("INSERT INTO categories (name) VALUES ('قديم')").run();
live2Raw.db.prepare("INSERT INTO items (name, name_norm, category_id, sell_price, quantity) VALUES ('بطارية قديمة', 'بطارية قديمة', 1, 100, 1)").run();
await live2.exec(`ATTACH DATABASE '${probePath}' AS msbak_restore KEY "x'${deriveKeyHex(password, chk.header.kdf)}'"`);
const imageTables = await userTables(live2, 'msbak_restore');
await replaceMainFrom(live2, 'msbak_restore', imageTables);
await live2.exec('DETACH DATABASE msbak_restore');
const after = live2Raw.db.prepare('SELECT name FROM items').all() as { name: string }[];
check('restore replaces live content with the backup image', after.length === 1 && after[0].name.includes('A52'));
check('restored live db reopens with ITS OWN device key (key unchanged)', (() => {
  live2Raw.db.close();
  try { const d = openKeyed(live2Path, keyHex(live2Key)); d.prepare('SELECT count(*) FROM items').get(); d.close(); return true; } catch { return false; }
})());
check('restored FTS5 index searchable', ftsCount(openKeyed(live2Path, keyHex(live2Key)), 'شاشة') === 1);

// 6) INTEGRITY ROLLBACK: an image whose rows violate a live FK (item -> missing category) must be
//    caught by the pre-commit foreign_key_check and leave the live db untouched.
const migrateInto = (rawDb: Database.Database) => migrate({ db: rawDb, dir: path.join(process.cwd(), 'src/migrations'), capabilities: { fts5Trigram: true } });
const brokenPath = path.join(tmp, 'broken.db');
const broken = openKeyed(brokenPath, exportKey);
migrateInto(broken);
broken.pragma('foreign_keys = OFF'); // fabricate an orphan row that a live restore must reject
broken.prepare("INSERT INTO categories (name) VALUES ('مكسورة')").run();
broken.prepare("INSERT INTO items (name, name_norm, category_id, search_text) VALUES ('يتيمة', 'يتيمة', 999, 'يتيمة')").run(); // category 999 does not exist
broken.close();
const live3Raw = openDatabase({ path: path.join(tmp, 'live3.db'), key: crypto.randomBytes(32) });
migrate({ db: live3Raw.db, dir: path.join(process.cwd(), 'src/migrations'), capabilities: live3Raw.capabilities });
const live3 = new NodeADb(live3Raw.db);
live3Raw.db.prepare("INSERT INTO categories (name) VALUES ('حي')").run();
live3Raw.db.prepare("INSERT INTO items (name, name_norm, category_id) VALUES ('محتوى حي', 'محتوى حي', 1)").run();
await live3.exec(`ATTACH DATABASE '${brokenPath}' AS msbak_restore KEY "x'${exportKey}'"`);
const brokenTables = await userTables(live3, 'msbak_restore');
let rollbackOk = false;
try { await replaceMainFrom(live3, 'msbak_restore', brokenTables); }
catch (e) { rollbackOk = (e as { message?: string }).message?.includes('متسقة مرجعيًا') ?? false; } // specifically the FK-check rejection
await live3.exec('DETACH DATABASE msbak_restore');
const live3Items = live3Raw.db.prepare('SELECT name FROM items').all() as { name: string }[];
check('FK-violating image rejected by pre-commit integrity check, live content intact', rollbackOk &&
  live3Items.length === 1 && live3Items[0].name === 'محتوى حي');

// 6b) PREFLIGHT REJECTIONS: unknown ledger, extra (newer-schema) columns, newer migration version.
const noLedger = path.join(tmp, 'noledger.db');
const nl = openKeyed(noLedger, exportKey);
nl.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)'); nl.close();
let rejectedNoLedger = false;
try { await live3.exec(`ATTACH DATABASE '${noLedger}' AS msbak_restore KEY "x'${exportKey}'"`);
  await replaceMainFrom(live3, 'msbak_restore', await userTables(live3, 'msbak_restore'));
} catch { rejectedNoLedger = true; } finally { await live3.exec('DETACH DATABASE msbak_restore').catch(() => undefined); }
check('image without a migration ledger is rejected (not this app / corrupt)', rejectedNoLedger);

const newerPath = path.join(tmp, 'newer.db');
const nw = openKeyed(newerPath, exportKey);
migrateInto(nw);
nw.exec('ALTER TABLE items ADD COLUMN future_field TEXT'); // a column this app version does not know
nw.prepare("INSERT INTO schema_migrations (version, name, checksum) VALUES (999, 'future', 'x')").run();
nw.close();
let rejectedNewer = false;
try { await live3.exec(`ATTACH DATABASE '${newerPath}' AS msbak_restore KEY "x'${exportKey}'"`);
  await replaceMainFrom(live3, 'msbak_restore', await userTables(live3, 'msbak_restore'));
} catch (e) { rejectedNewer = ((e as { message?: string }).message ?? '').includes('أحدث'); } // specifically the newer-version rejection
finally { await live3.exec('DETACH DATABASE msbak_restore').catch(() => undefined); }
check('newer-schema image rejected (extra column + higher version), nothing discarded', rejectedNewer &&
  (live3Raw.db.prepare('SELECT name FROM items').all() as { name: string }[])[0]?.name === 'محتوى حي');

// 7) v1 DESKTOP backup restores through the same replaceMainFrom path.
const desktopKey = crypto.randomBytes(32); // the desktop db's device key: same key in the file AND in the backup header
const desktopDb = openKeyed(path.join(tmp, 'desktop.db'), keyHex(desktopKey));
migrateInto(desktopDb);
desktopDb.prepare("INSERT INTO categories (name) VALUES ('مكتبي')").run();
desktopDb.prepare("INSERT INTO items (name, name_norm, category_id, search_text) VALUES ('من الديسكتوب', 'من الديسكتوب', 1, 'من الديسكتوب')").run();
desktopDb.close();
const v1file = path.join(tmp, 'desktop.msbak');
writeBackup({ dbPath: path.join(tmp, 'desktop.db'), outPath: v1file, key: desktopKey, password });
const v1img = path.join(tmp, 'v1x.db');
const v1 = extractBackup(v1file, password, v1img); // decrypts the image to v1img; wrong password -> throws (covered in xcompat tests)
const live4Raw = openDatabase({ path: path.join(tmp, 'live4.db'), key: crypto.randomBytes(32) });
migrate({ db: live4Raw.db, dir: path.join(process.cwd(), 'src/migrations'), capabilities: live4Raw.capabilities });
const live4 = new NodeADb(live4Raw.db);
await live4.exec(`ATTACH DATABASE '${v1img}' AS msbak_restore KEY "x'${keyHex(v1.key)}'"`);
const v1Tables = await userTables(live4, 'msbak_restore');
await replaceMainFrom(live4, 'msbak_restore', v1Tables);
await live4.exec('DETACH DATABASE msbak_restore');
check('v1 desktop backup restores into a migrated Android live db', (live4Raw.db.prepare('SELECT name FROM items').all() as { name: string }[])[0]?.name === 'من الديسكتوب');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
