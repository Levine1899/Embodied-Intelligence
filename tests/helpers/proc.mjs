// 测试辅助：临时数据目录、独立进程、端口、轮询等待。
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TESTS_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const REPO_ROOT = path.resolve(TESTS_DIR, '..');
export const SERVER_DIR = path.join(REPO_ROOT, 'server');

export async function makeDataDir(prefix = 'kepu-auth-test-') {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function removeDir(dir) {
  await fsp.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitFor(condition, { timeoutMs = 15000, intervalMs = 50, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await condition();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(intervalMs);
  }
  throw new Error('等待超时：' + label + (lastError ? '（最后错误：' + lastError.message + '）' : ''));
}

/**
 * 启动一个 Node 子进程，等它打印 ready 正则或端口可连接。
 * @returns {Promise<{child:import('node:child_process').ChildProcess, port:number, output:()=>string, stderr:()=>string, stop:()=>Promise<void>}>}
 */
export async function startProcess({ script, env = {}, ready = null, port = null, timeoutMs = 30000 }) {
  const child = spawn(process.execPath, [script], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });

  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));

  if (ready || port) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('子进程启动超时：' + script + '\nstdout:\n' + stdout + '\nstderr:\n' + stderr));
      }, timeoutMs);
      let settled = false;
      const done = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve();
      };
      child.stdout.on('data', () => { if (!settled && ready && ready.test(stdout)) done(); });
      child.stderr.on('data', () => { if (!settled && ready && ready.test(stdout)) done(); });
      exited.then(code => {
        if (!settled) done(new Error('子进程提前退出（code=' + code + '）\nstdout:\n' + stdout + '\nstderr:\n' + stderr));
      });
      if (port) {
        waitFor(() => probePort(port), { timeoutMs, label: '端口 ' + port + ' 可连接' })
          .then(() => done())
          .catch(done);
      }
    });
  }

  const stop = async () => {
    if (child.exitCode !== null) return;
    child.kill();
    const code = await Promise.race([exited, wait(4000).then(() => 'timeout')]);
    if (code === 'timeout') {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      await exited;
    }
  };

  return {
    child,
    port,
    output: () => stdout,
    stderr: () => stderr,
    stop,
    exited
  };
}

export function probePort(port, host = '127.0.0.1', timeoutMs = 1000) {
  return new Promise(resolve => {
    const socket = net.connect({ port, host });
    const done = value => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** Windows 上 kill 不走优雅退出，运行锁目录可能残留；模拟管理员的“清理陈旧锁”步骤。 */
export async function clearStaleInstanceLock(dataDir) {
  for (const name of ['instance.lock.lock', 'users.json.lock']) {
    await fsp.rm(path.join(dataDir, name), { recursive: true, force: true }).catch(() => {});
  }
}

/** 读取 users.json 原始文本（测试断言“没有明文密码”时用）。 */
export async function readUsersRaw(dataDir) {
  return fsp.readFile(path.join(dataDir, 'users.json'), 'utf8');
}

/** 在独立子进程里执行一次 store 操作（跨进程锁测试用）。命令从 stdin 传入。 */
export async function runStoreDriver(dataDir, command, { env = {}, timeoutMs = 30000 } = {}) {
  const script = path.join(TESTS_DIR, 'helpers', 'store-driver.mjs');
  const child = spawn(process.execPath, [script], {
    cwd: REPO_ROOT,
    env: { ...process.env, AUTH_DATA_DIR: dataDir, ...env },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.end(JSON.stringify(command));
  const timer = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, timeoutMs);
  const code = await new Promise(resolve => child.once('close', resolve));
  clearTimeout(timer);
  let parsed = null;
  try { parsed = JSON.parse(stdout.trim().split('\n').pop()); } catch { /* 保留原始输出 */ }
  return { code, stdout, stderr, result: parsed };
}
