// users.json 存储层：Schema 校验、原子写入、跨进程文件锁、账户增改、审计。
// 设计要点：
// 1. 所有写操作都在同一把跨进程锁（proper-lockfile）内完成“读最新 → 校验 → 修改 → 原子写”。
// 2. 文件损坏/结构不合法时 fail closed：抛 AuthStoreError，不静默覆盖。
// 3. 用户文件、锁文件、审计文件都放在 web/ 之外的运行时目录，不提交进仓库。

import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import lockfile from 'proper-lockfile';

import {
  DATA_DIR, USERS_FILE, AUDIT_FILE, INSTANCE_LOCK_FILE, isInsideWebDir
} from './auth-config.mjs';
import {
  hashPassword, isSupportedPasswordRecord, SCRYPT_KEY_LENGTH, SCRYPT_PARAMS, SCRYPT_SALT_BYTES
} from './auth-crypto.mjs';

export const SCHEMA_VERSION = 1;
export const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const ROLES = new Set(['admin', 'user']);
const STATUSES = new Set(['active', 'disabled']);
const USER_KEYS = new Set(['id', 'username', 'usernameNormalized', 'displayName', 'role', 'status', 'authVersion', 'password', 'createdAt', 'updatedAt', 'lastLoginAt']);
const PASSWORD_KEYS = new Set(['algorithm', 'salt', 'hash', 'keyLength', 'params']);
const PARAM_KEYS = new Set(['N', 'r', 'p']);

const LOCK_OPTIONS = Object.freeze({
  realpath: false,
  stale: 20000,
  update: 5000,
  retries: { retries: 40, minTimeout: 40, maxTimeout: 300, factor: 1.4, randomize: true }
});

export class AuthStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthStoreError';
    this.code = code;
  }
}

export function isAuthStoreError(error) {
  return error instanceof AuthStoreError || (error && typeof error.code === 'string' && error.code.startsWith('auth_store_'));
}

/* —————————————— Schema 校验 —————————————— */

function fail(message) {
  throw new AuthStoreError('auth_store_corrupt', 'users.json 结构不合法：' + message);
}

function assertKeys(object, allowed, label) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) fail(label + ' 出现未知字段 ' + JSON.stringify(key));
  }
}

function assertIsoOrNull(value, label) {
  if (value === null) return;
  if (typeof value !== 'string' || !ISO_RE.test(value)) fail(label + ' 不是合法的 ISO 时间字符串');
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail(label + ' 时间无法解析');
}

export function normalizeUsername(username) {
  return typeof username === 'string' ? username.toLowerCase() : '';
}

function validateUser(user, index, seenIds, seenNames) {
  const where = 'users[' + index + ']';
  if (!user || typeof user !== 'object' || Array.isArray(user)) fail(where + ' 不是对象');
  assertKeys(user, USER_KEYS, where);

  if (typeof user.id !== 'string' || !UUID_RE.test(user.id)) fail(where + '.id 不是合法 UUID');
  if (seenIds.has(user.id)) fail(where + '.id 重复');
  seenIds.add(user.id);

  if (typeof user.username !== 'string' || !USERNAME_RE.test(user.username)) {
    fail(where + '.username 必须是 3–32 位 ASCII 字母/数字/点/下划线/短横线');
  }
  if (user.usernameNormalized !== normalizeUsername(user.username)) {
    fail(where + '.usernameNormalized 必须等于 username 的规范化小写值');
  }
  if (seenNames.has(user.usernameNormalized)) fail(where + '.username 规范化后重复：' + user.username);
  seenNames.add(user.usernameNormalized);

  if (typeof user.displayName !== 'string') fail(where + '.displayName 必须是字符串');
  const display = user.displayName.trim();
  if (!display || Array.from(display).length > 64) fail(where + '.displayName 长度必须在 1–64 之间');
  if (/[\u0000-\u001f\u007f]/.test(display)) fail(where + '.displayName 不能含控制字符');

  if (!ROLES.has(user.role)) fail(where + '.role 只能是 admin 或 user');
  if (!STATUSES.has(user.status)) fail(where + '.status 只能是 active 或 disabled');

  if (!Number.isInteger(user.authVersion) || user.authVersion < 1 || user.authVersion > 1e9) {
    fail(where + '.authVersion 必须是正整数');
  }

  const pwd = user.password;
  if (!pwd || typeof pwd !== 'object' || Array.isArray(pwd)) fail(where + '.password 不是对象');
  assertKeys(pwd, PASSWORD_KEYS, where + '.password');
  if (pwd.algorithm !== 'scrypt') fail(where + '.password.algorithm 只支持 scrypt');
  if (pwd.keyLength !== SCRYPT_KEY_LENGTH) fail(where + '.password.keyLength 必须为 ' + SCRYPT_KEY_LENGTH);
  if (!pwd.params || typeof pwd.params !== 'object') fail(where + '.password.params 不是对象');
  assertKeys(pwd.params, PARAM_KEYS, where + '.password.params');
  if (pwd.params.N !== SCRYPT_PARAMS.N || pwd.params.r !== SCRYPT_PARAMS.r || pwd.params.p !== SCRYPT_PARAMS.p) {
    fail(where + '.password.params 不是当前支持的 scrypt 参数组合');
  }
  if (typeof pwd.salt !== 'string' || !BASE64_RE.test(pwd.salt) || Buffer.from(pwd.salt, 'base64').length !== SCRYPT_SALT_BYTES) {
    fail(where + '.password.salt 必须是 ' + SCRYPT_SALT_BYTES + ' 字节的 base64');
  }
  if (typeof pwd.hash !== 'string' || !BASE64_RE.test(pwd.hash) || Buffer.from(pwd.hash, 'base64').length !== SCRYPT_KEY_LENGTH) {
    fail(where + '.password.hash 必须是 ' + SCRYPT_KEY_LENGTH + ' 字节的 base64');
  }
  if (!isSupportedPasswordRecord(pwd)) fail(where + '.password 不是受支持的密码记录');

  assertIsoOrNull(user.createdAt, where + '.createdAt');
  assertIsoOrNull(user.updatedAt, where + '.updatedAt');
  assertIsoOrNull(user.lastLoginAt, where + '.lastLoginAt');
  if (typeof user.createdAt !== 'string') fail(where + '.createdAt 不能为空');

  return {
    id: user.id,
    username: user.username,
    usernameNormalized: user.usernameNormalized,
    displayName: display,
    role: user.role,
    status: user.status,
    authVersion: user.authVersion,
    password: {
      algorithm: pwd.algorithm,
      salt: pwd.salt,
      hash: pwd.hash,
      keyLength: pwd.keyLength,
      params: { N: pwd.params.N, r: pwd.params.r, p: pwd.params.p }
    },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt
  };
}

/** 校验整份文档；返回规范化后的副本（去掉字段顺序/空白差异）。 */
export function validateDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('顶层不是对象');
  assertKeys(doc, new Set(['schemaVersion', 'updatedAt', 'users']), '顶层');
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    throw new AuthStoreError('auth_store_unsupported', 'users.json 的 schemaVersion 不受支持：' + String(doc.schemaVersion));
  }
  assertIsoOrNull(doc.updatedAt, 'updatedAt');
  if (typeof doc.updatedAt !== 'string') fail('updatedAt 不能为空');
  if (!Array.isArray(doc.users)) fail('users 必须是数组');
  const seenIds = new Set();
  const seenNames = new Set();
  const users = doc.users.map((u, i) => validateUser(u, i, seenIds, seenNames));
  return { schemaVersion: SCHEMA_VERSION, updatedAt: doc.updatedAt, users };
}

export function emptyDoc() {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString(), users: [] };
}

export function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    authVersion: user.authVersion,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt
  };
}

/* —————————————— 文件系统：目录、原子写 —————————————— */

let posixWarned = false;

export async function ensureDataDir() {
  if (isInsideWebDir(DATA_DIR)) {
    throw new AuthStoreError('auth_store_insecure_path', 'AUTH_DATA_DIR 位于 web/ 目录内，拒绝使用：' + DATA_DIR);
  }
  await fsp.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    try { await fsp.chmod(DATA_DIR, 0o700); } catch { /* 忽略：目录可能是挂载点 */ }
  } else if (!posixWarned) {
    posixWarned = true;
    // Windows 的 mode 位没有 ACL 语义；权限收紧需由运维用 icacls 完成（见部署文档）。
    console.warn('[auth] Windows 下目录/文件权限由 NTFS ACL 决定，请按文档用 icacls 限制 server/data 的访问。');
  }
}

async function renameWithRetry(from, to) {
  const delays = [10, 20, 40, 60, 100, 150, 200, 200, 200];
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (error) {
      // Windows 上杀毒/索引服务会短暂占用文件，只在这类可重试错误上退避重试
      const retryable = ['EPERM', 'EACCES', 'EBUSY'].includes(error.code);
      if (!retryable || process.platform !== 'win32' || attempt >= delays.length) throw error;
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }
}

async function fsyncDir(dir) {
  let handle;
  try {
    handle = await fsp.open(dir, 'r');
    await handle.sync();
  } catch {
    // Windows 不支持对目录 fsync；POSIX 上失败也不影响已完成 rename 的完整性
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

/**
 * 原子写：同目录临时文件 → 写入 + fsync → close → rename 覆盖 → fsync 父目录。
 * 绝不采用“先删旧文件再写”的非原子降级。
 */
export async function writeJsonAtomic(filePath, value, options = {}) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, '.' + base + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp');
  const body = JSON.stringify(value, null, 2) + '\n';
  let handle;
  try {
    handle = await fsp.open(tmp, 'wx', 0o600);
    await handle.writeFile(body, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    if (process.platform !== 'win32') await fsp.chmod(tmp, 0o600).catch(() => {});
    if (typeof options.__testFailBeforeRename === 'function') {
      await options.__testFailBeforeRename({ tmp, target: filePath });
    }
    await renameWithRetry(tmp, filePath);
    if (process.platform !== 'win32') await fsp.chmod(filePath, 0o600).catch(() => {});
    await fsyncDir(dir);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fsp.unlink(tmp).catch(() => {});
    throw error;
  }
}

/* —————————————— 读 —————————————— */

async function readRaw(filePath) {
  let text;
  try {
    text = await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AuthStoreError('auth_store_missing', '用户文件不存在：' + filePath);
    }
    throw new AuthStoreError('auth_store_unavailable', '无法读取用户文件：' + error.code);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AuthStoreError('auth_store_corrupt', 'users.json 不是合法 JSON（拒绝自动覆盖，请先备份再人工修复）');
  }
  return parsed;
}

/** 首次启动时原子创建空结构；已有文件（包括损坏文件）绝不覆盖。 */
export async function ensureStorage() {
  await ensureDataDir();
  try {
    await fsp.access(USERS_FILE);
    return false;
  } catch {
    /* 不存在再创建 */
  }
  const tmp = path.join(DATA_DIR, '.users.json.init.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
  const body = JSON.stringify(emptyDoc(), null, 2) + '\n';
  await fsp.writeFile(tmp, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try {
    // 用硬链接做“不存在才创建”：link 是原子的，目标已存在一定失败，绝不会覆盖并发进程刚写好的用户数据
    try {
      await fsp.link(tmp, USERS_FILE);
      if (process.platform !== 'win32') await fsp.chmod(USERS_FILE, 0o600).catch(() => {});
      return true;
    } catch (linkError) {
      if (linkError.code === 'EEXIST') return false;
      if (!['EPERM', 'ENOTSUP', 'ENOSYS', 'EXDEV', 'EACCES', 'EINVAL'].includes(linkError.code)) throw linkError;
      // 文件系统不支持硬链接（FAT/exFAT/SMB）时退回独占创建，仍然不会覆盖已有文件
      let handle;
      try {
        handle = await fsp.open(USERS_FILE, 'wx', 0o600);
      } catch (openError) {
        if (openError.code === 'EEXIST') return false;
        throw openError;
      }
      try {
        await handle.writeFile(body, 'utf8');
        await handle.sync();
      } finally {
        await handle.close().catch(() => {});
      }
      return true;
    }
  } finally {
    await fsp.unlink(tmp).catch(() => {});
  }
}

/** 只读快照（用于认证校验等高频路径）。原子替换保证读到的是完整文件。 */
export async function readDocument() {
  await ensureStorage();
  return validateDoc(await readRaw(USERS_FILE));
}

export async function isInitialized() {
  const doc = await readDocument();
  return doc.users.length > 0;
}

/* —————————————— 锁 —————————————— */

/** 在同一把跨进程锁内执行“读最新 → 校验 → 修改 → 原子写”。 */
export async function withUsersLock(task) {
  await ensureStorage();
  let release;
  try {
    release = await lockfile.lock(USERS_FILE, LOCK_OPTIONS);
  } catch (error) {
    if (error.code === 'ELOCKED') {
      throw new AuthStoreError('auth_store_locked', '用户文件被其他进程占用（锁等待超时），请稍后重试');
    }
    throw new AuthStoreError('auth_store_unavailable', '无法获取用户文件锁：' + (error.code || error.message));
  }
  try {
    return await task();
  } finally {
    try { await release(); } catch { /* 锁目录可能已被回收 */ }
  }
}

/**
 * 读-改-写。mutator 拿到锁内的最新文档，返回 { doc, result }。
 * 写前重新校验整份文档，任何不合法都不落盘。
 */
export async function mutateDocument(mutator, meta = {}) {
  return withUsersLock(async () => {
    const doc = validateDoc(await readRaw(USERS_FILE));
    const outcome = await mutator(doc);
    if (!outcome || typeof outcome !== 'object' || !outcome.doc) {
      throw new AuthStoreError('auth_store_bug', 'mutator 必须返回 { doc, result }');
    }
    const next = validateDoc(outcome.doc);
    next.updatedAt = new Date().toISOString();
    await writeJsonAtomic(USERS_FILE, next);
    if (meta.operation) {
      await appendAudit({
        operation: meta.operation,
        actor: meta.actor || cliActor(),
        targetUserId: meta.targetUserId || null,
        targetUsername: meta.targetUsername || null,
        detail: meta.detail || null
      });
    }
    return outcome.result;
  });
}

/* —————————————— 审计 —————————————— */

export function cliActor() {
  try {
    return os.userInfo().username || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** 追加一行审计 JSON。只记操作类型、用户标识、时间、执行者；绝不记密码/哈希/Token。 */
export async function appendAudit(entry) {
  await ensureDataDir();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    operation: String(entry.operation || '').slice(0, 64),
    actor: String(entry.actor || cliActor()).slice(0, 64),
    targetUserId: entry.targetUserId || null,
    targetUsername: entry.targetUsername || null,
    detail: entry.detail && typeof entry.detail === 'object' ? entry.detail : null
  }) + '\n';
  let handle;
  try {
    handle = await fsp.open(AUDIT_FILE, 'a', 0o600);
    await handle.writeFile(line, 'utf8');
  } catch (error) {
    console.error('[auth] 审计日志写入失败（操作已生效）：' + (error.code || error.message));
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

/* —————————————— 单实例运行锁 —————————————— */

let instanceRelease = null;

/**
 * 同一个 AUTH_DATA_DIR 只允许一个 proxy 进程。
 * 两个实例会各自持有不共享的内存 Session，必须拒绝以“已支持多实例”启动。
 */
export async function acquireInstanceLock() {
  await ensureStorage();
  const file = INSTANCE_LOCK_FILE;
  // proper-lockfile 需要目标文件存在才能计算锁目录
  await fsp.open(file, 'a', 0o600).then(handle => handle.close()).catch(() => {});
  try {
    instanceRelease = await lockfile.lock(file, {
      realpath: false,
      stale: 20000,
      update: 5000,
      retries: { retries: 12, minTimeout: 60, maxTimeout: 400, factor: 1.4, randomize: true }
    });
    return instanceRelease;
  } catch (error) {
    throw new AuthStoreError(
      'auth_store_instance_locked',
      '同一个 AUTH_DATA_DIR 已有另一个认证服务实例在运行：' + DATA_DIR + '（第一版不支持多实例共享内存 Session）'
    );
  }
}

export async function releaseInstanceLock() {
  if (!instanceRelease) return;
  const release = instanceRelease;
  instanceRelease = null;
  try { await release(); } catch { /* ignore */ }
}

/* —————————————— 账户操作 —————————————— */

export function findUserByNormalized(doc, username) {
  const normalized = normalizeUsername(username);
  return doc.users.find(user => user.usernameNormalized === normalized) || null;
}

export function findUserById(doc, id) {
  return doc.users.find(user => user.id === id) || null;
}

export function countActiveAdmins(doc) {
  return doc.users.filter(user => user.role === 'admin' && user.status === 'active').length;
}

export class StoreRuleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StoreRuleError';
    this.code = code;
  }
}

function assertValidDisplayName(displayName) {
  if (typeof displayName !== 'string') throw new StoreRuleError('invalid_display_name', '显示名必须是字符串');
  const display = displayName.trim();
  if (!display) throw new StoreRuleError('invalid_display_name', '显示名不能为空');
  if (Array.from(display).length > 64) throw new StoreRuleError('invalid_display_name', '显示名最多 64 个字符');
  if (/[\u0000-\u001f\u007f]/.test(display)) throw new StoreRuleError('invalid_display_name', '显示名不能含控制字符');
  return display;
}

function assertValidUsername(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new StoreRuleError('invalid_username', '用户名必须是 3–32 位 ASCII 字母、数字、点、下划线或短横线');
  }
  return username;
}

export async function createUser({ username, displayName, role = 'user', password, actor = cliActor() }) {
  assertValidUsername(username);
  const display = assertValidDisplayName(displayName);
  if (!ROLES.has(role)) throw new StoreRuleError('invalid_role', '角色只能是 admin 或 user');
  if (typeof password !== 'string' || password.length === 0) {
    throw new StoreRuleError('invalid_password', '密码不能为空');
  }
  // scrypt 放到锁外执行：不要让一次 600ms 的计算占着文件锁
  const passwordRecord = await hashPassword(password);
  return mutateDocument(doc => {
    if (findUserByNormalized(doc, username)) {
      throw new StoreRuleError('username_taken', '用户名已存在（用户名不区分大小写）：' + username);
    }
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      username,
      usernameNormalized: normalizeUsername(username),
      displayName: display,
      role,
      status: 'active',
      authVersion: 1,
      password: passwordRecord,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    };
    doc.users.push(user);
    return { doc, result: toPublicUser(user) };
  }, { operation: 'create-user', actor, targetUsername: username, detail: { role } });
}

export async function initAdmin({ username, displayName, password, actor = cliActor() }) {
  assertValidUsername(username);
  const display = assertValidDisplayName(displayName);
  const passwordRecord = await hashPassword(password);
  return mutateDocument(doc => {
    if (doc.users.length > 0) {
      throw new StoreRuleError('users_exist', '用户库非空，init-admin 拒绝执行（只能用于首次初始化）');
    }
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      username,
      usernameNormalized: normalizeUsername(username),
      displayName: display,
      role: 'admin',
      status: 'active',
      authVersion: 1,
      password: passwordRecord,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    };
    doc.users.push(user);
    return { doc, result: toPublicUser(user) };
  }, { operation: 'init-admin', actor, targetUsername: username });
}

export async function resetPassword(username, password, actor = cliActor()) {
  assertValidUsername(username);
  if (typeof password !== 'string' || password.length === 0) {
    throw new StoreRuleError('invalid_password', '密码不能为空');
  }
  const passwordRecord = await hashPassword(password);
  return mutateDocument(doc => {
    const user = findUserByNormalized(doc, username);
    if (!user) throw new StoreRuleError('user_not_found', '用户不存在：' + username);
    user.password = passwordRecord;
    user.authVersion += 1;
    user.updatedAt = new Date().toISOString();
    return { doc, result: toPublicUser(user) };
  }, { operation: 'reset-password', actor, targetUsername: username });
}

export async function setUserStatus(username, status, actor = cliActor()) {
  assertValidUsername(username);
  if (!STATUSES.has(status)) throw new StoreRuleError('invalid_status', '状态只能是 active 或 disabled');
  return mutateDocument(doc => {
    const user = findUserByNormalized(doc, username);
    if (!user) throw new StoreRuleError('user_not_found', '用户不存在：' + username);
    if (user.status === status) {
      throw new StoreRuleError('no_change', '用户当前状态已经是 ' + status + '：' + username);
    }
    if (status === 'disabled' && user.role === 'admin' && user.status === 'active' && countActiveAdmins(doc) <= 1) {
      throw new StoreRuleError('last_admin', '不能禁用最后一个可用的管理员账户');
    }
    user.status = status;
    user.authVersion += 1;
    user.updatedAt = new Date().toISOString();
    return { doc, result: toPublicUser(user) };
  }, { operation: status === 'disabled' ? 'disable-user' : 'enable-user', actor, targetUsername: username });
}

/** 登录成功时记录 lastLoginAt（不递增 authVersion，不影响已有 Session）。 */
export async function touchLastLogin(userId) {
  return mutateDocument(doc => {
    const user = findUserById(doc, userId);
    if (!user) return { doc, result: false };
    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = user.lastLoginAt;
    return { doc, result: true };
  });
}

export async function listUsers() {
  const doc = await readDocument();
  return doc.users.map(toPublicUser);
}
