// Copies backend migrations into the Android WebView bundle assets and writes the manifest.
// Run as part of the Android build (see BUILD-ANDROID.md).
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../backend/src/migrations');
const OUT = path.resolve(import.meta.dirname, '../frontend/public/migrations');
const RE = /^(\d{3,})_([a-z0-9_]+)\.sql$/;

fs.mkdirSync(OUT, { recursive: true });
const files = fs.readdirSync(SRC).filter((f) => RE.test(f)).sort();
for (const f of files) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ files }, null, 2) + '\n');
console.log(`synced ${files.length} migrations -> frontend/public/migrations`);
