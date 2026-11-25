// Session 过期、Cookie、Origin、客户端 IP、登录限流的单元测试。
// 关键点：SessionStore 的 now / TTL 都可通过参数注入，因此“8 小时绝对过期、30 分钟空闲过期”
// 可以用毫秒级 TTL + 假时钟确定性地验证，不需要真的等待。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SessionStore, SessionCapacityError, hashToken, startSessionSweeper,
  parseCookies, readSessionToken, serializeSessionCookie, serializeClearCookie,
  checkOrigin, isStateChanging, normalizeIp, clientIp, LoginRateLimiter, SESSION_COOKIE
} from '../server/auth-session.mjs';

const USER = { id: '11111111-1111-4111-8111-111111111111', authVersion: 1, username: 'admin' };
const USER2 = { id: '22222222-2222-4222-8222-222222222222', authVersion: 3, username: 'editor' };

test('Session：绝对过期由服务端时钟判定，过期即删除', () => {
  const store = new SessionStore({ absoluteMs: 1000, idleMs: 600000 });
  const { token } = store.create(USER, 0);
  assert.equal(store.get(token, 999)?.session.userId, USER.id);
  assert.equal(store.get(token, 1000), null, '到达 absoluteExpiresAt 必须失效');
  assert.equal(store.size, 0, '失效的 Session 必须从 Map 删除');
});

test('Session：空闲超时、touch 续期，且空闲续期不超过绝对上限', () => {
  const store = new SessionStore({ absoluteMs: 100000, idleMs: 100 });
  const { token, session } = store.create(USER, 0);
  assert.equal(store.get(token, 50)?.session.userId, USER.id);
  store.touch(session, 50);
  assert.equal(session.idleExpiresAt, 150);
  assert.equal(store.get(token, 149)?.session.userId, USER.id, '续期后应仍有效');
  assert.equal(store.get(token, 150), null, '空闲到期后失效');

  const capped = new SessionStore({ absoluteMs: 1000, idleMs: 5000 });
  const created = capped.create(USER, 0);
  capped.get(created.token, 900);
  capped.touch(created.session, 900);
  assert.equal(created.session.idleExpiresAt, 1000, '空闲续期不得越过绝对过期时间');
});

test('Session：sweep 清理过期会话，定时器可停止', async () => {
  const store = new SessionStore({ absoluteMs: 1000, idleMs: 100 });
  store.create(USER, 0);   // 空闲到期 100
  store.create(USER2, 80); // 空闲到期 180
  assert.equal(store.sweep(150), 1, '只清理已过期的那个');
  assert.equal(store.size, 1);

  const timer = startSessionSweeper(store, 5);
  await new Promise(resolve => setTimeout(resolve, 30));
  clearInterval(timer);
  assert.equal(store.size, 0);
});

test('Session：撤销（按 token / 按缓存键 / 按用户）', () => {
  const store = new SessionStore();
  const a = store.create(USER);
  const b = store.create(USER);
  const c = store.create(USER2);
  assert.equal(store.revoke(a.token), true);
  assert.equal(store.get(a.token), null);
  assert.equal(store.revoke('not-a-valid-token'), false);
  assert.equal(store.revokeByHash(b.key), true);
  assert.equal(store.revokeUser(USER.id), 0, '该用户已无会话');
  assert.equal(store.revokeUser(USER2.id), 1);
  assert.equal(store.size, 0);
  assert.equal(store.get(c.token), null);
});

test('Session：Map 只保存 SHA-256(token)，不保存原始 Token', () => {
  const store = new SessionStore();
  const { token } = store.create(USER);
  assert.equal(store.sessions.has(token), false, '原始 Token 不得作为键');
  assert.equal(store.sessions.has(hashToken(token)), true);
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
});

test('Session：每用户上限与总量上限', () => {
  const store = new SessionStore({ maxPerUser: 2, maxTotal: 100 });
  const first = store.create(USER, 1000);
  store.create(USER, 2000);
  store.create(USER, 3000);
  assert.equal(store.size, 2, '每用户最多 2 个会话');
  assert.equal(store.get(first.token, 4000), null, '最旧的会话被回收');

  const tiny = new SessionStore({ maxPerUser: 5, maxTotal: 2 });
  tiny.create(USER, 1);
  tiny.create(USER2, 2);
  assert.throws(() => tiny.create({ ...USER2, id: '33333333-3333-4333-8333-333333333333' }, 3), SessionCapacityError);
});

test('Session：轮换登录会撤销旧 Token', () => {
  const store = new SessionStore();
  const old = store.create(USER, 10);
  const next = store.create(USER, 11, { rotateFrom: old.token });
  assert.equal(store.get(old.token), null, '旧 Token 立即失效');
  assert.equal(store.get(next.token, 12)?.session.userId, USER.id);
});

test('Cookie：属性完整、清除属性与创建一致', () => {
  const created = serializeSessionCookie('abc_DEF-123', { secure: true, maxAgeSeconds: 28800 });
  assert.match(created, new RegExp('^' + SESSION_COOKIE + '=abc_DEF-123;'));
  assert.match(created, /Path=\//);
  assert.match(created, /HttpOnly/);
  assert.match(created, /SameSite=Lax/);
  assert.match(created, /Max-Age=28800/);
  assert.match(created, /Secure/);
  assert.doesNotMatch(created, /Domain=/i);

  const insecure = serializeSessionCookie('x', { secure: false });
  assert.doesNotMatch(insecure, /Secure/);

  const cleared = serializeClearCookie({ secure: true });
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /Path=\//);
  assert.match(cleared, /HttpOnly/);
  assert.match(cleared, /SameSite=Lax/);
  assert.match(cleared, /Secure/);
});

test('Cookie：解析容错（引号、重复键取第一个、无等号跳过）', () => {
  const parsed = parseCookies(`a=1; b="x y"; a=2; flag; ${SESSION_COOKIE}=tok`);
  assert.equal(parsed.a, '1');
  assert.equal(parsed.b, 'x y');
  assert.equal(parsed[SESSION_COOKIE], 'tok');
  assert.equal('flag' in parsed, false);
  assert.deepEqual(Object.keys(parseCookies('')), []);
  assert.equal(readSessionToken({ headers: { cookie: `${SESSION_COOKIE}=tok` } }), 'tok');
  assert.equal(readSessionToken({ headers: {} }), '');
});

test('Origin：精确 allowlist，缺失/null/其它域一律拒绝', () => {
  const origins = ['https://kepu.example.com'];
  assert.deepEqual(checkOrigin({ headers: { origin: 'https://kepu.example.com' } }, origins), { ok: true, origin: 'https://kepu.example.com' });
  assert.equal(checkOrigin({ headers: { origin: 'https://kepu.example.com/' } }, origins).ok, true, '末尾斜杠归一化');
  assert.equal(checkOrigin({ headers: {} }, origins).reason, 'missing_origin');
  assert.equal(checkOrigin({ headers: { origin: 'null' } }, origins).reason, 'null_origin');
  assert.equal(checkOrigin({ headers: { origin: 'http://kepu.example.com' } }, origins).reason, 'origin_not_allowed');
  assert.equal(checkOrigin({ headers: { origin: 'https://evil.example.com' } }, origins).reason, 'origin_not_allowed');
  assert.equal(isStateChanging('post'), true);
  assert.equal(isStateChanging('GET'), false);
});

test('客户端 IP：仅可信代理的 X-Real-IP 生效，X-Forwarded-For 永远忽略', () => {
  assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeIp('127.0.0.1%eth0'), '127.0.0.1');
  assert.equal(normalizeIp('::1'), '::1');
  assert.equal(normalizeIp('not-an-ip'), '');

  const fakeReq = (remote, headers) => ({ socket: { remoteAddress: remote }, headers });
  const xffOnly = fakeReq('127.0.0.1', { 'x-forwarded-for': '1.2.3.4' });
  assert.equal(clientIp(xffOnly, { trustProxy: true, trustedProxies: ['127.0.0.1'] }), '127.0.0.1');

  const untrusted = fakeReq('203.0.113.9', { 'x-real-ip': '1.2.3.4' });
  assert.equal(clientIp(untrusted, { trustProxy: true, trustedProxies: ['127.0.0.1'] }), '203.0.113.9');

  const trusted = fakeReq('127.0.0.1', { 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '1.2.3.4' });
  assert.equal(clientIp(trusted, { trustProxy: true, trustedProxies: ['127.0.0.1'] }), '198.51.100.7');

  const invalidClaim = fakeReq('127.0.0.1', { 'x-real-ip': 'garbage' });
  assert.equal(clientIp(invalidClaim, { trustProxy: true, trustedProxies: ['127.0.0.1'] }), '127.0.0.1');

  const noTrust = fakeReq('127.0.0.1', { 'x-real-ip': '198.51.100.7' });
  assert.equal(clientIp(noTrust, { trustProxy: false, trustedProxies: ['127.0.0.1'] }), '127.0.0.1');
});

test('登录限流：窗口内 5 次失败后封禁，到期解除，不同键互不影响', () => {
  const limiter = new LoginRateLimiter({ windowMs: 1000, maxFailures: 5, blockMs: 600, maxKeys: 100 });
  const key = LoginRateLimiter.key('admin', '127.0.0.1');
  const other = LoginRateLimiter.key('editor', '127.0.0.1');
  for (let i = 0; i < 5; i += 1) limiter.recordFailure(key, 100 + i);
  assert.equal(limiter.check(key, 105).blocked, true);
  assert.ok(limiter.check(key, 105).retryAfterSeconds >= 1);
  assert.equal(limiter.check(other, 105).blocked, false, '其它用户不受影响');
  assert.equal(limiter.check(key, 703).blocked, true, '封禁未到期仍然拒绝');
  assert.equal(limiter.check(key, 704).blocked, false, '封禁到期（blockedUntil）即解除');
  limiter.clear(key);
  assert.equal(limiter.check(key, 800).blocked, false);
  assert.equal(limiter.windowMs, 1000);
});

test('登录限流：键表有上限，不会随随机用户名无限增长', () => {
  const limiter = new LoginRateLimiter({ windowMs: 60000, maxFailures: 5, blockMs: 60000, maxKeys: 10 });
  for (let i = 0; i < 50; i += 1) limiter.recordFailure(`user-${i}|1.2.3.4`, 1000 + i);
  assert.ok(limiter.size <= 10, '键表必须被限制在上限内，实际 ' + limiter.size);
});
