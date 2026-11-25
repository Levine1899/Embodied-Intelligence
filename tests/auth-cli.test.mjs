// 管理员 CLI：交互流程、TTY 拒绝、密码策略、authVersion、最后一个管理员保护。
// 密码输入用真实 readSecret + 可注入的伪 TTY，不接触真实终端。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { makeDataDir, removeDir, REPO_ROOT, SERVER_DIR } from './helpers/proc.mjs';

const dataDir = await makeDataDir();
process.env.AUTH_DATA_DIR = dataDir;
const store = await import('../server/auth-store.mjs');
const cli = await import('../server/auth-cli.mjs');
const secret = await import('../server/secret-input.mjs');

const ADMIN_PASSWORD = 'cli admin password 001';
const ADMIN2_PASSWORD = 'cli admin password 002';

after(async () => {
  await removeDir(dataDir);
});

/** 伪 TTY：记录 raw mode 变化，data 事件在监听器就绪后投递（模拟粘贴整行）。 */
class FakeTty extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.isRaw = false;
    this.paused = true;
    this.rawHistory = [];
    this.pending = [];
  }
  setRawMode(value) { this.isRaw = Boolean(value); this.rawHistory.push(this.isRaw); }
  resume() { this.paused = false; return this; }
  pause() { this.paused = true; return this; }
  setEncoding() { return this; }
  on(event, listener) {
    super.on(event, listener);
    if (event === 'data' && this.pending.length) {
      const chunk = this.pending.shift();
      setImmediate(() => listener(chunk));
    }
    return this;
  }
  feed(text) {
    if (this.listenerCount('data') > 0) setImmediate(() => this.emit('data', text));
    else this.pending.push(text);
  }
}

function fakeOutput() {
  return {
    isTTY: true,
    chunks: [],
    write(value) { this.chunks.push(String(value)); return true; },
    text() { return this.chunks.join(''); }
  };
}

/**
 * 跑一次 CLI 命令：ask 依次返回 answers；密码按 secrets 顺序投喂给真实 readSecret。
 */
async function runCli(argv, { answers = [], secrets = [], tty = true } = {}) {
  const input = new FakeTty();
  const output = fakeOutput();
  if (!tty) {
    input.isTTY = false;
    output.isTTY = false;
  }
  let answerIndex = 0;
  let secretIndex = 0;
  const record = { answers: [], secretsGiven: secrets };

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); };

  // 每次 readSecret 被调用时，延后一拍投递“输入 + 回车”
  const feedingSecret = (options) => {
    const value = secrets[secretIndex++];
    record.secretsGiven = secrets;
    setImmediate(() => { input.feed(value + '\r'); });
    return secret.readSecret({ ...options, input, output });
  };

  let code;
  let caught = null;
  try {
    code = await cli.main(argv, {
      stdin: input,
      stdout: output,
      ask: async question => {
        record.answers.push(question);
        return answers[answerIndex++] ?? '';
      },
      readSecret: feedingSecret,
      readSecretConfirmed: async options => {
        const first = await feedingSecret({ ...options, prompt: options.prompt });
        const second = await feedingSecret({ ...options, prompt: options.confirmPrompt });
        if (first !== second) throw new secret.SecretInputError('mismatch', '两次输入的密码不一致');
        return first;
      }
    });
  } catch (error) {
    caught = error;
    code = typeof error.exitCode === 'number' ? error.exitCode : 1;
  } finally {
    console.log = originalLog;
  }
  return { code, error: caught, input, output, logs, record };
}

function spawnCli(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(SERVER_DIR, 'auth-cli.mjs'), ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, AUTH_DATA_DIR: dataDir },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.end();
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('非 TTY：init-admin 拒绝，且不回退到明文输入', async () => {
  const fake = await runCli(['init-admin'], { tty: false, answers: ['admin'], secrets: ['x', 'x'] });
  assert.notEqual(fake.code, 0);
  assert.match(String(fake.error && fake.error.message), /终端|TTY/);

  const real = await spawnCli(['init-admin']);
  assert.notEqual(real.code, 0);
  assert.match(real.stderr + real.stdout, /终端|TTY/);
  const users = await store.listUsers();
  assert.equal(users.length, 0, '拒绝时不能创建任何账户');
});

test('init-admin：隐藏输入、不回显密码、初始化成功', async () => {
  const result = await runCli(['init-admin'], {
    answers: ['admin', '系统管理员'],
    secrets: [ADMIN_PASSWORD, ADMIN_PASSWORD]
  });
  assert.equal(result.code, 0);
  assert.equal(result.input.isRaw, false, '结束后必须退出 raw mode');
  assert.ok(result.input.rawHistory.includes(true), '输入过程中应进入 raw mode');
  assert.equal(result.output.text().includes(ADMIN_PASSWORD), false, '终端不得回显密码');

  const users = await store.listUsers();
  assert.equal(users.length, 1);
  assert.equal(users[0].username, 'admin');
  assert.equal(users[0].role, 'admin');
  assert.equal(users[0].authVersion, 1);
  assert.ok(result.logs.some(line => line.includes('已创建管理员')));
  assert.equal(result.logs.join('\n').includes(ADMIN_PASSWORD), false, '日志不得包含密码');
});

test('init-admin 重复执行被拒绝', async () => {
  const result = await runCli(['init-admin'], { answers: ['admin2', 'x'], secrets: ['x'.repeat(20), 'x'.repeat(20)] });
  assert.notEqual(result.code, 0);
  assert.match(String(result.error && result.error.message), /用户库非空/);
  assert.equal((await store.listUsers()).length, 1);
});

test('add-user：创建第二个管理员，用户名大小写重复被拒绝', async () => {
  const ok = await runCli(['add-user'], {
    answers: ['editor', '编辑', 'admin'],
    secrets: [ADMIN2_PASSWORD, ADMIN2_PASSWORD]
  });
  assert.equal(ok.code, 0);
  const users = await store.listUsers();
  assert.equal(users.length, 2);
  assert.ok(users.some(user => user.username === 'editor' && user.role === 'admin'));

  const duplicate = await runCli(['add-user'], {
    answers: ['EDITOR', '重复', 'user'],
    secrets: ['another long password 3', 'another long password 3']
  });
  assert.notEqual(duplicate.code, 0);
  assert.equal((await store.listUsers()).length, 2);
});

test('弱密码与两次输入不一致都被拒绝', async () => {
  const mismatch = await runCli(['add-user'], {
    answers: ['zhang3', '张三', 'user'],
    secrets: ['a long enough password', 'a different password x']
  });
  assert.notEqual(mismatch.code, 0);
  assert.match(String(mismatch.error && mismatch.error.message), /不一致/);

  const weak = await runCli(['add-user'], {
    answers: ['zhang3', '张三', 'user'],
    secrets: ['passwordpassword', 'passwordpassword']
  });
  assert.notEqual(weak.code, 0);
  assert.match(String(weak.error && weak.error.message), /密码不符合要求/);
  assert.equal((await store.listUsers()).length, 2);
});

test('reset-password：authVersion 递增并提示旧会话失效', async () => {
  const result = await runCli(['reset-password', 'editor'], {
    secrets: ['reset password for editor', 'reset password for editor']
  });
  assert.equal(result.code, 0);
  assert.ok(result.logs.some(line => line.includes('authVersion=2')));
  assert.equal(result.logs.join('\n').includes('reset password for editor'), false);
  const editor = (await store.listUsers()).find(user => user.username === 'editor');
  assert.equal(editor.authVersion, 2);
});

test('disable-user / enable-user：authVersion 递增，禁止禁用最后一个管理员', async () => {
  const disableEditor = await runCli(['disable-user', 'editor']);
  assert.equal(disableEditor.code, 0);
  let editor = (await store.listUsers()).find(user => user.username === 'editor');
  assert.equal(editor.status, 'disabled');
  assert.equal(editor.authVersion, 3);

  const enableEditor = await runCli(['enable-user', 'editor']);
  assert.equal(enableEditor.code, 0);
  editor = (await store.listUsers()).find(user => user.username === 'editor');
  assert.equal(editor.status, 'active');
  assert.equal(editor.authVersion, 4);

  // 先禁用 editor，再尝试禁用 admin（最后一个可用管理员）→ 拒绝
  assert.equal((await runCli(['disable-user', 'editor'])).code, 0);
  const lastAdmin = await runCli(['disable-user', 'admin']);
  assert.notEqual(lastAdmin.code, 0);
  assert.match(String(lastAdmin.error && lastAdmin.error.message), /最后一个/);
  const admin = (await store.listUsers()).find(user => user.username === 'admin');
  assert.equal(admin.status, 'active');
});

test('list-users 只输出公开字段，不含密码材料', async () => {
  const result = await spawnCli(['list-users']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /admin/);
  assert.match(result.stdout, /editor/);
  for (const forbidden of ['scrypt', 'salt', 'hash', '"password"', ADMIN_PASSWORD, ADMIN2_PASSWORD]) {
    assert.equal(result.stdout.includes(forbidden), false, 'list-users 不应输出：' + forbidden);
  }
});

test('拒绝通过命令行参数传密码', async () => {
  const result = await spawnCli(['add-user', '--password', 'secret-value']);
  assert.equal(result.code, 2);
  assert.match(result.stderr + result.stdout, /拒绝|密码/);
});

test('Ctrl+C 取消密码输入：退出码 130，终端恢复，不写入账户', async () => {
  const input = new FakeTty();
  const output = fakeOutput();
  const run = cli.main(['add-user'], {
    stdin: input,
    stdout: output,
    ask: async question => (question.includes('用户名') ? 'canceluser' : question.includes('角色') ? 'user' : '取消用户'),
    readSecret: options => {
      setImmediate(() => input.feed('\u0003'));
      return secret.readSecret({ ...options, input, output });
    },
    readSecretConfirmed: options => {
      setImmediate(() => input.feed('\u0003'));
      return secret.readSecret({ ...options, input, output });
    }
  });
  await assert.rejects(run, error => error.exitCode === 130);
  assert.equal(input.isRaw, false, '取消后必须恢复终端');
  assert.equal((await store.listUsers()).some(user => user.username === 'canceluser'), false);
});

test('密码输入支持退格与 Unicode，且不做 trim', async () => {
  const input = new FakeTty();
  const output = fakeOutput();
  const promise = secret.readSecret({ prompt: '密码: ', input, output });
  setImmediate(() => input.feed('ab\u007fcd 密码 😀\r'));
  const value = await promise;
  assert.equal(value, 'acd 密码 😀');
  assert.equal(output.text().includes('acd'), false, '输入过程中不回显');
  assert.equal(input.isRaw, false);
});

test('非 TTY 下 readSecret 直接拒绝（不接受管道）', async () => {
  const input = new FakeTty();
  input.isTTY = false;
  await assert.rejects(
    () => secret.readSecret({ prompt: 'x', input, output: fakeOutput() }),
    error => error.code === 'not_tty'
  );
});
