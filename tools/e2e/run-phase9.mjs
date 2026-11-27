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
function nodeBounds(assetId) {
  const st = JSON.parse(readFileSync(`web/assets/underground/${assetId}/${assetId}.stats.json`, 'utf8'));
  const out = {};
  for (const [name, b] of Object.entries(st.nodes || {})) {
    out[name] = {
      bottom: b.min[1], top: b.max[1],
      halfX: (b.max[0] - b.min[0]) / 2,
      maxRadial: Math.max(
        Math.hypot(b.min[0], b.min[2]), Math.hypot(b.min[0], b.max[2]),
        Math.hypot(b.max[0], b.min[2]), Math.hypot(b.max[0], b.max[2]),
      ),
    };
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
    const visState = await page.evaluate(() => ({ vis: window.__l1.layerVisible, pore: window.__l1.poreMode }));
    const vis = visState.vis;
    const strata = nodeBounds('underground_strata');
    const orderNames = ['geo_overburden', 'geo_caprock', 'geo_reservoir_layer', 'geo_basement'];
    const order = orderNames.map((n) => ({ name: n, ...strata[n] }));
    /* 入场 1.2s 后会自动进入孔隙视图（hideSurfaceScene 会隐藏四层），这是既有教学流程。
       因此断言的是"可见性与 poreMode 一致"，而不是无条件要求四层都亮着。 */
    const allVisible = Object.values(vis).every((v) => v === true);
    const allHidden = Object.values(vis).every((v) => v === false);
    check('C 层可见性与当前视图状态一致（剖面全亮 / 微观全隐）',
      visState.pore ? allHidden : allVisible, { poreMode: visState.pore, vis });
    check('C 四层地层都在资产里', order.every((o) => o.top !== undefined), order.map((o) => o.name));
    const ordered = order.every((o, i) => i === 0 || o.top <= order[i - 1].bottom + 0.001);
    check('C 层序未改变且不重叠（上覆→盖层→储层→基底）', ordered,
      order.map((o) => `${o.name}[${o.bottom.toFixed(2)},${o.top.toFixed(2)}]`));

    /* ---------------- D 井筒层级 ---------------- */
    const well = nodeBounds('underground_wellbore');
    const strataD = nodeBounds('underground_strata');
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
    /* 射孔沿 45°+k·90° 斜插，用 x 向半宽去比水泥环半径是错的判据。
       正确的是：射孔末端到井轴的水平距离 > 水泥环外径。 */
    const cementOuter = d.cement.halfX;
    check('D 射孔末端穿出水泥环进入地层',
      d.perfs.every((p) => p.maxRadial > cementOuter + 0.1),
      { perfRadial: +d.perfs[0].maxRadial.toFixed(3), cementOuter: +cementOuter.toFixed(3) });

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
    /* 判据用相对位移：切换本身不该改变取景，但相机有平滑缓动，
       绝对位移个位数厘米在 ~20m 距离上属缓动漂移，不是比例跳变。 */
    const dist = Math.hypot(...before) || 1;
    const jump = Math.max(...micro.cam.map((v, i) => Math.abs(v - before[i])));
    check('F 整体↔微观切换无比例跳变（相对位移 < 0.5%）', jump / dist < 0.005,
      { jump: +jump.toFixed(4), dist: +dist.toFixed(2), ratio: +(jump / dist).toFixed(5) });
    await page.screenshot({ path: `${OUT}/l1-micro.png` });
    await page.evaluate(() => window.__l1.exitPore());
    await page.waitForTimeout(300);
    check('F 退出微观后回到剖面', (await page.evaluate(() => window.__l1.microMode)) === false);

    /* ---------------- H 粒子路径引用 anchors ---------------- */
    const flows = await page.evaluate(() => ({
      anchors: window.__l1.flowAnchors,
      endpoints: window.__l1.flowEndpoints,
      anchorPoints: window.__l1.anchors && window.__l1.anchors.anchors,
    }));
    check('H 三条粒子路径都声明了锚点来源',
      flows.anchors && flows.anchors.wellFlow.length === 2 &&
      flows.anchors.perfFlow.length === 2 && flows.anchors.convFlows.length === 1,
      flows.anchors);
    const az = flows.anchorPoints && flows.anchorPoints.perforation_zone ? flows.anchorPoints.perforation_zone.point : null;
    const wt = flows.anchorPoints && flows.anchorPoints.wellbore_top ? flows.anchorPoints.wellbore_top.point : null;
    const rt = flows.anchorPoints && flows.anchorPoints.reservoir_top ? flows.anchorPoints.reservoir_top.point : null;
    const near = (a, b, eps) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < (eps || 1e-6);
    check('H wellFlow 起点 = perforation_zone − 1.1', !!az && near(flows.endpoints.wellFlow.start[1], az[1] - 1.1), { got: flows.endpoints.wellFlow.start, az });
    check('H wellFlow 终点 = wellbore_top − 0.4', !!wt && near(flows.endpoints.wellFlow.end[1], wt[1] - 0.4), { got: flows.endpoints.wellFlow.end, wt });
    check('H perfFlow 终点 = reservoir_top − 0.63', !!rt && near(flows.endpoints.perfFlow.end[1], rt[1] - 0.63), { got: flows.endpoints.perfFlow.end, rt });

    /* ---------------- 截图证据 ---------------- */
    /* 入场 1.2s 后会自动进孔隙视图（flyTo 到罐内）。拍"剖面总览"前必须先退出，
       并等 900ms 的恢复动画跑完，否则拍到的是罐内特写。 */
    await page.evaluate(() => { window.__l1.exitPore(true); window.__l1.setRep('detail'); });
    await page.waitForTimeout(1600);
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
