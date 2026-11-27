#!/usr/bin/env node
/**
 * Phase 10｜性能基线采集（真实浏览器 + 真实 GPU 路径）。
 *
 * 纪律（对应本阶段的禁令）：
 *  - renderer.info.memory.* 只是**资源数量**，不是显存；显存单独标注 NOT_AVAILABLE
 *  - 报告里的 FPS/frame time 全部来自这里实测，禁止手填
 *  - 若运行在 SwiftShader/软件渲染，结果标记 software=true 且**不作为 GPU 性能证据**
 *
 * 用法：node tools/perf/run-baseline.mjs [--out <path>]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureServer, ensureUser, cleanupUser, launchChrome, openPage, login,
  waitForSandboxReady, enterLevel, exitLevel, waitFor,
} from '../e2e/harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.argv.includes('--out')
  ? resolve(process.argv[process.argv.indexOf('--out') + 1])
  : resolve(ROOT, 'docs/3d-model-optimization/evidence/phase-10-2026-11-27/baseline.json');

const SAMPLE_MS = 4000;

function pct(arr, p) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))));
  return a[i];
}
const round = (v, n = 2) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10 ** n) / 10 ** n : v);

async function sampleFrames(page, ms) {
  return page.evaluate((duration) => new Promise((res) => {
    const dts = [];
    let last = performance.now();
    const t0 = last;
    function tick(now) {
      dts.push(now - last);
      last = now;
      if (now - t0 < duration) requestAnimationFrame(tick);
      else res(dts);
    }
    requestAnimationFrame(tick);
  }), ms);
}

function framesToMetrics(dts) {
  if (!dts || dts.length < 5) return { frames: dts ? dts.length : 0, fpsAvg: null };
  const fps = dts.map((d) => 1000 / d);
  return {
    frames: dts.length,
    windowMs: Math.round(dts.reduce((a, b) => a + b, 0)),
    fpsAvg: round(fps.reduce((a, b) => a + b, 0) / fps.length),
    fpsP5: round(1000 / pct(dts, 95)),      /* 最差 5% 帧对应的 FPS */
    fpsMin: round(1000 / Math.max(...dts)),
    frameTimeP50: round(pct(dts, 50)),
    frameTimeP95: round(pct(dts, 95)),
  };
}

function gpuInfoScript() {
  const r = window.__stage && window.__stage.renderer;
  if (!r) return { error: 'no renderer' };
  const ctx = r.getContext ? r.getContext() : null;
  let vendor = null, rendererName = null, unmasked = null;
  if (ctx) {
    vendor = ctx.getParameter(ctx.VENDOR);
    rendererName = ctx.getParameter(ctx.RENDERER);
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
    if (dbg) unmasked = ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
  }
  const info = r.info || {};
  return {
    contextType: ctx ? (typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1') : null,
    vendor, renderer: rendererName, unmaskedRenderer: unmasked,
    software: /swiftshader|software|basic render/i.test(String(unmasked || rendererName || '')),
    devicePixelRatio: window.devicePixelRatio,
    canvas: { w: r.domElement.width, h: r.domElement.height },
    drawingBuffer: { w: ctx ? ctx.drawingBufferWidth : null, h: ctx ? ctx.drawingBufferHeight : null },
    memory: info.memory ? { geometries: info.memory.geometries, textures: info.memory.textures } : null,
    render: info.render ? { calls: info.render.calls, triangles: info.render.triangles, points: info.render.points, lines: info.render.lines } : null,
    programs: info.programs ? info.programs.length : null,
    capabilities: r.capabilities ? {
      maxTextureSize: r.capabilities.maxTextureSize,
      maxSamples: r.capabilities.maxSamples,
    } : null,
    toneMapping: r.toneMapping !== undefined ? r.toneMapping : null,
    toneMappingExposure: r.toneMappingExposure !== undefined ? r.toneMappingExposure : null,
    shadowsEnabled: !!(r.shadowMap && r.shadowMap.enabled),
    pixelRatio: r.getPixelRatio ? r.getPixelRatio() : null,
  };
}

async function glbBytes() {
  const { readdir, stat } = await import('node:fs/promises');
  const dir = resolve(ROOT, 'web/assets');
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = resolve(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.glb')) {
        const s = await stat(p);
        out[relative(resolve(ROOT, 'web'), p).replace(/\\/g, '/')] = s.size;
      }
    }
  }
  await walk(dir);
  return out;
}

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  const glb = await glbBytes();
  const totalGlb = Object.values(glb).reduce((a, b) => a + b, 0);
  const server = await ensureServer();
  const user = await ensureUser({ username: 'perf_p10_' + Date.now().toString(36) });
  /* 性能测量走系统 GPU；若仍回退软光栅，结果会被标记 software=true 且不作为 GPU 证据。 */
  const launch = await launchChrome({ hardware: !process.env.PETRO_FORCE_SOFTWARE, headless: false });
  const { browser } = launch;
  const { page } = await openPage(browser, { width: 1440, height: 900 });
  const result = {
    schemaVersion: '1.0.0',
    capturedAt: new Date().toISOString(),
    sampleMs: SAMPLE_MS,
    env: { launch: { hardware: !!launch.hardware, headless: !launch.hardware, args: launch.args } },
    assets: { glbCount: Object.keys(glb).length, glbTotalBytes: totalGlb, glb },
    scenarios: [],
    vram: { status: 'NOT_AVAILABLE', note: 'WebGL 不暴露显存占用；仅在有可靠驱动/系统来源时才记录' },
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e).slice(0, 200)));

  try {
    await login(page, user);
    await waitForSandboxReady(page);
    await page.waitForTimeout(1200);

    result.env.browser = await browser.version();
    result.env.userAgent = await page.evaluate(() => navigator.userAgent);
    result.env.viewport = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }));
    result.env.gpu = await page.evaluate(gpuInfoScript);

    /* ---- 总览（首屏）---- */
    const t0 = Date.now();
    const overviewDts = await sampleFrames(page, SAMPLE_MS);
    result.scenarios.push({
      id: 'overview',
      label: '总览首屏',
      firstFrameMs: Date.now() - t0 - SAMPLE_MS > 0 ? null : null,
      ...framesToMetrics(overviewDts),
      info: await page.evaluate(gpuInfoScript),
    });

    /* ---- L1–L5 ---- */
    for (const id of ['l1', 'l2', 'l3', 'l4', 'l5']) {
      const enterStart = Date.now();
      await enterLevel(page, id);
      await page.waitForTimeout(2600);
      const enterMs = Date.now() - enterStart;
      let detail = {};
      if (id === 'l3') detail = await page.evaluate(() => ({ level: window.__l3 && window.__l3.level, cut: window.__l3 && window.__l3.cutMode }));
      if (id === 'l5') detail = await page.evaluate(() => ({ loaded: window.__l5 && window.__l5.modelStats.loaded, failed: window.__l5 && window.__l5.modelStats.failed }));
      if (id === 'l1') detail = await page.evaluate(() => ({ loaded: window.__l1 && window.__l1.assetLoaded, usingV2: window.__l1 && window.__l1.usingV2 }));
      const dts = await sampleFrames(page, SAMPLE_MS);
      result.scenarios.push({
        id, label: id.toUpperCase() + ' 关卡内', enterToSettledMs: enterMs,
        ...framesToMetrics(dts),
        info: await page.evaluate(gpuInfoScript),
        detail,
      });
      await exitLevel(page, id);
      await waitFor(async () => !(await page.evaluate(() => window.__stage.isLevel())), { timeoutMs: 25000, label: 'exit ' + id }).catch(() => {});
      await page.waitForTimeout(500);
    }
    result.errors = errors;
  } finally {
    await browser.close().catch(() => {});
    await cleanupUser();
    await server.stop();
  }

  await writeFile(OUT, JSON.stringify(result, null, 2) + '\n');
  console.log('@@BASELINE@@ ' + JSON.stringify({
    out: relative(ROOT, OUT).replace(/\\/g, '/'),
    gpu: result.env.gpu && (result.env.gpu.unmaskedRenderer || result.env.gpu.renderer),
    software: result.env.gpu && result.env.gpu.software,
    glb: result.assets,
    scenarios: result.scenarios.map((s) => ({
      id: s.id, fpsAvg: s.fpsAvg, fpsP5: s.fpsP5, frameTimeP95: s.frameTimeP95,
      calls: s.info && s.info.render && s.info.render.calls,
      tris: s.info && s.info.render && s.info.render.triangles,
      geos: s.info && s.info.memory && s.info.memory.geometries,
      texs: s.info && s.info.memory && s.info.memory.textures,
    })),
    errors: result.errors,
  }, null, 2));
}

main().catch((e) => { console.error('[PERF] ' + (e && e.stack || e)); process.exit(1); });
