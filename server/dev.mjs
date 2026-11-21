// 本地开发服务器：静态托管 web/，并把 /api/* 转发给同目录的 proxy（默认 127.0.0.1:8790）
// 用法：npm run dev  →  http://127.0.0.1:5173
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, '..', 'web');
const DEV_PORT = Number(process.env.DEV_PORT || 5173);
const API_HOST = '127.0.0.1';
const API_PORT = Number(process.env.PORT || 8790);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const rel = clean === '/' ? '/index.html' : clean;
  const abs = path.join(WEB, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!abs.startsWith(WEB)) return null;
  return abs;
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const upstream = http.request(
      { host: API_HOST, port: API_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: API_HOST + ':' + API_PORT } },
      up => {
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res);
      }
    );
    upstream.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'API 未启动：' + err.message + '（先运行 npm run api 或检查 server/.env）' }));
    });
    req.pipe(upstream);
    return;
  }

  const file = resolveFile(req.url);
  if (!file) { res.writeHead(403); return res.end('forbidden'); }
  try {
    const info = await stat(file);
    if (info.isDirectory()) { res.writeHead(302, { Location: req.url.replace(/\/?$/, '/') }); return res.end(); }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 ' + req.url);
  }
});

let api = null;
if (process.env.PROXY_EXTERNAL !== '1') {
  api = spawn(process.execPath, [path.join(ROOT, 'proxy.mjs')], { stdio: 'inherit' });
  api.on('exit', code => console.log('[dev] proxy 退出，code=' + code));
}

server.listen(DEV_PORT, '127.0.0.1', () => {
  console.log('油见未来 · dev  http://127.0.0.1:' + DEV_PORT);
  console.log('静态目录: ' + WEB);
  console.log('API 转发: /api/* → http://' + API_HOST + ':' + API_PORT);
});

process.on('SIGINT', () => { if (api) api.kill(); server.close(() => process.exit(0)); });
