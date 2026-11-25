// 本地开发服务器：静态托管 web/，把 /api/* 转发给同目录的 proxy（默认 127.0.0.1:8790）。
// 受保护页面在服务端先做 /api/auth/verify 子请求：未登录时不交付业务 HTML（前端 guard 只是体验层）。
// 用法：npm run dev  →  http://127.0.0.1:5173

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat, realpath } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { loadPagePolicy, isProtectedPage } from './auth-pages.mjs';
import { clientIp } from './auth-session.mjs';

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
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2'
};

const SAFE_SEGMENT = /^[^\\/:*?"<>|\u0000]+$/;

let webReal = WEB;
try { webReal = await realpath(WEB); } catch { /* 忽略：首次运行目录异常时由后续 404 处理 */ }

/** 把 URL 路径映射到 web/ 内的真实文件；任何可疑段直接拒绝，不交给文件系统去猜。 */
function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\u0000')) return null;
  const rel = decoded.replace(/^[/\\]+/, '');
  if (!rel) return path.join(WEB, 'index.html');
  const segments = rel.split(/[/\\]/);
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') return null;
    if (!SAFE_SEGMENT.test(segment)) return null;
    if (segment !== segment.trim()) return null;      // Windows 会忽略首尾空格
    if (segment.endsWith('.')) return null;           // Windows 会忽略尾部点
  }
  const abs = path.resolve(WEB, ...segments);
  if (abs !== WEB && !abs.startsWith(WEB + path.sep)) return null;
  return abs;
}

function serveVideo(req, res, file, size) {
  const range = /^bytes=(\d*)-(\d*)$/i.exec(req.headers.range || '');
  const [, first = '', last = ''] = range || [];
  const partial = Boolean(first || last);
  const start = first ? Number(first) : Math.max(0, size - Number(last || size));
  const end = first && last ? Math.min(Number(last), size - 1) : size - 1;
  if (partial && (start >= size || end < start)) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` });
    return res.end();
  }
  const headers = {
    'Content-Type': MIME['.mp4'],
    'Content-Length': partial ? end - start + 1 : size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  res.writeHead(partial ? 206 : 200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(file, partial ? { start, end } : undefined);
  pipeline(stream, res).catch(() => res.destroy());
}

/** 由 dev server 自己做服务端校验：Cookie 透传给本机 proxy 的 /api/auth/verify。 */
function verifySession(req) {
  return new Promise(resolve => {
    const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
    const request = http.request({
      host: API_HOST,
      port: API_PORT,
      path: '/api/auth/verify',
      method: 'GET',
      headers: {
        cookie,
        'x-real-ip': clientIp(req),
        accept: 'application/json'
      },
      timeout: 5000
    }, upstream => {
      upstream.resume();
      resolve({ status: upstream.statusCode || 502 });
    });
    request.on('timeout', () => { request.destroy(); resolve({ status: 0 }); });
    request.on('error', () => resolve({ status: 0 }));
    request.end();
  });
}

function redirectToLogin(req, res, pathname) {
  const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const next = encodeURIComponent(pathname + search);
  res.writeHead(302, {
    Location: '/login.html?next=' + next,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end();
}

function serveUnavailable(res, detail) {
  const body = '<!doctype html><meta charset="utf-8"><title>服务暂不可用</title>'
    + '<body style="background:#0b0f11;color:#e8e1d4;font:15px/1.8 system-ui;padding:48px;max-width:640px;margin:0 auto">'
    + '<h1 style="font-size:22px;color:#d8a24a">认证服务暂不可用</h1>'
    + '<p>无法确认登录状态，因此没有交付页面内容。请稍后刷新重试；如果持续出现，请联系系统管理员检查认证服务。</p>'
    + '<p style="color:#8b867d;font-size:13px">' + detail + '</p></body>';
  res.writeHead(503, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Retry-After': '5',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

let pagePolicy;
try {
  pagePolicy = await loadPagePolicy();
} catch (error) {
  console.error('[dev] 受保护页面清单不可用，拒绝启动（fail closed）：' + error.message);
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  let pathname = '/';
  try {
    pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  } catch {
    res.writeHead(400);
    return res.end();
  }

  if (pathname.startsWith('/api/')) {
    const upstream = http.request(
      {
        host: API_HOST,
        port: API_PORT,
        path: req.url,
        method,
        headers: { ...req.headers, host: API_HOST + ':' + API_PORT, 'x-real-ip': clientIp(req) }
      },
      up => {
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res);
      }
    );
    upstream.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'API 未启动：' + err.message + '（先运行 npm run api 或检查 server/.env）' }));
    });
    req.pipe(upstream);
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  const file = resolveFile(req.url);
  if (!file) { res.writeHead(403); return res.end('forbidden'); }

  // 受保护判断以“解析出的真实文件”为准，而不是原始 URL 字符串：
  // 这样百分号编码、大小写等变体不会绕过页面清单。
  const pagePath = '/' + path.relative(WEB, file).split(path.sep).join('/').toLowerCase();
  const extension = path.extname(file).toLowerCase();
  const isHtml = extension === '.html';
  if (isHtml && isProtectedPage(pagePath, pagePolicy)) {
    const result = await verifySession(req);
    if (result.status === 401) return redirectToLogin(req, res, pathname);
    if (result.status !== 204) return serveUnavailable(res, '认证服务返回 ' + (result.status || '连接失败'));
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404');
    }
    // 真实路径必须仍落在 web/ 内（防符号链接逃逸）
    const real = await realpath(file);
    if (real !== webReal && !real.startsWith(webReal + path.sep)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    if (extension === '.mp4') return serveVideo(req, res, real, info.size);
    const body = await readFile(real);
    const headers = {
      'Content-Type': MIME[extension] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    };
    if (isHtml) {
      headers['Referrer-Policy'] = 'same-origin';
      headers['X-Frame-Options'] = 'SAMEORIGIN';
    }
    res.writeHead(200, headers);
    res.end(method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 ' + pathname);
  }
});

let api = null;
if (process.env.PROXY_EXTERNAL !== '1') {
  api = spawn(process.execPath, [path.join(ROOT, 'proxy.mjs')], {
    stdio: 'inherit',
    env: {
      ...process.env,
      // dev 走本机回环转发：默认相信 127.0.0.1 传来的 X-Real-IP（内部由 dev.mjs 覆盖写入）
      AUTH_TRUST_PROXY: process.env.AUTH_TRUST_PROXY ?? '1'
    }
  });
  api.on('exit', code => console.log('[dev] proxy 退出，code=' + code));
}

server.listen(DEV_PORT, '127.0.0.1', () => {
  console.log('石油科普智能体 · dev  http://127.0.0.1:' + DEV_PORT);
  console.log('静态目录: ' + WEB);
  console.log('API 转发: /api/* → http://' + API_HOST + ':' + API_PORT);
  console.log('[auth] 受保护页面 ' + pagePolicy.protectedPages.size + ' 个，公开页面 ' + pagePolicy.publicPages.size + ' 个');
});

function shutdown() {
  if (api) { try { api.kill(); } catch { /* ignore */ } }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
