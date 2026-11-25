// 用户存储：Schema 校验、原子写、损坏 fail-closed、跨进程锁、authVersion。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { promises as fsp } from 'node:fs';

import {
  makeDataDir, removeDir, readUsersRaw, runStoreDriver, REPO_ROOT
} from './helpers/proc.mjs';

const dataDir = await makeDataDir();
process.env.AUTH_DATA_DIR = dataDir;
const store = await import('../server/auth-store.mjs');
const config = await import('../server/auth-config.mjs');

const USERS_FILE = path.join(dataDir, 'users.json');
const ADMIN_PASSWORD = 'correct horse battery staple';
const ADMIN = { username: 'admin', displayName: '系统管理员', password: ADMIN_PASSWORD };

after(async () => {
  await store.releaseInstanceLock();
  await removeDir(dataDir);
});

async function restore(raw) {
  await fsp.writeFile(USERS_FILE, raw, 'utf8');
}

async function readJson() {
  return JSON.parse(await readUsersRaw(dataDir));
}

test('首次读取只原子创建空结构，不创建默认用户', async () => {
  const doc = await store.readDocument();
  assert.equal(doc.schemaVersion, 1);
  assert.deepEqual(doc.users, []);
  const raw = await readUsersRaw(dataDir);
  assert.match(raw, /"schemaVersion": 1/);
  assert.match(raw, /"users": \[\]/);
  assert.equal(config.isInsideWebDir(dataDir), false, '运行时数据目录必须在 web/ 之外');
  assert.equal(config.DATA_DIR, dataDir);
});

test('init-admin 创建第一个管理员；重复执行与大小写重复用户名都被拒绝', async () => {
  const admin = await store.initAdmin(ADMIN);
  assert.equal(admin.role, 'admin');
  assert.equal(admin.status, 'active');
  assert.equal(admin.username, 'admin');

  await assert.rejects(() => store.initAdmin({ ...ADMIN, username: 'admin2' }),
    error => error.code === 'users_exist');

  await assert.rejects(() => store.createUser({
    username: 'ADMIN', displayName: '另一个管理员', role: 'admin', password: 'another long password here'
  }), error => error.code === 'username_taken');
});

test('users.json 不保存明文密码，只保存 scrypt 记录', async () => {
  const raw = await readUsersRaw(dataDir);
  assert.equal(raw.includes(ADMIN_PASSWORD), false, '文件中不得出现明文密码');
  assert.match(raw, /"algorithm": "scrypt"/);
  assert.match(raw, /"salt": "/);
  assert.match(raw, /"N": 131072/);
  assert.match(raw, /"r": 8/);
  assert.match(raw, /"p": 1/);
  assert.match(raw, /"authVersion": 1/);

  const users = await store.listUsers();
  assert.equal(users.length, 1);
  assert.equal(Object.hasOwn(users[0], 'password'), false);
  assert.equal(Object.hasOwn(users[0], 'usernameNormalized'), false);
});

test('非法用户名 / 显示名 / 角色被拒绝', async () => {
  await assert.rejects(() => store.createUser({ username: 'ab', displayName: 'x', password: 'a very long password' }),
    error => error.code === 'invalid_username');
  await assert.rejects(() => store.createUser({ username: 'bad name', displayName: 'x', password: 'a very long password' }),
    error => error.code === 'invalid_username');
  await assert.rejects(() => store.createUser({ username: 'okname', displayName: '   ', password: 'a very long password' }),
    error => error.code === 'invalid_display_name');
  await assert.rejects(() => store.createUser({ username: 'okname2', displayName: 'ok', role: 'owner', password: 'a very long password' }),
    error => error.code === 'invalid_role');
});

test('JSON 损坏时 fail closed，且不覆盖原文件', async () => {
  const backup = await readUsersRaw(dataDir);
  const broken = backup.slice(0, Math.floor(backup.length / 2));
  await restore(broken);
  await assert.rejects(() => store.readDocument(), error => error.code === 'auth_store_corrupt');
  assert.equal(await readUsersRaw(dataDir), broken, '损坏文件必须保持原样，等待人工修复');
  await restore(backup);
  const doc = await store.readDocument();
  assert.equal(doc.users.length, 1);
});

test('不支持的 scrypt 参数 / schemaVersion / 重复用户名一律拒绝', async () => {
  const backup = await readUsersRaw(dataDir);

  const weak = JSON.parse(backup);
  weak.users[0].password.params.N = 16384;
  await restore(JSON.stringify(weak, null, 2));
  await assert.rejects(() => store.readDocument(), error => error.code === 'auth_store_corrupt');

  const future = JSON.parse(backup);
  future.schemaVersion = 99;
  await restore(JSON.stringify(future, null, 2));
  await assert.rejects(() => store.readDocument(), error => error.code === 'auth_store_unsupported');

  const duplicate = JSON.parse(backup);
  const clone = structuredClone(duplicate.users[0]);
  clone.id = '11111111-1111-4111-8111-111111111111';
  duplicate.users.push(clone);
  await restore(JSON.stringify(duplicate, null, 2));
  await assert.rejects(() => store.readDocument(), error => error.code === 'auth_store_corrupt');

  const unknownField = JSON.parse(backup);
  unknownField.users[0].isSuperAdmin = true;
  await restore(JSON.stringify(unknownField, null, 2));
  await assert.rejects(() => store.readDocument(), error => error.code === 'auth_store_corrupt');

  await restore(backup);
  assert.equal((await store.readDocument()).users.length, 1);
});

test('原子写失败时旧文件保持完整，且不残留临时文件', async () => {
  const before = await readUsersRaw(dataDir);
  await assert.rejects(() => store.writeJsonAtomic(USERS_FILE, { schemaVersion: 1, users: [] }, {
    __testFailBeforeRename: async () => { throw new Error('模拟 rename 前失败'); }
  }));
  assert.equal(await readUsersRaw(dataDir), before);
  const leftovers = (await fsp.readdir(dataDir)).filter(name => name.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('mutator 抛错时不会写入任何内容', async () => {
  const before = await readUsersRaw(dataDir);
  await assert.rejects(() => store.mutateDocument(() => { throw new Error('业务规则失败'); }));
  assert.equal(await readUsersRaw(dataDir), before);
});

test('禁止禁用最后一个可用管理员', async () => {
  const before = await readJson();
  assert.equal(store.countActiveAdmins(before), 1);
  await assert.rejects(() => store.setUserStatus('admin', 'disabled'), error => error.code === 'last_admin');
  const afterDoc = await readJson();
  assert.equal(afterDoc.users[0].status, 'active');
  assert.equal(afterDoc.users[0].authVersion, 1);
});

test('重置密码 / 禁用 / 启用都递增 authVersion', async () => {
  await store.createUser({ username: 'editor', displayName: '编辑管理员', role: 'admin', password: 'second admin password ok' });
  const created = await store.createUser({ username: 'zhang3', displayName: '张三', role: 'user', password: 'ordinary long password 42' });
  assert.equal(created.status, 'active');

  const reset = await store.resetPassword('zhang3', 'brand new long password 7');
  assert.equal(reset.authVersion, 2);
  const disabled = await store.setUserStatus('zhang3', 'disabled');
  assert.equal(disabled.authVersion, 3);
  assert.equal(disabled.status, 'disabled');
  const enabled = await store.setUserStatus('zhang3', 'active');
  assert.equal(enabled.authVersion, 4);
  assert.equal(enabled.status, 'active');

  // 最后一个管理员保护：现在有两个 active admin，可以禁用其中一个
  const editorDisabled = await store.setUserStatus('editor', 'disabled');
  assert.equal(editorDisabled.status, 'disabled');
  await assert.rejects(() => store.setUserStatus('admin', 'disabled'), error => error.code === 'last_admin');
});

test('两个独立进程并发创建用户，结果完整且无丢失更新', async () => {
  const before = await store.listUsers();
  const [a, b] = await Promise.all([
    runStoreDriver(dataDir, { op: 'createUser', args: { username: 'worker_a', displayName: '并发 A', password: 'concurrent password A' } }),
    runStoreDriver(dataDir, { op: 'createUser', args: { username: 'worker_b', displayName: '并发 B', password: 'concurrent password B' } })
  ]);
  assert.equal(a.result && a.result.ok, true, '进程 A 应该成功：' + a.stdout + a.stderr);
  assert.equal(b.result && b.result.ok, true, '进程 B 应该成功：' + b.stdout + b.stderr);

  const users = await store.listUsers();
  assert.equal(users.length, before.length + 2);
  const names = users.map(user => user.username).sort();
  assert.ok(names.includes('worker_a') && names.includes('worker_b'));

  const doc = JSON.parse(await readUsersRaw(dataDir));
  assert.equal(doc.users.length, users.length, '最终 JSON 必须是完整可解析的');
});

test('同一个 AUTH_DATA_DIR 不允许两个认证服务实例同时持有运行锁', async () => {
  const release = await store.acquireInstanceLock();
  try {
    const second = await runStoreDriver(dataDir, { op: 'acquireInstance', holdMs: 100 });
    assert.equal(second.result.ok, false, '第二个实例必须被拒绝');
    assert.equal(second.result.code, 'auth_store_instance_locked');
  } finally {
    await release();
    await store.releaseInstanceLock();
  }
  // 释放之后可以再次获取
  const release2 = await store.acquireInstanceLock();
  await release2();
  await store.releaseInstanceLock();
});

test('审计日志记录管理操作，且不含密码材料', async () => {
  const log = await fsp.readFile(path.join(dataDir, 'auth-audit.log'), 'utf8');
  const entries = log.trim().split('\n').map(line => JSON.parse(line));
  const operations = entries.map(entry => entry.operation);
  assert.ok(operations.includes('init-admin'));
  assert.ok(operations.includes('create-user'));
  assert.ok(operations.includes('reset-password'));
  assert.ok(operations.includes('disable-user'));
  assert.equal(log.includes(ADMIN_PASSWORD), false);
  assert.equal(log.includes('"salt"'), false);
  assert.equal(log.includes('"hash"'), false);
  for (const entry of entries) {
    assert.equal(typeof entry.actor, 'string');
    assert.equal(typeof entry.ts, 'string');
  }
});

test('.gitignore 忽略运行时数据目录与锁文件', async () => {
  const ignore = await fsp.readFile(path.join(REPO_ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /server\/data\//);
  assert.match(ignore, /\.lock/);
});

test('凭据校验的失败路径都走同成本 scrypt（不存在 / 密码错误 / 禁用）', async () => {
  const login = await import('../server/auth-login.mjs');
  login.resetLoginStats();

  const unknown = await login.authenticateCredentials('no_such_account', 'whatever password 1');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'invalid');
  assert.equal(login.loginStats.dummyPath, 1, '用户名不存在必须走 dummy 校验');
  assert.equal(login.loginStats.realVerify, 0);

  const wrongPassword = await login.authenticateCredentials('admin', 'wrong password for admin');
  assert.equal(wrongPassword.ok, false);
  assert.equal(wrongPassword.reason, 'invalid');
  assert.equal(login.loginStats.realVerify, 1, '密码错误走真实记录校验');

  const disabled = await login.authenticateCredentials('editor', 'second admin password ok');
  assert.equal(disabled.ok, false, '禁用的管理员即使密码正确也必须被拒绝');
  assert.equal(disabled.reason, 'disabled');
  assert.equal(login.loginStats.disabledRejected, 1);
  assert.equal(login.loginStats.realVerify, 2, '禁用账户同样先做完整密码校验，不按状态快速返回');

  assert.equal(login.loginStats.attempts, 3);
});

test('POSIX 下用户文件与目录权限收紧到 0600 / 0700', async t => {
  if (process.platform === 'win32') {
    t.diagnostic('Windows 使用 NTFS ACL，跳过 POSIX mode 断言');
    return;
  }
  const fileMode = (await fsp.stat(USERS_FILE)).mode & 0o777;
  const dirMode = (await fsp.stat(dataDir)).mode & 0o777;
  assert.equal(fileMode, 0o600);
  assert.equal(dirMode, 0o700);
});
