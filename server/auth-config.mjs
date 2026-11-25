// 认证配置：环境变量的唯一解析入口。
// 原则：默认值必须安全；生产环境（NODE_ENV=production）配置不完整时拒绝启动（fail closed）。

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SERVER_DIR, '..');
export const WEB_DIR = path.join(REPO_ROOT, 'web');

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** 默认开发 Origin；生产必须用 APP_ORIGINS 显式覆盖。 */
export const DEFAULT_DEV_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173'];

function envText(name) {
  const raw = process.env[name];
  return typeof raw === 'string' ? raw.trim() : '';
}

function envFlag(name, fallback = false) {
  const raw = envText(name).toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function envInt(name, fallback) {
  const raw = envText(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * 解析 AUTH_DATA_DIR。
 * 相对路径相对 server/ 解析（不依赖 process.cwd()），绝对路径原样使用。
 */
export function resolveDataDir(raw = envText('AUTH_DATA_DIR'), serverDir = SERVER_DIR) {
  if (!raw) return path.join(serverDir, 'data');
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(serverDir, raw);
}

export const DATA_DIR = resolveDataDir();
export const USERS_FILE = path.join(DATA_DIR, 'users.json');
export const AUDIT_FILE = path.join(DATA_DIR, 'auth-audit.log');
export const INSTANCE_LOCK_FILE = path.join(DATA_DIR, 'instance.lock');

/** 被允许访问的站点 Origin（精确匹配，不含路径与尾部斜杠）。 */
export function parseOrigins(raw, { production = IS_PRODUCTION } = {}) {
  const source = (typeof raw === 'string' && raw.trim()) ? raw : (production ? '' : DEFAULT_DEV_ORIGINS.join(','));
  const origins = [];
  for (const piece of String(source).split(',')) {
    const value = piece.trim();
    if (!value) continue;
    if (value === '*') {
      throw new Error('APP_ORIGINS 不允许使用通配符 *，必须写精确 Origin');
    }
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('APP_ORIGINS 中存在无法解析的 Origin: ' + value);
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error('APP_ORIGINS 只能写 Origin（协议+主机+端口），不能带路径或凭据: ' + value);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('APP_ORIGINS 只支持 http/https: ' + value);
    }
    const origin = parsed.origin;
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

export const APP_ORIGINS = parseOrigins(process.env.APP_ORIGINS);

export const TRUST_PROXY = envFlag('AUTH_TRUST_PROXY', false);

function parseProxyList(raw) {
  const fallback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  if (!raw) return fallback;
  const list = raw.split(',').map(s => s.trim()).filter(Boolean);
  return list.length ? list : fallback;
}
/** 只有来自这些地址的连接才允许读取 X-Real-IP。 */
export const TRUSTED_PROXY_IPS = parseProxyList(envText('AUTH_TRUSTED_PROXY_IPS'));

export const COOKIE_SECURE = envFlag('AUTH_COOKIE_SECURE', IS_PRODUCTION);

export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MAX_PER_USER = 5;
export const SESSION_MAX_TOTAL = envInt('AUTH_SESSION_MAX', 10000);

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = envInt('AUTH_LOGIN_MAX_FAILURES', 5);
export const LOGIN_BLOCK_MS = 15 * 60 * 1000;

export const LOGIN_BODY_LIMIT = 8 * 1024;
export const BUSINESS_BODY_LIMIT = 64 * 1024;

/** 判断某个绝对路径是否落在 web/ 静态根目录内（用户数据绝不能放这里）。 */
export function isInsideWebDir(target) {
  const resolved = path.resolve(target);
  const web = path.resolve(WEB_DIR);
  return resolved === web || resolved.startsWith(web + path.sep);
}

/**
 * 生产环境的 fail-closed 配置检查。
 * 开发环境只做基本一致性检查（不阻止 http + 非 Secure 的本地调试）。
 * @returns {string[]} 致命问题列表
 */
export function configProblems({ production = IS_PRODUCTION, origins = APP_ORIGINS, cookieSecure = COOKIE_SECURE, dataDir = DATA_DIR } = {}) {
  const problems = [];
  if (isInsideWebDir(dataDir)) {
    problems.push('AUTH_DATA_DIR 位于 web/ 静态目录内，用户文件会被 Web 直接访问；请改用 web/ 之外的目录');
  }
  if (!origins.length) {
    problems.push('APP_ORIGINS 为空：状态改变请求的 Origin 校验无法工作');
  }
  if (production) {
    if (!cookieSecure) {
      problems.push('生产环境必须设置 AUTH_COOKIE_SECURE=1（HTTPS 下 Cookie 必须带 Secure）');
    }
    if (process.env.APP_ORIGINS === undefined || !String(process.env.APP_ORIGINS).trim()) {
      problems.push('生产环境必须显式配置 APP_ORIGINS（实际 HTTPS 域名），不能依赖开发默认值');
    }
    for (const origin of origins) {
      let parsed;
      try { parsed = new URL(origin); } catch { problems.push('APP_ORIGINS 含非法 Origin: ' + origin); continue; }
      if (parsed.protocol !== 'https:') {
        problems.push('生产环境 APP_ORIGINS 必须使用 https://：' + origin);
      }
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1') {
        problems.push('生产环境 APP_ORIGINS 不能是本地回环地址：' + origin);
      }
    }
  }
  return problems;
}

/**
 * 启动前调用：有问题直接抛错，进程以非 0 退出。
 * 不允许“悄悄降级为不安全 Cookie”。
 */
export function assertStartupConfig() {
  const problems = configProblems();
  if (problems.length) {
    const error = new Error('认证配置不安全，拒绝启动：\n- ' + problems.join('\n- '));
    error.code = 'AUTH_CONFIG_INVALID';
    throw error;
  }
}

export function describeConfig() {
  return {
    dataDir: DATA_DIR,
    usersFile: USERS_FILE,
    cookieSecure: COOKIE_SECURE,
    origins: APP_ORIGINS,
    trustProxy: TRUST_PROXY,
    trustedProxyIps: TRUSTED_PROXY_IPS,
    production: IS_PRODUCTION
  };
}
