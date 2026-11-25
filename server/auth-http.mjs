// 认证 HTTP 层：/api/auth/* 路由、Session 鉴权中间件、业务 API 的统一 401。
// 路由原则：除显式公开的认证端点外，所有 /api/* 默认要求登录（default deny）。

import crypto from 'node:crypto';

import {
  APP_ORIGINS, COOKIE_SECURE, LOGIN_BODY_LIMIT, SESSION_ABSOLUTE_MS, IS_PRODUCTION
} from './auth-config.mjs';
import { authenticateCredentials } from './auth-login.mjs';
import { findUserById, normalizeUsername, readDocument, touchLastLogin, isAuthStoreError } from './auth-store.mjs';
import {
  SessionStore, LoginRateLimiter, startSessionSweeper,
  readSessionToken, serializeSessionCookie, serializeClearCookie,
  checkOrigin, isStateChanging, clientIp, SESSION_COOKIE
} from './auth-session.mjs';

export const sessions = new SessionStore();
export const rateLimiter = new LoginRateLimiter();
startSessionSweeper(sessions);

const PUBLIC_AUTH_PATHS = new Set(['/api/auth/status', '/api/auth/login', '/api/auth/logout']);
const AUTH_PATHS = new Set([...PUBLIC_AUTH_PATHS, '/api/auth/me', '/api/auth/verify']);

export function isAuthPath(pathname) {
  return AUTH_PATHS.has(pathname);
}

/** 认证公开端点：不要求登录（login/status/logout）。其余 /api/* 一律要求登录。 */
export function isPublicApiPath(pathname) {
  return PUBLIC_AUTH_PATHS.has(pathname);
}

export function requestId(req) {
  if (!req.__authRequestId) req.__authRequestId = crypto.randomBytes(6).toString('hex');
  return req.__authRequestId;
}

function maskIp(ip) {
  if (!ip) return 'unknown';
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    return (parts.slice(0, 2).join(':') || 'v6') + '::';
  }
  const octets = ip.split('.');
  if (octets.length === 4) return octets[0] + '.' + octets[1] + '.x.x';
  return 'unknown';
}

export function logAuth(event, fields = {}) {
  const payload = { ts: new Date().toISOString(), event, ...fields };
  try {
    console.log('[auth] ' + JSON.stringify(payload));
  } catch { /* 日志失败不影响请求 */ }
}

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

export function sendJson(res, status, payload, extra = {}) {
  if (res.headersSent) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...NO_STORE,
    ...extra
  });
  res.end(body);
}

function sendEmpty(res, status, extra = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { ...NO_STORE, ...extra });
  res.end();
}

function methodNotAllowed(res, allow) {
  sendJson(res, 405, { error: 'method_not_allowed' }, { Allow: allow });
}

/** 读取 JSON 请求体；超过上限返回 code=body_too_large。 */
export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        const error = new Error('request body too large');
        error.code = 'body_too_large';
        finish(error);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
    req.on('error', error => finish(error));
    req.on('aborted', () => finish(Object.assign(new Error('aborted'), { code: 'aborted' })));
  });
}

function parseJsonBody(text) {
  try {
    return { ok: true, value: JSON.parse(text || '{}') };
  } catch {
    return { ok: false };
  }
}

function contentTypeIsJson(req) {
  const raw = req.headers['content-type'];
  if (typeof raw !== 'string') return false;
  return /^application\/json\s*(;|$)/i.test(raw.trim());
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
}

/**
 * 解析当前请求的 Session 并核对最新用户记录。
 * 每次都会重新读取 users.json：CLI 在另一个进程里禁用/重置后，下一次请求立即失效。
 * @returns {Promise<{ok:true,user:object,session:object,token:string}
 *   | {ok:false,status:number,code:string}>}
 */
export async function authenticate(req) {
  const token = readSessionToken(req);
  if (!token) return { ok: false, status: 401, code: 'unauthorized' };
  const found = sessions.get(token);
  if (!found) return { ok: false, status: 401, code: 'unauthorized' };

  let doc;
  try {
    doc = await readDocument();
  } catch (error) {
    logAuth('store_unavailable', {
      reqId: requestId(req),
      code: error.code || 'unknown',
      category: isAuthStoreError(error) ? 'store' : 'internal'
    });
    return { ok: false, status: 503, code: 'auth_unavailable' };
  }

  const user = findUserById(doc, found.session.userId);
  if (!user || user.status !== 'active' || user.authVersion !== found.session.authVersion) {
    sessions.revokeByHash(found.key);
    return { ok: false, status: 401, code: 'unauthorized' };
  }
  sessions.touch(found.session);
  return { ok: true, user, session: found.session, token };
}

/**
 * 业务 API 的鉴权门槛：先 Session，再 Origin（状态改变请求），最后才读 body / 调上游。
 * 返回 true 表示已放行；返回 false 表示已经写过响应。
 */
export async function requireBusinessAuth(req, res, pathname) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    sendJson(res, auth.status, {
      authenticated: false,
      error: auth.code === 'auth_unavailable' ? 'auth_unavailable' : 'unauthorized'
    });
    return null;
  }
  if (isStateChanging(req.method)) {
    const origin = checkOrigin(req, APP_ORIGINS);
    if (!origin.ok) {
      logAuth('origin_rejected', {
        reqId: requestId(req),
        path: pathname,
        reason: origin.reason,
        ip: maskIp(clientIp(req))
      });
      sendJson(res, 403, { error: 'origin_not_allowed' });
      return null;
    }
  }
  return auth;
}

/* —————————————— /api/auth/* —————————————— */

async function handleStatus(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  let doc;
  try {
    doc = await readDocument();
  } catch (error) {
    logAuth('status_store_error', { reqId: requestId(req), code: error.code || 'unknown' });
    return sendJson(res, 503, { initialized: false, error: 'auth_store_unavailable' });
  }
  return sendJson(res, 200, { initialized: doc.users.length > 0 });
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const origin = checkOrigin(req, APP_ORIGINS);
  if (!origin.ok) {
    logAuth('login_origin_rejected', { reqId: requestId(req), reason: origin.reason, ip: maskIp(clientIp(req)) });
    return sendJson(res, 403, { error: 'origin_not_allowed' });
  }
  if (!contentTypeIsJson(req)) {
    return sendJson(res, 415, { error: 'unsupported_media_type' });
  }
  let text;
  try {
    text = await readBody(req, LOGIN_BODY_LIMIT);
  } catch (error) {
    if (error.code === 'body_too_large') return sendJson(res, 413, { error: '请求体过大' });
    return sendJson(res, 400, { error: '请求格式无效' });
  }
  const parsed = parseJsonBody(text);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return sendJson(res, 400, { error: '请求格式无效' });
  }
  const { username, password } = parsed.value;
  if (typeof username !== 'string' || typeof password !== 'string') {
    return sendJson(res, 400, { error: '请求格式无效' });
  }
  if (Buffer.byteLength(password, 'utf8') > 512 || username.length > 200) {
    return sendJson(res, 400, { error: '请求格式无效' });
  }

  const ip = clientIp(req);
  const rateKey = LoginRateLimiter.key(normalizeUsername(username), ip);
  const limit = rateLimiter.check(rateKey);
  if (limit.blocked) {
    logAuth('login_rate_limited', { reqId: requestId(req), ip: maskIp(ip), retryAfter: limit.retryAfterSeconds });
    return sendJson(res, 429, { error: '尝试次数过多，请稍后再试' }, {
      'Retry-After': String(limit.retryAfterSeconds)
    });
  }

  let outcome;
  try {
    outcome = await authenticateCredentials(username, password);
  } catch (error) {
    if (error && error.code === 'unsupported_password_record') {
      logAuth('login_unsupported_record', { reqId: requestId(req) });
      return sendJson(res, 503, { error: 'auth_store_unavailable' });
    }
    if (error && error.code === 'scrypt_overloaded') {
      logAuth('login_overloaded', { reqId: requestId(req) });
      return sendJson(res, 503, { error: 'auth_busy' });
    }
    logAuth('login_store_error', {
      reqId: requestId(req),
      code: error && error.code ? error.code : 'internal'
    });
    return sendJson(res, 503, { error: 'auth_store_unavailable' });
  }

  if (!outcome.ok) {
    if (outcome.reason !== 'uninitialized') {
      rateLimiter.recordFailure(rateKey);
    }
    logAuth('login_failed', {
      reqId: requestId(req),
      category: outcome.reason,
      ip: maskIp(ip)
    });
    if (outcome.reason === 'uninitialized') {
      return sendJson(res, 503, { error: 'auth_not_initialized' });
    }
    return sendJson(res, 401, { error: '用户名或密码错误' });
  }

  rateLimiter.clear(rateKey);
  const oldToken = readSessionToken(req);
  let created;
  try {
    created = sessions.create(outcome.user, Date.now(), { rotateFrom: oldToken || null });
  } catch (error) {
    logAuth('session_capacity', { reqId: requestId(req) });
    return sendJson(res, 503, { error: 'auth_busy' });
  }
  try {
    await touchLastLogin(outcome.user.id);
  } catch (error) {
    logAuth('last_login_update_failed', { reqId: requestId(req), code: error.code || 'unknown' });
  }
  logAuth('login_ok', {
    reqId: requestId(req),
    userId: outcome.user.id,
    username: outcome.user.username,
    ip: maskIp(ip)
  });
  return sendJson(res, 200, { authenticated: true, user: publicUser(outcome.user) }, {
    'Set-Cookie': serializeSessionCookie(created.token, {
      secure: COOKIE_SECURE,
      maxAgeSeconds: Math.floor(SESSION_ABSOLUTE_MS / 1000)
    })
  });
}

async function handleMe(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  const auth = await authenticate(req);
  if (!auth.ok) {
    if (auth.status === 503) return sendJson(res, 503, { authenticated: false, error: 'auth_unavailable' });
    return sendJson(res, 401, { authenticated: false, error: 'unauthorized' });
  }
  return sendJson(res, 200, { authenticated: true, user: publicUser(auth.user) });
}

async function handleVerify(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  const auth = await authenticate(req);
  if (!auth.ok) {
    if (auth.status === 503) return sendEmpty(res, 503);
    return sendEmpty(res, 401);
  }
  return sendEmpty(res, 204);
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const origin = checkOrigin(req, APP_ORIGINS);
  if (!origin.ok) {
    logAuth('logout_origin_rejected', { reqId: requestId(req), reason: origin.reason });
    return sendJson(res, 403, { error: 'origin_not_allowed' });
  }
  const token = readSessionToken(req);
  if (token) sessions.revoke(token);
  logAuth('logout', { reqId: requestId(req), hadSession: Boolean(token) });
  return sendJson(res, 200, { authenticated: false }, {
    'Set-Cookie': serializeClearCookie({ secure: COOKIE_SECURE })
  });
}

/**
 * 分派 /api/auth/*。未知的认证子路径返回 404（不再回落到业务路由）。
 * @returns {Promise<boolean>} 是否已处理
 */
export async function handleAuthRequest(req, res, pathname) {
  switch (pathname) {
    case '/api/auth/status': await handleStatus(req, res); return true;
    case '/api/auth/login': await handleLogin(req, res); return true;
    case '/api/auth/me': await handleMe(req, res); return true;
    case '/api/auth/verify': await handleVerify(req, res); return true;
    case '/api/auth/logout': await handleLogout(req, res); return true;
    default:
      if (pathname.startsWith('/api/auth/')) {
        sendJson(res, 404, { error: 'not found' });
        return true;
      }
      return false;
  }
}

export const authInternals = {
  PUBLIC_AUTH_PATHS,
  AUTH_PATHS,
  SESSION_COOKIE,
  IS_PRODUCTION
};
