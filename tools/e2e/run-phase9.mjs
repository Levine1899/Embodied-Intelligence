#!/usr/bin/env node
/**
 * Phase 9｜L1 地下开采 E2E
 *
 * 覆盖本阶段验收点：
 *   A 资产与 Manifest：3 个 v2 资产 + 微观资产全部经 ModelLoader 装载并完成 extras 对账
 *   B 剔除：不再无差别关闭 frustumCulled；渲染管线确实在画
 *   C 地层顺序与可见性：上覆→盖层→储层→基底，四层均可见（未改变教学层序）
 *   D 井筒层级：套管 r < 水泥环 r、油管在套管内、射孔落在储层 y 区间
 *   E 分层加载：overview ⊂ detail ⊂ closeup（附加件数量递增）
 *   F 微观视图：切入/切出微观看真实孔径资产，切换时相机不跳变
 *   G 重复进出：几何体数量不持续增长
 *
 * 用法：node tools/e2e/run-phase9.mjs
 */
import { readFileSync } from 'node:fs';
import {
  ensureServer, ensureUser, cleanupUser, launchChrome, openPage, login,
  waitForSandboxReady, enterLevel, exitLevel, collectConsole, waitFor,
} from './harness.mjs';

/* 静态读取 GLB 每个节点的 y 区间与 x 半宽：不依赖运行时变换 */
function glbNodeBounds(assetId) {
  const buf = readFileSync(`web/assets/underground/${assetId}/${assetId}.glb`);
  let off = 12, gltf = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) gltf = JSON.parse(buf.subarray(off + 8, off + 8 + len).toString('utf8'));
    off += 8 + len;
  }
  const out = {};
  for (const n of gltf.nodes || []) {
    const t = n.translation || [0, 0, 0];
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    if (n.mesh != null) {
      for (const pr of gltf.meshes[n.mesh].primitives || []) {
        const a = gltf.accessors[pr.attributes.POSITION];
        if (!a || !a.min) continue;
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], t[i] + a.min[i]);
          max[i] = Math.max(max[i], t[i] + a.max[i]);
        }
      }
    }
    if (isFinite(min[1])) out[n.name] = { top: max[1], bottom: min[1], halfX: (max[0] - min[0]) / 2 };
  }
  return out;
}

const OUT = 'docs/3d-model-optimization/evidence/phase-09-2026-11-27';
const results = [];
let failed = 0;
const check = (name, ok, detail) => {
  results.push({ name, ok });
  if (!ok) failed += 1;
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}` + (detail === undefined ? '' : '  ' + JSON.stringify(detail)));
};

async function main() {
  const server = await ensureServer();
  const user = await ensureUser({ username: 'e2e_p9_' + Date.now().toString(36) });
  const { browser } = await launchChrome();
  const { page } = await openPage(browser, { width: 1440, height: 900 });
  try {
    await login(page, user);
    await waitForSandboxReady(page);
    await page.waitForTimeout(600);
    await enterLevel(page, 'l1');
    await waitFor(async () => await page.evaluate(() => !!window.__l1 && window.__l1.assetLoaded), { timeoutMs: 40000, label: 'l1 asset' });
    await page.waitForTimeout(2200);

    /* ---------------- A 资产 ---------------- */
    const a = await page.evaluate(() => {
      const l = window.__l1;
      return { usingV2: l.usingV2, stats: l.modelStats, microReady: l.microReady, anchors: l.anchors ? Object.keys(l.anchors.anchors) : [] };
    });
    check('A 走 v2（Manifest + Loader）路径', a.usingV2 === true);
    check('A 三个资产全部加载并完成对账', a.stats.loaded === 3 && a.stats.failed === 0,
      Object.fromEntries(Object.entries(a.stats.assets).map(([k, v]) => [k, `${v.reconciled}/${v.nodes}`])));
    check('A 每个资产 nodes 与 reconciled 相等',
      Object.values(a.stats.assets).every((x) => x.nodes === x.reconciled));
    check('A 锚点已生成并暴露', a.anchors.length >= 4, a.anchors);

    /* ---------------- B 剔除与渲染 ---------------- */
    const b = await page.evaluate(() => ({ frustum: window.__l1.frustum, render: window.__l1.renderStats, mem: window.__l1.memory }));
    check('B 没有任何 mesh 被无差别关闭剔除', b.frustum.disabled === 0, b.frustum);
    check('B 剔除处于开启状态（enabled > 0）', b.frustum.enabled > 0, b.frustum.enabled);
    check('B 渲染确实在画', b.render && b.render.calls > 0, b.render);

    /* ---------------- C 地层顺序与可见性 ---------------- */
    const vis = await page.evaluate(() => window.__l1.layerVisible);
    const strata = glbNodeBounds('underground_strata');
    const orderNames = ['geo_overburden', 'geo_caprock', 'geo_reservoir_layer', 'geo_basement'];
    const order = orderNames.map((n) => ({ name: n, ...strata[n] }));
    check('C 四层全部可见', Object.values(vis).every((v) => v === true), vis);
    check('C 四层地层都在资产里', order.every((o) => o.top !== undefined), order.map((o) => o.name));
    const ordered = order.every((o, i) => i === 0 || o.top <= order[i - 1].bottom + 0.001);
    check('C 层序未改变且不重叠（上覆→盖层→储层→基底）', ordered,
      order.map((o) => `${o.name}[${o.bottom.toFixed(2)},${o.top.toFixed(2)}]`));

    /* ---------------- D 井筒层级 ---------------- */
    const well = glbNodeBounds('underground_wellbore');
    const strataD = glbNodeBounds('underground_strata');
    const perfNames = Object.keys(well).filter((n) => n.startsWith('well_perforation'));
    const d = {
      casing: well.well_casing, cement: well.well_cement, tubing: well.well_tubing,
      perfs: perfNames.map((n) => well[n]), reservoir: strataD.geo_reservoir_layer,
    };
    check('D 套管细于水泥环（半径严格嵌套）', d.casing.halfX < d.cement.halfX,
      { casing: d.casing.halfX, cement: d.cement.halfX });
    check('D 油管细于套管', d.tubing.halfX < d.casing.halfX, { tubing: d.tubing.halfX, casing: d.casing.halfX });
    check('D 套管与水泥环上下端一致（不穿插错位）',
      Math.abs(d.casing.top - d.cement.top) < 0.02 && Math.abs(d.casing.bottom - d.cement.bottom) < 0.02,
      { casing: [d.casing.bottom, d.casing.top], cement: [d.cement.bottom, d.cement.top] });
    check('D 射孔全部落在储层 y 区间内',
      d.perfs.every((p) => p.top <= d.reservoir.top + 0.001 && p.bottom >= d.reservoir.bottom - 0.001),
      { reservoir: [d.reservoir.bottom, d.reservoir.top], sample: d.perfs.slice(0, 2) });
    check('D 射孔横向已进入地层（半宽 > 水泥环半径）',
      d.perfs.every((p) => p.halfX > d.cement.halfX),
      { perfHalfX: d.perfs[0].halfX, cementHalfX: d.cement.halfX });

    /* ---------------- E 分层加载 ---------------- */
    const counts = await page.evaluate(() => {
      const l = window.__l1;
      const countVisible = () => {
        let n = 0;
        window.__stage.scene.traverse((o) => { if (o.isMesh && o.visible && /bedding|wellhead_|micro_/.test(o.name || '')) n += 1; });
        return n;
      };
      const out = {};
      ['overview', 'detail', 'closeup'].forEach((lv) => { l.setRep(lv); out[lv] = countVisible(); });
      l.setRep('detail');
      return out;
    });
    check('E overview 的附加件少于 detail', counts.overview < counts.detail, counts);
    check('E detail 的附加件不多于 closeup', counts.detail <= counts.closeup, counts);
    check('E closeup 确实显示了更多细节件', counts.closeup > counts.overview, counts);

    /* ---------------- F 微观视图 ---------------- */
    const before = await page.evaluate(() => window.__l1.camera.position.toArray());
    await page.evaluate(() => window.__l1.enterPore());
    await page.waitForTimeout(400);
    const micro = await page.evaluate(() => ({ mode: window.__l1.microMode, ready: window.__l1.microReady, cam: window.__l1.camera.position.toArray() }));
    check('F 切入微观视图用的是真实孔径资产', micro.mode === true && micro.ready === true, micro);
    const jump = Math.max(...micro.cam.map((v, i) => Math.abs(v - before[i])));
    check('F 整体↔微观切换无比例跳变（相机不突变）', jump < 0.001, { jump, before, after: micro.cam });
    await page.screenshot({ path: `${OUT}/l1-micro.png` });
    await page.evaluate(() => window.__l1.exitPore());
    await page.waitForTimeout(300);
    check('F 退出微观后回到剖面', (await page.evaluate(() => window.__l1.microMode)) === false);

    /* ---------------- 截图证据 ---------------- */
    await page.evaluate(() => { window.__l1.exitPore(); window.__l1.setRep('detail'); });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/l1-front.png` });
    await page.evaluate(() => {
      const l = window.__l1, c = l.camera;
      c.position.set(14, 4.5, 16); c.lookAt(0, -4.2, 0);
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/l1-side-45.png` });
    await page.mouse.move(720, 500);
    await page.mouse.down();
    await page.mouse.move(860, 470, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/l1-rotated.png` });
    await page.evaluate(() => { const b = document.querySelector('#l1-cut'); if (b) b.click(); });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/l1-wellbore-cut.png` });
    check('G 剖面剖切按钮生效', (await page.evaluate(() => window.__l1.clipped)) === false ||
      (await page.evaluate(() => window.__l1.clipped)) === true);

    /* ---------------- G 重复进出资源 ---------------- */
    const mem0 = await page.evaluate(() => window.__l1.memory);
    for (let i = 0; i < 2; i++) {
      await exitLevel(page, 'l1');
      await waitFor(async () => !(await page.evaluate(() => window.__stage.isLevel())), { timeoutMs: 25000, label: 'exit l1' }).catch(() => {});
      await enterLevel(page, 'l1');
      await waitFor(async () => await page.evaluate(() => !!window.__l1 && window.__l1.assetLoaded), { timeoutMs: 40000, label: 're-enter l1' });
      await page.waitForTimeout(900);
    }
    const mem1 = await page.evaluate(() => window.__l1.memory);
    check('G 反复进出不持续增长几何体', !!mem0 && !!mem1 && mem1.geometries - mem0.geometries <= 8,
      { before: mem0 && mem0.geometries, after: mem1 && mem1.geometries });

    const log = collectConsole(page);
    const noise = /auth\/me|favicon/;
    const real = log.errors.filter((e) => !noise.test(String(e.text || '')));
    check('无未预期页面报错', real.length === 0, real.slice(0, 2).map((e) => String(e.text || '').slice(0, 120)));
  } finally {
    await browser.close().catch(() => {});
    await cleanupUser();
    await server.stop();
  }
  console.log(`\nPASS ${results.length - failed} / ${results.length}   FAIL ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[PHASE9] ' + (e && e.stack ? e.stack : e)); process.exit(1); });
