import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('材质令牌自检无缺项', async () => {
  const src = readFileSync(new URL('../web/visual/material-tokens.js', import.meta.url), 'utf8');
  const win = {};
  new Function('window', src)(win);
  const report = win.PetroVisual.audit();
  assert.equal(report.problems.length, 0, JSON.stringify(report.problems));
  assert.ok(report.count >= 11, '令牌数量不足：' + report.count);
});

test('令牌覆盖工艺必需的材质类目', async () => {
  const src = readFileSync(new URL('../web/visual/material-tokens.js', import.meta.url), 'utf8');
  const win = {};
  new Function('window', src)(win);
  const keys = Object.keys(win.PetroVisual.TOKENS);
  for (const need of ['steel_coated', 'steel_stainless', 'steel_galvanized', 'pipe_insulated',
    'concrete', 'rock_sandstone', 'rock_mudstone', 'reservoir', 'fluid_oil', 'fluid_water', 'fluid_gas']) {
    assert.ok(keys.includes(need), '缺少令牌 ' + need);
  }
});
