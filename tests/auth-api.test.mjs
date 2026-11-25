// 认证 API 集成测试：真实启动 proxy.mjs，用真实 HTTP 请求验证
// 401 优先级、Cookie、Session 撤销、Origin、限流、可信代理、Dify SSE 与身份替换。
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';

import {
  makeDataDir, removeDir, freePort, startProcess, waitFor, wait, probePort, clearStaleInstanceLock, SERVER_DIR
} from './helpers/proc.mjs';
import { request, sessionCookieFrom, cookieAttributes, DEV_ORIGIN, loginOptions } from './helpers/http.mjs';

const dataDir = await makeDataDir();
process.env.AUTH_DATA_DIR = dataDir;
const store = await import('../server/auth-store.mjs');

const PASSWORD = 'integration test password 01';
const ADMIN = { username: 'admin', displayName: '系统管理员', password: PASSWORD };
const USERS = {
  revoke: { username: 'revoke_user', displayName: '会被撤销', password: 'revoke user password 1' },
  ratelimit: { username: 'ratelimit_user', displayName: '限流测试', password: 'ratelimit password 12' },
  cap: { username: 'cap_user', displayName: '会话上限', password: 'session cap password 1' },
  disabled: { username: 'disabled_user', displayName: '已禁用', password: 'disabled user password' }
};

let fakeDify = null;
let difyRequests = [];
let proxy = null;
let baseUrl = '';
let adminId = '';

function startFakeDify() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch { /* ignore */ }
        difyRequests.push({ url: req.url, body: parsed });
        if (!req.url.startsWith('/v1/chat-messages')) {
          res.writeHead(404).end('{}');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache'
        });
        res.write('data: {"event":"message_start"}\n\n');
        setTimeout(() => {
          res.write('data: {"event":"message","answer":"分馏"}\n\n');
          setTimeout(() => {
            res.end('data: {"event":"message_end"}\n\n');
          }, 120);
        }, 260);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function proxyEnv(overrides = {}) {
  return {
    AUTH_DATA_DIR: dataDir,
    NODE_ENV: '',
    APP_ORIGINS: DEV_ORIGIN,
    AUTH_COOKIE_SECURE: '0',
    AUTH_TRUST_PROXY: '0',
    // 用空白值强制“未配置模型 Key”，避免测试环境读取 server/.env 里的真实 Key
    DEEPSEEK_API_KEY: ' ',
    XFYUN_APPID: ' ',
    XFYUN_API_SECRET: ' ',
    XFYUN_API_KEY: ' ',
    DIFY_API_KEY: 'test-dify-key',
    DIFY_API_URL: 'http://127.0.0.1:' + fakeDify.port + '/v1',
    // 同样用空白值覆盖，确保“未配置写作 Key”分支可被稳定断言
    DIFY_WRITE_API_KEY: ' ',
    DIFY_WRITE_API_URL: ' ',
    ...overrides
  };
}

async function startProxy(envOverrides = {}, port = null, dir = dataDir) {
  const apiPort = port || await freePort();
  const child = await startProcess({
    script: path.join(SERVER_DIR, 'proxy.mjs'),
    env: { ...proxyEnv(envOverrides), AUTH_DATA_DIR: dir, PORT: apiPort },
    ready: /kepu-proxy on/,
    port: apiPort
  });
  return { ...child, port: apiPort, baseUrl: 'http://127.0.0.1:' + apiPort };
}

async function login(target, username, password, options = {}) {
  return request(target.baseUrl, '/api/auth/login', loginOptions(username, password, options));
}

before(async () => {
  await store.ensureStorage();
  const admin = await store.initAdmin(ADMIN);
  adminId = admin.id;
  await store.createUser({ ...USERS.revoke, role: 'user' });
  await store.createUser({ ...USERS.ratelimit, role: 'user' });
  await store.createUser({ ...USERS.cap, role: 'user' });
  await store.createUser({ ...USERS.disabled, role: 'user' });
  await store.setUserStatus(USERS.disabled.username, 'disabled');

  fakeDify = await startFakeDify();
  proxy = await startProxy();
  baseUrl = proxy.baseUrl;
});

after(async () => {
  if (proxy) await proxy.stop();
  if (fakeDify) await new Promise(resolve => fakeDify.server.close(resolve));
  await removeDir(dataDir);
});

/* —————————————— 未登录 —————————————— */

test('GET /api/auth/status 公开且只返回 initialized', async () => {
  const response = await request(baseUrl, '/api/auth/status');
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { initialized: true });
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.equal(response.text.includes('admin'), false, 'status 不得泄露用户清单');
});

test('未登录 /api/auth/me 返回 401 JSON', async () => {
  const response = await request(baseUrl, '/api/auth/me');
  assert.equal(response.status, 401);
  assert.deepEqual(response.json, { authenticated: false, error: 'unauthorized' });
  assert.match(response.headers.get('content-type') || '', /application\/json/);
});

test('未登录业务 API 全部 401，且不触发任何上游调用', async () => {
  const before = difyRequests.length;
  for (const endpoint of ['/api/ask', '/api/gen', '/api/dify-chat', '/api/dify-write', '/api/tts']) {
    const response = await request(baseUrl, endpoint, { method: 'POST', body: { question: 'hi', user: 'u1' } });
    assert.equal(response.status, 401, endpoint + ' 未登录应返回 401');
    assert.equal(response.json.authenticated, false);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
  }
  // GET 也不能绕过（先鉴权，再判断方法）
  const getAsk = await request(baseUrl, '/api/ask');
  assert.equal(getAsk.status, 401);
  assert.equal(difyRequests.length, before, '未登录请求不得触达 Dify');
});

test('缺少 DeepSeek Key 时，未登录业务 API 仍然先返回 401（不是 503 no key）', async () => {
  const response = await request(baseUrl, '/api/ask', { method: 'POST', body: { question: 'hi' } });
  assert.equal(response.status, 401);
  assert.equal(response.text.includes('no key'), false);
});

test('未来新增的 /api/* 默认要求登录；登录后才返回 404', async () => {
  const anonymous = await request(baseUrl, '/api/some-future-endpoint');
  assert.equal(anonymous.status, 401);

  const logged = await login(proxy, ADMIN.username, PASSWORD);
  const cookie = sessionCookieFrom(logged);
  const authenticated = await request(baseUrl, '/api/some-future-endpoint', { headers: { cookie } });
  assert.equal(authenticated.status, 404);
  const post = await request(baseUrl, '/api/some-future-endpoint', {
    method: 'POST', headers: { cookie, Origin: DEV_ORIGIN }, body: {}
  });
  assert.equal(post.status, 404);
});

test('认证接口不依赖模型 Key：未初始化时登录返回 503 auth_not_initialized', async t => {
  const emptyDir = await makeDataDir('kepu-auth-empty-');
  let emptyProxy = null;
  try {
    emptyProxy = await startProxy({}, null, emptyDir);
    const status = await request(emptyProxy.baseUrl, '/api/auth/status');
    assert.deepEqual(status.json, { initialized: false });
    const response = await request(emptyProxy.baseUrl, '/api/auth/login', loginOptions('nobody', 'whatever password'));
    assert.equal(response.status, 503);
    assert.equal(response.json.error, 'auth_not_initialized');
  } finally {
    if (emptyProxy) await emptyProxy.stop();
    await clearStaleInstanceLock(emptyDir);
    await removeDir(emptyDir);
  }
});

/* —————————————— 登录成功 / Session —————————————— */

test('登录成功：统一错误语义、Cookie 属性、公开用户字段', async () => {
  const wrongPassword = await login(proxy, ADMIN.username, 'definitely wrong password');
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(wrongPassword.json, { error: '用户名或密码错误' });

  const unknownUser = await login(proxy, 'no_such_user', 'definitely wrong password');
  assert.equal(unknownUser.status, 401);
  assert.deepEqual(unknownUser.json, { error: '用户名或密码错误' });

  const disabled = await login(proxy, USERS.disabled.username, USERS.disabled.password);
  assert.equal(disabled.status, 401);
  assert.deepEqual(disabled.json, { error: '用户名或密码错误' });

  const ok = await login(proxy, 'ADMIN', PASSWORD); // 用户名大小写不敏感
  assert.equal(ok.status, 200);
  assert.equal(ok.json.authenticated, true);
  assert.equal(ok.json.user.username, 'admin');
  assert.equal(ok.json.user.displayName, '系统管理员');
  assert.equal(Object.hasOwn(ok.json.user, 'authVersion'), false, '响应不暴露 authVersion');
  assert.equal(Object.hasOwn(ok.json.user, 'password'), false);

  const attrs = cookieAttributes(ok);
  assert.match(attrs, /^yj_session=[A-Za-z0-9_-]{40,};/);
  assert.match(attrs, /Path=\//);
  assert.match(attrs, /HttpOnly/);
  assert.match(attrs, /SameSite=Lax/);
  assert.match(attrs, /Max-Age=28800/);
  assert.equal(/Secure/.test(attrs), false, '开发环境（AUTH_COOKIE_SECURE=0）不应带 Secure');
  assert.equal(/Domain=/.test(attrs), false, '不应设置 Domain');
  assert.equal(ok.text.includes('scrypt'), false);
});

test('/api/auth/me 与 /api/auth/verify 使用 Session', async () => {
  const ok = await login(proxy, ADMIN.username, PASSWORD);
  const cookie = sessionCookieFrom(ok);

  const me = await request(baseUrl, '/api/auth/me', { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal(me.json.authenticated, true);
  assert.equal(me.json.user.id, adminId);
  assert.deepEqual(Object.keys(me.json.user).sort(), ['displayName', 'id', 'role', 'username']);

  const verify = await request(baseUrl, '/api/auth/verify', { headers: { cookie } });
  assert.equal(verify.status, 204);
  assert.equal(verify.text, '');

  const verifyAnon = await request(baseUrl, '/api/auth/verify');
  assert.equal(verifyAnon.status, 401);
  assert.equal(verifyAnon.text, '', '/api/auth/verify 不返回用户信息');
});

test('登录会轮换 Token：旧 Token 立即失效', async () => {
  const first = await login(proxy, ADMIN.username, PASSWORD);
  const firstCookie = sessionCookieFrom(first);
  const second = await login(proxy, ADMIN.username, PASSWORD, { headers: { cookie: firstCookie } });
  const secondCookie = sessionCookieFrom(second);
  assert.notEqual(firstCookie, secondCookie);

  const oldMe = await request(baseUrl, '/api/auth/me', { headers: { cookie: firstCookie } });
  assert.equal(oldMe.status, 401, '轮换后旧 Token 必须失效');
  const newMe = await request(baseUrl, '/api/auth/me', { headers: { cookie: secondCookie } });
  assert.equal(newMe.status, 200);
});

test('登出销毁 Session 并清除 Cookie', async () => {
  const ok = await login(proxy, ADMIN.username, PASSWORD);
  const cookie = sessionCookieFrom(ok);

  const missingOrigin = await request(baseUrl, '/api/auth/logout', { method: 'POST', headers: { cookie } });
  assert.equal(missingOrigin.status, 403, '登出同样校验 Origin');

  const logout = await request(baseUrl, '/api/auth/logout', {
    method: 'POST', headers: { cookie, Origin: DEV_ORIGIN }
  });
  assert.equal(logout.status, 200);
  assert.equal(logout.json.authenticated, false);
  const cleared = cookieAttributes(logout);
  assert.match(cleared, /^yj_session=;/);
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /HttpOnly/);
  assert.match(cleared, /SameSite=Lax/);
  assert.match(cleared, /Path=\//);

  const me = await request(baseUrl, '/api/auth/me', { headers: { cookie } });
  assert.equal(me.status, 401);
});

test('CLI 重置密码后，旧 Session 在下一次请求时失效', async () => {
  const ok = await login(proxy, USERS.revoke.username, USERS.revoke.password);
  const cookie = sessionCookieFrom(ok);
  assert.equal((await request(baseUrl, '/api/auth/me', { headers: { cookie } })).status, 200);

  await store.resetPassword(USERS.revoke.username, 'brand new revoke password');
  const afterReset = await request(baseUrl, '/api/auth/me', { headers: { cookie } });
  assert.equal(afterReset.status, 401, '重置密码后旧 Session 必须失效');
  assert.equal((await request(baseUrl, '/api/ask', {
    method: 'POST', headers: { cookie, Origin: DEV_ORIGIN }, body: { question: 'x' }
  })).status, 401, '业务 API 同样立即失效');

  // 旧密码不能再登录，新密码可以
  assert.equal((await login(proxy, USERS.revoke.username, USERS.revoke.password)).status, 401);
  assert.equal((await login(proxy, USERS.revoke.username, 'brand new revoke password')).status, 200);
});

test('禁用后再启用，旧 Session 不会复活', async () => {
  const ok = await login(proxy, USERS.revoke.username, 'brand new revoke password');
  const cookie = sessionCookieFrom(ok);
  await store.setUserStatus(USERS.revoke.username, 'disabled');
  assert.equal((await request(baseUrl, '/api/auth/me', { headers: { cookie } })).status, 401);
  await store.setUserStatus(USERS.revoke.username, 'active');
  assert.equal((await request(baseUrl, '/api/auth/me', { headers: { cookie } })).status, 401,
    '启用后 authVersion 已变化，旧 Session 不能复活');
});

test('单用户最多 5 个活跃 Session，最早的会被回收', async () => {
  const tokens = [];
  for (let i = 0; i < 6; i += 1) {
    const response = await login(proxy, USERS.cap.username, USERS.cap.password);
    assert.equal(response.status, 200);
    tokens.push(sessionCookieFrom(response));
  }
  const firstStillValid = await request(baseUrl, '/api/auth/me', { headers: { cookie: tokens[0] } });
  assert.equal(firstStillValid.status, 401, '第 6 次登录应回收最早创建的 Session');
  const lastValid = await request(baseUrl, '/api/auth/me', { headers: { cookie: tokens[5] } });
  assert.equal(lastValid.status, 200);
});

test('服务重启后所有内存 Session 失效', async () => {
  const ok = await login(proxy, ADMIN.username, PASSWORD);
  const cookie = sessionCookieFrom(ok);
  assert.equal((await request(baseUrl, '/api/auth/me', { headers: { cookie } })).status, 200);

  const port = proxy.port;
  await proxy.stop();
  // Windows 上 kill 不是优雅退出，按文档清理陈旧运行锁；等端口真正释放再重启
  await clearStaleInstanceLock(dataDir);
  await waitFor(async () => !(await probePort(port)), { label: '端口释放' });
  await wait(150);
  proxy = await startProxy({}, port);
  baseUrl = proxy.baseUrl;

  const afterRestart = await request(baseUrl, '/api/auth/me', { headers: { cookie } });
  assert.equal(afterRestart.status, 401, '重启后 Session Map 为空，旧 Cookie 必须失效');
});

/* —————————————— Origin / CSRF —————————————— */

test('Origin 校验：缺失、null、非白名单都被拒绝', async () => {
  const ok = await login(proxy, ADMIN.username, PASSWORD);
  const cookie = sessionCookieFrom(ok);
  const body = { question: '石油为什么是黑色的' };

  const noOrigin = await request(baseUrl, '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN.username, password: PASSWORD })
  });
  assert.equal(noOrigin.status, 403);

  const nullOrigin = await request(baseUrl, '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'null' },
    body: JSON.stringify({ username: ADMIN.username, password: PASSWORD })
  });
  assert.equal(nullOrigin.status, 403);

  const evil = await login(proxy, ADMIN.username, PASSWORD, { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);

  const evilApi = await request(baseUrl, '/api/dify-chat', {
    method: 'POST', headers: { cookie, Origin: 'https://evil.example' }, body
  });
  assert.equal(evilApi.status, 403);

  // 允许的 Origin 下正常放行
  const goodApi = await request(baseUrl, '/api/dify-chat', {
    method: 'POST', headers: { cookie, Origin: DEV_ORIGIN }, body: { question: '石油为什么是黑色的' }
  });
  assert.equal(goodApi.status, 200);
});

/* —————————————— 限流 / 可信代理 —————————————— */

test('同一用户名 + IP 连续失败触发临时限流，且不影响其他用户', async () => {
  let last = null;
  for (let i = 0; i < 5; i += 1) {
    last = await login(proxy, USERS.ratelimit.username, 'wrong password attempt');
    assert.equal(last.status, 401);
  }
  const blocked = await login(proxy, USERS.ratelimit.username, USERS.ratelimit.password);
  assert.equal(blocked.status, 429, '达到失败上限后，即使密码正确也应临时限制');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal(blocked.text.includes('用户名'), false, '限流响应不泄露账号信息');

  const otherUser = await login(proxy, ADMIN.username, PASSWORD);
  assert.equal(otherUser.status, 200, '限流按用户名+IP 分桶，不应波及他人');
});

test('不可信来源伪造 X-Real-IP 不会改变限流分桶', async () => {
  for (let i = 0; i < 5; i += 1) {
    const response = await login(proxy, USERS.disabled.username + 'x', 'wrong password attempt', {
      headers: { 'X-Real-IP': '10.0.0.' + (i + 1) }
    });
    assert.equal(response.status, 401);
  }
  // AUTH_TRUST_PROXY=0：所有请求都按真实 socket 地址（127.0.0.1）分桶，伪造头无效
  const blocked = await request(baseUrl, '/api/auth/login', loginOptions('disabled_userx', 'wrong password attempt', {
    headers: { 'X-Real-IP': '203.0.113.9' }
  }));
  assert.equal(blocked.status, 429);
});

test('可信代理（AUTH_TRUST_PROXY=1）下 X-Real-IP 生效，X-Forwarded-For 不被信任', async t => {
  const trustDir = await makeDataDir('kepu-auth-trust-');
  let trustProxy = null;
  try {
    const { runStoreDriver, freePort: pickPort } = await import('./helpers/proc.mjs');
    const created = await runStoreDriver(trustDir, {
      op: 'initAdmin',
      args: { username: 'trustadmin', displayName: '代理测试', password: 'trusted proxy password' }
    });
    assert.equal(created.result.ok, true, '初始化可信代理测试用户：' + created.stdout + created.stderr);

    const port = await pickPort();
    trustProxy = await startProcess({
      script: path.join(SERVER_DIR, 'proxy.mjs'),
      env: { ...proxyEnv({ AUTH_TRUST_PROXY: '1' }), AUTH_DATA_DIR: trustDir, PORT: String(port) },
      ready: /kepu-proxy on/,
      port
    });
    const trustBase = 'http://127.0.0.1:' + port;

    // 同一用户名，不同 X-Real-IP：应被分到不同桶，不触发限流
    for (let i = 0; i < 5; i += 1) {
      const response = await request(trustBase, '/api/auth/login', loginOptions('trustadmin', 'wrong password', {
        headers: { 'X-Real-IP': '198.51.100.7' }
      }));
      assert.equal(response.status, 401);
    }
    const otherIp = await request(trustBase, '/api/auth/login', loginOptions('trustadmin', 'wrong password', {
      headers: { 'X-Real-IP': '198.51.100.8' }
    }));
    assert.equal(otherIp.status, 401, '不同可信 IP 使用不同桶');

    const sameIpBlocked = await request(trustBase, '/api/auth/login', loginOptions('trustadmin', 'wrong password', {
      headers: { 'X-Real-IP': '198.51.100.7' }
    }));
    assert.equal(sameIpBlocked.status, 429, '同一可信 IP 达到上限后应被限制');

    // 只带 X-Forwarded-For 时不被信任：与无头同桶（真实 socket 127.0.0.1）
    for (let i = 0; i < 5; i += 1) {
      await request(trustBase, '/api/auth/login', loginOptions('trustadmin', 'wrong password', {
        headers: { 'X-Forwarded-For': '203.0.113.' + (i + 1) }
      }));
    }
    const xffIgnored = await request(trustBase, '/api/auth/login', loginOptions('trustadmin', 'wrong password', {
      headers: { 'X-Forwarded-For': '203.0.113.99' }
    }));
    assert.equal(xffIgnored.status, 429, 'X-Forwarded-For 必须被忽略');
  } finally {
    if (trustProxy) await trustProxy.stop();
    await clearStaleInstanceLock(trustDir);
    await removeDir(trustDir);
  }
});

/* —————————————— 请求格式 —————————————— */

test('登录请求：Content-Type、请求体上限、错误方法', async () => {
  const wrongType = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Origin: DEV_ORIGIN },
    body: JSON.stringify({ username: 'admin', password: PASSWORD })
  });
  assert.equal(wrongType.status, 415);

  const tooLarge = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: DEV_ORIGIN },
    body: JSON.stringify({ username: 'admin', password: 'x'.repeat(9000) })
  });
  assert.equal(tooLarge.status, 413);

  const badJson = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: DEV_ORIGIN },
    body: '{not json'
  });
  assert.equal(badJson.status, 400);

  const getLogin = await request(baseUrl, '/api/auth/login');
  assert.equal(getLogin.status, 405);
  assert.equal(getLogin.headers.get('allow'), 'POST');
});

/* —————————————— 业务兼容性 —————————————— */

test('登录后原有业务 API 行为不变：缺少 Key 时仍返回 503', async () => {
  const ok = await login(proxy, ADMIN.username, PASSWORD);
  const cookie = sessionCookieFrom(ok);

  const ask = await request(baseUrl, '/api/ask', {
    method: 'POST', headers: { cookie, Origin: DEV_ORIGIN }, body: { question: '石油为什么是黑色的' }
  });
  assert.equal(ask.status, 503);
  assert.deepEqual(ask.json, { error: 'no key' }, '认证通过后才轮到 Key 检查');

  const write = await request(baseUrl, '/api/dify-write', {
    method: 'POST', headers: { cookie, Origin: DEV_ORIGIN }, body: { topic: 'x', genre: 'copy', facts: '', audience: 'public', style: 'rigorous', draft: '', comment: '' }
  });
  assert.equal(write.status, 503);
  assert.match(write.json.error, /写作工作流 API Key/);
});

test('Dify SSE 不被缓冲，且服务端用 Session 用户 ID 覆盖客户端伪造 user', async () => {
  const ok = await login(proxy, ADMIN.username, PASSWORD);
  const cookie = sessionCookieFrom(ok);
  difyRequests = [];

  const started = Date.now();
  const response = await fetch(baseUrl + '/api/dify-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie, Origin: DEV_ORIGIN },
    body: JSON.stringify({
      question: '常压蒸馏塔为什么按沸点分段',
      conversation_id: '',
      user: 'forged-client-user'
    })
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/event-stream/);
  assert.equal(response.headers.get('x-accel-buffering'), 'no');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let firstChunkMs = 0;
  let count = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (count === 0) firstChunkMs = Date.now() - started;
    count += 1;
    text += decoder.decode(value, { stream: true });
  }
  const totalMs = Date.now() - started;

  assert.match(text, /message_start/);
  assert.match(text, /message_end/);
  assert.ok(firstChunkMs < totalMs - 100, '首块应在服务端延迟结束前到达（未被缓冲）：first=' + firstChunkMs + 'ms total=' + totalMs + 'ms');

  assert.equal(difyRequests.length, 1);
  const upstream = difyRequests[0].body;
  assert.equal(upstream.user, adminId, 'Dify 收到的 user 必须是 Session 对应用户 ID');
  assert.notEqual(upstream.user, 'forged-client-user');
  assert.match(upstream.query, /常压蒸馏塔为什么按沸点分段/);
  assert.equal(upstream.response_mode, 'streaming');
});

test('AUTH_COOKIE_SECURE=1 时 Cookie 带 Secure（生产 HTTPS 形态）', async t => {
  const secureDir = await makeDataDir('kepu-auth-secure-');
  let secureProxy = null;
  try {
    const { runStoreDriver, freePort: freePort2 } = await import('./helpers/proc.mjs');
    await runStoreDriver(secureDir, {
      op: 'initAdmin',
      args: { username: 'secureadmin', displayName: '安全 Cookie', password: 'secure cookie password' }
    });
    const port = await freePort2();
    secureProxy = await startProcess({
      script: path.join(SERVER_DIR, 'proxy.mjs'),
      env: { ...proxyEnv({ AUTH_COOKIE_SECURE: '1' }), AUTH_DATA_DIR: secureDir, PORT: String(port) },
      ready: /kepu-proxy on/,
      port
    });
    const response = await request('http://127.0.0.1:' + port, '/api/auth/login',
      loginOptions('secureadmin', 'secure cookie password'));
    assert.equal(response.status, 200);
    const attrs = cookieAttributes(response);
    assert.match(attrs, /Secure/);
    assert.match(attrs, /HttpOnly/);
    assert.match(attrs, /SameSite=Lax/);
  } finally {
    if (secureProxy) await secureProxy.stop();
    await clearStaleInstanceLock(secureDir);
    await removeDir(secureDir);
  }
});
