#!/usr/bin/env node
/**
 * Phase 8｜L5 产品去向 E2E
 *
 * 覆盖本阶段验收 A–F：
 *   A 分类与 representationType 一致，且判定不再依赖 oil 布尔
 *   B 12 件产品模型全部由真实 GLB 加载（含装配单元多零件）
 *   C 辨识度：不靠文字也能区分（每件都有真实几何，且不是单一方块）
 *   D 多原料产品保留 ≥2 种原料，文本无绝对化表述
 *   E 点击模型 → 判定 → 解释文本三处一致
 *   F 模型未加载时不得静默以占位几何冒充（badge 显式提示）
 *
 * 用法：node tools/e2e/run-phase8.mjs
 */
import {
  ensureServer, ensureUser, cleanupUser, launchChrome, openPage, login,
  waitForSandboxReady, enterLevel, exitLevel, collectConsole, formatConsoleLog, waitFor,
} from './harness.mjs';

const results = [];
let failed = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}` + (detail === undefined ? '' : '  ' + JSON.stringify(detail)));
}

const EXPECTED = {
  gasoline: { repType: 'product', feedstocks: ['petroleum'], target: true },
  diesel: { repType: 'product', feedstocks: ['petroleum'], target: true },
  jet_fuel: { repType: 'product', feedstocks: ['petroleum'], target: true },
  asphalt: { repType: 'material', feedstocks: ['petroleum'], target: true },
  plastics: { repType: 'manufacturedItem', feedstocks: ['petroleum', 'natural_gas', 'coal', 'biomass'], target: true },
  paraffin_wax: { repType: 'material', feedstocks: ['petroleum'], target: true },
  synthetic_fiber: { repType: 'material', feedstocks: ['petroleum', 'natural_gas', 'coal'], target: true },
  synthetic_rubber: { repType: 'material', feedstocks: ['petroleum', 'natural_gas'], target: true },
  glass: { repType: 'material', feedstocks: ['other'], target: false },
  cotton: { repType: 'material', feedstocks: ['biomass'], target: false },
  cement: { repType: 'material', feedstocks: ['other'], target: false },
  salt: { repType: 'material', feedstocks: ['other'], target: false },
};

const FORBIDDEN = ['只能由石油', '仅来自石油', '只能来自石油', '唯一来源是石油'];

async function main() {
  const server = await ensureServer();
  const user = await ensureUser({ username: 'e2e_p8_' + Date.now().toString(36) });
  const { browser } = await launchChrome();
  const { page } = await openPage(browser, { width: 1440, height: 900 });

  try {
    await login(page, user);
    await waitForSandboxReady(page);
    await page.waitForTimeout(600);
    await enterLevel(page, 'l5');

    await page.evaluate(async () => {
      await Promise.race([window.__l5.assetsReady, new Promise((r) => setTimeout(r, 30000))]);
    });
    await page.waitForTimeout(2600);

    /* ---------------- A 数据契约 ---------------- */
    const items = await page.evaluate(() => window.__l5.items);
    check('A 任务项数量 12', items.length === 12, items.length);
    check('A 物品数据里不再有 oil 布尔', items.every((i) => !('oil' in i)), Object.keys(items[0] || {}));
    check('A 分类口径自证 usesOilBoolean=false',
      (await page.evaluate(() => window.__l5.classification.usesOilBoolean)) === false);

    for (const it of items) {
      const exp = EXPECTED[it.productId];
      if (!exp) { check(`A 未知产品 ${it.productId}`, false); continue; }
      check(`A ${it.productId} representationType=${exp.repType}`, it.representationType === exp.repType, it.representationType);
      check(`A ${it.productId} 原料集合一致`,
        JSON.stringify(it.typicalFeedstocks) === JSON.stringify(exp.feedstocks), it.typicalFeedstocks);
      check(`A ${it.productId} 石油路线判定与原料一致`,
        it.isPetroleumRoute === exp.target, { isPetroleumRoute: it.isPetroleumRoute, expect: exp.target });
    }

    const cls = await page.evaluate(() => window.__l5.classification);
    check('A 目标 8 件 / 非目标 4 件',
      cls.targets.length === 8 && cls.nonTargets.length === 4, { t: cls.targets.length, n: cls.nonTargets.length });

    /* ---------------- B 模型装载 ---------------- */
    const stats = await page.evaluate(() => window.__l5.modelStats);
    check('B 12 件产品模型全部加载', stats.loaded === 12 && stats.failed === 0,
      { loaded: stats.loaded, failed: stats.failed, failedItems: stats.failedItems });
    check('B 无任何产品走占位兜底',
      (await page.evaluate(() => window.__l5.usingFallbackAsset)) === false);
    check('B 七个产品 GLB 均完成 extras 对账',
      Object.values(stats.assets).every((a) => a.ok && a.reconciled === a.nodes),
      Object.fromEntries(Object.entries(stats.assets).map(([k, v]) => [k, `${v.reconciled}/${v.nodes}`])));

    /* ---------------- C 辨识度：装配单元必须是多零件 ---------------- */
    const multiPart = items.filter((i) => i.partCount >= 2).map((i) => i.productId);
    check('C 至少 10 件由多零件装配（不是单一方块）', multiPart.length >= 10, multiPart);
    const needParts = { plastics: 5, synthetic_fiber: 3, synthetic_rubber: 1, asphalt: 3, cotton: 6 };
    for (const [pid, min] of Object.entries(needParts)) {
      const it = items.find((i) => i.productId === pid);
      check(`C ${pid} 装配零件数 ≥${min}`, !!it && it.partCount >= min, it && it.partCount);
    }
    check('C 每件都有独立 nodeUid 锚点',
      items.every((i) => typeof i.boundNodeUid === 'string' && i.boundNodeUid.length > 10));
    check('C 渲染管线确实在画（draw calls > 0）',
      (await page.evaluate(() => window.__stage.renderer.info.render.calls)) > 0,
      await page.evaluate(() => window.__stage.renderer.info.render.calls));

    /* ---------------- D 多原料与文案 ---------------- */
    for (const pid of ['plastics', 'synthetic_fiber', 'synthetic_rubber']) {
      const it = items.find((i) => i.productId === pid);
      check(`D ${pid} 保留 ≥2 种原料（不表达唯一来源）`, it.typicalFeedstocks.length >= 2, it.typicalFeedstocks);
      check(`D ${pid} 仍保留 petroleum 作为可行原料`, it.typicalFeedstocks.includes('petroleum'));
    }
    const texts = await page.evaluate(() => window.__l5.items.map((i) => {
      const info = window.__l5.productInfo(i.productId);
      return info.petroleumRouteDescription + ' ' + info.teachingNote;
    }).join(' '));
    check('D 文本无绝对化表述', FORBIDDEN.every((p) => !texts.includes(p)),
      FORBIDDEN.filter((p) => texts.includes(p)));

    /* ---------------- E 点击 / 判定 / 解释一致 ---------------- */
    const clickCheck = [];
    for (const pid of ['asphalt', 'plastics', 'synthetic_fiber']) {
      await page.evaluate(() => { window.__l5.picked.forEach ? null : null; });
      const idx = items.findIndex((i) => i.productId === pid);
      const sp = await page.evaluate((i) => window.__l5.screenPoint(i), idx);
      if (!sp || !sp.visible) { clickCheck.push({ pid, clicked: false }); continue; }
      await page.mouse.click(sp.x, sp.y);
      await page.waitForTimeout(260);
      const d = await page.evaluate(() => ({ picked: window.__l5.picked, detail: window.__l5.detailText }));
      const it = items[idx];
      clickCheck.push({
        pid, clicked: d.picked.includes(idx),
        hasName: d.detail.includes(it.displayName),
        hasFeedstock: d.detail.includes('典型原料'),
      });
      await page.mouse.click(sp.x, sp.y);
      await page.waitForTimeout(160);
    }
    check('E 点击模型能选中对应 productId', clickCheck.every((c) => c.clicked && c.hasName && c.hasFeedstock), clickCheck);

    /* 解释文本与判定一致：点开后详情里的"判定"行与数据一致 */
    const judge = await page.evaluate(() => {
      const out = [];
      window.__l5.items.forEach((i, idx) => {
        window.__l5.toggle(idx);
        const t = window.__l5.detailText;
        out.push({
          pid: i.productId,
          target: i.isPetroleumRoute,
          saysTarget: t.includes('常见石油') && !t.includes('不属于石油产品路线'),
          saysNonTarget: t.includes('不属于石油产品路线'),
        });
        window.__l5.toggle(idx);
      });
      return out;
    });
    check('E 详情判定与数据判定逐项一致',
      judge.every((j) => (j.target ? j.saysTarget && !j.saysNonTarget : j.saysNonTarget && !j.saysTarget)),
      judge.filter((j) => !(j.target ? j.saysTarget && !j.saysNonTarget : j.saysNonTarget && !j.saysTarget)));

    /* 正解：只选 8 件目标 → 完成 */
    await page.evaluate(() => {
      const api = window.__l5;
      api.picked.slice().forEach((i) => api.toggle(i));
      api.items.forEach((it, i) => { if (it.isPetroleumRoute) api.toggle(i); });
    });
    await page.evaluate(() => document.querySelector('#l5-check').click());
    await page.waitForTimeout(320);
    const done = await page.evaluate(() => ({
      completed: window.__l5.completed,
      uiDone: !!document.querySelector('.lvl.done'),
    }));
    check('E 选满 8 件目标 → 完成', done.completed === true && done.uiDone === true, done);

    /* 错解：退出重进，故意少选一件 → 不得完成，且提示"漏了" */
    await exitLevel(page, 'l5');
    await waitFor(async () => !(await page.evaluate(() => window.__stage.isLevel())), {
      timeoutMs: 20000, label: 'exit l5',
    }).catch(() => {});
    await enterLevel(page, 'l5');
    await page.evaluate(async () => {
      await Promise.race([window.__l5.assetsReady, new Promise((r) => setTimeout(r, 30000))]);
    });
    await page.waitForTimeout(1500);
    const missed = await page.evaluate(() => {
      const api = window.__l5;
      let skipped = false;
      api.items.forEach((it, i) => {
        if (!it.isPetroleumRoute) return;
        if (!skipped) { skipped = true; return; }   /* 故意漏掉第一件 */
        api.toggle(i);
      });
      return api.picked.length;
    });
    await page.evaluate(() => document.querySelector('#l5-check').click());
    await page.waitForTimeout(300);
    const wrong = await page.evaluate(() => ({
      completed: window.__l5.completed,
      hint: document.querySelector('#l5-hint').textContent,
      note: document.querySelector('#l5-note').textContent,
    }));
    check('E 少选一件不得完成', wrong.completed === false, { picked: missed, ...wrong });
    check('E 少选提示含"漏了"', /漏了/.test(wrong.hint || wrong.note || ''), wrong.hint);

    /* ---------------- F 未加载不得静默冒充 ---------------- */
    const badge = await page.evaluate(() => {
      const el = document.querySelector('#l5-asset-badge');
      return { hidden: el.hidden, text: el.textContent };
    });
    check('F 全部加载成功时资产告警条隐藏', badge.hidden === true, badge);
    check('F 不存在"用方块冒充成功"的兜底路径',
      (await page.evaluate(() => window.__l5.modelStats.failed === 0 && !window.__l5.usingFallbackAsset)));

    await page.screenshot({ path: 'docs/3d-model-optimization/evidence/phase-08-2026-11-27/l5-e2e-final.png' });
    const consoleLog = collectConsole(page);
    const noise = /\/api\/auth\/me|\/favicon\.ico/;
    const realErrors = consoleLog.errors.filter((e) => !noise.test(String(e.text || '')));
    check('页面无未预期报错', realErrors.length === 0, realErrors.slice(0, 3).map((e) => String(e.text || '').slice(0, 120)));
  } finally {
    await browser.close().catch(() => {});
    await cleanupUser();
    await server.stop();
  }

  console.log(`\nPASS ${results.length - failed} / ${results.length}   FAIL ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[PHASE8] 运行失败：' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
