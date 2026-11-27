import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * L1 结构性守卫（Phase 9 遗留债）。
 * 这些是"删掉就会悄悄退化"的不变量，用静态检查钉住。
 */
const src = readFileSync(new URL('../web/levels/l1.js', import.meta.url), 'utf8');
const count = (re) => (src.match(re) || []).length;

test('L1 只有一份 enterPoreOverlay 定义', () => {
  assert.equal(count(/function enterPoreOverlay\(/g), 1);
});

test('L1 只有一份 enterPore 定义', () => {
  assert.equal(count(/function enterPore\(/g), 1);
});

test('L1 不再无差别关闭视锥剔除', () => {
  assert.equal(count(/frustumCulled = false/g), 0);
  assert.ok(count(/frustumCulled = true/g) >= 1);
});

test('L1 粒子端点引用资产锚点', () => {
  assert.match(src, /anchorVec\(\s*['"]perforation_zone['"]/);
  assert.match(src, /anchorVec\(\s*['"]wellbore_top['"]/);
  assert.match(src, /anchorVec\(\s*['"]reservoir_top['"]/);
});
