/**
 * tools/e2e/harness.mjs — 浏览器冒烟 / 关卡 E2E 的公共底座。
 *
 * 设计约束（与仓库现状一致）：
 *  - 只用 playwright-core + 系统 Chrome，不下载 Playwright 自带浏览器。
 *  - 只用「只读调试入口」（window.__l2 / __l3 / __l4 / __stage / PETRO_DEVICE_STATE）
 *    和真实 DOM 读取状态，不靠截图 hash 判断。
 *  - 账号通过 tests/helpers/store-driver.mjs 建（测试套件自己的正规库路径），
 *    跑完必须删掉 server/data 下这次运行产生的文件。
 *
 * 已知坑（务必保留 enterLevel 里的 waitNotLevel 前置等待）：
 *  exit() 是带动画的，stage.back() 在 fly 回调里才执行；在 exit 动画结束前调 enter()
 *  会被 `if (stage.isLevel()) return;` 挡掉，页面看起来「关卡空了」。
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pw from 'playwright-core';

const { chromium } = pw;

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

export const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(E2E_DIR, '..', '..');
export const SERVER_DIR = path.join(REPO_ROOT, 'server');

/** 与 server/auth-config.mjs 的默认值一致：AUTH_DATA_DIR 缺省为 server/data。 */
export const DATA_DIR = process.env.AUTH_DATA_DIR
  ? path.resolve(REPO_ROOT, process.env.AUTH_DATA_DIR)
  : path.join(SERVER_DIR, 'data');

export const DEV_PORT = Number(process.env.DEV_PORT || 5173);
export const BASE_URL = process.env.PETRO_BASE_URL || `http://127.0.0.1:${DEV_PORT}`;

const DEFAULT_CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

/** 交付要求里的默认账号；可用 PETRO_E2E_USER / PETRO_E2E_PASSWORD 覆盖。 */
export const DEFAULT_USERNAME = process.env.PETRO_E2E_USER || 'e2e_p5';
export const DEFAULT_DISPLAY_NAME = process.env.PETRO_E2E_DISPLAY_NAME || 'E2E P5';

/* headless 下用 ANGLE + SwiftShader 软件光栅：只为功能冒烟，不代表 GPU 性能。 */
const CHROME_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-sync',
  '--no-service-autorun',
  '--mute-audio',
  '--hide-scrollbars',
  '--enable-unsafe-swiftshader', // Chrome 137+ 软件 WebGL 回退需要显式放行
  '--use-gl=angle',
  '--use-angle=swiftshader',
  /* 关卡的退场动画靠 requestAnimationFrame 推进；headless 下窗口被判定为
   * 后台/遮挡时 rAF 会被降频甚至停顿，导致 exit() 永远走不完（实测三关都
   * 卡在 "stage.isLevel() === false" 超时）。这三个开关是 headless E2E 的标准做法。 */
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

export function wait(ms) {
  return delay(ms);
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
    await delay(intervalMs);
  }
  throw new Error(`等待超时：${label}` + (lastError ? `（最后错误：${lastError.message}）` : ''));
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

async function httpStatus(url, timeoutMs = 3000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
    await response.arrayBuffer().catch(() => {});
    return response.status;
  } catch {
    return 0;
  }
}

/** Windows 上 child.kill() 只杀一个进程；dev.mjs 还有 proxy.mjs 子进程，必须杀进程树。 */
async function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise(resolve => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.once('exit', resolve);
      killer.once('error', resolve);
    });
  } else {
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
  }
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(5000),
  ]);
}

export function resolveChromePath() {
  const override = process.env.PETRO_CHROME;
  if (override) {
    if (!existsSync(override)) throw new Error(`PETRO_CHROME 指向的 Chrome 不存在：${override}`);
    return override;
  }
  const hit = DEFAULT_CHROME_CANDIDATES.find(p => existsSync(p));
  if (!hit) {
    throw new Error('找不到系统 Chrome；请设置 PETRO_CHROME=/path/to/chrome');
  }
  return hit;
}

/* ------------------------------------------------------------------ *
 * 1. 浏览器
 * ------------------------------------------------------------------ */

/**
 * 用系统 Chrome 起一个 headless 浏览器。
 * @returns {Promise<{browser: import('playwright-core').Browser, version: string,
 *                    executablePath: string, args: string[]}>}
 */
export async function launchChrome({ headless = process.env.PETRO_HEADFUL === '1' ? false : true } = {}) {
  const executablePath = resolveChromePath();
  const browser = await chromium.launch({
    executablePath,
    headless,
    args: CHROME_ARGS,
    timeout: 60000,
  });
  const version = browser.version();
  return { browser, version, executablePath, args: CHROME_ARGS.slice() };
}

/**
 * 建 context + page。viewport 固定，保证不同机器的布局一致；DPR 由真实浏览器给出。
 */
export async function openPage(browser, { width = 1440, height = 900, deviceScaleFactor = 1 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(45000);
  return { context, page };
}

/* ------------------------------------------------------------------ *
 * 2. dev server
 * ------------------------------------------------------------------ */

/**
 * 若 127.0.0.1:5173 已经可用则复用，否则自己 spawn `node server/dev.mjs`。
 * stop() 只杀自己启动的进程（且杀整棵进程树，避免 proxy.mjs 残留）。
 * @returns {Promise<{started:boolean, port:number, stop:() => Promise<void>,
 *                    output:() => string, stderr: () => string}>}
 */
export async function ensureServer({ port = DEV_PORT, timeoutMs = 60000 } = {}) {
  const statusUrl = `${BASE_URL}/api/auth/status`;
  if (await probePort(port)) {
    // 端口有人监听：确认是本项目的 dev server（/api 能回状态），再直接复用。
    const status = await httpStatus(statusUrl);
    if (!status) {
      throw new Error(`127.0.0.1:${port} 已被占用，但 /api/auth/status 不可用（status=${status}）；请先释放端口`);
    }
    return {
      started: false,
      port,
      reused: true,
      stop: async () => { /* 只复用，不接管进程 */ },
      output: () => '',
      stderr: () => '',
    };
  }

  const child = spawn(process.execPath, [path.join(SERVER_DIR, 'dev.mjs')], {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });

  try {
    await waitFor(async () => (await probePort(port)) && (await httpStatus(statusUrl)) === 200, {
      timeoutMs,
      intervalMs: 150,
      label: `dev server ${BASE_URL} 就绪（/api/auth/status 200）`,
    });
  } catch (error) {
    await killTree(child);
    throw new Error(`${error.message}\n--- dev stdout ---\n${stdout}\n--- dev stderr ---\n${stderr}`);
  }

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await killTree(child);
  };
  return { started: true, port, reused: false, stop, output: () => stdout, stderr: () => stderr };
}

/* ------------------------------------------------------------------ *
 * 3. 测试账号（正规 store 路径，不是绕过鉴权）
 * ------------------------------------------------------------------ */

function runStoreDriver(command, { dataDir = DATA_DIR, timeoutMs = 60000 } = {}) {
  const script = path.join(REPO_ROOT, 'tests', 'helpers', 'store-driver.mjs');
  if (!existsSync(script)) throw new Error('缺少 tests/helpers/store-driver.mjs（测试套件自带的 store 驱动）');
  const child = spawn(process.execPath, [script], {
    cwd: REPO_ROOT,
    env: { ...process.env, AUTH_DATA_DIR: dataDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.end(JSON.stringify(command));
  return new Promise(resolve => {
    const timer = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, timeoutMs);
    child.once('close', code => {
      clearTimeout(timer);
      let parsed = null;
      try { parsed = JSON.parse(stdout.trim().split('\n').pop()); } catch { /* 保留原始输出 */ }
      resolve({ code, stdout, stderr, result: parsed });
    });
  });
}

/**
 * 清掉「上一轮崩溃留下的、已经超过 60s 没刷新的」锁目录。
 * 与 tests/helpers/proc.mjs 的 clearStaleInstanceLock 同一做法（Windows 上 kill 不走优雅退出）。
 * 只动 lock 目录，不动用户数据。
 */
export async function clearStaleLocks({ dataDir = DATA_DIR } = {}) {
  const removed = [];
  if (!existsSync(dataDir)) return removed;
  for (const name of ['instance.lock.lock', 'users.json.lock']) {
    const target = path.join(dataDir, name);
    try {
      const age = Date.now() - statSync(target).mtimeMs;
      if (age > 60000) {
        await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        removed.push(target);
      }
    } catch { /* 不存在 / 已释放：忽略 */ }
  }
  return removed;
}

function randomPassword() {
  return 'E2e-' + crypto.randomBytes(12).toString('base64url');
}

/**
 * 确保测试账号存在且密码已知（幂等：已存在则重置密码）。
 * 必须带 displayName，否则 store 报 invalid_display_name。
 * @returns {Promise<{username:string, password:string, created:boolean, dataDir:string}>}
 */
export async function ensureUser({
  username = DEFAULT_USERNAME,
  displayName = DEFAULT_DISPLAY_NAME,
  dataDir = DATA_DIR,
} = {}) {
  await clearStaleLocks({ dataDir });
  const password = process.env.PETRO_E2E_PASSWORD || randomPassword();

  const created = await runStoreDriver({
    op: 'createUser',
    args: { username, displayName, password, role: 'user' },
  }, { dataDir });

  if (created.result && created.result.ok) {
    return { username, password, created: true, dataDir, userId: created.result.result && created.result.result.id };
  }
  if (created.result && created.result.code === 'username_taken') {
    const reset = await runStoreDriver({
      op: 'resetPassword',
      args: { username, password },
    }, { dataDir });
    if (!reset.result || !reset.result.ok) {
      throw new Error('createUser 说用户名已存在，但 resetPassword 失败：'
        + JSON.stringify(reset.result || reset.stderr || reset.stdout));
    }
    return { username, password, created: false, dataDir, rotatedPassword: true };
  }
  throw new Error('createUser 失败：' + JSON.stringify({
    result: created.result,
    code: created.code,
    stderr: created.stderr.trim(),
    stdout: created.stdout.trim(),
  }));
}

const CLEANUP_TARGETS = [
  'users.json',
  'auth-audit.log',
  'instance.lock',
  'instance.lock.lock', // proper-lockfile 的锁目录（Windows 上可能残留）
  'users.json.lock',
];

/**
 * 删除本次运行产生的账号数据。只删上面这几个明确目标，不递归清理别人的东西。
 * @returns {Promise<{removed:string[], leftover:string[], dataDir:string, dataDirRemoved:boolean}>}
 */
export async function cleanupUser({ dataDir = DATA_DIR } = {}) {
  const removed = [];
  for (const name of CLEANUP_TARGETS) {
    const target = path.join(dataDir, name);
    if (existsSync(target)) {
      await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      removed.push(target);
    }
  }
  let leftover = [];
  let dataDirRemoved = false;
  if (existsSync(dataDir)) {
    try { leftover = readdirSync(dataDir); } catch { leftover = []; }
    if (leftover.length === 0) {
      await rm(dataDir, { recursive: true, force: true }).catch(() => {});
      dataDirRemoved = !existsSync(dataDir);
    }
  }
  return { removed, leftover, dataDir, dataDirRemoved };
}

/* ------------------------------------------------------------------ *
 * 4. 登录（走真实 UI）
 * ------------------------------------------------------------------ */

/**
 * 走登录页 UI 登录；未登录访问 /sandbox.html 会被 dev server 302 到 /login.html?next=...
 * @returns {Promise<{alreadyLoggedIn:boolean, redirectedFrom:string}>}
 */
export async function login(page, { username = DEFAULT_USERNAME, password } = {}) {
  if (!password) throw new Error('login() 需要 password（先调 ensureUser()）');

  const target = `${BASE_URL}/sandbox.html`;
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  const landed = page.url();

  if (/\/sandbox\.html/.test(new URL(landed).pathname)) {
    return { alreadyLoggedIn: true, redirectedFrom: target };
  }
  if (!/\/login\.html/.test(new URL(landed).pathname)) {
    throw new Error(`未登录访问 /sandbox.html 没有跳到登录页，实际 URL：${landed}`);
  }

  await page.waitForSelector('#username', { state: 'visible' });
  await page.fill('#username', username);
  await page.fill('#password', password);
  await Promise.all([
    page.waitForURL('**/sandbox.html', { timeout: 30000 }),
    page.click('#submit'),
  ]);
  await page.waitForLoadState('domcontentloaded');
  return { alreadyLoggedIn: false, redirectedFrom: landed };
}

/** sandbox 页面脚本都就绪（6 个关卡的调试入口都在）。 */
export async function waitForSandboxReady(page, { timeoutMs = 60000 } = {}) {
  await waitFor(() => page.evaluate(() => (
    !!window.__stage
    && typeof window.__stage.isLevel === 'function'
    && !!window.__l2 && !!window.__l3 && !!window.__l4
    && !!window.PETRO_DEVICE_STATE
    && !!document.querySelector('#viewport canvas')
  )), { timeoutMs, intervalMs: 150, label: 'sandbox 就绪（__stage/__l2/__l3/__l4/PETRO_DEVICE_STATE/canvas）' });
}

/* ------------------------------------------------------------------ *
 * 5. 关卡进出（含那个致命的动画坑）
 * ------------------------------------------------------------------ */

const LEVEL_GLOBALS = { l2: '__l2', l3: '__l3', l4: '__l4', l5: '__l5', l1: '__l1' };

/**
 * 等 exit() 的动画真正结束：stage.isLevel() === false。
 * 必须用轮询等，不能调完 exit() 就 enter()——exit 的 fly 回调里才 stage.back()。
 *
 * 注意：headless + SwiftShader 只有 ~5fps，机器同时跑别的测试时会更慢，
 * 所以超时给足，并且轮询间隔放大（别用高频 evaluate 去抢渲染主线程）。
 */
export async function waitNotLevel(page, { timeoutMs = 45000, intervalMs = 200 } = {}) {
  await waitFor(() => page.evaluate(() => !(window.__stage && window.__stage.isLevel && window.__stage.isLevel())), {
    timeoutMs,
    intervalMs,
    label: 'stage.isLevel() === false（exit 动画结束）',
  });
  // stage.back() 之后 DOM class / 内部标志还要再收一拍
  await wait(150);
}

async function levelReady(page, id) {
  if (id === 'l2') {
    await waitFor(() => page.evaluate(() => !!window.__l2 && window.__l2.assetLoaded === true), {
      timeoutMs: 60000, intervalMs: 100,
      label: 'L2 assetLoaded（separator.obj + separator.manifest.json）',
    });
    await wait(150);
  } else if (id === 'l4') {
    await waitFor(() => page.evaluate(() => !!window.__l4 && window.__l4.loaded === true), {
      timeoutMs: 120000, intervalMs: 150,
      label: 'L4 loaded（tower.obj + tower.manifest.json）',
    });
    await wait(150);
  } else if (id === 'l3') {
    // L3 的几何在 enter() 内同步 build()，没有 assetLoaded 标志；等 UI/上下文标志即可。
    await waitFor(() => page.evaluate(() => (
      document.body.classList.contains('in-level')
      && !!document.querySelector('#l3-level')
      && !!document.querySelector('#l3-back')
    )), { timeoutMs: 30000, intervalMs: 100, label: 'L3 UI 就绪（#l3-level / body.in-level）' });
  }
}

/**
 * 进入关卡：先确认已退出（避免被 isLevel() 守卫挡掉），再调 enter()，再等资产/UI 就绪。
 * @returns {Promise<{level:string, waitedNotLevelMs:number, enterMs:number}>}
 */
export async function enterLevel(page, id, { timeoutMs = 120000 } = {}) {
  const globalName = LEVEL_GLOBALS[id];
  if (!globalName) throw new Error(`未知关卡：${id}`);

  const t0 = Date.now();
  await waitNotLevel(page, { timeoutMs: 45000 });
  const waitedNotLevelMs = Date.now() - t0;

  const present = await page.evaluate(g => !!(window[g] && typeof window[g].enter === 'function'), globalName);
  if (!present) throw new Error(`${globalName}.enter() 不存在（关卡的调试入口没挂上）`);

  const enterError = await page.evaluate(g => {
    try { window[g].enter(); return null; } catch (error) { return { message: error.message, stack: error.stack }; }
  }, globalName);
  if (enterError) throw new Error(`${globalName}.enter() 抛错：${enterError.message}\n${enterError.stack || ''}`);

  await waitFor(() => page.evaluate(() => window.__stage.isLevel() === true), {
    timeoutMs: 20000, intervalMs: 100, label: `${id}: stage.isLevel() === true`,
  });
  await levelReady(page, id);
  return { level: id, waitedNotLevelMs, enterMs: Date.now() - t0 };
}

/**
 * 退出关卡并等到 isLevel() === false。
 * exit() 里的异常不会被吞掉：返回 {exited, error}，调用方自己决定怎么记。
 */
export async function exitLevel(page, id, { timeoutMs = 45000 } = {}) {
  const globalName = LEVEL_GLOBALS[id];
  if (!globalName) throw new Error(`未知关卡：${id}`);
  const isLevel = await page.evaluate(() => !!(window.__stage && window.__stage.isLevel()));
  if (!isLevel) return { exited: false, error: null, exitMs: 0 };

  const t0 = Date.now();
  const error = await page.evaluate(g => {
    try { window[g].exit(); return null; } catch (err) { return { message: err.message, stack: err.stack }; }
  }, globalName);
  if (error) {
    console.warn(`[e2e] ${globalName}.exit() 抛错：${error.message}`);
  }
  await waitNotLevel(page, { timeoutMs });
  return { exited: true, error, exitMs: Date.now() - t0 };
}

/* ------------------------------------------------------------------ *
 * 6. console / pageerror / 网络收集
 * ------------------------------------------------------------------ */

/**
 * 收集 console error、warning、pageerror 与 requestfailed。
 * 返回的对象是活引用，随页面活动持续累积。
 */
export function collectConsole(page) {
  const errors = [];
  const warnings = [];
  const pageErrors = [];
  const all = [];
  const requestFailures = [];

  page.on('console', message => {
    const location = message.location();
    const record = {
      type: message.type(),
      text: message.text(),
      location,
      // 资源加载失败的 console error 只有把 location.url 带出来才知道是哪个请求
      url: location && location.url ? location.url : '',
      at: new Date().toISOString(),
    };
    all.push(record);
    if (record.type === 'error') errors.push(record);
    else if (record.type === 'warning') warnings.push(record);
  });
  page.on('pageerror', error => {
    const record = { message: error.message, stack: error.stack || '', at: new Date().toISOString() };
    pageErrors.push(record);
    all.push({ type: 'pageerror', text: error.message, at: record.at });
  });
  page.on('requestfailed', request => {
    requestFailures.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: request.failure() ? request.failure().errorText : 'unknown',
    });
  });

  return {
    errors,
    warnings,
    pageErrors,
    all,
    requestFailures,
    clear() {
      errors.length = 0;
      warnings.length = 0;
      pageErrors.length = 0;
      all.length = 0;
      requestFailures.length = 0;
    },
    summary() {
      return {
        consoleErrors: errors.length,
        consoleWarnings: warnings.length,
        pageErrors: pageErrors.length,
        requestFailures: requestFailures.length,
      };
    },
  };
}

/** 把 console 里跟错误相关的部分格式化出来（失败时打印）。 */
export function formatConsoleLog(consoleLog, { maxLines = 60 } = {}) {
  const lines = [];
  for (const record of consoleLog.errors) {
    lines.push(`[console.error] ${record.text}${record.url ? `  <- ${record.url}` : ''}`);
  }
  for (const record of consoleLog.pageErrors) lines.push(`[pageerror] ${record.message}`);
  for (const record of consoleLog.requestFailures) lines.push(`[requestfailed] ${record.failure} ${record.url}`);
  for (const record of consoleLog.warnings.slice(0, 10)) lines.push(`[console.warn] ${record.text}`);
  if (lines.length === 0) return '(控制台没有 error / pageerror / requestfailed)';
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown.push(`… 还有 ${lines.length - maxLines} 条`);
  return shown.join('\n');
}

/* ------------------------------------------------------------------ *
 * 7. 证据截图
 * ------------------------------------------------------------------ */

/**
 * 如果设置了 PETRO_EVIDENCE_DIR，把截图写到 <PETRO_EVIDENCE_DIR>/<dir>/<name>.png。
 * @returns {Promise<string|null>} 写出的路径；没设置环境变量时返回 null。
 */
export async function saveArtifacts(dir, page, name = 'screen') {
  const base = process.env.PETRO_EVIDENCE_DIR;
  if (!base) return null;
  const outDir = path.join(path.resolve(base), dir);
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.png`);
  try {
    await page.screenshot({ path: file });
    return file;
  } catch (error) {
    console.warn(`[e2e] 截图失败（不影响断言）：${error.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * 8. 断言小框架
 * ------------------------------------------------------------------ */

/**
 * 记录并打印断言结果；失败不会中断整轮（继续收集证据），最后由 summary()/exitCode 决定退出码。
 */
export function createSuite(title) {
  const checks = [];
  const failures = [];

  const record = (name, ok, detail) => {
    const entry = { name, ok: !!ok, detail, at: new Date().toISOString() };
    checks.push(entry);
    if (!entry.ok) failures.push(entry);
    const mark = entry.ok ? 'PASS' : 'FAIL';
    const extra = detail === undefined ? '' : `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    console.log(`[${mark}] ${title}.${name}${extra}`);
    return entry.ok;
  };

  return {
    title,
    checks,
    failures,
    /** 断言真值。 */
    ok(name, condition, detail) {
      return record(name, condition, detail);
    },
    /** 断言等于（严格 ===）。 */
    equal(name, actual, expected) {
      return record(name, actual === expected, { expected, actual });
    },
    /** 断言数值 >= 下限。 */
    atLeast(name, actual, min) {
      return record(name, typeof actual === 'number' && Number.isFinite(actual) && actual >= min, { min, actual });
    },
    /** 断言字符串匹配。 */
    matches(name, value, regex) {
      return record(name, typeof value === 'string' && regex.test(value), { regex: String(regex), value });
    },
    /** 只记录观测值，不算断言（用于报告）。 */
    note(name, detail) {
      console.log(`[INFO] ${title}.${name}  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
      checks.push({ name: `(info) ${name}`, ok: true, info: true, detail });
      return true;
    },
    pass() { return failures.length === 0; },
    summary() {
      return {
        title,
        total: checks.filter(c => !c.info).length,
        passed: checks.filter(c => !c.info && c.ok).length,
        failed: failures.length,
        failures: failures.map(f => ({ name: f.name, detail: f.detail })),
      };
    },
  };
}

/** 打印失败清单 + 控制台日志，并设置退出码。 */
export function reportAndExit({ suites, consoleLog, extraLines = [] }) {
  const summaries = suites.map(s => s.summary());
  const failed = summaries.reduce((sum, s) => sum + s.failed, 0);
  const total = summaries.reduce((sum, s) => sum + s.total, 0);

  console.log('\n================ E2E SUMMARY ================');
  for (const summary of summaries) {
    console.log(`${summary.title}: ${summary.passed}/${summary.total} passed, ${summary.failed} failed`);
  }
  for (const line of extraLines) console.log(line);
  console.log(`TOTAL: ${total - failed}/${total} passed`);

  if (failed > 0) {
    console.log('\n---- FAILED CASES ----');
    for (const summary of summaries) {
      for (const failure of summary.failures) {
        console.log(`FAILED: ${summary.title}.${failure.name}  ${JSON.stringify(failure.detail)}`);
      }
    }
    if (consoleLog) {
      console.log('\n---- CONSOLE / PAGEERROR / REQUESTFAILED ----');
      console.log(formatConsoleLog(consoleLog));
    }
    process.exitCode = 1;
  } else {
    console.log('\nNo failed assertions.');
    if (consoleLog) {
      const stats = consoleLog.summary();
      console.log(`console: errors=${stats.consoleErrors} warnings=${stats.consoleWarnings} `
        + `pageErrors=${stats.pageErrors} requestFailed=${stats.requestFailures}`);
    }
  }
  return failed;
}
