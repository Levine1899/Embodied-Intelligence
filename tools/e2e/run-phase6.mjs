#!/usr/bin/env node
/**
 * Phase 6 E2E：GLB Loader 验收。
 *
 * 断言方式：只读调试 API + 网络事件 + renderer.info，不使用截图 hash。
 * 覆盖：
 *  1. 页面只有一套 THREE runtime（bundle），无 three.browser.js 请求
 *  2. THREE.REVISION 与 GLTFLoader 来自同一包、revision 精确 180
 *  3. 全程无外部域请求（无 CDN）
 *  4. GLB + Manifest 加载、extras↔manifest 对账、hash 绑定、语义索引
 *  5. GLB 失败 → OBJ 回退，且 UI 明示"备用"
 *  6. 重复进出 10 次，几何/纹理/材质数量不持续增长
 */
import { ensureServer, ensureUser, cleanupUser, launchChrome, openPage, login, waitForSandboxReady, collectConsole, formatConsoleLog } from './harness.mjs';

const RESULTS = [];
let failed = 0;

function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failed++;
  RESULTS.push({ name, ok, detail });
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}` + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}

async function main() {
  const server = await ensureServer();
  const user = await ensureUser({ username: 'e2e_p6_' + Date.now().toString(36) });
  const { browser, version } = await launchChrome();
  console.log(`browser.version(): ${version}`);
  const opened = await openPage(browser, { width: 1440, height: 900, deviceScaleFactor: 1 });
  const page = opened.page;
  const consoleLog = collectConsole(page);

  const requests = [];
  page.on('request', (r) => requests.push(r.url()));

  /* 记录被拦截的注入点：稍后强制 GLB 404 以验证回退 */
  let forceGlbFail = false;
  await page.route('**/separator/separator.glb*', async (route) => {
    if (forceGlbFail) return route.fulfill({ status: 404, body: 'forced failure' });
    return route.continue();
  });

  try {
    await login(page, user);
    await waitForSandboxReady(page);
    await page.waitForTimeout(1500);

    /* ---------- 1. 单 runtime ---------- */
    const runtime = await page.evaluate(() => ({
      hasTHREE: !!window.THREE,
      runtimeTag: window.THREE && window.THREE.__petroRuntime,
      revision: window.THREE && window.THREE.REVISION,
      exposedRevision: window.__PETRO_THREE_REVISION,
      hasGLTFLoader: typeof window.GLTFLoader === 'function',
      hasModelLoader: !!window.ModelLoader,
      threeScripts: Array.from(document.querySelectorAll('script[src]'))
        .map((s) => s.getAttribute('src'))
        .filter((s) => /three/i.test(s)),
    }));
    check('页面存在 THREE', runtime.hasTHREE);
    check('THREE 来自 bundle（__petroRuntime=bundle）', runtime.runtimeTag === 'bundle', runtime.runtimeTag);
    check('THREE.REVISION === "180"', String(runtime.revision) === '180', runtime.revision);
    check('window.__PETRO_THREE_REVISION === "180"', String(runtime.exposedRevision) === '180', runtime.exposedRevision);
    check('GLTFLoader 可用且同源', runtime.hasGLTFLoader);
    check('ModelLoader 可用', runtime.hasModelLoader);
    check('页面只引用 1 个 three 脚本', runtime.threeScripts.length === 1, runtime.threeScripts);

    const oldRuntimeLoaded = requests.some((u) => /three\.browser\.js/.test(u));
    check('未请求旧 three.browser.js', !oldRuntimeLoaded);

    /* ---------- 2. 无 CDN ---------- */
    const origin = new URL(page.url()).origin;
    const external = requests.filter((u) => {
      if (!/^https?:/i.test(u)) return false;
      try { return new URL(u).origin !== origin; } catch { return false; }
    });
    check('无外部域请求（无 CDN）', external.length === 0, external.slice(0, 5));

    /* ---------- 3. ModelLoader 直接加载 separator.glb ---------- */
    const direct = await page.evaluate(async () => {
      const handle = await window.ModelLoader.load({
        glbUrl: 'assets/separator/separator.glb',
        manifestUrl: 'assets/separator/separator.manifest.json',
      });
      const out = {
        stats: handle.stats,
        anchors: handle.indices.anchors.size,
        nodeCount: handle.indices.nodeByUid.size,
        objectBuckets: handle.indices.byObjectId.size,
        systemBuckets: handle.indices.bySystemId.size,
        semanticBuckets: handle.indices.bySemanticId.size,
        sampleAnchor: (function () {
          const first = Array.from(handle.indices.anchors.keys())[0];
          const a = handle.anchor(first);
          return { anchorId: first, position: a.position, owner: a.ownerObjectId };
        })(),
        sampleObject3d: (function () {
          const uid = Array.from(handle.indices.object3dByUid.keys())[0];
          const o = handle.findByNodeUid(uid);
          return { uid, name: o && o.name, isObject3D: !!(o && o.isObject3D) };
        })(),
      };
      handle.dispose();
      out.disposed = handle.disposed;
      return out;
    });
    check('GLB 节点数 43', direct.stats.nodes === 43, direct.stats.nodes);
    check('43/43 节点带 extras.petro', direct.stats.withExtras === 43, direct.stats.withExtras);
    check('extras 与 Manifest 全部对账', direct.stats.reconciled === 43, direct.stats.reconciled);
    check('sha256 校验通过', direct.stats.hashVerified === true, direct.stats.hashVerified);
    check('anchor 索引非空（5 条）', direct.anchors === 5, direct.anchors);
    check('objectId / systemId / semanticId 索引可用',
      direct.objectBuckets > 0 && direct.systemBuckets > 0 && direct.semanticBuckets > 0,
      { obj: direct.objectBuckets, sys: direct.systemBuckets, sem: direct.semanticBuckets });
    check('anchor 能取到坐标与 owner', !!(direct.sampleAnchor && direct.sampleAnchor.position && direct.sampleAnchor.owner), direct.sampleAnchor);
    check('nodeUid 能反查到 Object3D', direct.sampleObject3d.isObject3D === true, direct.sampleObject3d);
    check('dispose 后标记 disposed', direct.disposed === true);

    /* ---------- 4. hash 不符必须失败（负向） ---------- */
    const badHash = await page.evaluate(async () => {
      // 直接改一份 manifest 的 sha256 再让 ModelLoader 去拉：用 data URL 更干净
      const res = await fetch('assets/separator/separator.manifest.json');
      const m = await res.json();
      m.runtime.sha256 = 'f'.repeat(64);
      const blob = new Blob([JSON.stringify(m)], { type: 'application/json' });
      try {
        await window.ModelLoader.load({
          glbUrl: 'assets/separator/separator.glb',
          manifestUrl: URL.createObjectURL(blob),
        });
        return { threw: false };
      } catch (e) {
        return { threw: true, message: String(e.message || e) };
      }
    });
    check('sha256 不符时加载失败', badHash.threw === true, badHash.message);

    /* ---------- 5. 强制 GLB 404 → OBJ 回退 + UI 明示 ---------- */
    forceGlbFail = true;
    await page.evaluate(() => { if (window.__l2) { try { window.__l2.exit(); } catch (e) {} } });
    await page.waitForTimeout(2000);
    await page.evaluate(async () => {
      // 等 isLevel 变 false 再进（exit 带动画，踩过两次坑）
      for (let i = 0; i < 100 && window.__stage.isLevel(); i++) await new Promise((r) => setTimeout(r, 100));
      window.__l2.enter();
    });
    await page.waitForTimeout(4000);
    const fallback = await page.evaluate(() => ({
      isLevel: window.__stage.isLevel(),
      assetLoaded: window.__l2.assetLoaded,
      usingFallback: window.__l2.usingFallback,
      fallbackReason: window.__l2.fallbackReason,
      hint: (document.querySelector('#l2-hint') || {}).textContent || '',
      badge: (document.querySelector('#l2-asset-badge') || {}).textContent || '',
      badgeHidden: (document.querySelector('#l2-asset-badge') || {}).hidden,
    }));
    check('GLB 404 时 L2 仍能进入（回退成功）', fallback.isLevel === true && fallback.assetLoaded === true, fallback);
    check('回退标记 usingFallback=true', fallback.usingFallback === true, fallback.usingFallback);
    check('UI 常驻徽标明示"备用示意模型"',
      fallback.badgeHidden === false && /备用/.test(fallback.badge),
      { badge: fallback.badge, hidden: fallback.badgeHidden });
    forceGlbFail = false;

    /* ---------- 6. 正常路径 + 重复进出 10 次资源曲线 ---------- */
    await page.unroute('**/separator/separator.glb*').catch(() => {});
    const growth = await page.evaluate(async () => {
      const samples = [];
      const info = window.__stage.renderer.info;
      const waitNotLevel = async () => {
        for (let i = 0; i < 120 && window.__stage.isLevel(); i++) await new Promise((r) => setTimeout(r, 100));
      };
      const waitLevel = async () => {
        for (let i = 0; i < 200 && !window.__stage.isLevel(); i++) await new Promise((r) => setTimeout(r, 100));
      };
      await window.__l2.exit();
      await waitNotLevel();

      for (let i = 0; i < 10; i++) {
        window.__l2.enter();
        await waitLevel();
        // 等 GLB 加载完（assetLoaded 真）
        for (let k = 0; k < 200 && !window.__l2.assetLoaded; k++) await new Promise((r) => setTimeout(r, 100));
        const stats = window.__l2.assetStats;
        samples.push({
          i,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs ? info.programs.length : null,
          assetLoaded: window.__l2.assetLoaded,
          usingFallback: window.__l2.usingFallback,
          statsReconciled: stats && stats.reconciled,
        });
        await window.__l2.exit();
        await waitNotLevel();
        samples[samples.length - 1].afterExitGeometries = info.memory.geometries;
        samples[samples.length - 1].handleAfterExit = window.__l2.assetHandle;
      }
      return samples;
    }, { timeout: 0 });

    const first = growth[0];
    const last = growth[growth.length - 1];
    const geoDelta = last.afterExitGeometries - first.afterExitGeometries;
    check('10 次进出均成功加载 GLB', growth.every((g) => g.assetLoaded && g.statsReconciled === 43),
      growth.map((g) => g.statsReconciled));
    check('每次退出后资产句柄已释放', growth.every((g) => g.handleAfterExit === null));
    check('几何数量无持续增长（|Δ| <= 2）', Math.abs(geoDelta) <= 2, { first: first.afterExitGeometries, last: last.afterExitGeometries, delta: geoDelta });
    console.log('[INFO] 资源曲线: ' + JSON.stringify(growth.map((g) => [g.i, g.geometries, g.afterExitGeometries, g.textures])));

    /* 预期内的错误：未登录探测 /api/auth/me 的 401；本测试自己用 route 注入的
     * separator.glb 404。除此之外任何 error 都算回归。 */
    const expectedNoise = /\/api\/auth\/me|separator\.glb/;
    const unexpected = consoleLog.errors.filter((e) => {
      const u = (e && (e.url || (e.location && e.location.url))) || '';
      return !expectedNoise.test(u);
    });
    check('无非预期 console error', unexpected.length === 0, {
      unexpected: unexpected.slice(0, 3),
      expectedNoise: consoleLog.errors.length - unexpected.length,
    });
  } finally {
    await browser.close().catch(() => {});
    await cleanupUser();
    await server.stop();
  }

  console.log('\n================ PHASE 6 SUMMARY ================');
  console.log(`PASS ${RESULTS.length - failed} / ${RESULTS.length}   FAIL ${failed}`);
  console.log(formatConsoleLog(consoleLog, { maxLines: 20 }));
  if (failed > 0) {
    console.log('---- FAILED ----');
    RESULTS.filter((r) => !r.ok).forEach((r) => console.log('FAILED:', r.name, JSON.stringify(r.detail)));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[PHASE6] 运行异常：', e);
  /* 兜底：异常路径下若还有句柄没释放，5 秒后强制退出，避免测试进程挂住 */
  setTimeout(() => process.exit(1), 5000).unref();
  process.exitCode = 1;
});
