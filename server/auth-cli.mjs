#!/usr/bin/env node
// 管理员 CLI：账户只由服务器命令行管理，不提供网页注册。
// 密码只从 TTY 隐藏输入读取：不接受 --password、环境变量、命令行参数或非 TTY 管道。

import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline/promises';

import { DATA_DIR, USERS_FILE, AUDIT_FILE } from './auth-config.mjs';
import { checkNewPassword, PASSWORD_MIN_CHARS } from './auth-crypto.mjs';
import {
  USERNAME_RE, createUser, initAdmin, resetPassword, setUserStatus, listUsers, readDocument,
  findUserByNormalized, AuthStoreError, StoreRuleError
} from './auth-store.mjs';
import { readSecret, readSecretConfirmed, SecretInputError } from './secret-input.mjs';

export const EXIT = { OK: 0, ERROR: 1, USAGE: 2, CANCELLED: 130 };

const USAGE = `石油科普智能体 · 用户管理（仅服务器命令行）

用法：
  node server/auth-cli.mjs init-admin              首次初始化管理员（用户库必须为空）
  node server/auth-cli.mjs add-user                新增用户（交互输入用户名、显示名、角色、密码）
  node server/auth-cli.mjs reset-password <用户名>  重置密码（同时使该用户所有旧会话失效）
  node server/auth-cli.mjs disable-user <用户名>    禁用用户（不能禁用最后一个可用管理员）
  node server/auth-cli.mjs enable-user <用户名>     启用用户（旧会话不会复活）
  node server/auth-cli.mjs list-users              列出用户（不显示任何密码材料）

规则：
- 密码只能在本终端交互输入，绝不出现在命令行参数、环境变量、日志或进程列表里。
- 新建/重置密码至少 ${PASSWORD_MIN_CHARS} 个字符，允许空格与 Unicode，不 trim、不截断。
- 用户文件：${USERS_FILE}
- 审计记录：${AUDIT_FILE}

可用环境变量：
  AUTH_DATA_DIR   用户数据目录（默认 server/data；相对路径相对 server/ 解析）
`;

class CliError extends Error {
  constructor(message, exitCode = EXIT.ERROR) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

function makeAsk(stdin, stdout) {
  return async function ask(question) {
    const rl = readline.createInterface({
      input: stdin,
      output: stdout,
      terminal: Boolean(stdin.isTTY && stdout.isTTY)
    });
    try {
      return (await rl.question(question)).trim();
    } finally {
      rl.close();
    }
  };
}

function requireInteractive(ctx, action) {
  if (!(ctx.stdin.isTTY && ctx.stdout.isTTY)) {
    throw new CliError(
      `${action} 需要在交互式终端里运行：密码必须隐藏输入，不接受管道/环境变量/命令行参数。`,
      EXIT.ERROR
    );
  }
}

function assertUsernameFormat(username) {
  if (!USERNAME_RE.test(username)) {
    throw new CliError('用户名必须是 3–32 位 ASCII 字母、数字、点、下划线或短横线');
  }
  return username;
}

function assertPasswordPolicy(password, username) {
  const result = checkNewPassword(password, { username });
  if (!result.ok) throw new CliError('密码不符合要求：' + result.message);
  return password;
}

async function readNewPassword(ctx, username) {
  let password;
  try {
    password = await ctx.readSecretConfirmed({
      prompt: '密码（输入不可见）: ',
      confirmPrompt: '再次输入密码: ',
      input: ctx.stdin,
      output: ctx.stdout
    });
  } catch (error) {
    if (error instanceof SecretInputError) {
      if (error.code === 'cancelled') throw new CliError('已取消', EXIT.CANCELLED);
      throw new CliError(error.message);
    }
    throw error;
  }
  return assertPasswordPolicy(password, username);
}

function printUserTable(users) {
  if (!users.length) {
    console.log('（用户库为空：请先运行 init-admin）');
    return;
  }
  const rows = users.map(u => ({
    ID: u.id,
    '用户名': u.username,
    '显示名': u.displayName,
    '角色': u.role,
    '状态': u.status,
    '创建时间': u.createdAt,
    '最后登录': u.lastLoginAt || '-'
  }));
  const headers = Object.keys(rows[0]);
  const widths = headers.map(h => Math.max(h.length, ...rows.map(row => String(row[h]).length)));
  const line = values => values.map((v, i) => String(v).padEnd(widths[i])).join('  ').trimEnd();
  console.log(line(headers));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(line(headers.map(h => row[h])));
  console.log('');
  console.log(`共 ${users.length} 个用户；密码材料与 Token 一律不显示。`);
}

async function commandInitAdmin(ctx) {
  requireInteractive(ctx, 'init-admin');
  let doc;
  try {
    doc = await readDocument();
  } catch (error) {
    throw new CliError('无法读取用户库（拒绝覆盖）：' + error.message);
  }
  if (doc.users.length > 0) {
    throw new CliError('用户库非空，init-admin 拒绝执行。新增用户请用 add-user。');
  }
  console.log('初始化第一个管理员。此命令只能执行一次，且只在用户库为空时可用。');
  const username = assertUsernameFormat(await ctx.ask('管理员用户名: '));
  const displayName = (await ctx.ask('显示名（默认 系统管理员）: ')) || '系统管理员';
  const password = await readNewPassword(ctx, username);
  const user = await initAdmin({ username, displayName, password });
  console.log(`\n已创建管理员 ${user.username}（${user.displayName}），id=${user.id}`);
  console.log('现在可以用该账号登录 ' + '/login.html');
}

async function commandAddUser(ctx) {
  requireInteractive(ctx, 'add-user');
  const username = assertUsernameFormat(await ctx.ask('新用户名（3–32 位字母/数字/._-）: '));
  const displayName = (await ctx.ask('显示名: ')) || username;
  let role = (await ctx.ask('角色 [user/admin]（默认 user）: ')).toLowerCase() || 'user';
  if (role !== 'user' && role !== 'admin') throw new CliError('角色只能是 user 或 admin');
  const password = await readNewPassword(ctx, username);
  const user = await createUser({ username, displayName, role, password });
  console.log(`\n已创建用户 ${user.username}（${user.displayName} · ${user.role}），id=${user.id}`);
}

async function commandResetPassword(ctx, username) {
  if (!username) throw new CliError('用法：node server/auth-cli.mjs reset-password <用户名>', EXIT.USAGE);
  assertUsernameFormat(username);
  requireInteractive(ctx, 'reset-password');
  const doc = await readDocument();
  const user = findUserByNormalized(doc, username);
  if (!user) throw new CliError('用户不存在：' + username);
  const password = await readNewPassword(ctx, username);
  const updated = await resetPassword(username, password);
  console.log(`\n已重置 ${updated.username} 的密码，authVersion=${updated.authVersion}。`);
  console.log('该用户所有已登录会话会在下一次请求时失效，需要用新密码重新登录。');
}

async function commandSetStatus(username, status) {
  if (!username) throw new CliError('用法：node server/auth-cli.mjs ' + (status === 'disabled' ? 'disable-user' : 'enable-user') + ' <用户名>', EXIT.USAGE);
  assertUsernameFormat(username);
  const user = await setUserStatus(username, status);
  console.log(`已${status === 'disabled' ? '禁用' : '启用'} ${user.username}，当前状态 ${user.status}，authVersion=${user.authVersion}。`);
  if (status === 'disabled') console.log('该用户已登录的会话会在下一次请求时失效；已在进行中的长连接不会即时中断。');
  else console.log('旧会话不会因为重新启用而恢复，需要重新登录。');
}

async function commandListUsers() {
  const users = await listUsers();
  printUserTable(users);
}

/** 可注入的入口，便于自动化测试（不接触真实终端）。 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const ctx = {
    stdin: deps.stdin || process.stdin,
    stdout: deps.stdout || process.stdout,
    ask: deps.ask || null,
    readSecret: deps.readSecret || readSecret,
    readSecretConfirmed: deps.readSecretConfirmed || readSecretConfirmed
  };
  if (!ctx.ask) ctx.ask = makeAsk(ctx.stdin, ctx.stdout);

  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    ctx.stdout.write(USAGE);
    return command ? EXIT.OK : EXIT.USAGE;
  }
  for (const arg of rest) {
    if (/^--?(password|pass|p)$/i.test(arg) || /^--password=/i.test(arg)) {
      throw new CliError('拒绝通过命令行参数传递密码：请在终端交互输入。', EXIT.USAGE);
    }
  }

  console.log(`[auth-cli] 用户数据目录: ${DATA_DIR}`);
  switch (command) {
    case 'init-admin':
      await commandInitAdmin(ctx);
      return EXIT.OK;
    case 'add-user':
      await commandAddUser(ctx);
      return EXIT.OK;
    case 'reset-password':
      await commandResetPassword(ctx, rest[0]);
      return EXIT.OK;
    case 'disable-user':
      await commandSetStatus(rest[0], 'disabled');
      return EXIT.OK;
    case 'enable-user':
      await commandSetStatus(rest[0], 'active');
      return EXIT.OK;
    case 'list-users':
      await commandListUsers();
      return EXIT.OK;
    default:
      throw new CliError('未知命令：' + command + '\n\n' + USAGE, EXIT.USAGE);
  }
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  const entry = pathToFileURL(path.resolve(process.argv[1])).href;
  const self = import.meta.url;
  if (entry === self) return true;
  return process.platform === 'win32' && entry.toLowerCase() === self.toLowerCase();
}

if (isEntryPoint()) {
  main()
    .then(code => process.exit(code))
    .catch(error => {
      if (error instanceof CliError) {
        console.error('[auth-cli] ' + error.message);
        process.exit(error.exitCode);
      }
      if (error instanceof StoreRuleError || error instanceof AuthStoreError) {
        console.error('[auth-cli] ' + error.message);
        process.exit(EXIT.ERROR);
      }
      if (error instanceof SecretInputError) {
        console.error('[auth-cli] ' + error.message);
        process.exit(EXIT.ERROR);
      }
      console.error('[auth-cli] 未预期的错误：' + (error && error.message ? error.message : error));
      process.exit(EXIT.ERROR);
    });
}
