/**
 * tools/e2e/run-smoke.mjs — sandbox 页面浏览器冒烟。
 *
 * 断言（在「已登录后完整加载一次 /sandbox.html」这个测量窗口内）：
 *  1. 无 console.error、无 pageerror；
 *  2. canvas 存在，且能拿到 webgl2（否则 webgl）上下文；
 *  3. 主脚本与 3D 资源请求无 4xx/5xx。
 *
 * 为什么登录前的事件不算断言：
 *  login.html 自己会请求 /api/auth/status 与 /api/auth/me；未登录时 /api/auth/me 返回 401
 *  是登录页的正常行为，Chrome 会把它记成一条 "Failed to load resource: 401" 的 console.error。
 *  那不是 sandbox 页的问题，所以先登录、再重新整页加载一次 sandbox 作为测量窗口；
 *  登录前的事件仍然完整打印在报告里（preAuth 段），不隐瞒。
 *
 * 明确声明：headless + SwiftShader 下的 WebGL 只做「场景能渲染出帧」的功能冒烟，
 * 不代表真实 GPU 性能（帧率、纹理带宽、并发面数都不作数）。
 *
 * 用法：node tools/e2e/run-smoke.mjs
 * 可选环境变量：PETRO_EVIDENCE_DIR（截图目录）、PETRO_CHROME、PETRO_HEADFUL=1、PETRO_BASE_URL
 */

import {
  BASE_URL,
  cleanupUser,
  collectConsole,
  createSuite,
  ensureServer,
  ensureUser,
  formatConsoleLog,
  launchChrome,
  login,
  openPage,
  reportAndExit,
  saveArtifacts,
  waitForSandboxReady,
} from './harness.mjs';

const VIEWPORT = { width: 1440, height: 900 };

/** 主脚本：页面自身 + 关卡/世界/站点脚本。 */
const MAIN_SCRIPT = /\.(?:js|mjs)$/i;
/** 3D 资源：模型、材质、Manifest、数据。 */
const ASSET_3D = /\.(?:obj|mtl|glb|json)$/i;
const OK_STATUS = status => status > 0 && status < 400;

function isMainScript(url) {
  const { pathname } = new URL(url);
  return MAIN_SCRIPT.test(pathname) && /^\/(?:levels|world|assets)\//.test(pathname);
}

function is3dAsset(url) {
  const { pathname } = new URL(url);
  return ASSET_3D.test(pathname) && /^\/assets\//.test(pathname);
}

async function main() {
  const suite = createSuite('SMOKE');
  let server = null;
  let browser = null;
  let context = null;
  let consoleLog = null;
  let preAuthLog = null;
  const responses = [];
  const extraLines = [];

  try {
    server = await ensureServer();
    extraLines.push(`server: ${BASE_URL} (${server.started ? 'started by runner' : 'reused existing'})`);

    const user = await ensureUser();
    extraLines.push(`user: ${user.username} (${user.created ? 'created' : 'existing, password rotated'})`);

    const launched = await launchChrome();
    browser = launched.browser;
    extraLines.push(`chrome: ${launched.executablePath}`);
    extraLines.push(`browser.version(): ${launched.version}`);
    extraLines.push(`args: ${launched.args.join(' ')}`);

    const opened = await openPage(browser, { ...VIEWPORT, deviceScaleFactor: 1 });
    context = opened.context;
    const page = opened.page;
    preAuthLog = collectConsole(page);

    page.on('response', response => {
      const url = response.url();
      if (!url.startsWith(BASE_URL)) return;
      responses.push({
        url,
        path: new URL(url).pathname,
        status: response.status(),
        type: response.request().resourceType(),
      });
    });

    // 1) 走真实 UI 登录（这段的事件只做参考，不算断言）
    const loginResult = await login(page, user);
    suite.note('login', { alreadyLoggedIn: loginResult.alreadyLoggedIn, redirectedFrom: loginResult.redirectedFrom });
    const preAuthStats = { ...preAuthLog.summary() };
    const preAuthErrors = preAuthLog.errors.map(e => ({ text: e.text, url: e.url }));
    const preAuthResponses = responses.slice();
    extraLines.push(`preAuth console: ${JSON.stringify(preAuthStats)}`);
    for (const item of preAuthErrors) extraLines.push(`  preAuth console.error: ${item.text} <- ${item.url}`);

    // 2) 测量窗口：已登录状态下整页重新加载 sandbox（不会被 302 到登录页）
    responses.length = 0;
    preAuthLog = Object.assign(preAuthLog, { frozen: true });
    consoleLog = collectConsole(page);
    await page.goto(`${BASE_URL}/sandbox.html`, { waitUntil: 'domcontentloaded' });
    const landedPath = new URL(page.url()).pathname;
    suite.equal('sandbox.html 直接可达（已登录，未被重定向）', landedPath, '/sandbox.html');
    await waitForSandboxReady(page);

    // 3) 运行环境信息（浏览器版本 / viewport / DPR）
    const env = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      screen: { width: window.screen.width, height: window.screen.height },
      userAgent: navigator.userAgent,
    }));
    extraLines.push(`viewport: ${env.innerWidth}x${env.innerHeight} (layout, CSS px)`);
    extraLines.push(`devicePixelRatio: ${env.devicePixelRatio}`);
    extraLines.push(`screen: ${env.screen.width}x${env.screen.height}`);
    extraLines.push(`userAgent: ${env.userAgent}`);
    suite.note('viewport', { w: env.innerWidth, h: env.innerHeight, dpr: env.devicePixelRatio });

    // 4) canvas + WebGL 上下文
    const webgl = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      const rows = canvases.map(canvas => {
        const row = {
          id: canvas.id || '',
          className: typeof canvas.className === 'string' ? canvas.className : '',
          width: canvas.width,
          height: canvas.height,
          contextType: null,
          version: null,
          renderer: null,
          vendor: null,
          drawingBuffer: null,
        };
        for (const type of ['webgl2', 'webgl']) {
          let ctx = null;
          try { ctx = canvas.getContext(type); } catch { ctx = null; }
          if (!ctx) continue;
          row.contextType = type;
          try {
            row.version = ctx.getParameter(ctx.VERSION);
            row.renderer = ctx.getParameter(ctx.RENDERER);
            row.vendor = ctx.getParameter(ctx.VENDOR);
            row.drawingBuffer = `${ctx.drawingBufferWidth}x${ctx.drawingBufferHeight}`;
          } catch { /* 上下文被丢弃时参数读取会抛错，保留 type 即可 */ }
          break;
        }
        return row;
      });
      const viewportCanvas = document.querySelector('#viewport canvas');
      return {
        count: canvases.length,
        rows,
        viewportCanvasPresent: !!viewportCanvas,
        viewportCanvasConnected: !!(viewportCanvas && viewportCanvas.isConnected),
      };
    });

    suite.ok('canvas.count>=1', webgl.count >= 1, { count: webgl.count });
    suite.ok('#viewport canvas 存在', webgl.viewportCanvasPresent && webgl.viewportCanvasConnected, {
      present: webgl.viewportCanvasPresent,
      connected: webgl.viewportCanvasConnected,
    });
    const glRow = webgl.rows.find(row => row.contextType);
    suite.ok('webgl 上下文可用', !!glRow, webgl.rows.map(r => ({
      id: r.id, type: r.contextType, version: r.version, renderer: r.renderer, buffer: r.drawingBuffer,
    })));
    if (glRow) {
      extraLines.push(`webgl: ${glRow.contextType} | version=${glRow.version} | renderer=${glRow.renderer} `
        + `| vendor=${glRow.vendor} | drawingBuffer=${glRow.drawingBuffer}`);
    }

    // 场景真的在出图：renderer.info.render.calls > 0
    const renderStats = await page.evaluate(() => {
      try { return window.__stage.stats(); } catch { return null; }
    });
    suite.ok('renderer 正在出图（calls>0）', !!renderStats && renderStats.calls > 0, renderStats);
    suite.note('renderer.stats', renderStats);

    // 5) 网络：主脚本与 3D 资源不得 4xx/5xx
    const sameOrigin = responses.filter(r => r.type !== 'preflight');
    const bad = sameOrigin.filter(r => !OK_STATUS(r.status));
    const badMainScripts = bad.filter(r => isMainScript(r.url));
    const bad3d = bad.filter(r => is3dAsset(r.url));
    const seenMainScripts = sameOrigin.filter(r => isMainScript(r.url));
    const seen3d = sameOrigin.filter(r => is3dAsset(r.url));

    suite.ok('main script requests 无 4xx/5xx', badMainScripts.length === 0, badMainScripts.map(r => `${r.status} ${r.path}`));
    suite.ok('3D asset requests 无 4xx/5xx', bad3d.length === 0, bad3d.map(r => `${r.status} ${r.path}`));
    suite.ok('全部同源请求 无 4xx/5xx', bad.length === 0, bad.map(r => `${r.status} ${r.path}`));
    suite.atLeast('主脚本请求数', seenMainScripts.length, 5);
    suite.atLeast('3D 资源请求数', seen3d.length, 3);
    suite.note('3D 资源请求', seen3d.map(r => `${r.status} ${r.path}`).sort());
    extraLines.push(`requests: total(same-origin)=${sameOrigin.length} mainScripts=${seenMainScripts.length} `
      + `3dAssets=${seen3d.length} bad=${bad.length}`);
    for (const item of seen3d.slice(0, 20)) extraLines.push(`  3d: ${item.status} ${item.path}`);
    for (const item of bad) extraLines.push(`  bad: ${item.status} ${item.path}`);

    // 6) console / pageerror（只看已登录 sandbox 这次加载）
    const stats = consoleLog.summary();
    suite.ok('无 console.error', stats.consoleErrors === 0, consoleLog.errors.map(e => `${e.text} <- ${e.url}`));
    suite.ok('无 pageerror', stats.pageErrors === 0, consoleLog.pageErrors.map(e => e.message));
    suite.ok('无 requestfailed', stats.requestFailures === 0, consoleLog.requestFailures.map(r => `${r.failure} ${r.url}`));
    suite.note('console 统计', stats);
    for (const warning of consoleLog.warnings.slice(0, 10)) {
      extraLines.push(`console.warn(未断言，仅供参考): ${warning.text}`);
    }

    const shot = await saveArtifacts('smoke', page, 'sandbox');
    if (shot) extraLines.push(`screenshot: ${shot}`);

    // 关卡调试入口是否都挂上了（冒烟只验证「能用」，逐关断言在 run-levels.mjs）
    const levelHooks = await page.evaluate(() => ({
      l1: !!(window.__l1 && window.__l1.enter),
      l2: !!(window.__l2 && window.__l2.enter),
      l3: !!(window.__l3 && window.__l3.enter),
      l4: !!(window.__l4 && window.__l4.enter),
      l5: !!(window.__l5 && window.__l5.enter),
      levelHooks: Object.keys(window.__levelHooks || {}).length,
    }));
    suite.ok('关卡调试入口齐全', levelHooks.l2 && levelHooks.l3 && levelHooks.l4, levelHooks);
    suite.note('level hooks', levelHooks);

    extraLines.push('NOTE: headless + SwiftShader 的 WebGL 仅证明「场景能渲染出帧」，'
      + '不代表 GPU 性能；帧率/吞吐请在有 GPU 的带界面浏览器里测。');
  } catch (error) {
    console.error('[SMOKE] 运行异常：' + (error && error.stack ? error.stack : error));
    suite.ok('smoke.run', false, { error: String(error && error.message || error) });
  } finally {
    try { if (context) await context.close(); } catch { /* ignore */ }
    try { if (browser) await browser.close(); } catch { /* ignore */ }
    try { if (server) await server.stop(); } catch { /* ignore */ }
    let cleanup = null;
    try { cleanup = await cleanupUser(); } catch (error) { console.error('[SMOKE] cleanupUser 失败：' + error.message); }
    if (cleanup) {
      extraLines.push(`cleanup: removed=${cleanup.removed.length} leftover=[${cleanup.leftover.join(', ')}] `
        + `dataDirRemoved=${cleanup.dataDirRemoved}`);
      console.log(`[INFO] cleanup removed: ${cleanup.removed.join(', ') || '(none)'}`);
      console.log(`[INFO] cleanup leftover: ${cleanup.leftover.join(', ') || '(empty)'}`);
    }
  }

  console.log('\n================ SMOKE REPORT ================');
  for (const line of extraLines) console.log(line);
  if (consoleLog && consoleLog.errors.length + consoleLog.pageErrors.length > 0) {
    console.log('\n---- CONSOLE / PAGEERROR ----');
    console.log(formatConsoleLog(consoleLog));
  }
  reportAndExit({ suites: [suite], consoleLog, extraLines: [] });
}

await main();
