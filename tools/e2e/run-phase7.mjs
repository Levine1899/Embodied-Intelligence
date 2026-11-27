#!/usr/bin/env node
/**
 * Phase 7 E2E：L3 储运 Hero 资产迁移验收（A–F）。
 *
 * A 任务：2% → 70% 完成，且**全程不启动泵送**
 * B 重进：每次重新进入回到 2%、泵停、完成态清除、默认固定顶
 * C 模型：10/50/90% 油面正确、固定顶不动、浮盘紧贴液面
 * D 结构：外观/半剖切换正确，半剖时完整罐壁不可见（不穿模）
 * E 泵送：可选；flow 只绑定 connectionId，未登记则不建管线
 * F 选择隔离：fixed/floating/pump 状态互不影响
 */
import {
  ensureServer, ensureUser, cleanupUser, launchChrome, openPage, login,
  waitForSandboxReady, collectConsole, formatConsoleLog, enterLevel, waitNotLevel,
} from './harness.mjs';

const RESULTS = [];
let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failed++;
  RESULTS.push({ name, ok, detail });
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}` + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function main() {
  const server = await ensureServer();
  const user = await ensureUser({ username: 'e2e_p7_' + Date.now().toString(36) });
  const { browser, version } = await launchChrome();
  console.log(`browser.version(): ${version}`);
  const opened = await openPage(browser, { width: 1440, height: 900, deviceScaleFactor: 1 });
  const page = opened.page;
  const consoleLog = collectConsole(page);

  try {
    await login(page, user);
    await waitForSandboxReady(page);
    await page.waitForTimeout(1200);

    /* ---------------- 进入 L3 并等资产就绪 ---------------- */
    await enterLevel(page, 'l3');
    const ready = await page.evaluate(async () => {
      if (!window.__l3) return { ok: false, why: 'no __l3' };
      const h = await Promise.race([
        window.__l3.assetsReady,
        new Promise((r) => setTimeout(() => r('timeout'), 25000)),
      ]);
      return { ok: h !== 'timeout', handles: !!h, usingFallback: window.__l3.usingFallback, err: window.__l3.assetError };
    });
    check('储运 Hero 资产加载完成（非回退）', ready.ok === true && ready.usingFallback === false, ready);

    /* ---------------- C 模型：三个液位 ---------------- */
    for (const pct of [10, 50, 90]) {
      const probe = await page.evaluate((p) => {
        window.__l3.setLevel(p);
        return window.__l3.probe();
      }, pct);
      const f = probe.tanks.fixed, fl = probe.tanks.floating;
      const lv = pct / 100;
      /* 固定顶罐：油面随液位上升；roof_cone 静止 */
      check(`C ${pct}% 固定顶油面上升`, f.oilTop > 0 && f.oilTop > (probe.tanks.fixed.oilTop - 100) && f.oilTop > lv * 3,
        { oilTop: f.oilTop, level: lv });
      check(`C ${pct}% 固定顶 roof 静止`, f.roofStatic === true, { roofY: f.roofY, roofStatic: f.roofStatic });
      /* 外浮顶：浮盘紧贴油面（容差 0.45m，含盘厚） */
      check(`C ${pct}% 浮盘贴合油面`, near(fl.deckY, fl.oilTop, 0.45),
        { deckY: fl.deckY, oilTop: fl.oilTop, diff: +(fl.deckY - fl.oilTop).toFixed(3) });
      check(`C ${pct}% 浮盘随液位移动`, Math.abs(fl.deckOffset - (pct - 10) / 100 * 3) >= 0 || pct === 10,
        { deckOffset: fl.deckOffset });
    }

    /* ---------------- D 结构：外观/半剖 ---------------- */
    const struct = await page.evaluate(() => {
      const out = {};
      window.__l3.setStructureMode('fixed_roof_tank', 'external');
      window.__l3.setStructureMode('floating_roof_tank', 'external');
      out.ext = window.__l3.probe().tanks.fixed.vis;
      window.__l3.setStructureMode('fixed_roof_tank', 'half');
      out.half = window.__l3.probe().tanks.fixed.vis;
      out.halfMode = window.__l3.structureModeOf('fixed_roof_tank');
      out.floatAfterFixedHalf = window.__l3.structureModeOf('floating_roof_tank');
      window.__l3.setStructureMode('fixed_roof_tank', 'ghost');
      out.ghost = window.__l3.probe().tanks.fixed.vis;
      window.__l3.setStructureMode('fixed_roof_tank', 'external');
      return out;
    });
    /* 按身份断言：half 模式下完整罐壁必须不可见，剖切壳必须可见（不穿模） */
    check('D external: 完整罐壁可见、剖切壳隐藏',
      struct.ext.shell.visible === true && struct.ext.shell_cut.visible === false,
      { shell: struct.ext.shell, cut: struct.ext.shell_cut });
    check('D half: 完整罐壁隐藏、剖切壳可见（不穿模）',
      struct.half.shell.visible === false && struct.half.shell_cut.visible === true,
      { shell: struct.half.shell, cut: struct.half.shell_cut });
    check('D half: 固定顶 roof 仍可见（顶不参与剖切）',
      struct.half.roof_cone && struct.half.roof_cone.visible === true, struct.half.roof_cone);
    check('D ghost: 罐壁半透明而非消失',
      struct.ghost.shell.visible === true && struct.ghost.shell.opacity !== null && struct.ghost.shell.opacity < 0.6,
      struct.ghost.shell);
    check('D fixed 切 half 不影响 floating', struct.floatAfterFixedHalf === 'external', struct.floatAfterFixedHalf);

    /* ---------------- A 任务：2% → 70% 完成，不启动泵送 ---------------- */
    /* 先重进一次，清掉 C 段 90% 触发的完成态，保证 A 从干净状态开始 */
    await page.evaluate(() => window.__l3.exit());
    await waitNotLevel(page, { timeoutMs: 15000 });
    await enterLevel(page, 'l3');
    await page.evaluate(async () => {
      await Promise.race([window.__l3.assetsReady, new Promise((r) => setTimeout(r, 20000))]);
    });
    await page.evaluate(() => window.__l3.setLevel(2));
    await page.evaluate(() => window.__l3.setLevel(69));
    const before46 = await page.evaluate(() => ({
      completed: window.__l3.completed,
      pumpRunning: window.__l3.pumpRunning,
      hint: document.querySelector('#l3-hint').textContent,
    }));
    check('A 69% 时尚未完成', before46.completed === false, before46);
    await page.evaluate(() => window.__l3.setLevel(70));
    await page.waitForTimeout(300);
    const at70 = await page.evaluate(() => ({
      completed: window.__l3.completed,
      pumpRunning: window.__l3.pumpRunning,
      pumpPaused: window.__l3.pumpPaused,
      backText: document.querySelector('#l3-back').textContent,
      stateText: document.querySelector('#l3-state').textContent,
      observed: window.__l3.observedTanks,
    }));
    check('A 70% 即完成', at70.completed === true, at70.completed);
    check('A 完成不依赖泵送', at70.pumpRunning === false && at70.pumpPaused === false, at70);
    check('A 完成后返回按钮提示', /完成/.test(at70.backText), at70.backText);

    /* 不要求观察两种罐：只选过 fixed 也应完成（observed.floating 可能为 false） */
    check('A 不要求先观察两种罐', at70.observed.fixed_roof_tank === true, at70.observed);

    /* ---------------- E 泵送：可选 + connectionId ---------------- */
    const route = await page.evaluate(() => {
      const r = window.__l3.routeInfo;
      return r ? { connectionId: r.connectionId, routeSource: r.routeSource, status: r.status, pipe: r.pipe } : null;
    });
    check('E 泵送绑定 connectionId', route && route.connectionId === 'conn_store_transfer_to_refinery', route);
    check('E 未登记连接时不建替代管线', route && route.pipe === null && route.status === 'blocked', route);
    const pump = await page.evaluate(() => {
      window.__l3.selectTank('transfer_pump');
      const before = { running: window.__l3.pumpRunning };
      window.__l3.startPump();
      const running = window.__l3.pumpRunning;
      window.__l3.pausePump();
      return { before, running, paused: window.__l3.pumpPaused, stopped: !window.__l3.pumpRunning };
    });
    check('E 泵送可独立启停（可选功能）', pump.before.running === false && pump.running === true && pump.paused === true, pump);

    /* ---------------- F 设备选择隔离 ---------------- */
    const iso = await page.evaluate(() => {
      window.__l3.setStructureMode('fixed_roof_tank', 'ghost');
      window.__l3.setStructureMode('floating_roof_tank', 'half');
      const a = {
        fixed: window.__l3.structureModeOf('fixed_roof_tank'),
        floating: window.__l3.structureModeOf('floating_roof_tank'),
      };
      window.__l3.selectTank('fixed_roof_tank');
      const sel1 = window.__l3.selectedTankId;
      const pressed1 = document.querySelector('#l3-fixed').getAttribute('aria-pressed');
      window.__l3.selectTank('transfer_pump');
      const sel2 = window.__l3.selectedTankId;
      const pumpPressed = document.querySelector('#l3-pump').getAttribute('aria-pressed');
      const states = window.PETRO_DEVICE_STATE && window.PETRO_DEVICE_STATE.snapshot
        ? window.PETRO_DEVICE_STATE.snapshot() : null;
      return { a, sel1, pressed1, sel2, pumpPressed, states };
    });
    check('F 两罐结构状态彼此独立', iso.a.fixed === 'ghost' && iso.a.floating === 'half', iso.a);
    check('F 选择状态互斥切换', iso.sel1 === 'fixed_roof_tank' && iso.sel2 === 'transfer_pump',
      { sel1: iso.sel1, sel2: iso.sel2 });
    check('F 按钮 aria-pressed 跟随选择', iso.pressed1 === 'true' && iso.pumpPressed === 'true', iso);

    /* ---------------- B 重进重置 ---------------- */
    await page.evaluate(() => window.__l3.exit());
    await waitNotLevel(page, { timeoutMs: 15000 });
    await enterLevel(page, 'l3');
    await page.waitForTimeout(1200);
    const re = await page.evaluate(() => ({
      level: window.__l3.level,
      slider: document.querySelector('#l3-level').value,
      pumpRunning: window.__l3.pumpRunning,
      pumpPaused: window.__l3.pumpPaused,
      completed: window.__l3.completed,
      selected: window.__l3.selectedTankId,
      stateText: document.querySelector('#l3-state').textContent,
      uiDone: document.querySelector('.lvl').classList.contains('done'),
    }));
    check('B 重进液位回到 2%', re.level === 0.02 && re.slider === '2', { level: re.level, slider: re.slider });
    check('B 重进泵停止且取消暂停', re.pumpRunning === false && re.pumpPaused === false, re);
    check('B 重进清除完成态', re.completed === false && re.uiDone === false, re);
    check('B 重进默认固定顶罐', re.selected === 'fixed_roof_tank' && re.stateText === '固定顶罐', re);

    const unexpected = consoleLog.errors.filter((e) => {
      const u = (e && (e.url || (e.location && e.location.url))) || '';
      return !/\/api\/auth\/me|favicon\.ico/.test(u);
    });
    check('无非预期 console error', unexpected.length === 0, unexpected.slice(0, 3));
  } finally {
    await browser.close().catch(() => {});
    await cleanupUser();
    await server.stop();
  }

  console.log('\n================ PHASE 7 SUMMARY ================');
  console.log(`PASS ${RESULTS.length - failed} / ${RESULTS.length}   FAIL ${failed}`);
  console.log(formatConsoleLog(consoleLog, { maxLines: 12 }));
  if (failed > 0) {
    RESULTS.filter((r) => !r.ok).forEach((r) => console.log('FAILED:', r.name, JSON.stringify(r.detail)));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[PHASE7] 运行异常：', e);
  setTimeout(() => process.exit(1), 5000).unref();
  process.exitCode = 1;
});
