import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const manifest = JSON.parse(read('web/assets/separator/separator.manifest.json'));
const l2Src = read('web/levels/l2.js');

/** 解析 OBJ：返回 { 对象名: {v, f, min, max} } */
function parseObj(text) {
  const out = {};
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('o ')) {
      cur = line.slice(2).trim();
      out[cur] = { v: 0, f: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    } else if (line.startsWith('v ') && cur) {
      const p = line.split(/\s+/).slice(1, 4).map(Number);
      out[cur].v++;
      for (let k = 0; k < 3; k++) {
        out[cur].min[k] = Math.min(out[cur].min[k], p[k]);
        out[cur].max[k] = Math.max(out[cur].max[k], p[k]);
      }
    } else if (line.startsWith('f ') && cur) {
      out[cur].f++;
    }
  }
  return out;
}

const byUid = new Map(manifest.nodes.map((n) => [n.nodeUid, n]));
const uidOf = (nodeName) => {
  const n = manifest.nodes.find((x) => x.nodeName === nodeName);
  assert.ok(n, `Manifest 中缺少节点 ${nodeName}`);
  return n.nodeUid;
};

test('L2 结构：full 模式按契约留空并在 limitations 说明（不虚构）', () => {
  /* asset-manifest.schema.json 强制要求 full 键存在，并规定：
   * "full 若资产不支持，可将三个数组留空并在 limitations 说明。" */
  const modes = Object.keys(manifest.structureModes).sort();
  assert.deepEqual(modes, ['external', 'full', 'ghost', 'half']);
  const full = manifest.structureModes.full;
  assert.deepEqual(full.show || [], [], 'full.show 必须为空（资产无完整全剖表示）');
  assert.deepEqual(full.hide || [], [], 'full.hide 必须为空');
  assert.deepEqual(full.ghost || [], [], 'full.ghost 必须为空');
  const documented = manifest.limitations.some((t) => /full/.test(t) && /全剖|空/.test(t));
  assert.ok(documented, 'limitations 必须说明 full 不受支持');
});

test('L2 结构：三态引用的 nodeUid 都存在于 nodes，且 show/hide 不重叠', () => {
  for (const [mode, spec] of Object.entries(manifest.structureModes)) {
    const show = spec.show || [];
    const hide = spec.hide || [];
    const showSet = new Set(show);
    for (const uid of [...show, ...hide, ...(spec.ghost || [])]) {
      assert.ok(byUid.has(uid), `${mode} 引用了不存在的 nodeUid ${uid}`);
    }
    for (const uid of hide) {
      assert.ok(!showSet.has(uid), `${mode} 同时 show 与 hide 了 ${byUid.get(uid).nodeName}`);
    }
  }
});

test('L2 结构：external 显示完整壳、隐藏半剖壳与内部件', () => {
  const s = manifest.structureModes.external;
  assert.ok(s.show.includes(uidOf('separator_shell')), 'external 必须显示完整壳');
  assert.ok(s.hide.includes(uidOf('separator_cut_shell')), 'external 必须隐藏半剖壳');
  assert.ok(s.hide.includes(uidOf('separator_cut_edge_top')), 'external 必须隐藏切面封边');
  assert.ok(s.hide.includes(uidOf('separator_internal_oil')), 'external 必须隐藏内部油层');
  assert.ok(s.hide.includes(uidOf('separator_internal_gas')), 'external 必须隐藏内部气相');
});

test('L2 结构：half 隐藏完整壳、显示真实半剖壳与切面封边', () => {
  const s = manifest.structureModes.half;
  assert.ok(s.hide.includes(uidOf('separator_shell')), 'half 必须隐藏完整壳');
  assert.ok(s.show.includes(uidOf('separator_cut_shell')), 'half 必须显示真实半剖壳');
  assert.ok(s.show.includes(uidOf('separator_cut_edge_top')), 'half 必须显示切面封边');
  assert.ok(s.show.includes(uidOf('separator_cut_edge_bottom')), 'half 必须显示切面封边');
  assert.ok(s.show.includes(uidOf('separator_cutaway_rim')), 'half 必须显示切口边条');
  for (const internal of ['separator_internal_oil', 'separator_internal_gas', 'separator_internal_water', 'separator_internal_weir', 'separator_internal_baffle']) {
    assert.ok(s.show.includes(uidOf(internal)), `half 必须显示 ${internal}`);
  }
  /* half 下两个封头降为半透明（ghost），让视线能穿过两端看到内部；
   * 这是 Manifest 的设计，不是"用 ghost 冒充半剖"——半剖壳本身在不透明 show 里。 */
  assert.deepEqual((s.ghost || []).map((u) => byUid.get(u).nodeName).sort(),
    ['separator_head_left', 'separator_head_right']);
});

test('L2 结构：ghost 把完整壳降为半透明、隐藏半剖壳、显示内部件', () => {
  const s = manifest.structureModes.ghost;
  assert.ok((s.ghost || []).includes(uidOf('separator_shell')), 'ghost 必须把完整壳列入半透明');
  assert.ok(s.hide.includes(uidOf('separator_cut_shell')), 'ghost 必须隐藏半剖壳');
  for (const internal of ['separator_internal_oil', 'separator_internal_gas', 'separator_internal_water']) {
    assert.ok(s.show.includes(uidOf(internal)), `ghost 必须显示 ${internal}`);
  }
});

test('L2 结构：资产确实存在真实半剖壳（不是命名占位）', () => {
  const obj = parseObj(read('web/assets/separator/separator.obj'));
  const full = obj.separator_shell;
  const cut = obj.separator_cut_shell;
  assert.ok(full && cut, 'OBJ 中必须同时存在 separator_shell 与 separator_cut_shell');
  assert.ok(cut.f > 0, '半剖壳必须有实际面片');
  assert.ok(cut.f < full.f, `半剖壳面数应少于完整壳（实际 ${cut.f} vs ${full.f}）`);
  /* 半剖壳只覆盖 z>=0 一侧：任何顶点都不应明显越过切面 */
  assert.ok(cut.min[2] >= -0.05, `半剖壳不应越过切面（min z=${cut.min[2]}）`);
  /* 完整壳跨越切面两侧 */
  assert.ok(full.min[2] < 0 && full.max[2] > 0, '完整壳应跨越切面两侧');
  /* 切面封边必须存在且贴合切面 */
  for (const edge of ['separator_cut_edge_top', 'separator_cut_edge_bottom']) {
    assert.ok(obj[edge] && obj[edge].f > 0, `${edge} 必须有实际面片`);
    assert.ok(Math.abs(obj[edge].min[2]) < 0.1 && Math.abs(obj[edge].max[2]) < 0.1, `${edge} 应贴合切面`);
  }
});

test('L2 结构：l2.js 使用显式 structureMode，不再有布尔 structMode / applyStructure', () => {
  assert.match(l2Src, /STRUCTURE_MODES\s*=\s*\['external',\s*'half',\s*'ghost'\]/);
  assert.match(l2Src, /function setStructureMode\(/);
  assert.ok(!/\bstructMode\b/.test(l2Src), 'l2.js 不应再出现布尔 structMode');
  assert.ok(!/applyStructure/.test(l2Src), 'l2.js 不应再出现 applyStructure');
});

test('L2 结构：显隐由 Manifest 驱动，不按对象名前缀分类', () => {
  assert.match(l2Src, /separatorManifest\.structureModes/);
  assert.ok(!/indexOf\('separator_cut_'\)/.test(l2Src), '不应再用名称前缀判断剖切件');
  assert.ok(!/indexOf\('separator_internal'\)\s*===\s*0/.test(l2Src), '不应再用名称前缀判断内部件');
  assert.match(l2Src, /role === 'cut_shell'/, '应按 Manifest 的 role 归类');
  assert.match(l2Src, /nodeUid/, '节点身份应来自 nodeUid');
});

test('L2 结构：三个结构按钮与设备状态写入', () => {
  assert.match(l2Src, /data-structure="external"/);
  assert.match(l2Src, /data-structure="half"/);
  assert.match(l2Src, /data-structure="ghost"/);
  assert.match(l2Src, /structure:\s*structureMode/, 'deviceState 应写入当前 structureMode');
});

test('L2 结构：退出与重进都复位到 external', () => {
  assert.match(l2Src, /function exit\(\)[\s\S]{0,400}setStructureMode\('external'/, 'exit 应复位 external');
  assert.match(l2Src, /function enter\(\)[\s\S]{0,400}setStructureMode\('external'/, 'enter 应从 external 起步');
});
