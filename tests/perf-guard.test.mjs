import test from 'node:test';
import assert from 'node:assert/strict';

/** 在 Node 里跑纯状态机：把 perf-guard.js 的 IIFE 灌进一个假 window。 */
async function loadGuard() {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../web/visual/perf-guard.js', import.meta.url), 'utf8');
  const win = { devicePixelRatio: 1, performance: { now: () => 0 }, requestAnimationFrame: () => 0 };
  new Function('window', 'performance', 'requestAnimationFrame', src)(win, win.performance, win.requestAnimationFrame);
  return win.PetroPerf;
}

test('低于 30fps 连续 3s 才降级', async () => {
  const { createPerfGuard } = await loadGuard();
  const g = createPerfGuard({ maxLevel: 2 });
  g.tick(20, 0); g.tick(20, 1000); g.tick(20, 2000);
  assert.equal(g.level, 2, '未满 3s 不该降级');
  g.tick(20, 3000);
  assert.equal(g.level, 1);
});

test('30–45fps 不动区不触发任何切换', async () => {
  const { createPerfGuard } = await loadGuard();
  const g = createPerfGuard();
  for (let t = 0; t <= 20000; t += 500) g.tick(38, t);
  assert.equal(g.level, 2);
  assert.equal(g.events.length, 0);
});

test('高于 45fps 连续 10s 且冷却满足才恢复', async () => {
  const { createPerfGuard } = await loadGuard();
  const g = createPerfGuard();
  g.tick(20, 0); g.tick(20, 3000);      /* 降一级 */
  assert.equal(g.level, 1);
  for (let t = 3100; t < 13000; t += 500) g.tick(60, t);
  assert.equal(g.level, 1, '冷却 5s 内不得恢复');
  for (let t = 13000; t <= 24000; t += 500) g.tick(60, t);
  assert.equal(g.level, 2, '冷却 + 10s 后应恢复');
});

test('降级不会越过 minLevel', async () => {
  const { createPerfGuard } = await loadGuard();
  const g = createPerfGuard({ minLevel: 0 });
  for (let t = 0; t <= 60000; t += 1000) g.tick(10, t);
  assert.equal(g.level, 0);
});

test('DPR 随等级递减且不低于 0.6 倍基准', async () => {
  const { createPerfGuard } = await loadGuard();
  const g = createPerfGuard();
  assert.equal(g.dprScale(), 1);
  g.tick(10, 0); g.tick(10, 3000);
  assert.ok(g.dprScale() < 1);
});
