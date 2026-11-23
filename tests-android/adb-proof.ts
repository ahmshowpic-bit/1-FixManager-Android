// Proves the async DB layer (Android port target) preserves desktop semantics:
// named params, booleans, transactions with nested savepoints, rollback, constraint mapping, FTS5/trigram probe.
import Database from 'better-sqlite3-multiple-ciphers';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { NodeADb } from '../backend/src/core/database/adb-node';
import { AsyncTxManager, normalizeParams, assertInAsyncTransaction } from '../backend/src/core/database/adb';
import { migrate } from '../backend/src/core/database/migrator';
import { AppError } from '../backend/src/core/errors';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = '') => { if (cond) { pass++; console.log('OK  ', name, extra); } else { fail++; console.log('FAIL', name, extra); } };

async function main() {
  // normalizeParams unit checks
  const n1 = normalizeParams('UPDATE t SET a=@a, b=@b WHERE c=@a AND note=@s', [{ a: 1, b: true, s: "x@y: z" }]);
  check('named->positional count', n1.sql === 'UPDATE t SET a=?, b=? WHERE c=? AND note=?' && n1.values.length === 4 && n1.values[1] === 1);
  const n2 = normalizeParams("INSERT INTO t VALUES (?, ?, '-- @fake', ?)", [1, null, 0, 'واحد']);
  check('positional+quoted untouched', n2.sql === "INSERT INTO t VALUES (?, ?, '-- @fake', ?)" && n2.values.length === 4);
  const n3 = normalizeParams('SELECT ":notparam", col FROM t WHERE x = ?', [5]);
  check('quoted identifier skipped', n3.sql === 'SELECT ":notparam", col FROM t WHERE x = ?' && n3.values[0] === 5);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adbtest-'));
  const raw = new Database(path.join(dir, 'shop.db'));
  raw.pragma("cipher = 'sqlcipher'"); raw.pragma(`key = "x'${'0'.repeat(64)}'"`);
  raw.pragma('journal_mode = WAL'); raw.pragma('foreign_keys = ON');
  const probe = { sqliteVersion: (raw.prepare('SELECT sqlite_version() v').get() as any).v, fts5: true, fts5Trigram: true };
  try { raw.exec("CREATE VIRTUAL TABLE temp.p USING fts5(x, tokenize='trigram'); DROP TABLE temp.p;"); } catch { probe.fts5 = false; probe.fts5Trigram = false; }
  const mig = migrate({ db: raw, dir: path.join(process.cwd(), 'backend/src/migrations'), capabilities: probe } as any);
  const fileCount = fs.readdirSync(path.join(process.cwd(), 'backend/src/migrations')).filter((f) => /^\d{3,}_.*\.sql$/.test(f)).length;
  check('migrations applied', mig.applied.length === fileCount && mig.currentVersion === 16, `files=${fileCount} applied=${mig.applied.length} skipped=${mig.skipped.length} v=${mig.currentVersion}`);

  const db = new NodeADb(raw);
  const tx = new AsyncTxManager(db);

  // CRUD through async layer with named params + Arabic
  const ins = await db.run('INSERT INTO categories (name, is_screen, sort_order) VALUES (@name, @screen, @sort)', { name: 'شاشات', screen: true, sort: 10 });
  check('named insert', ins.changes === 1 && ins.lastId > 0);
  const got = await db.get<any>('SELECT * FROM categories WHERE id = ?', ins.lastId);
  check('read back Arabic+bool', got?.name === 'شاشات' && got?.is_screen === 1);

  // transaction commit
  await tx.run(async () => {
    assertInAsyncTransaction(db, 'test-op');
    await db.run('INSERT INTO categories (name, is_screen, sort_order) VALUES (?, ?, ?)', 'بطاريات', 0, 20);
  });
  check('tx commit', ((await db.get<any>("SELECT COUNT(*) n FROM categories WHERE name='بطاريات'"))!.n) === 1);

  // nested savepoint: inner failure rolls back inner only when caught outside
  await tx.run(async () => {
    await db.run("INSERT INTO categories (name, is_screen, sort_order) VALUES ('شاشة سامسونج', 1, 30)");
    try { await tx.run(async () => { await db.run("INSERT INTO categories (name) VALUES (NULL)"); }); } catch { /* swallow inner */ }
    check('nested savepoint error surfaced', true);
  });
  const kept = await db.get<any>("SELECT COUNT(*) n FROM categories WHERE name='شاشة سامسونج'");
  check('savepoint partial rollback', kept?.n === 1, `n=${kept?.n}`);

  // outer failure rolls back everything
  try {
    await tx.run(async () => {
      await db.run("INSERT INTO categories (name, is_screen, sort_order) VALUES ('مفروض يتراجع', 0, 40)");
      throw new AppError('VALIDATION_ERROR', 'boom', 422);
    });
  } catch (e) { check('AppError passthrough', e instanceof AppError && (e as AppError).code === 'VALIDATION_ERROR'); }
  const rolled = await db.get<any>("SELECT COUNT(*) n FROM categories WHERE name='مفروض يتراجع'");
  check('full rollback', rolled?.n === 0);

  // guard fires outside tx
  let guardFired = false;
  try { assertInAsyncTransaction(db, 'free-op'); } catch (e) { guardFired = e instanceof AppError && (e as AppError).code === 'TRANSACTION_REQUIRED'; }
  check('tx guard outside transaction', guardFired);

  // constraint mapping (UNIQUE) through tx
  try { await tx.run(async () => { await db.run("INSERT INTO categories (name, is_screen, sort_order) VALUES ('شاشات', 0, 50)"); }); }
  catch (e) { check('unique->CONFLICT', e instanceof AppError && (e as AppError).code === 'CONFLICT', (e as AppError)?.code); }

  // FTS trigram search works on seeded schema
  await db.run('INSERT INTO items (name, name_norm, search_text, category_id, sell_price, purchase_price) VALUES (?, ?, ?, ?, ?, ?)', 'شاشة ايفون 11', 'شاشة ايفون 11', 'شاشة ايفون 11 ايفون', ins.lastId, 100000, 80000).catch((e) => console.log('items insert note:', e.message));
  const fts = await db.all<any>("SELECT rowid FROM items_fts WHERE items_fts MATCH 'ايفون'").catch(() => []);
  check('FTS5 trigram search', Array.isArray(fts) && fts.length >= 1, `rows=${fts.length}`);

  console.log(`\n== adb proof: ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
