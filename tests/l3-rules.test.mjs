import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * L3 业务回归护栏（按当前主线规则）。
 *
 * 这些断言直接读源码结构，而不是跑浏览器：阈值、复位字段、完成条件都是
 * "谁改谁负责"的硬约束，静态断言最快也最稳。浏览器里的行为由
 * tools/e2e/run-levels.mjs 覆盖，两者互补。
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const l3 = readFileSync(resolve(ROOT, 'web/levels/l3.js'), 'utf8');
const mission = readFileSync(resolve(ROOT, 'web/mission.js'), 'utf8');

/** 从源码里按大括号配对取出某个函数体（含函数头） */
function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `源码里找不到 function ${name}(`);
  const braceStart = src.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`function ${name} 大括号未闭合`);
}

const completeBody = extractFunction(l3, 'complete');
const enterBody = extractFunction(l3, 'enter');

test('L3：液位达到 70% 即判定任务完成', () => {
  const hits = [...l3.matchAll(/if \(level >= 0\.70 && !completed\) complete\(\);/g)];
  assert.equal(hits.length, 2, '完成判定应恰好出现在 2 处（滑块与单步/演示两条路径）');
  /* 不得再出现别的完成阈值，避免"某个入口用 80% 才算完成"这种分叉 */
  const otherThresholds = [...l3.matchAll(/level >= 0\.(\d+)/g)]
    .map((m) => m[1])
    .filter((v) => v !== '70');
  assert.deepEqual(otherThresholds, [], `发现其它完成阈值：${otherThresholds.join(', ')}`);
});

test('L3：不启动泵送也能完成任务（完成条件不依赖泵状态）', () => {
  assert.ok(!/pumpRunning|pumpPaused/.test(completeBody), 'complete() 不应读取泵状态');
  const condLines = [...l3.matchAll(/if \(level >= 0\.70 && !completed\) complete\(\);/g)].length;
  assert.equal(condLines, 2);
  /* 完成判定行本身也不得夹带泵条件 */
  const condFull = [...l3.matchAll(/if \(level >= 0\.70[^\n]*complete\(\);/g)].map((m) => m[0]);
  for (const c of condFull) {
    assert.ok(!/pump/i.test(c), `完成判定不应依赖泵：${c}`);
  }
});

test('L3：不要求先观察两个罐型（完成条件不依赖 observedTanks）', () => {
  assert.ok(!/observedTanks/.test(completeBody), 'complete() 不应读取 observedTanks');
  const condFull = [...l3.matchAll(/if \(level >= 0\.70[^\n]*complete\(\);/g)].map((m) => m[0]);
  for (const c of condFull) {
    assert.ok(!/observedTanks/.test(c), `完成判定不应要求观察罐型：${c}`);
  }
});

test('L3：每次进入重置为 2% / 泵停止 / 完成态清除 / 默认固定顶罐', () => {
  const required = [
    [/level = 0\.02;/, '液位复位 2%'],
    [/pumpRunning = false;/, '泵运行态复位'],
    [/pumpPaused = false;/, '泵暂停态复位'],
    [/completed = false;/, '完成态清除'],
    [/selectedTankId = 'fixed_roof_tank';/, '默认选中固定顶罐'],
    [/observedTanks = \{ fixed_roof_tank: false, floating_roof_tank: false \};/, '观察记录复位'],
  ];
  for (const [re, what] of required) {
    assert.ok(re.test(enterBody), `enter() 里缺少复位：${what}`);
  }
  /* 滑块也要回到 2，否则 UI 与状态不一致 */
  assert.ok(/slider\.value = '2';/.test(enterBody), "enter() 应把液位滑块重置为 '2'");
});

test('L3：重置任务会清除节点完成状态', () => {
  const resetBody = extractFunction(mission, 'reset');
  assert.ok(
    /setNodeDone\(i, false\)/.test(resetBody) && /STEP_DEFS\.length/.test(resetBody),
    'mission.reset() 应遍历 STEP_DEFS 把每个节点的完成态清成 false',
  );
  /* 完成时确实会标记节点完成——否则上面那句"清除"就没有对象 */
  assert.ok(/stage\.setNodeDone\(2, true\)/.test(completeBody), 'complete() 应把 L3 节点标记为完成');
});

test('L3：完成时会写入教学账本与节点完成态', () => {
  assert.ok(/__leadai/.test(completeBody), 'complete() 应写入教学账本');
  assert.ok(/setNodeDone\(2, true\)/.test(completeBody));
  assert.ok(/done/.test(completeBody), 'complete() 应给 UI 加 done 状态');
});
