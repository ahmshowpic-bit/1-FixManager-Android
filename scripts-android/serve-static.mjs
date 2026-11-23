// Tiny static server for the test harnesses. SERVE_ROOT=<dir> PORT=<port> node scripts-android/serve-static.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.env.SERVE_ROOT ?? 'frontend/dist');
const port = Number(process.env.PORT ?? 5173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent((req.url || '/').split('?')[0]));
  if (!p.startsWith(root)) p = root;
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  res.setHeader('content-type', types[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('static up on', port));
