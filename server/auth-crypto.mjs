// 密码哈希与校验：只用 node:crypto 的异步 scrypt。
// 参数是写死的常量；users.json 里的 params 只用于白名单比对，绝不直接传给 scrypt。

import crypto from 'node:crypto';

export const SCRYPT_ALGORITHM = 'scrypt';
export const SCRYPT_PARAMS = Object.freeze({ N: 131072, r: 8, p: 1 });
export const SCRYPT_KEY_LENGTH = 64;
export const SCRYPT_SALT_BYTES = 16;
/** 128 * N * r = 128 MiB；留足余量，显式设置避免 Node 默认 maxmem 报错。 */
export const SCRYPT_MAXMEM = 256 * 1024 * 1024;

export const PASSWORD_MIN_CHARS = 15;
export const PASSWORD_MAX_CHARS = 128;
export const PASSWORD_MAX_BYTES = 512;

export class PasswordPolicyError extends Error {
  constructor(message, code = 'password_policy') {
    super(message);
    this.code = code;
  }
}

/* ——— 并发闸门：同一进程里最多 N 个 scrypt 同时在跑，队列也有上限 ——— */
class ScryptGate {
  constructor(max, maxQueue = 32) {
    this.max = Math.max(1, max | 0);
    this.maxQueue = Math.max(1, maxQueue | 0);
    this.active = 0;
    this.queue = [];
  }
  get pending() { return this.queue.length; }
  async run(task) {
    if (this.active >= this.max) {
      if (this.queue.length >= this.maxQueue) {
        const error = new Error('密码校验队列已满');
        error.code = 'scrypt_overloaded';
        throw error;
      }
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export const scryptGate = new ScryptGate(Number(process.env.AUTH_SCRYPT_CONCURRENCY) || 2);

/** 测试与观测用计数器：确认所有失败分支都走了同成本校验函数。 */
export const cryptoStats = {
  verifyCalls: 0,
  dummyVerifyCalls: 0,
  hashCalls: 0
};

function scryptAsync(password, salt, keyLength) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      maxmem: SCRYPT_MAXMEM
    }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/** 只判断“这个参数组合是不是代码当前支持的那一套”。 */
export function isSupportedPasswordRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.algorithm !== SCRYPT_ALGORITHM) return false;
  if (record.keyLength !== SCRYPT_KEY_LENGTH) return false;
  const p = record.params;
  if (!p || typeof p !== 'object') return false;
  if (p.N !== SCRYPT_PARAMS.N || p.r !== SCRYPT_PARAMS.r || p.p !== SCRYPT_PARAMS.p) return false;
  if (typeof record.salt !== 'string' || typeof record.hash !== 'string') return false;
  try {
    if (Buffer.from(record.salt, 'base64').length !== SCRYPT_SALT_BYTES) return false;
    if (Buffer.from(record.hash, 'base64').length !== SCRYPT_KEY_LENGTH) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * 生成密码记录。密码本身不 trim、不截断：调用方已按策略校验过原始字符串。
 * @returns {Promise<{algorithm:string,salt:string,hash:string,keyLength:number,params:{N:number,r:number,p:number}}>}
 */
export async function hashPassword(password) {
  if (typeof password !== 'string') throw new PasswordPolicyError('密码必须是字符串', 'password_type');
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  cryptoStats.hashCalls += 1;
  const derived = await scryptGate.run(() => scryptAsync(password, salt, SCRYPT_KEY_LENGTH));
  return {
    algorithm: SCRYPT_ALGORITHM,
    salt: salt.toString('base64'),
    hash: derived.toString('base64'),
    keyLength: SCRYPT_KEY_LENGTH,
    params: { ...SCRYPT_PARAMS }
  };
}

/**
 * 校验密码。参数不合规时抛错（由调用方 fail closed），不会用任意参数跑 scrypt。
 */
export async function verifyPassword(password, record) {
  if (!isSupportedPasswordRecord(record)) {
    const error = new Error('不支持的密码哈希参数');
    error.code = 'unsupported_password_record';
    throw error;
  }
  if (typeof password !== 'string') return false;
  const salt = Buffer.from(record.salt, 'base64');
  const expected = Buffer.from(record.hash, 'base64');
  cryptoStats.verifyCalls += 1;
  const derived = await scryptGate.run(() => scryptAsync(password, salt, SCRYPT_KEY_LENGTH));
  return constantTimeEqual(derived, expected);
}

/* ——— 恒定成本路径：用户名不存在时的 dummy 校验 ——— */
let dummyRecord = null;

/**
 * dummy 记录在进程启动时随机生成：salt 与 hash 都是随机字节，
 * 不来自任何真实密码，所以不存在“已知的可用 dummy 密码”。
 */
export function getDummyPasswordRecord() {
  if (!dummyRecord) {
    dummyRecord = {
      algorithm: SCRYPT_ALGORITHM,
      salt: crypto.randomBytes(SCRYPT_SALT_BYTES).toString('base64'),
      hash: crypto.randomBytes(SCRYPT_KEY_LENGTH).toString('base64'),
      keyLength: SCRYPT_KEY_LENGTH,
      params: { ...SCRYPT_PARAMS }
    };
  }
  return dummyRecord;
}

/** 与真实校验同参数的 scrypt；结果必然不匹配（hash 是随机字节）。 */
export async function verifyDummyPassword(password) {
  cryptoStats.dummyVerifyCalls += 1;
  return verifyPassword(password, getDummyPasswordRecord());
}

export function constantTimeEqual(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ——— 弱口令与长度策略（仅新建/重置时执行，登录不 trim、不改写） ——— */

const SEQUENTIAL = /(?:0123456789|1234567890|abcdefghij|qwertyuiop|asdfghjkl|zxcvbnm)/i;
const WEAK_EXACT = new Set([
  'password', 'passwordpassword', 'passw0rd', '123456789012345', '123456789012345678',
  'qwertyuiopasdfgh', 'letmeinletmein', 'adminadminadmin', 'iloveyouiloveyou',
  '000000000000000', '111111111111111', 'aaaaaaaaaaaaaaa', '666666666666666'
]);

export function passwordChars(value) {
  return Array.from(value).length;
}

/**
 * 新建/重置密码时的策略校验。
 * 允许空格与 Unicode；不做 trim；超长直接拒绝而不是静默截断。
 * @returns {{ok:boolean, code?:string, message?:string}}
 */
export function checkNewPassword(password, context = {}) {
  if (typeof password !== 'string') {
    return { ok: false, code: 'password_type', message: '密码必须是字符串' };
  }
  if (password.length === 0) {
    return { ok: false, code: 'password_empty', message: '密码不能为空' };
  }
  if (/\u0000/.test(password)) {
    return { ok: false, code: 'password_control', message: '密码不能包含 NUL 字符' };
  }
  const chars = passwordChars(password);
  if (chars < PASSWORD_MIN_CHARS) {
    return { ok: false, code: 'password_too_short', message: '密码至少需要 ' + PASSWORD_MIN_CHARS + ' 个字符' };
  }
  if (chars > PASSWORD_MAX_CHARS) {
    return { ok: false, code: 'password_too_long', message: '密码最多 ' + PASSWORD_MAX_CHARS + ' 个字符' };
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return { ok: false, code: 'password_too_many_bytes', message: '密码 UTF-8 长度不能超过 ' + PASSWORD_MAX_BYTES + ' 字节' };
  }
  const folded = password.toLowerCase();
  const username = typeof context.username === 'string' ? context.username.toLowerCase() : '';
  if (username && folded.length <= 64 && (folded === username || folded === username + username || folded === username + '123456')) {
    return { ok: false, code: 'password_equals_username', message: '密码不能与用户名相同或近似' };
  }
  if (WEAK_EXACT.has(folded)) {
    return { ok: false, code: 'password_weak', message: '这个密码过于常见，请换一个' };
  }
  if (SEQUENTIAL.test(folded)) {
    return { ok: false, code: 'password_sequential', message: '密码不能是连续字符（如 123456 / abcdef / qwerty）' };
  }
  // 整串只有一种字符（重复 15 次以上）
  if (new Set(Array.from(password)).size === 1) {
    return { ok: false, code: 'password_repeated', message: '密码不能是同一个字符的重复' };
  }
  // 整串由 1–4 个字符的短单元重复拼成（如 abcabcabcabcabc / ababababababab）
  if (/^(.{1,4})\1+$/.test(password)) {
    return { ok: false, code: 'password_repeated', message: '密码不能是同一小段的重复拼接' };
  }
  return { ok: true };
}

/** 生成一个符合策略的随机密码建议（仅供 CLI 拒绝弱口令后提示，绝不写入文件）。 */
export function suggestPassword(length = 20) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  while (out.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte >= 256 - (256 % alphabet.length)) continue;
    out += alphabet[byte % alphabet.length];
  }
  return out;
}
