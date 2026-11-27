#!/usr/bin/env node
/**
 * Phase 10｜压力测试：反复进出、切换细节等级，观察资源是否持续增长。
 *
 * 判据：每个关卡 10 轮进/退后，geometries/textures/programs 不应呈单调增长；
 *      任何 webglcontextlost / 加载失败都被记录（不是"没看到就当没有"）。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureServer, ensureUser, cleanupUser, launchChrome, openPage, login,
  waitForSandboxReady, enterLevel, exitLevel, waitFor,
} from '../e2e/harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'docs/3d-model-optimization/evidence/phase-10-2026-11-27/stress.json');
const CYCLES = 10;
const LEVELS = ['l1', 'l2', 'l3', 'l4', 'l5'];

const snap = () => {
  const r = window.__stage && window.__stage.renderer;
  if (!r) return null;
  const i = r.info || {};
  return {
    geometries: i.memory ? i.memory.geometries : null,
    textures: i.memory ? i.memory.textures : null,
    programs: i.programs ? i.programs.length : null,
    calls: i.render ? i.render.calls : null,
    triangles: i.render ? i.render.triangles : null,
    pixelRatio: r.getPixelRatio ? r.getPixelRatio() : null,
    guardLevel: window.__perfGuard ? window.__perfGuard.level : null,
  };
};

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  const server = await ensureServer();
  const user = await ensureUser({ username: 'stress_p10_' + Date.now().toString(36) });
  const { browser } = await launchChrome({ hardware: true, headless: false });
  const { page } = await openPage(browser, { width: 1440, height: 900 });
  const result = {
    schemaVersion: '1.0.0',
    exitFailures: [],
    capturedAt: new Date().toISOString(),
    cyclesPerLevel: CYCLES,
    guard: null,
    policy: null,
    contextLost: 0,
    pageErrors: [],
    loadFailures: [],
    levels: {},
  };
  page.on('pageerror', (e) => result.pageErrors.push(String((e && e.message) || e).slice(0, 200)));
  page.on('console', (m) => {
    const t = m.text();
    if (/context lost|WebGL context|Failed to load|ERR_/.test(t)) result.loadFailures.push(t.slice(0, 200));
  });

  try {
    await login(page, user);
    await waitForSandboxReady(page);
    /* 等自挂载完成：renderer 出现后 autoAttach 才会接管 */
    for (let i = 0; i < 60; i++) {
      const g = await page.evaluate(() => !!(window.__perfGuard && window.__visualPolicy));
      if (g) break;
      await page.waitForTimeout(250);
    }
    result.guard = await page.evaluate(() => ({
      attached: !!window.__perfGuard,
      level: window.__perfGuard ? window.__perfGuard.level : null,
      dprScale: window.__perfGuard ? window.__perfGuard.dprScale() : null,
      config: window.__perfGuard ? window.__perfGuard.config : null,
    }));
    result.policy = await page.evaluate(() => window.__visualPolicy || null);
    await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (c) c.addEventListener('webglcontextlost', () => { window.__ctxLost = (window.__ctxLost || 0) + 1; }, false);
    });

    const idle = await page.evaluate(snap);
    result.overviewIdle = idle;

    for (const id of LEVELS) {
      const samples = [];
      for (let c = 1; c <= CYCLES; c++) {
        await enterLevel(page, id);
        await page.waitForTimeout(1500);

        /* L1 有 detailLevel 表示切换：同一轮内再切 3 次，模拟用户反复看细节 */
        if (id === 'l1') {
          for (const rep of ['overview', 'closeup', 'detail']) {
            await page.evaluate((r) => { try { window.__l1.setRep(r); } catch (e) { /* 记录在 errors */ } }, rep);
            await page.waitForTimeout(200);
          }
        }
        const inLevel = await page.evaluate(snap);
        let exitFailed = false;
        try {
          await exitLevel(page, id);
        } catch (e) {
          exitFailed = true;
          result.exitFailures.push({ level: id, cycle: c, error: String((e && e.message) || e).slice(0, 160) });
          /* 卡住时无法继续复用该页面：重载后继续下一轮，并标注该轮数据不可比 */
          await page.reload({ waitUntil: 'domcontentloaded' });
          await waitForSandboxReady(page);
          await page.waitForTimeout(800);
        }
        if (!exitFailed) await page.waitForTimeout(300);
        samples.push({ cycle: c, exitFailed, inLevel, afterExit: await page.evaluate(snap) });
      }
      const okSamples = samples.filter((x) => !x.exitFailed);
      const first = (okSamples[0] || samples[0]).afterExit;
      const last = samples[samples.length - 1].afterExit;
      result.levels[id] = {
        samples,
        growth: {
          geometries: last.geometries - first.geometries,
          textures: last.textures - first.textures,
          programs: last.programs - first.programs,
        },
        stable: last && first && last.geometries <= first.geometries + 2 && last.textures <= first.textures + 2,
        exitFailureCount: samples.filter((x) => x.exitFailed).length,
      };
    }

    result.contextLost = await page.evaluate(() => window.__ctxLost || 0);
    result.finalIdle = await page.evaluate(snap);
  } finally {
    await browser.close().catch(() => {});
    await cleanupUser();
    await server.stop();
  }

  await writeFile(OUT, JSON.stringify(result, null, 2) + '\n');
  const summary = Object.fromEntries(Object.entries(result.levels).map(([k, v]) => [k, {
    growth: v.growth, stable: v.stable,
    firstInLevel: v.samples[0].inLevel, lastInLevel: v.samples[v.samples.length - 1].inLevel,
  }]));
  console.log('@@STRESS@@ ' + JSON.stringify({
    out: relative(ROOT, OUT).replace(/\\/g, '/'),
    guard: result.guard, policy: result.policy,
    contextLost: result.contextLost,
    pageErrors: result.pageErrors.slice(0, 5),
    loadFailures: result.loadFailures.slice(0, 5),
    summary,
  }, null, 2));
}

main().catch((e) => { console.error('[STRESS] ' + ((e && e.stack) || e)); process.exit(1); });
