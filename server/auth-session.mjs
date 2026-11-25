// Session、Cookie、Origin 校验、客户端 IP 解析、登录限流。
// 第一版边界：Session 只存在于单个 Node 进程内存；进程重启后全部失效。
// Cookie 里只有原始 Token，服务端 Map 的 key 是 SHA-256(Token)。

import crypto from 'node:crypto';
import net from 'node:net';

import {
  SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SESSION_MAX_PER_USER, SESSION_MAX_TOTAL,
  LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES, LOGIN_BLOCK_MS, APP_ORIGINS, TRUST_PROXY, TRUSTED_PROXY_IPS
} from './auth-config.mjs';

export const SESSION_COOKIE = 'yj_session';
const SAFE_TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

export class SessionCapacityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SessionCapacityError';
    this.code = 'session_capacity';
  }
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export class SessionStore {
  constructor(options = {}) {
    this.absoluteMs = options.absoluteMs || SESSION_ABSOLUTE_MS;
    this.idleMs = options.idleMs || SESSION_IDLE_MS;
    this.maxPerUser = options.maxPerUser || SESSION_MAX_PER_USER;
    this.maxTotal = options.maxTotal || SESSION_MAX_TOTAL;
    this.sessions = new Map();
    this.created = 0;
    this.revoked = 0;
  }

  get size() { return this.sessions.size; }

  /** 创建 Session，并在超限时按创建时间回收最旧会话（每个用户最多 5 个）。 */
  create(user, now = Date.now(), { rotateFrom = null } = {}) {
    if (rotateFrom) this.revoke(rotateFrom);
    this.sweep(now);
    if (this.sessions.size >= this.maxTotal) {
      throw new SessionCapacityError('Session 数量已达上限，请稍后重试');
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const key = hashToken(token);
    const mine = [];
    for (const [otherKey, session] of this.sessions) {
      if (session.userId === user.id) mine.push([otherKey, session]);
    }
    if (mine.length >= this.maxPerUser) {
      mine.sort((a, b) => a[1].createdAt - b[1].createdAt);
      for (const [oldKey] of mine.slice(0, mine.length - this.maxPerUser + 1)) {
        this.sessions.delete(oldKey);
        this.revoked += 1;
      }
    }
    const session = {
      userId: user.id,
      authVersion: user.authVersion,
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt: now + this.absoluteMs,
      idleExpiresAt: now + this.idleMs
    };
    this.sessions.set(key, session);
    this.created += 1;
    return { token, key, session };
  }

  /** 读取并且校验有效期；过期即删除。 */
  get(token, now = Date.now()) {
    if (typeof token !== 'string' || !SAFE_TOKEN_RE.test(token)) return null;
    const key = hashToken(token);
    const session = this.sessions.get(key);
    if (!session) return null;
    if (now >= session.absoluteExpiresAt || now >= session.idleExpiresAt) {
      this.sessions.delete(key);
      this.revoked += 1;
      return null;
    }
    return { key, session };
  }

  /** 每次有效请求刷新“最近活动”，只改内存，不写文件。 */
  touch(session, now = Date.now()) {
    session.lastSeenAt = now;
    session.idleExpiresAt = Math.min(now + this.idleMs, session.absoluteExpiresAt);
  }

  revoke(token) {
    if (typeof token !== 'string' || !SAFE_TOKEN_RE.test(token)) return false;
    const key = hashToken(token);
    if (this.sessions.delete(key)) {
      this.revoked += 1;
      return true;
    }
    return false;
  }

  revokeByHash(key) {
    if (this.sessions.delete(key)) {
      this.revoked += 1;
      return true;
    }
    return false;
  }

  revokeUser(userId) {
    let count = 0;
    for (const [key, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(key);
        count += 1;
      }
    }
    this.revoked += count;
    return count;
  }

  sweep(now = Date.now()) {
    let removed = 0;
    for (const [key, session] of this.sessions) {
      if (now >= session.absoluteExpiresAt || now >= session.idleExpiresAt) {
        this.sessions.delete(key);
        removed += 1;
      }
    }
    this.revoked += removed;
    return removed;
  }
}

/** 一个 unref 的定时清理任务；不为每个 Session 单独建 timer。 */
export function startSessionSweeper(store, intervalMs = 60_000) {
  const timer = setInterval(() => {
    try { store.sweep(); } catch { /* 清理失败不影响请求 */ }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

/* —————————————— Cookie —————————————— */

export function parseCookies(header) {
  const result = Object.create(null);
  if (typeof header !== 'string' || !header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    let value = part.slice(index + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!(name in result)) result[name] = value;
  }
  return result;
}

export function readSessionToken(req) {
  const cookies = parseCookies(req.headers && req.headers.cookie);
  return cookies[SESSION_COOKIE] || '';
}

export function serializeSessionCookie(token, { secure = false, maxAgeSeconds = SESSION_ABSOLUTE_MS / 1000 } = {}) {
  const parts = [
    SESSION_COOKIE + '=' + token,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + Math.floor(maxAgeSeconds)
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** 清除 Cookie：属性必须与创建时一致，否则浏览器可能留下旧的同名 Cookie。 */
export function serializeClearCookie({ secure = false } = {}) {
  const parts = [SESSION_COOKIE + '=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/* —————————————— Origin / CSRF —————————————— */

export const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isStateChanging(method) {
  return STATE_CHANGING_METHODS.has(String(method || '').toUpperCase());
}

/**
 * 精确 Origin allowlist 校验。
 * 缺失 Origin、'null'、或不在 allowlist 一律拒绝；不根据 Host / X-Forwarded-Host 推导。
 */
export function checkOrigin(req, origins = APP_ORIGINS) {
  const raw = req.headers && req.headers.origin;
  if (typeof raw !== 'string' || !raw) return { ok: false, reason: 'missing_origin' };
  if (raw === 'null') return { ok: false, reason: 'null_origin' };
  const normalized = raw.replace(/\/+$/, '');
  if (!origins.includes(normalized)) return { ok: false, reason: 'origin_not_allowed' };
  return { ok: true, origin: normalized };
}

/* —————————————— 客户端 IP —————————————— */

export function normalizeIp(value) {
  if (typeof value !== 'string') return '';
  let ip = value.trim();
  if (!ip) return '';
  const zone = ip.indexOf('%');
  if (zone > 0) ip = ip.slice(0, zone);
  if (ip.toLowerCase().startsWith('::ffff:')) {
    const v4 = ip.slice(7);
    if (net.isIP(v4) === 4) return v4;
  }
  if (ip === '::1') return '::1';
  return net.isIP(ip) ? ip : '';
}

function isTrustedProxy(remote, trusted) {
  const normalized = normalizeIp(remote);
  if (!normalized) return false;
  return trusted.some(entry => {
    const candidate = normalizeIp(entry) || entry;
    return candidate === normalized;
  });
}

/**
 * 真实客户端 IP：
 * - 只有“连接来源确实是可信代理”时才读 X-Real-IP（Nginx 覆盖写入）。
 * - X-Forwarded-For 一律忽略：不解析客户端提供的代理链。
 */
export function clientIp(req, { trustProxy = TRUST_PROXY, trustedProxies = TRUSTED_PROXY_IPS } = {}) {
  const remote = (req.socket && (req.socket.remoteAddress || req.socket._remoteAddress)) || '';
  const remoteNormalized = normalizeIp(remote) || String(remote);
  if (trustProxy && isTrustedProxy(remoteNormalized, trustedProxies)) {
    const header = req.headers && req.headers['x-real-ip'];
    const rawValue = Array.isArray(header) ? header[0] : header;
    if (typeof rawValue === 'string') {
      const first = rawValue.split(',')[0];
      const claimed = normalizeIp(first);
      if (claimed) return claimed;
    }
  }
  return remoteNormalized || 'unknown';
}

/* —————————————— 登录限流 —————————————— */

/**
 * 15 分钟窗口内同一（规范化用户名 + IP）失败 5 次 → 临时限制 15 分钟。
 * 不做永久锁死；表有容量上限，且惰性清理，不会随随机用户名无限增长。
 */
export class LoginRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || LOGIN_WINDOW_MS;
    this.maxFailures = options.maxFailures || LOGIN_MAX_FAILURES;
    this.blockMs = options.blockMs || LOGIN_BLOCK_MS;
    this.maxKeys = options.maxKeys || 10000;
    this.entries = new Map();
  }

  static key(usernameNormalized, ip) {
    return String(usernameNormalized || '').slice(0, 64) + '|' + String(ip || '').slice(0, 64);
  }

  get size() { return this.entries.size; }

  _prune(now) {
    for (const [key, entry] of this.entries) {
      const windowExpired = now - entry.firstSeenAt > this.windowMs;
      const blockExpired = entry.blockedUntil > 0 && now >= entry.blockedUntil;
      if ((windowExpired && entry.blockedUntil === 0) || (blockExpired && now - entry.blockedUntil > this.windowMs)) {
        this.entries.delete(key);
      }
    }
  }

  _ensureCapacity(now) {
    if (this.entries.size < this.maxKeys) return;
    this._prune(now);
    if (this.entries.size < this.maxKeys) return;
    // 仍然满：按最久未更新淘汰，绝不无限增长
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [key, entry] of this.entries) {
      const at = Math.max(entry.lastAt || 0, entry.blockedUntil || 0);
      if (at < oldestAt) { oldestAt = at; oldestKey = key; }
    }
    if (oldestKey !== null) this.entries.delete(oldestKey);
  }

  check(key, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry) return { blocked: false, retryAfterSeconds: 0 };
    if (entry.blockedUntil > now) {
      return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000)) };
    }
    if (now - entry.firstSeenAt > this.windowMs) {
      this.entries.delete(key);
      return { blocked: false, retryAfterSeconds: 0 };
    }
    return { blocked: false, retryAfterSeconds: 0 };
  }

  recordFailure(key, now = Date.now()) {
    this._ensureCapacity(now);
    let entry = this.entries.get(key);
    if (!entry || now - entry.firstSeenAt > this.windowMs) {
      entry = { firstSeenAt: now, failures: 0, blockedUntil: 0, lastAt: now };
      this.entries.set(key, entry);
    }
    entry.failures += 1;
    entry.lastAt = now;
    if (entry.failures >= this.maxFailures) {
      entry.blockedUntil = now + this.blockMs;
    }
    return entry;
  }

  clear(key) {
    return this.entries.delete(key);
  }

  reset() {
    this.entries.clear();
  }
}
