// 页面保护：清单一致性、next 白名单、开发服务器服务端拦截、Nginx 样例检查。
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { promises as fsp } from 'node:fs';

import {
  makeDataDir, removeDir, freePort, startProcess, waitFor, probePort, clearStaleInstanceLock,
  REPO_ROOT, SERVER_DIR, TESTS_DIR
} from './helpers/proc.mjs';
import { request, sessionCookieFrom, DEV_ORIGIN } from './helpers/http.mjs';

const dataDir = await makeDataDir();
process.env.AUTH_DATA_DIR = dataDir;
const store = await import('../server/auth-store.mjs');
const policyModule = await import('../server/auth-pages.mjs');

const WEB_DIR = path.join(REPO_ROOT, 'web');
const PASSWORD = 'page guard password 01';

let policy;
let proxy = null;
let dev = null;
let devPort = 0;
let apiPort = 0;
let devOrigin = '';
let devBase = '';

function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  await store.ensureStorage();
  await store.initAdmin({ username: 'admin', displayName: '页面测试', password: PASSWORD });
  policy = await policyModule.loadPagePolicy();

  devPort = await freePort();
  apiPort = await freePort();
  devOrigin = 'http://127.0.0.1:' + devPort;
  devBase = devOrigin;

  proxy = await startProcess({
    script: path.join(SERVER_DIR, 'proxy.mjs'),
    env: {
      ...process.env,
      AUTH_DATA_DIR: dataDir,
      PORT: String(apiPort),
      APP_ORIGINS: devOrigin,
      AUTH_COOKIE_SECURE: '0',
      AUTH_TRUST_PROXY: '0',
      DEEPSEEK_API_KEY: ' ',
      DIFY_API_KEY: ' ',
      DIFY_WRITE_API_KEY: ' ',
      XFYUN_APPID: ' ',
      XFYUN_API_SECRET: ' ',
      XFYUN_API_KEY: ' '
    },
    ready: /kepu-proxy on/,
    port: apiPort
  });

  dev = await startProcess({
    script: path.join(SERVER_DIR, 'dev.mjs'),
    env: {
      ...process.env,
      PROXY_EXTERNAL: '1',
      PORT: String(apiPort),
      DEV_PORT: String(devPort),
      APP_ORIGINS: devOrigin,
      AUTH_TRUST_PROXY: '0'
    },
    ready: /dev\s+http:\/\/127\.0\.0\.1:/,
    port: devPort
  });
});

after(async () => {
  if (dev) await dev.stop();
  if (proxy) await proxy.stop();
  await clearStaleInstanceLock(dataDir);
  await removeDir(dataDir);
});

/* —————————————— 清单一致性 —————————————— */

test('每个 web/*.html 都被显式标记为 protected 或 public', async () => {
  const files = (await fsp.readdir(WEB_DIR)).filter(name => name.toLowerCase().endsWith('.html'));
  assert.ok(files.length >= 10, '应扫描到全部页面');
  for (const file of files) {
    const pagePath = '/' + file.toLowerCase();
    const isProtected = policy.protectedPages.has(pagePath);
    const isPublic = policy.publicPages.has(pagePath);
    assert.ok(isProtected || isPublic, '未登记的 HTML：' + pagePath + '（必须显式加入 server/protected-pages.json）');
    assert.ok(!(isProtected && isPublic), '页面不能同时是 protected 与 public：' + pagePath);
  }
  assert.ok(policy.publicPages.has('/login.html'));
  assert.ok(policy.protectedPages.has('/index.html'));
});

test('受保护页面都加载 auth-guard；登录页不加载（避免循环）', async () => {
  for (const pagePath of policy.protectedPages) {
    const file = path.join(WEB_DIR, pagePath.slice(1));
    const html = await fsp.readFile(file, 'utf8');
    assert.match(html, /assets\/site\/auth-guard\.js/, pagePath + ' 必须加载 auth-guard.js');
    assert.match(html, /assets\/site\/auth\.css/, pagePath + ' 必须加载 auth.css');
    // guard 必须在 head 里（业务脚本之前）
    const head = html.slice(0, html.indexOf('</head>'));
    assert.match(head, /auth-guard\.js/, pagePath + ' 的 guard 必须在 </head> 之前');
  }
  for (const pagePath of policy.publicPages) {
    const html = await fsp.readFile(path.join(WEB_DIR, pagePath.slice(1)), 'utf8');
    assert.equal(html.includes('auth-guard.js'), false, pagePath + ' 不应加载 auth-guard');
  }
});

test('登录页具备可访问表单与安全属性', async () => {
  const html = await fsp.readFile(path.join(WEB_DIR, 'login.html'), 'utf8');
  assert.match(html, /<form[^>]+id="login-form"/);
  assert.match(html, /name="username"[^>]*autocomplete="username"/);
  assert.match(html, /name="password"[^>]*autocomplete="current-password"/);
  assert.match(html, /type="button"[^>]*id="toggle-password"/);
  assert.match(html, /<label[^>]+for="username"/);
  assert.match(html, /<label[^>]+for="password"/);
  assert.equal(html.includes('localStorage'), false);
  assert.equal(html.includes('sessionStorage'), false);
  assert.equal(/http:\/\//.test(html.replace(/<!DOCTYPE[^>]*>/i, '')), false, '登录页不引用外部 http 资源');
});

/* —————————————— next 白名单 —————————————— */

async function loadNextModule() {
  const code = await fsp.readFile(path.join(WEB_DIR, 'assets', 'site', 'auth-next.js'), 'utf8');
  const sandbox = { window: {}, URL, encodeURIComponent, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.AuthNext;
}

test('前端 next 白名单与 protected-pages.json 完全一致', async () => {
  const AuthNext = await loadNextModule();
  const fromClient = [...AuthNext.ALLOWED_PAGES].sort();
  const fromServer = [...policy.protectedPages].sort();
  assert.deepEqual(fromClient, fromServer);
  assert.equal(AuthNext.DEFAULT_PAGE, policy.entryPage);
});

test('next 参数：拒绝外部/协议相对/反斜杠/编码穿越，保留合法深链', async () => {
  const AuthNext = await loadNextModule();
  const origin = 'http://127.0.0.1:5173';
  const fallback = '/index.html';

  const bad = [
    'https://evil.example/steal',
    'http://127.0.0.1:5173.evil.example/',
    '//evil.example',
    '\\\\evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/%2f%2fevil.example',
    '/%2e%2e/index.html',
    '/..%2findex.html',
    '/chapter.html/%2e%2e/%2e%2e/server/data/users.json',
    '',
    '   ',
    '/unknown.html',
    '/login.html?next=/index.html',
    'http://[::1',
    '/index.html\u0000'
  ];
  for (const candidate of bad) {
    assert.equal(AuthNext.pickNext(candidate, origin), fallback, '应回退默认页：' + JSON.stringify(candidate));
  }
  assert.equal(AuthNext.pickNext(undefined, origin), fallback);
  assert.equal(AuthNext.pickNext('/' + 'a'.repeat(600), origin), fallback);

  assert.equal(AuthNext.pickNext('/index.html', origin), '/index.html');
  assert.equal(AuthNext.pickNext('/tower.html', origin), '/tower.html');
  assert.equal(AuthNext.pickNext('/chapter.html?id=drill', origin), '/chapter.html?id=drill');
  assert.equal(AuthNext.pickNext('/chapter.html?id=drill&evil=1', origin), '/chapter.html?id=drill');
  assert.equal(AuthNext.pickNext('/chapter.html?id=<script>', origin), '/chapter.html');
  assert.equal(AuthNext.pickNext('/sandbox.html#stage=3', origin), '/sandbox.html#stage=3');
  assert.equal(AuthNext.pickNext('/sandbox.html#stage=9', origin), '/sandbox.html');
  assert.equal(AuthNext.pickNext('/sandbox.html?x=1#stage=2', origin), '/sandbox.html#stage=2');
  assert.equal(AuthNext.pickNext('http://127.0.0.1:5173/tower.html?x=1', origin), '/tower.html');
  assert.equal(AuthNext.pickNext('/TOWER.HTML', origin), '/tower.html');
});

/* —————————————— 开发服务器：服务端拦截 —————————————— */

test('未登录请求受保护 HTML 时，服务端 302 到登录页（不是 200）', async () => {
  const cases = ['/', '/index.html', '/sandbox.html', '/explore.html', '/chapter.html?id=drill',
    '/tower.html', '/ask.html', '/write.html', '/kb.html', '/videos.html', '/video.html?id=x', '/_spike-separator.html'];
  for (const target of cases) {
    const response = await request(devBase, target);
    assert.equal(response.status, 302, target + ' 未登录必须是 302，实际 ' + response.status);
    const location = response.headers.get('location') || '';
    assert.match(location, /^\/login\.html\?next=/, target + ' 应跳转登录页：' + location);
    assert.equal(response.text.includes('<html'), false, target + ' 不得提前交付 HTML body');
  }
  // 首页 next 是 "/"；带查询的页面保留查询串
  const root = await request(devBase, '/');
  assert.equal(decodeURIComponent(root.headers.get('location').split('next=')[1]), '/');
  const chapter = await request(devBase, '/chapter.html?id=drill');
  assert.equal(decodeURIComponent(chapter.headers.get('location').split('next=')[1]), '/chapter.html?id=drill');

  const head = await rawGet(devPort, '/sandbox.html');
  assert.equal(head.status, 302);
  assert.equal(head.body, '', 'HEAD/未登录不得返回 body');

  const missing = await request(devBase, '/not-registered.html');
  assert.notEqual(missing.status, 200);
});

test('登录页与公开静态资源无需登录即可加载', async () => {
  const login = await request(devBase, '/login.html');
  assert.equal(login.status, 200);
  assert.match(login.headers.get('content-type') || '', /text\/html/);
  assert.match(login.text, /欢迎登录/);
  assert.match(login.headers.get('cache-control') || '', /no-store/);
  assert.match(login.headers.get('x-content-type-options') || '', /nosniff/);

  const errorPage = await request(devBase, '/auth-error.html');
  assert.equal(errorPage.status, 200);

  for (const asset of ['/assets/site/tokens.css', '/assets/site/auth.css', '/assets/site/auth.js',
    '/assets/site/auth-guard.js', '/assets/site/auth-next.js', '/assets/science-logo.png']) {
    const response = await request(devBase, asset);
    assert.equal(response.status, 200, asset + ' 未登录也应可加载');
  }
});

test('未登录 API 仍是 JSON 401，不会被改写成登录 HTML', async () => {
  const response = await request(devBase, '/api/ask', { method: 'POST', body: { question: 'x' } });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal(response.text.includes('<html'), false);
  assert.equal(response.headers.get('location'), null);

  const status = await request(devBase, '/api/auth/status');
  assert.equal(status.status, 200);
  assert.equal(status.json.initialized, true);
});

test('登录 Cookies 经 dev 代理正确往返；登录后可访问业务页面；登出后再次被拦截', async () => {
  const login = await request(devBase, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: devOrigin },
    body: JSON.stringify({ username: 'admin', password: PASSWORD })
  });
  assert.equal(login.status, 200);
  const cookie = sessionCookieFrom(login);
  assert.ok(cookie, 'dev 代理必须把 Set-Cookie 透传给浏览器');

  const me = await request(devBase, '/api/auth/me', { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.username, 'admin');

  for (const target of ['/', '/sandbox.html', '/ask.html', '/tower.html', '/chapter.html?id=drill']) {
    const page = await request(devBase, target, { headers: { cookie } });
    assert.equal(page.status, 200, target + ' 登录后应可访问，实际 ' + page.status);
    assert.match(page.text, /auth-guard\.js/);
  }

  const logout = await request(devBase, '/api/auth/logout', {
    method: 'POST', headers: { cookie, Origin: devOrigin }
  });
  assert.equal(logout.status, 200);

  const afterLogout = await request(devBase, '/sandbox.html', { headers: { cookie } });
  assert.equal(afterLogout.status, 302, '登出后旧 Cookie 不能再访问业务页面');
});

test('探测路径穿越与编码绕过：拿不到 users.json', async () => {
  const attempts = [
    '/../server/data/users.json',
    '/%2e%2e/server/data/users.json',
    '/..%2fserver/data/users.json',
    '/assets/../../server/data/users.json',
    '/%252e%252e/server/data/users.json'
  ];
  for (const attempt of attempts) {
    const response = await rawGet(devPort, attempt);
    assert.notEqual(response.status, 200, '不得返回 200：' + attempt);
    assert.equal(response.body.includes('"usernameNormalized"'), false, '不得泄露用户文件：' + attempt);
  }
  const windowsStyle = await rawGet(devPort, '/..\\server\\data\\users.json');
  assert.notEqual(windowsStyle.status, 200);
});

/* —————————————— Nginx 样例 —————————————— */

test('Nginx 样例覆盖全部受保护页面、内部 auth 子请求与 SSE 透传', async () => {
  const file = path.join(REPO_ROOT, 'deploy', 'nginx-auth.example.conf');
  const text = await fsp.readFile(file, 'utf8');
  assert.match(text, /auth_request \/_auth;/);
  assert.match(text, /location = \/_auth \{\s*internal;/);
  assert.match(text, /proxy_pass http:\/\/127\.0\.0\.1:8790\/api\/auth\/verify;/);
  assert.match(text, /proxy_pass_request_body off;/);
  assert.match(text, /proxy_set_header Cookie \$http_cookie;/);
  assert.match(text, /proxy_set_header X-Real-IP \$remote_addr;/);
  assert.match(text, /proxy_set_header X-Forwarded-For "";/);
  assert.match(text, /proxy_buffering off;/);
  assert.match(text, /proxy_intercept_errors off;/);
  assert.match(text, /error_page 401 = @login_redirect;/);
  assert.match(text, /location = \/login\.html/);
  assert.match(text, /location = \/ \{/);
  assert.match(text, /location \/api\/ \{/);
  assert.match(text, /deny all;/);
  // 每个受保护页面都在受保护 regex 中
  for (const pagePath of policy.protectedPages) {
    const name = pagePath.slice(1).replace(/\.html$/, '');
    assert.ok(text.includes(name), 'Nginx 样例缺少受保护页面：' + pagePath);
  }
  // 登录页绝不能挂 auth_request
  const loginBlock = text.slice(text.indexOf('location = /login.html'), text.indexOf('location /assets/'));
  assert.equal(loginBlock.includes('auth_request'), false, '登录页不能挂 auth_request');
  // 不得把运行时数据目录映射出去
  assert.equal(/root\s+\/www\/kepu\/server\/data/.test(text), false);
});
