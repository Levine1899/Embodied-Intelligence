/**
 * tools/e2e/run-levels.mjs — 关卡 E2E（L2 结构 / L4 工艺连接 / L3 储运初态与完成）。
 *
 * 只用「只读调试 API + DOM 状态」判断，不用截图 hash。
 *   - 只读 API：window.__l2 / __l3 / __l4 / __stage / PETRO_DEVICE_STATE.snapshot()
 *   - DOM：只在 API 观察不到的地方补（L3 的当前罐型是闭包变量 selectedTankId，
 *     __l3 没有暴露 getter，于是读 #l3-state / #l3-fixed[aria-pressed] / #l3-pct / #l3-level）
 *
 * 用法：node tools/e2e/run-levels.mjs
 * 可选环境变量：PETRO_EVIDENCE_DIR、PETRO_CHROME、PETRO_HEADFUL=1、PETRO_BASE_URL
 */

import {
  BASE_URL,
  cleanupUser,
  collectConsole,
  createSuite,
  ensureServer,
  ensureUser,
  exitLevel,
  enterLevel,
  formatConsoleLog,
  launchChrome,
  login,
  openPage,
  reportAndExit,
  saveArtifacts,
  waitFor,
  waitForSandboxReady,
} from './harness.mjs';

const VIEWPORT = { width: 1440, height: 900 };

/** L2 的三态由 manifest 的 structureModes 决定；l2.js 暴露 structureModes getter。 */
const L2_EXPECTED_MODES = ['external', 'half', 'ghost'];
const L2_ROUNDS = 20;

/** L4 的设备身份契约（web/levels/l4.js 的 DEVICE_IDS，权威归属来自 tower.manifest.json 的 objects[]）。 */
const L4_DEVICE_IDS = [
  'atmospheric_tower', 'vacuum_tower', 'heater',
  'stripper_naphtha', 'stripper_kerosene', 'stripper_diesel',
  'overhead_condenser', 'reflux_drum',
];

/** L3 初态：液位 2%、泵停止、未完成、默认固定顶罐。 */
const L3_INITIAL_LEVEL = 0.02;
const L3_COMPLETE_TARGET_PCT = 70;

/* ------------------------------------------------------------------ *
 * 页面内取数函数（必须自包含，不能引用模块作用域）
 * ------------------------------------------------------------------ */

/** 退出关卡并把 exit() 的异常 / 耗时记进证据（异常不再被静默吞掉）。 */
async function exitAndCheck(page, id, suite) {
  const result = await exitLevel(page, id);
  suite.note(`exit(${id}).ms`, result.exitMs);
  if (result.error) suite.ok(`exit(${id}) 无异常`, false, result.error.message);
  return result;
}

function readL2State() {
  const api = window.__l2;
  return {
    isLevel: window.__stage.isLevel(),
    assetLoaded: api.assetLoaded,
    assetFailed: api.assetFailed,
    structureMode: api.structureMode,
    structureModes: api.structureModes,
    deviceStructure: (() => {
      const snap = window.PETRO_DEVICE_STATE ? window.PETRO_DEVICE_STATE.snapshot() : null;
      const dev = snap && snap.devices ? snap.devices.three_phase_separator : null;
      return dev ? { structure: dev.structure, selection: dev.selection } : null;
    })(),
  };
}

function readL3State() {
  const el = sel => document.querySelector(sel);
  const text = sel => {
    const node = el(sel);
    return node ? String(node.textContent || '').trim() : null;
  };
  const attr = (sel, name) => {
    const node = el(sel);
    return node ? node.getAttribute(name) : null;
  };
  const klass = (sel, name) => {
    const node = el(sel);
    return node ? node.classList.contains(name) : null;
  };
  const api = window.__l3 || {};
  const snap = window.PETRO_DEVICE_STATE ? window.PETRO_DEVICE_STATE.snapshot() : null;
  return {
    isLevel: window.__stage.isLevel(),
    // —— 只读 API ——
    level: api.level,
    pumpRunning: api.pumpRunning,
    pumpPaused: api.pumpPaused,
    completed: api.completed,
    cutMode: api.cutMode,
    selectedObjectId: snap ? snap.selectedObjectId : null,
    lastInteraction: api.lastInteraction || null,
    routeInfo: api.routeInfo
      ? { startError: api.routeInfo.startError, endError: api.routeInfo.endError, hasCurve: !!api.routeInfo.curveStartWorld }
      : null,
    // —— DOM（补 API 观察不到的「当前选中罐型」与 UI 完成态）——
    dom: {
      sliderValue: el('#l3-level') ? el('#l3-level').value : null,
      levelText: text('#l3-pct'),
      tankName: text('#l3-state'),
      fixedPressed: attr('#l3-fixed', 'aria-pressed'),
      floatPressed: attr('#l3-float', 'aria-pressed'),
      pumpPressed: attr('#l3-pump', 'aria-pressed'),
      spaceText: text('#l3-space'),
      hintText: text('#l3-hint'),
      backText: text('#l3-back'),
      backPulse: klass('#l3-back', 'pulse'),
      uiDone: klass('.lvl.on', 'done'),
      actHidden: el('#l3-act') ? el('#l3-act').hidden : null,
    },
  };
}

async function readL4Connections() {
  const ready = !!(window.__l4Connections
    && Array.isArray(window.__l4Connections.handles)
    && window.__l4Connections.handles.length >= 1);
  if (!ready) return { ready: false };
  const handles = window.__l4Connections.handles;
  const describe = handle => ({
    id: handle.id,
    groupName: handle.group ? handle.group.name : null,
    points: Array.isArray(handle.points) ? handle.points.length : 0,
    particles: Array.isArray(handle.particles) ? handle.particles.length : 0,
    visible: handle.visible || null,
    hasCurve: !!handle.curve,
    statusLabel: handle.group && handle.group.userData ? handle.group.userData.statusLabel : null,
  });
  return {
    ready: true,
    count: handles.length,
    first: describe(handles[0]),
    all: handles.map(describe),
    summary: window.__l4Connections.summary || null,
    loaded: window.__l4 && window.__l4.loaded,
    isolated: window.__l4 && window.__l4.isolated,
    groups: window.__l4 && window.__l4.groups,
  };
}

async function readL4Identity() {
  const res = await fetch('assets/tower/tower.manifest.json', { cache: 'no-store' });
  const manifest = res.ok ? await res.json() : null;
  const l4Ids = (window.__l4 && window.__l4.detailBindings) || [];
  const objects = manifest ? (manifest.objects || []) : [];
  const snapshot = window.PETRO_DEVICE_STATE ? window.PETRO_DEVICE_STATE.snapshot() : null;
  const detailGroups = (window.__l4 && window.__l4.detailGroups) || {};
  const rows = l4Ids.map(id => {
    const obj = objects.find(item => item.objectId === id) || null;
    const dev = snapshot && snapshot.devices ? snapshot.devices[id] : null;
    const group = detailGroups[id] || null;
    return {
      objectId: id,
      inManifest: !!obj,
      manifestDisplayName: obj ? obj.displayName : null,
      manifestNodeCount: obj && Array.isArray(obj.nodeUids) ? obj.nodeUids.length : 0,
      hasDetailRepresentation: !!(dev && Array.isArray(dev.representations)
        && dev.representations.indexOf('detail') >= 0),
      detailGroupChildren: group ? group.children : null,
      detailGroupVisible: group ? group.visible : null,
    };
  });
  const manifestDeviceIds = objects
    .map(item => item.objectId)
    .filter(id => l4Ids.indexOf(id) >= 0);
  return {
    manifestAvailable: !!manifest,
    l4Ids,
    manifestDeviceIds,
    rows,
    selectedObjectId: snapshot ? snapshot.selectedObjectId : null,
    snapshotDeviceIds: snapshot && snapshot.devices ? Object.keys(snapshot.devices) : [],
  };
}

/* ------------------------------------------------------------------ *
 * L2：结构模式（三态 + 20 轮 × 3 模式 + 退出/重进复位）
 * ------------------------------------------------------------------ */

async function runL2(page, suite) {
  const enter = await enterLevel(page, 'l2');
  suite.note('enter.enterMs', enter.enterMs);
  suite.note('enter.waitNotLevelMs', enter.waitedNotLevelMs);

  const state = await page.evaluate(readL2State);
  suite.ok('enter: stage.isLevel()', state.isLevel === true, state.isLevel);
  suite.ok('enter: assetLoaded', state.assetLoaded === true && state.assetFailed === false, {
    assetLoaded: state.assetLoaded, assetFailed: state.assetFailed,
  });
  suite.ok('enter: structureModes 契约', JSON.stringify(state.structureModes) === JSON.stringify(L2_EXPECTED_MODES), state.structureModes);
  suite.equal('enter: 初始 structureMode', state.structureMode, 'external');
  suite.note('enter.deviceStructure', state.deviceStructure);

  // 1) 三种模式各自：setStructureMode → structureMode 读回 → structureProbe().ok
  const perMode = [];
  for (const mode of L2_EXPECTED_MODES) {
    const probe = await page.evaluate(mode => {
      window.__l2.setStructureMode(mode);
      const probe = window.__l2.structureProbe();
      return {
        readback: window.__l2.structureMode,
        ok: probe.ok,
        manifest: probe.manifest,
        counts: probe.counts,
        violations: (probe.violations || []).slice(0, 8),
        deviceStructure: (window.PETRO_DEVICE_STATE.snapshot().devices.three_phase_separator || {}).structure,
      };
    }, mode);
    perMode.push({ mode, ...probe });
    suite.equal(`mode.${mode}.readback`, probe.readback, mode);
    suite.ok(`mode.${mode}.structureProbe.ok`, probe.ok === true, {
      violations: probe.violations, counts: probe.counts,
    });
    suite.ok(`mode.${mode}.manifest 已加载（不是空 manifest 的假通过）`, probe.manifest === true, probe.manifest);
    suite.atLeast(`mode.${mode}.nodes`, probe.counts ? probe.counts.total : 0, 1);
    suite.equal(`mode.${mode}.violations`, probe.counts ? probe.counts.violations : -1, 0);
    suite.equal(`mode.${mode}.deviceState.structure`, probe.deviceStructure, mode);
    const shot = await saveArtifacts('levels', page, `l2-${mode}`);
    if (shot) suite.note(`screenshot.${mode}`, shot);
  }

  // 2) 连续 20 轮 × 3 模式，全部 ok
  const loop = await page.evaluate(({ modes, rounds }) => {
    const failures = [];
    let probes = 0;
    const seenModes = {};
    for (let round = 1; round <= rounds; round++) {
      for (const mode of modes) {
        window.__l2.setStructureMode(mode);
        const probe = window.__l2.structureProbe();
        const readback = window.__l2.structureMode;
        probes++;
        seenModes[readback] = (seenModes[readback] || 0) + 1;
        if (!probe || probe.ok !== true || readback !== mode || !probe.manifest) {
          failures.push({
            round,
            mode,
            readback,
            ok: probe && probe.ok,
            manifest: probe && probe.manifest,
            violations: (probe && probe.violations ? probe.violations : []).slice(0, 3),
          });
        }
      }
    }
    return { rounds, probes, failures, seenModes };
  }, { modes: L2_EXPECTED_MODES, rounds: L2_ROUNDS });

  suite.equal('loop.rounds', loop.rounds, L2_ROUNDS);
  suite.equal(`loop.probes（${L2_ROUNDS}×${L2_EXPECTED_MODES.length}）`, loop.probes, L2_ROUNDS * L2_EXPECTED_MODES.length);
  suite.ok('loop 全部 ok', loop.failures.length === 0, loop.failures.slice(0, 5));
  suite.note('loop.seenModes', loop.seenModes);

  // 3) exit → structureMode === 'external'；重进仍 external
  const beforeExitMode = await page.evaluate(() => window.__l2.structureMode);
  suite.equal('loop 结束时停在最后一个模式', beforeExitMode, 'ghost');
  await exitAndCheck(page, 'l2', suite);
  const afterExit = await page.evaluate(() => ({
    isLevel: window.__stage.isLevel(),
    structureMode: window.__l2.structureMode,
    deviceStructure: (window.PETRO_DEVICE_STATE.snapshot().devices.three_phase_separator || {}).structure,
  }));
  suite.equal('exit: stage.isLevel() false', afterExit.isLevel, false);
  suite.equal('exit: structureMode 复位 external', afterExit.structureMode, 'external');
  suite.equal('exit: deviceState.structure 复位 external', afterExit.deviceStructure, 'external');

  await enterLevel(page, 'l2');
  const reEnter = await page.evaluate(readL2State);
  suite.equal('re-enter: structureMode 仍是 external', reEnter.structureMode, 'external');
  suite.ok('re-enter: assetLoaded', reEnter.assetLoaded === true, reEnter.assetLoaded);
  suite.note('re-enter', { structureMode: reEnter.structureMode, assetLoaded: reEnter.assetLoaded });
  await exitAndCheck(page, 'l2', suite);
  suite.equal('re-enter 后 exit 再次复位 external',
    await page.evaluate(() => window.__l2.structureMode), 'external');
}

/* ------------------------------------------------------------------ *
 * L4：工艺连接 + manifest 驱动的节点身份
 * ------------------------------------------------------------------ */

async function runL4(page, suite) {
  const enter = await enterLevel(page, 'l4');
  suite.note('enter.enterMs', enter.enterMs);
  suite.note('enter.waitNotLevelMs', enter.waitedNotLevelMs);

  // __l4Connections 在 tower.obj 加载完后、connections.load() 解析完才出现
  await waitFor(() => page.evaluate(() => !!(window.__l4Connections
    && Array.isArray(window.__l4Connections.handles)
    && window.__l4Connections.handles.length >= 1)), {
    timeoutMs: 60000,
    intervalMs: 100,
    label: 'L4 __l4Connections.handles.length >= 1',
  });

  const conn = await page.evaluate(readL4Connections);
  suite.ok('__l4.loaded', conn.loaded === true, conn.loaded);
  suite.atLeast('__l4Connections.handles.length', conn.count, 1);
  suite.matches('handles[0].id 是 connectionId', conn.first.id, /^conn_/);
  suite.atLeast('handles[0].particles', conn.first.particles, 1);
  suite.atLeast('handles[0].points', conn.first.points, 2);
  suite.ok('handles[0].visible.detail', !!(conn.first.visible && conn.first.visible.detail === true), conn.first.visible);
  suite.ok('handles[0] 有 curve（可插值）', conn.first.hasCurve === true, conn.first.hasCurve);
  suite.note('handles[0]', conn.first);
  suite.note('connections', {
    count: conn.count,
    ids: conn.all.map(h => h.id),
    particleCounts: conn.all.map(h => h.particles),
    statusLabels: Array.from(new Set(conn.all.map(h => h.statusLabel).filter(Boolean))),
  });
  suite.ok('每个 handle 都有 id 与粒子', conn.all.every(h => /^conn_/.test(h.id) && h.particles > 0), {
    bad: conn.all.filter(h => !/^conn_/.test(h.id) || !(h.particles > 0)).map(h => h.id),
  });
  if (conn.summary) {
    suite.atLeast('summary 条目数', Array.isArray(conn.summary) ? conn.summary.length : 0, 1);
    const renderable = (conn.summary || []).filter(row => row.renderable);
    suite.atLeast('summary.renderable', renderable.length, 1);
    suite.note('summary', (conn.summary || []).map(row => ({
      id: row.connectionId, renderable: row.renderable, statusLabel: row.statusLabel,
    })));
  } else {
    suite.note('summary', '(connections.resolvedSummary() 未返回，跳过 summary 断言)');
  }
  suite.note('groups', conn.groups);
  suite.note('isolated(world objects hidden)', conn.isolated);

  // manifest 驱动的节点身份：8 个设备 = manifest.objects 里被 L4 认领的那 8 个
  const identity = await page.evaluate(readL4Identity);
  suite.ok('tower.manifest.json 可读', identity.manifestAvailable === true, identity.manifestAvailable);
  suite.equal('__l4.detailBindings 长度', identity.l4Ids.length, L4_DEVICE_IDS.length);
  suite.ok('detailBindings 与契约一致',
    JSON.stringify(identity.l4Ids.slice().sort()) === JSON.stringify(L4_DEVICE_IDS.slice().sort()),
    { actual: identity.l4Ids });
  suite.equal('manifest 命中的设备数', identity.manifestDeviceIds.length, L4_DEVICE_IDS.length);
  suite.ok('8 个设备都在 manifest.objects 里', identity.rows.every(r => r.inManifest), {
    missing: identity.rows.filter(r => !r.inManifest).map(r => r.objectId),
  });
  suite.ok('8 个设备都有 detail 表示（PETRO_DEVICE_STATE.snapshot）',
    identity.rows.every(r => r.hasDetailRepresentation), {
      missing: identity.rows.filter(r => !r.hasDetailRepresentation).map(r => r.objectId),
    });
  suite.ok('8 个设备分组都挂了子节点', identity.rows.every(r => (r.detailGroupChildren || 0) > 0), {
    children: identity.rows.map(r => ({ id: r.objectId, children: r.detailGroupChildren })),
  });
  suite.equal('L4 选中对象', identity.selectedObjectId, 'atmospheric_tower');
  suite.note('identity', identity.rows.map(r => ({
    id: r.objectId,
    name: r.manifestDisplayName,
    nodeUids: r.manifestNodeCount,
    detailChildren: r.detailGroupChildren,
    detailVisible: r.detailGroupVisible,
  })));

  const shot = await saveArtifacts('levels', page, 'l4-connections');
  if (shot) suite.note('screenshot', shot);

  await exitAndCheck(page, 'l4', suite);
  suite.equal('exit: stage.isLevel() false', await page.evaluate(() => window.__stage.isLevel()), false);
}

/* ------------------------------------------------------------------ *
 * L3：初态（2% / 泵停 / 未完成 / 固定顶罐）→ 不启泵推到 70% 完成 → 重进复位
 * ------------------------------------------------------------------ */

async function runL3(page, suite) {
  const enter = await enterLevel(page, 'l3');
  suite.note('enter.enterMs', enter.enterMs);
  suite.note('enter.waitNotLevelMs', enter.waitedNotLevelMs);

  const initial = await page.evaluate(readL3State);
  suite.note('initial', initial);
  suite.ok('enter: stage.isLevel()', initial.isLevel === true, initial.isLevel);
  suite.equal('初态: 液位 2%（__l3.level）', initial.level, L3_INITIAL_LEVEL);
  suite.equal('初态: 滑块 2（DOM #l3-level）', initial.dom.sliderValue, '2');
  suite.equal('初态: 百分比 2%（DOM #l3-pct）', initial.dom.levelText, '2%');
  suite.equal('初态: 泵停止（__l3.pumpRunning）', initial.pumpRunning, false);
  suite.equal('初态: 泵未暂停（__l3.pumpPaused）', initial.pumpPaused, false);
  suite.equal('初态: 未完成（__l3.completed）', initial.completed, false);
  suite.equal('初态: 当前罐型 固定顶罐（DOM #l3-state）', initial.dom.tankName, '固定顶罐');
  suite.equal('初态: #l3-fixed aria-pressed', initial.dom.fixedPressed, 'true');
  suite.equal('初态: #l3-float aria-pressed', initial.dom.floatPressed, 'false');
  // 只读 API 交叉验证「默认固定顶罐」：enter() 里 setContextObject(selectedTankId) → deviceState.select
  suite.equal('初态: 选中设备（PETRO_DEVICE_STATE.selectedObjectId）', initial.selectedObjectId, 'fixed_roof_tank');
  suite.note('初态: cutMode', initial.cutMode);
  suite.note('初态: routeInfo', initial.routeInfo);
  const shotInitial = await saveArtifacts('levels', page, 'l3-initial');
  if (shotInitial) suite.note('screenshot.initial', shotInitial);

  // 不启动泵送，直接把液位推到 >= 70%
  const pushed = await page.evaluate(target => {
    window.__l3.setLevel(target);
    return window.__l3.level;
  }, L3_COMPLETE_TARGET_PCT);
  suite.atLeast('推到 70% 后 level', pushed, L3_COMPLETE_TARGET_PCT / 100);

  const afterPush = await page.evaluate(readL3State);
  suite.note('afterPush', afterPush);
  suite.atLeast('完成后: 液位 >= 70%', afterPush.level, 0.7);
  suite.atLeast('完成后: deviceState 液位写入（PETRO_DEVICE_STATE.snapshot）',
    await page.evaluate(() => {
      const dev = window.PETRO_DEVICE_STATE.snapshot().devices.fixed_roof_tank || {};
      return dev.level;
    }), 0.7);
  suite.equal('完成后: completed === true（__l3.completed）', afterPush.completed, true);
  suite.equal('完成后: 百分比文本（DOM #l3-pct）', afterPush.dom.levelText, '70%');
  suite.equal('完成后: #l3-back 文案（DOM）', afterPush.dom.backText, '完成，返回总览 →');
  suite.equal('完成后: #l3-back 有 pulse 类（DOM）', afterPush.dom.backPulse, true);
  suite.equal('完成后: 关卡面板有 done 类（DOM）', afterPush.dom.uiDone, true);
  suite.equal('完成后: 全程未启泵（__l3.pumpRunning）', afterPush.pumpRunning, false);
  suite.ok('完成后: 最后一次交互是调液位（__l3.lastInteraction）',
    !!afterPush.lastInteraction && /liquid_level/.test(String(afterPush.lastInteraction.action || '')),
    afterPush.lastInteraction);
  const shotDone = await saveArtifacts('levels', page, 'l3-completed');
  if (shotDone) suite.note('screenshot.completed', shotDone);

  // 退出 → 轮询等 isLevel()===false（exit 是带动画的）→ 重进，必须回到初态
  const beforeExit = afterPush.level;
  await exitAndCheck(page, 'l3', suite);
  const exited = await page.evaluate(() => ({
    isLevel: window.__stage.isLevel(),
    completed: window.__l3.completed,
    level: window.__l3.level,
  }));
  suite.equal('exit: stage.isLevel() false', exited.isLevel, false);
  suite.note('exit 后残留状态（预期 level/completed 仍为上轮值，重进时复位）', exited);
  suite.equal('exit: 液位仍保留上轮值（复位发生在 enter）', exited.level, beforeExit);

  await enterLevel(page, 'l3');
  const reEnter = await page.evaluate(readL3State);
  suite.note('re-enter', reEnter);
  suite.equal('重进: 液位回到 2%（__l3.level）', reEnter.level, L3_INITIAL_LEVEL);
  suite.equal('重进: 滑块 2（DOM #l3-level）', reEnter.dom.sliderValue, '2');
  suite.equal('重进: 百分比 2%（DOM #l3-pct）', reEnter.dom.levelText, '2%');
  suite.equal('重进: 泵停止（__l3.pumpRunning）', reEnter.pumpRunning, false);
  suite.equal('重进: 泵未暂停（__l3.pumpPaused）', reEnter.pumpPaused, false);
  suite.equal('重进: 未完成（__l3.completed）', reEnter.completed, false);
  suite.equal('重进: 默认仍是固定顶罐（DOM #l3-state）', reEnter.dom.tankName, '固定顶罐');
  suite.equal('重进: #l3-fixed aria-pressed', reEnter.dom.fixedPressed, 'true');
  suite.equal('重进: 选中设备（PETRO_DEVICE_STATE.selectedObjectId）', reEnter.selectedObjectId, 'fixed_roof_tank');
  suite.equal('重进: 面板 done 类已清除（DOM）', reEnter.dom.uiDone, false);

  await exitAndCheck(page, 'l3', suite);
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

async function main() {
  const l2 = createSuite('LEVEL.L2');
  const l4 = createSuite('LEVEL.L4');
  const l3 = createSuite('LEVEL.L3');
  const suites = [l2, l4, l3];

  let server = null;
  let browser = null;
  let context = null;
  let consoleLog = null;
  let cleanup = null;
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

    const opened = await openPage(browser, { ...VIEWPORT, deviceScaleFactor: 1 });
    context = opened.context;
    const page = opened.page;
    consoleLog = collectConsole(page);

    const loginResult = await login(page, user);
    extraLines.push(`login: alreadyLoggedIn=${loginResult.alreadyLoggedIn}`);
    await waitForSandboxReady(page);
    // 登录页自己会探测 /api/auth/me（未登录时 401），不算关卡页的问题
    consoleLog.clear();

    const env = await page.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio,
      ua: navigator.userAgent,
    }));
    extraLines.push(`viewport: ${env.w}x${env.h} (CSS px)`);
    extraLines.push(`devicePixelRatio: ${env.dpr}`);
    extraLines.push(`userAgent: ${env.ua}`);

    // 逐关跑；某一关异常不阻断其它关，但会记为失败
    try { await runL2(page, l2); } catch (error) {
      l2.ok('L2.section.completed', false, { error: String(error && error.message || error) });
      console.error('[LEVELS] L2 段异常：' + (error && error.stack ? error.stack : error));
    }
    try { await runL4(page, l4); } catch (error) {
      l4.ok('L4.section.completed', false, { error: String(error && error.message || error) });
      console.error('[LEVELS] L4 段异常：' + (error && error.stack ? error.stack : error));
    }
    try { await runL3(page, l3); } catch (error) {
      l3.ok('L3.section.completed', false, { error: String(error && error.message || error) });
      console.error('[LEVELS] L3 段异常：' + (error && error.stack ? error.stack : error));
    }

    // 收尾：确保回到总览（isLevel false），避免下一轮继承关卡状态
    try {
      if (await page.evaluate(() => window.__stage.isLevel())) {
        await page.evaluate(() => { window.__stage.back(); });
        await waitFor(() => page.evaluate(() => !window.__stage.isLevel()), { timeoutMs: 5000, label: '收尾 isLevel() false' });
      }
    } catch { /* 收尾失败不影响结论 */ }
  } catch (error) {
    console.error('[LEVELS] 运行异常：' + (error && error.stack ? error.stack : error));
    l2.ok('levels.run', false, { error: String(error && error.message || error) });
  } finally {
    try { if (context) await context.close(); } catch { /* ignore */ }
    try { if (browser) await browser.close(); } catch { /* ignore */ }
    try { if (server) await server.stop(); } catch { /* ignore */ }
    try { cleanup = await cleanupUser(); } catch (error) { console.error('[LEVELS] cleanupUser 失败：' + error.message); }
    if (cleanup) {
      extraLines.push(`cleanup: removed=${cleanup.removed.length} leftover=[${cleanup.leftover.join(', ')}] `
        + `dataDirRemoved=${cleanup.dataDirRemoved}`);
      console.log(`[INFO] cleanup removed: ${cleanup.removed.join(', ') || '(none)'}`);
      console.log(`[INFO] cleanup leftover: ${cleanup.leftover.join(', ') || '(empty)'}`);
    }
  }

  console.log('\n================ LEVELS REPORT ================');
  for (const line of extraLines) console.log(line);
  if (consoleLog) {
    const stats = consoleLog.summary();
    extraLines.push(`console(level 阶段): ${JSON.stringify(stats)}`);
    console.log(`console(level 阶段): errors=${stats.consoleErrors} warnings=${stats.consoleWarnings} `
      + `pageErrors=${stats.pageErrors} requestFailed=${stats.requestFailures}`);
    for (const warning of consoleLog.warnings.slice(0, 10)) {
      console.log(`  console.warn: ${warning.text}`);
    }
  }
  reportAndExit({ suites, consoleLog, extraLines: [] });
}

await main();
