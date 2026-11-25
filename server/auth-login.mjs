// 凭据校验：把“恒定成本路径”集中在一处，方便单元测试断言。
// 关键约束：
// - 用户名不存在 → 用进程内随机 dummy 记录跑同参数 scrypt；
// - 账号被禁用 → 先做完整密码校验，再拒绝（不能按状态快速返回）；
// - 三种失败对外只有一种语义（由 HTTP 层统一输出）。

import { findUserByNormalized, readDocument } from './auth-store.mjs';
import { verifyDummyPassword, verifyPassword } from './auth-crypto.mjs';

export const loginStats = {
  attempts: 0,
  dummyPath: 0,
  realVerify: 0,
  disabledRejected: 0,
  storeErrors: 0
};

export function resetLoginStats() {
  loginStats.attempts = 0;
  loginStats.dummyPath = 0;
  loginStats.realVerify = 0;
  loginStats.disabledRejected = 0;
  loginStats.storeErrors = 0;
}

/**
 * @returns {Promise<{ok:boolean, reason?:'invalid'|'disabled'|'uninitialized', user?:object}>}
 * @throws AuthStoreError（文件损坏/不可读时由调用方转成 503）
 */
export async function authenticateCredentials(username, password) {
  loginStats.attempts += 1;
  const doc = await readDocument();
  if (doc.users.length === 0) {
    return { ok: false, reason: 'uninitialized' };
  }
  const user = findUserByNormalized(doc, username);
  if (!user) {
    // 不存在的用户名不能跳过哈希成本
    await verifyDummyPassword(password);
    loginStats.dummyPath += 1;
    return { ok: false, reason: 'invalid' };
  }
  loginStats.realVerify += 1;
  const passed = await verifyPassword(password, user.password);
  if (!passed) return { ok: false, reason: 'invalid' };
  if (user.status !== 'active') {
    loginStats.disabledRejected += 1;
    return { ok: false, reason: 'disabled' };
  }
  return { ok: true, user };
}
