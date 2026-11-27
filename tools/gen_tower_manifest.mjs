#!/usr/bin/env node
/**
 * tools/gen_tower_manifest.mjs — L4 常减压装置语义清单与 Manifest 生成器
 *
 * 目的
 *   1) 为 web/assets/tower/tower.obj 的**当前全部 253 个对象**建立语义清单；
 *   2) 输出 web/assets/tower/tower.manifest.json，供 l4.js / tower.html 以数据驱动
 *      设备归属，取代 tools 之外散落在 l4.js 里的名称正则；
 *   3) 输出人读清单 docs/3d-model-optimization/inventories/tower-node-inventory.json。
 *
 * 归属依据（重要，不可含糊）
 *   - objectId / semanticId / role / support 来自**生成器源码** tools/make_tower.py：
 *     该脚本是这些对象的唯一创建者，其函数名、显式名称与注释即为可审计的创建依据。
 *   - systemId（**工艺**归属）只有在生成器几何与注释明确成立时才给出，并一律标
 *     reviewStatus: "draft"；换热器/泵组的工艺角色无法由现有资料证明，归入
 *     `pending_process_attribution` 并标注 pending。禁止按英文前缀猜工艺。
 *   - 带数字的对象（Railing_10 / Post_18_3 / Nozzle_9 / Manway_12 …）中数字是
 *     **塔体标高（米）**，由 make_tower.py:251-272 的循环直接给出，属"明确位置标识"，
 *     不是 for-loop 索引。
 *
 * nodeUid 规则（契约 §2.2）
 *   uuidv5(PROJECT_NAMESPACE, `${assetId}/${objectId}/${semanticId}#${instanceId}`)
 *   instanceId 仅在同 semanticId 出现多次时给出，取值来自**几何质心**（0.1 m 取整），
 *   因此与循环顺序无关；几何改变即代表不同实体，nodeUid 随之改变，这是预期行为。
 *
 * 用法
 *   node tools/gen_tower_manifest.mjs [--check]
 *   --check  只比对现有 manifest 是否与重新生成结果一致，不写文件
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ASSET_ID = 'distillation_unit_hero';
const PROJECT_NAMESPACE = '5c3d1f7a-2b48-4e6c-9f10-8a7d3e5b2c94';
const SPACE_ID = 'distillation_unit_asset_local';

const OBJ_PATH = process.env.PETRO_TOWER_OBJ || path.join(ROOT, 'web/assets/tower/tower.obj');
const GLB_PATH = path.join(ROOT, 'web/assets/tower/tower.glb');
const META_PATH = path.join(ROOT, 'web/assets/tower/tower.meta.json');
const MANIFEST_PATH = path.join(ROOT, 'web/assets/tower/tower.manifest.json');
const INVENTORY_PATH = path.join(ROOT, 'docs/3d-model-optimization/inventories/tower-node-inventory.json');
const IDENTITY_PATH = path.join(ROOT, 'web/assets/tower/tower.identity.json');

/* ------------------------------------------------------------------ UUIDv5 */

const NS_HEX = PROJECT_NAMESPACE.replace(/-/g, '');

function uuid5(name) {
  // RFC 4122 §4.3，输出与 Python uuid.uuid5 逐字节一致
  const ns = Buffer.from(NS_HEX, 'hex');
  const msg = Buffer.from(name, 'utf8');
  const hash = createHash('sha1').update(Buffer.concat([ns, msg])).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* ------------------------------------------------------------------ OBJ 解析 */

function parseObj(file) {
  const text = readFileSync(file, 'utf8');
  const objects = new Map(); // name -> {count, sum, min, max}
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('o ')) {
      cur = line.slice(2).trim();
      if (!objects.has(cur)) {
        objects.set(cur, { name: cur, count: 0, sx: 0, sy: 0, sz: 0,
          min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
      }
    } else if (line.startsWith('v ') && cur) {
      const o = objects.get(cur);
      const [, x, y, z] = line.split(/\s+/);
      const vx = +x, vy = +y, vz = +z;
      o.count++; o.sx += vx; o.sy += vy; o.sz += vz;
      o.min[0] = Math.min(o.min[0], vx); o.min[1] = Math.min(o.min[1], vy); o.min[2] = Math.min(o.min[2], vz);
      o.max[0] = Math.max(o.max[0], vx); o.max[1] = Math.max(o.max[1], vy); o.max[2] = Math.max(o.max[2], vz);
    }
  }
  for (const o of objects.values()) {
    o.center = [o.sx / o.count, o.sy / o.count, o.sz / o.count].map((v) => +v.toFixed(3));
  }
  return [...objects.values()];
}

/* ------------------------------------------------------------------ 归属规则
 *
 * 顺序敏感：先匹配先生效。每条规则必须能追溯到 make_tower.py 的创建点。
 * systemId 语义：
 *   atmospheric_distillation / vacuum_distillation / feed_heater /
 *   side_draw_stripping / overhead_condensing  ← 生成器几何+注释明确
 *   site_structure                            ← 支撑/场地，非工艺
 *   pending_process_attribution               ← 工艺角色无依据，显式 pending
 */

const PENDING = 'pending_process_attribution';

const RULES = [
  /* ---- 常压塔本体（make_tower.py:243-245） ---- */
  { re: /^Tower_Atmospheric_ShellHalf$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_shell_half', role: 'cutaway_shell', interactive: true },
  { re: /^Tower_Atmospheric_DomeHalf$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_dome_half', role: 'cutaway_dome', interactive: true },
  { re: /^Tower_Atmospheric_Shell$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_shell', role: 'shell', interactive: true },
  { re: /^Tower_Atmospheric_Dome$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_dome', role: 'dome', interactive: true },
  { re: /^Tower_Atmospheric_Skirt$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_skirt', role: 'skirt', interactive: true },
  { re: /^Trays_A$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_trays', role: 'tray_bundle', interactive: true },

  /* ---- 减压塔本体（:280-282） ---- */
  { re: /^Tower_Vacuum_ShellHalf$/, objectId: 'vacuum_tower', systemId: 'vacuum_distillation', semanticId: 'vac_shell_half', role: 'cutaway_shell', interactive: true },
  { re: /^Tower_Vacuum_DomeHalf$/, objectId: 'vacuum_tower', systemId: 'vacuum_distillation', semanticId: 'vac_dome_half', role: 'cutaway_dome', interactive: true },
  { re: /^Tower_Vacuum_Shell$/, objectId: 'vacuum_tower', systemId: 'vacuum_distillation', semanticId: 'vac_shell', role: 'shell', interactive: true },
  { re: /^Tower_Vacuum_Dome$/, objectId: 'vacuum_tower', systemId: 'vacuum_distillation', semanticId: 'vac_dome', role: 'dome', interactive: true },
  { re: /^Tower_Vacuum_Skirt$/, objectId: 'vacuum_tower', systemId: 'vacuum_distillation', semanticId: 'vac_skirt', role: 'skirt', interactive: true },
  { re: /^Trays_V$/, objectId: 'vacuum_tower', systemId: 'vacuum_distillation', semanticId: 'vac_trays', role: 'tray_bundle', interactive: true },

  /* ---- 加热炉与进料（:289-295） ---- */
  { re: /^Heater_Chimney$/, objectId: 'heater', systemId: 'feed_heater', semanticId: 'heater_chimney', role: 'stack', interactive: true },
  { re: /^Heater$/, objectId: 'heater', systemId: 'feed_heater', semanticId: 'heater_shell', role: 'furnace', interactive: true },
  { re: /^Pipe_Feed_/, objectId: 'heater', systemId: 'feed_heater', semanticId: 'feed_line', role: 'process_pipe', interactive: true },
  { re: /^Foundation_Heater$/, objectId: 'heater', systemId: 'feed_heater', semanticId: 'heater_foundation', role: 'foundation', interactive: true },

  /* ---- 常压塔底 → 减压塔（:298） ---- */
  { re: /^Pipe_Bottom_To_Vacuum$/, objectId: 'pipe_bottom_to_vacuum', systemId: 'atmospheric_distillation', semanticId: 'atm_bottom_to_vacuum', role: 'process_pipe', interactive: true },

  /* ---- 三路侧线：接管/法兰/管线/支撑/汽提塔/产品出路（:309-340） ---- */
  { re: /^Nozzle_Side_(Naphtha|Kerosene|Diesel)$/, objectId: 'side_draw_$1', systemId: 'side_draw_stripping', semanticId: 'side_nozzle', role: 'nozzle', interactive: true },
  { re: /^Flange_Side_(Naphtha|Kerosene|Diesel)$/, objectId: 'side_draw_$1', systemId: 'side_draw_stripping', semanticId: 'side_flange', role: 'flange', interactive: true },
  { re: /^Pipe_Side_(Naphtha|Kerosene|Diesel)_(Seg\d+|Elbow\d+)$/, objectId: 'side_draw_$1', systemId: 'side_draw_stripping', semanticId: 'side_pipe', role: 'process_pipe', interactive: true },
  { re: /^Pipe_Side_(Naphtha|Kerosene|Diesel)$/, objectId: 'side_draw_$1', systemId: 'side_draw_stripping', semanticId: 'side_pipe_main', role: 'process_pipe', interactive: true },
  { re: /^SideRack_Col_(Naphtha|Kerosene|Diesel)_([AB])(_Foot)?$/, objectId: 'side_draw_$1', systemId: 'side_draw_stripping', semanticId: 'side_rack_column', role: 'support_column', interactive: false },

  { re: /^Stripper_(Naphtha|Kerosene|Diesel)_Foundation$/, objectId: 'stripper_$1', systemId: 'side_draw_stripping', semanticId: 'stripper_foundation', role: 'foundation', interactive: true },
  { re: /^Stripper_(Naphtha|Kerosene|Diesel)_Skirt$/, objectId: 'stripper_$1', systemId: 'side_draw_stripping', semanticId: 'stripper_skirt', role: 'skirt', interactive: true },
  { re: /^Stripper_(Naphtha|Kerosene|Diesel)_Shell$/, objectId: 'stripper_$1', systemId: 'side_draw_stripping', semanticId: 'stripper_shell', role: 'shell', interactive: true },
  { re: /^Stripper_(Naphtha|Kerosene|Diesel)_Dome$/, objectId: 'stripper_$1', systemId: 'side_draw_stripping', semanticId: 'stripper_dome', role: 'dome', interactive: true },

  { re: /^Pipe_Rundown_(Naphtha|Kerosene|Diesel)_(Seg\d+|Elbow\d+)$/, objectId: 'side_draw_$1', systemId: 'side_draw_stripping', semanticId: 'product_rundown_pipe', role: 'process_pipe', interactive: true },
  { re: /^Pipe_Rundown_(Naphtha|Kerosene|Diesel)$/, objectId: 'side_draw_$1', systemId: 'side_draw_stripping', semanticId: 'product_rundown_pipe_main', role: 'process_pipe', interactive: true },
  { re: /^BatteryLimit_(Naphtha|Kerosene|Diesel)_Support$/, objectId: 'battery_limit_$1', systemId: 'side_draw_stripping', semanticId: 'battery_limit_support', role: 'support_column', interactive: false },
  { re: /^BatteryLimit_(Naphtha|Kerosene|Diesel)_Foot$/, objectId: 'battery_limit_$1', systemId: 'side_draw_stripping', semanticId: 'battery_limit_foot', role: 'foundation', interactive: false },
  { re: /^BatteryLimit_(Naphtha|Kerosene|Diesel)$/, objectId: 'battery_limit_$1', systemId: 'side_draw_stripping', semanticId: 'battery_limit_flange', role: 'boundary_flange', interactive: true },
  { re: /^RundownRack_(Naphtha|Kerosene|Diesel)_\d+(_Foot)?$/, objectId: 'side_draw_$1', systemId: 'side_draw_stripping', semanticId: 'rundown_rack_post', role: 'support_column', interactive: false },

  /* ---- 塔顶冷凝 / 回流（:343-368） ---- */
  { re: /^Pipe_Top_/, objectId: 'overhead_condenser', systemId: 'overhead_condensing', semanticId: 'overhead_vapor_line', role: 'process_pipe', interactive: true },
  { re: /^Condenser_Shell$/, objectId: 'overhead_condenser', systemId: 'overhead_condensing', semanticId: 'condenser_shell', role: 'exchanger_shell', interactive: true },
  { re: /^Condenser_Head_/, objectId: 'overhead_condenser', systemId: 'overhead_condensing', semanticId: 'condenser_head', role: 'vessel_head', interactive: true },
  { re: /^Condenser_Saddle_/, objectId: 'overhead_condenser', systemId: 'overhead_condensing', semanticId: 'condenser_saddle', role: 'saddle', interactive: false },
  { re: /^Condenser_Beam_/, objectId: 'overhead_condenser', systemId: 'overhead_condensing', semanticId: 'condenser_beam', role: 'structural_beam', interactive: false },
  { re: /^Condenser_Frame_/, objectId: 'overhead_condenser', systemId: 'overhead_condensing', semanticId: 'condenser_frame', role: 'structural_frame', interactive: false },
  { re: /^Pipe_Condenser_To_Drum_(Seg\d+|Elbow\d+)$/, objectId: 'overhead_condenser', systemId: 'overhead_condensing', semanticId: 'condenser_to_drum_pipe', role: 'process_pipe', interactive: true },
  { re: /^Pipe_Condenser_To_Drum$/, objectId: 'overhead_condenser', systemId: 'overhead_condensing', semanticId: 'condenser_to_drum_pipe_main', role: 'process_pipe', interactive: true },
  { re: /^Reflux_Drum_(Head_[AB]|Beam|Cantilever_[AB]|Saddle_[AB])$/, objectId: 'reflux_drum', systemId: 'overhead_condensing', semanticId: 'reflux_drum_part', role: 'vessel_part', interactive: false },
  { re: /^Reflux_Drum$/, objectId: 'reflux_drum', systemId: 'overhead_condensing', semanticId: 'reflux_drum_shell', role: 'vessel_shell', interactive: true },

  /* ---- 换热器组：工艺角色无依据 → pending（:383-396） ---- */
  { re: /^Exchanger_(\d)_Shell$/, objectId: 'exchanger_$1', systemId: PENDING, semanticId: 'exchanger_shell', role: 'exchanger_shell', interactive: true },
  { re: /^Exchanger_(\d)_Head_/, objectId: 'exchanger_$1', systemId: PENDING, semanticId: 'exchanger_head', role: 'vessel_head', interactive: true },
  { re: /^Exchanger_(\d)_Nozzle(_Out)?$/, objectId: 'exchanger_$1', systemId: PENDING, semanticId: 'exchanger_nozzle', role: 'nozzle', interactive: true },
  { re: /^Exchanger_(\d)_Saddle(_[AB])?(\.\d{3})?$/, objectId: 'exchanger_$1', systemId: PENDING, semanticId: 'exchanger_saddle', role: 'saddle', interactive: false },
  { re: /^Exchanger_(\d)_Base$/, objectId: 'exchanger_$1', systemId: PENDING, semanticId: 'exchanger_base', role: 'foundation', interactive: false },

  /* ---- 泵组：工艺角色无依据 → pending（:371-372, :398-410） ---- */
  { re: /^Pump_A_(\d)_(Body|Motor|Suction|Discharge|ValveWheel)$/, objectId: 'pump_group_a', systemId: PENDING, semanticId: 'pump_$2', role: 'pump_part', interactive: true },
  { re: /^PumpSkid_Base$/, objectId: 'pump_group_a', systemId: PENDING, semanticId: 'pump_skid_base', role: 'foundation', interactive: false },
  { re: /^Pump_(\d)$/, objectId: 'pump_$1', systemId: PENDING, semanticId: 'pump_body', role: 'pump_body', interactive: true },

  /* ---- 常压/减压基础 ---- */
  { re: /^Foundation_Atm$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_foundation', role: 'foundation', interactive: true },
  { re: /^Foundation_Vac$/, objectId: 'vacuum_tower', systemId: 'vacuum_distillation', semanticId: 'vac_foundation', role: 'foundation', interactive: true },

  /* ---- 塔体附件（数字=标高 m，:250-275） ---- */
  { re: /^Railing_(\d+)$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_platform_railing', role: 'railing', interactive: false },
  { re: /^Post_(\d+)_(\d+)$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_railing_post', role: 'railing_post', interactive: false },
  { re: /^Manway_(\d+)$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_manway', role: 'manway', interactive: true },
  { re: /^Nozzle_(\d+)$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_nozzle', role: 'nozzle', interactive: true },
  { re: /^Flange_(\d+)$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_flange', role: 'flange', interactive: true },
  { re: /^Insulation_Band_(\d+)$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_insulation_band', role: 'insulation', interactive: true },
  { re: /^Ladder_Rail_/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_ladder_rail', role: 'ladder', interactive: false },
  { re: /^Ladder_Rung_/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_ladder_rung', role: 'ladder', interactive: false },
  { re: /^Ladder$/, objectId: 'atmospheric_tower', systemId: 'atmospheric_distillation', semanticId: 'atm_ladder', role: 'ladder', interactive: false },

  /* ---- 场地管廊/平台/钢梯/地面（:411-455） ---- */
  { re: /^PipeRack_/, objectId: 'site_pipe_rack', systemId: 'site_structure', semanticId: 'pipe_rack_part', role: 'pipe_rack', interactive: false },
  { re: /^Platform_(Grate|Rail|Post)/, objectId: 'site_platform', systemId: 'site_structure', semanticId: 'access_platform_part', role: 'platform', interactive: false },
  { re: /^Stair_/, objectId: 'site_platform', systemId: 'site_structure', semanticId: 'access_stair', role: 'stair', interactive: false },
  { re: /^Ground$/, objectId: 'site_ground', systemId: 'site_structure', semanticId: 'ground_plane', role: 'ground', interactive: false },
];

/* 结构模式与表示集：按 semanticId 归类 */
const STRUCTURE = {
  external: {
    show: ['atm_shell', 'atm_dome', 'vac_shell', 'vac_dome', 'stripper_shell', 'stripper_dome', 'condenser_shell', 'reflux_drum_shell'],
    hide: ['atm_shell_half', 'atm_dome_half', 'vac_shell_half', 'vac_dome_half', 'atm_trays', 'vac_trays'],
    ghost: [],
  },
  half: {
    show: ['atm_shell_half', 'atm_dome_half', 'vac_shell_half', 'vac_dome_half', 'atm_trays', 'vac_trays'],
    hide: ['atm_shell', 'atm_dome', 'vac_shell', 'vac_dome'],
    ghost: [],
  },
  full: {
    show: ['atm_shell_half', 'atm_dome_half', 'vac_shell_half', 'vac_dome_half', 'atm_trays', 'vac_trays'],
    hide: [],
    ghost: [],
  },
  ghost: {
    show: ['atm_shell_half', 'atm_dome_half', 'vac_shell_half', 'vac_dome_half', 'atm_trays', 'vac_trays'],
    hide: [],
    ghost: ['atm_shell', 'atm_dome', 'vac_shell', 'vac_dome'],
  },
};

const SUPPORT_REASON = {
  support_column: '支撑柱：结构必需但不参与交互选择',
  structural_beam: '结构梁：承托设备，不参与交互',
  structural_frame: '钢框架：承托冷凝器/回流罐，不参与交互',
  pipe_rack: '管廊结构：走管支撑，不参与交互',
  platform: '检修平台：通行结构，不参与交互',
  stair: '钢梯：通行结构，不参与交互',
  railing: '栏杆：安全防护，不参与交互',
  railing_post: '栏杆立柱：安全防护，不参与交互',
  ladder: '直梯：通行结构，不参与交互',
  ground: '地面基准：场景底板，不参与交互',
  saddle: '鞍座：设备支座，不参与交互',
  foundation: '设备基础：混凝土基础，不参与交互',
  vessel_part: '罐体附件（封头/梁/鞍座）：非交互部件',
  pump_part: '泵组部件：仅随泵组整体选择',
};

/* ------------------------------------------------------------------ 主流程 */

/** 取当前提交 SHA；schema 要求 ^[0-9a-f]{7,40}$，拿不到时以 0000000 显式表示未知 */
function resolveCommit() {
  if (process.env.GIT_COMMIT && /^[0-9a-f]{7,40}$/.test(process.env.GIT_COMMIT)) return process.env.GIT_COMMIT;
  try {
    const head = readFileSync(path.join(ROOT, '.git/HEAD'), 'utf8').trim();
    let sha;
    if (head.startsWith('ref: ')) {
      const refPath = path.join(ROOT, '.git', head.slice(5));
      sha = readFileSync(refPath, 'utf8').trim();
    } else {
      sha = head;
    }
    if (/^[0-9a-f]{7,40}$/.test(sha)) return sha;
  } catch { /* 忽略：packed-refs 或无 .git */ }
  return '0000000';
}

function classify(name) {
  for (const r of RULES) {
    const m = r.re.exec(name);
    if (!m) continue;
    const expand = (s) => (s == null ? s : s.replace(/\$(\d)/g, (_, i) => (m[+i] || '').toLowerCase()));
    return {
      objectId: expand(r.objectId),
      systemId: r.systemId,
      semanticId: expand(r.semanticId),
      role: r.role,
      interactive: r.interactive,
    };
  }
  return null;
}

function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes('--check');

  const objs = parseObj(OBJ_PATH);
  if (objs.length !== 253) {
    console.error(`[FATAL] tower.obj 对象数为 ${objs.length}，预期 253。资产已变化，需重新核对规则表。`);
    process.exit(2);
  }

  const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));

  // 1) 分类
  const unclassified = [];
  const classified = objs.map((o) => {
    const c = classify(o.name);
    if (!c) { unclassified.push(o.name); return { ...o, c: null }; }
    return { ...o, c };
  });
  if (unclassified.length) {
    console.error(`[FATAL] ${unclassified.length} 个对象无法归属：`);
    for (const n of unclassified) console.error('   -', n);
    process.exit(3);
  }

  // 2) semanticId 重数 -> instanceId（几何质心，与循环顺序无关）
  const semCount = new Map();
  for (const o of classified) {
    const k = `${o.c.objectId}/${o.c.semanticId}`;
    semCount.set(k, (semCount.get(k) || 0) + 1);
  }
  for (const o of classified) {
    const k = `${o.c.objectId}/${o.c.semanticId}`;
    if ((semCount.get(k) || 0) > 1) {
      // 位置编码：分米取整，负号用 m 前缀；满足 instanceId 字符集 ^[a-z0-9][a-z0-9_-]{0,31}$
      const enc = (v) => (v < 0 ? 'm' + Math.abs(Math.round(v * 10)) : 'p' + Math.round(v * 10));
      const [x, y, z] = o.center;
      o.instanceId = `x${enc(x)}_y${enc(y)}_z${enc(z)}`;
    } else {
      o.instanceId = '';
    }
    o.semanticPath = `${ASSET_ID}/${o.c.objectId}/${o.c.semanticId}${o.instanceId ? '#' + o.instanceId : ''}`;
    o.nodeUid = uuid5(o.semanticPath);
  }

  // 3) 唯一性自检
  const uidSet = new Map();
  const dup = [];
  for (const o of classified) {
    if (uidSet.has(o.nodeUid)) dup.push([o.nodeUid, uidSet.get(o.nodeUid), o.name]);
    else uidSet.set(o.nodeUid, o.name);
  }
  if (dup.length) {
    console.error(`[FATAL] nodeUid 冲突 ${dup.length} 组：`, JSON.stringify(dup.slice(0, 5)));
    process.exit(4);
  }

  // 4) 系统 / 设备
  const sysOrder = ['atmospheric_distillation', 'vacuum_distillation', 'feed_heater',
    'side_draw_stripping', 'overhead_condensing', 'site_structure', PENDING];
  const SYS_NAME = {
    atmospheric_distillation: '常压蒸馏系统',
    vacuum_distillation: '减压蒸馏系统',
    feed_heater: '加热炉与进料系统',
    side_draw_stripping: '侧线汽提与产品出路系统',
    overhead_condensing: '塔顶冷凝与回流系统',
    site_structure: '场地与支撑结构（非工艺）',
    [PENDING]: '待工艺确认装置群（无审核依据，禁止按名称猜测）',
  };
  const OBJ_NAME = {
    atmospheric_tower: '常压蒸馏塔',
    vacuum_tower: '减压蒸馏塔',
    heater: '加热炉',
    pipe_bottom_to_vacuum: '常压塔底至减压塔管线',
    stripper_naphtha: '石脑油侧线汽提塔',
    stripper_kerosene: '煤油侧线汽提塔',
    stripper_diesel: '柴油侧线汽提塔',
    side_draw_naphtha: '石脑油侧线系统',
    side_draw_kerosene: '煤油侧线系统',
    side_draw_diesel: '柴油侧线系统',
    battery_limit_naphtha: '石脑油界区法兰',
    battery_limit_kerosene: '煤油界区法兰',
    battery_limit_diesel: '柴油界区法兰',
    overhead_condenser: '塔顶冷凝器',
    reflux_drum: '回流罐',
    exchanger_1: '换热器 1（工艺角色待确认）',
    exchanger_2: '换热器 2（工艺角色待确认）',
    exchanger_3: '换热器 3（工艺角色待确认）',
    pump_group_a: '泵组 A（工艺角色待确认）',
    pump_1: '泵 1（工艺角色待确认）',
    pump_2: '泵 2（工艺角色待确认）',
    site_pipe_rack: '管廊',
    site_platform: '检修平台与钢梯',
    site_ground: '地面',
  };

  const objectsById = new Map();
  for (const o of classified) {
    if (!o.c.interactive) continue; // objects[].nodeUids 只引用 nodes[]；support 走 nonInteractiveSupport
    const id = o.c.objectId;
    if (!objectsById.has(id)) {
      objectsById.set(id, { objectId: id, systemId: o.c.systemId, displayName: OBJ_NAME[id] || id, nodeUids: [] });
    }
    objectsById.get(id).nodeUids.push(o.nodeUid);
  }
  const objects = [...objectsById.values()];
  const systems = sysOrder
    .map((sid) => ({ systemId: sid, displayName: SYS_NAME[sid], objectIds: objects.filter((o) => o.systemId === sid).map((o) => o.objectId) }))
    .filter((s) => s.objectIds.length > 0);

  // 5) nodes / support
  const nodes = [];
  const support = [];
  for (const o of classified) {
    if (o.c.interactive) {
      nodes.push({
        nodeUid: o.nodeUid,
        nodeName: o.name,
        objectId: o.c.objectId,
        semanticId: o.c.semanticId,
        ...(o.instanceId ? { instanceId: o.instanceId } : {}),
        role: o.c.role,
        interactive: true,
        representations: ['detail'],
      });
    } else {
      support.push({
        nodeUid: o.nodeUid,
        nodeName: o.name,
        reason: SUPPORT_REASON[o.c.role] || `${o.c.role}：结构必需但不参与交互选择`,
      });
    }
  }

  // 6) representations
  const uidBySemantic = new Map();
  for (const o of classified) {
    const k = o.c.semanticId;
    if (!uidBySemantic.has(k)) uidBySemantic.set(k, []);
    uidBySemantic.get(k).push(o.nodeUid);
  }
  const pick = (sems) => sems.flatMap((s) => uidBySemantic.get(s) || []);
  const shellSems = ['atm_shell', 'atm_dome', 'vac_shell', 'vac_dome', 'stripper_shell', 'stripper_dome', 'condenser_shell', 'reflux_drum_shell', 'heater_shell'];
  const internalSems = ['atm_trays', 'vac_trays'];

  const representations = {
    overview: pick([...shellSems, 'atm_skirt', 'vac_skirt', 'heater_chimney']),
    detail: nodes.map((n) => n.nodeUid),
    closeup: pick([...shellSems, ...internalSems, 'atm_shell_half', 'atm_dome_half', 'vac_shell_half', 'vac_dome_half']),
  };

  // 7) structureModes
  const structureModes = {};
  for (const [mode, rule] of Object.entries(STRUCTURE)) {
    structureModes[mode] = { show: pick(rule.show), hide: pick(rule.hide), ghost: pick(rule.ghost) };
  }

  // 8) bounds（OBJ 已是 Y-up 网页坐标）
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const o of objs) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], o.min[k]); max[k] = Math.max(max[k], o.max[k]); }

  // 9) anchors（来自 make_tower.py 写入的 meta.anchor_web_y_up）
  //    GLB 中对应 5 个空物体（anchor_tower_*）——它们是节点但不是交互网格，
  //    登记到 nonInteractiveSupport，避免"未登记 GLB 节点"。
  //    注意：schema 的 anchors[].nodeUid 只允许引用 nodes[]，而锚点是 support，
  //    故此处不填 nodeUid（改为可选），锚点靠 position + ownerObjectId 定位。
  const anchors = Object.entries(meta.anchor_web_y_up || {}).map(([anchorId, position]) => ({
    anchorId,
    ownerObjectId: anchorId.includes('vacuum') ? 'vacuum_tower'
      : anchorId.includes('products') ? 'battery_limit_naphtha'
      : anchorId.includes('feed') ? 'heater'
      : anchorId.includes('trays') ? 'atmospheric_tower'
      : 'atmospheric_tower',
    coordinateSpaceId: SPACE_ID,
    position,
    kind: 'teaching_marker',
  }));

  for (const a of anchors) {
    support.push({
      nodeUid: uuid5(`${ASSET_ID}/anchor_marker/${a.anchorId}`),
      nodeName: a.anchorId,
      reason: '教学锚点空物体：仅作 anchor 定位标记，不参与交互选择',
    });
  }

  // 10) runtime
  const glbExists = existsSync(GLB_PATH);
  const glbBuf = glbExists ? readFileSync(GLB_PATH) : null;
  const glbJsonLen = glbBuf ? glbBuf.readUInt32LE(12) : 0;
  const glbJson = glbBuf ? JSON.parse(glbBuf.subarray(20, 20 + glbJsonLen).toString('utf8')) : null;
  const glbHasPetro = glbJson ? (glbJson.nodes || []).filter((n) => n.extras && n.extras.petro).length : 0;

  const manifest = {
    schemaVersion: '1.0.0',
    assetId: ASSET_ID,
    assetVersion: `1.0.0+phase2l4`,
    source: {
      repository: 'gitee.com/LYU_PRO/scienceagent',
      commit: resolveCommit(),
      path: 'assets-source/blender/tower_hero.blend',
      dirty: false,
    },
    build: {
      sourceFile: 'assets-source/blender/tower_hero.blend',
      generator: 'tools/make_tower.py',
      blenderVersion: meta.blenderVersion || '5.3.0',
      exporterVersion: glbJson ? glbJson.asset.generator : 'Khronos glTF Blender I/O v5.3.43',
      exportOptionsHash: glbBuf ? createHash('sha256').update(glbBuf).digest('hex').slice(0, 16) : 'unbuilt',
      invocation: 'blender -b -P tools/make_tower.py -- <outDir>   # 输出目录可重定向；.blend 由 PETRO_TOWER_BLEND 指定',
      exportExtras: true,
    },
    runtime: {
      format: 'glb',
      uri: 'assets/tower/tower.glb',
      sha256: glbBuf ? createHash('sha256').update(glbBuf).digest('hex') : '0'.repeat(64),
      bytes: glbBuf ? glbBuf.length : 0,
      extrasStatus: glbHasPetro === (glbJson ? glbJson.nodes.length : 0) && glbJson ? 'verified' : 'pending_rebuild',
      fallback: {
        format: 'obj',
        uri: 'assets/tower/tower.obj',
        mtlUri: 'assets/tower/tower.mtl',
      },
    },
    coordinateSystem: {
      unit: 'meter',
      handedness: 'right',
      upAxis: '+Y',
      spaceId: SPACE_ID,
      sourceSpaceNote: 'Blender Z-up → OBJ/GLB Y-up（make_tower.py: obj_export forward_axis=NEGATIVE_Z, up_axis=Y）。OBJ 与 GLB 均为 assetLocal，未含 SCALE；l4.js 运行时另乘 SCALE=0.46 得到关卡坐标。',
    },
    bounds: { coordinateSpaceId: SPACE_ID, unit: 'meter', min: min.map((v) => +v.toFixed(3)), max: max.map((v) => +v.toFixed(3)) },
    defaults: { detailLevel: 'detail', structureMode: 'external', animationMode: 'idle' },
    systems,
    objects,
    nodes,
    anchors,
    representations,
    structureModes,
    dynamicBindings: [],
    nonInteractiveSupport: support,
    processBasis: [
      {
        basisId: 'generator_source_structure',
        version: '1.0.0',
        reviewStatus: 'draft',
        sourceTitle: 'tools/make_tower.py 生成器源码（几何与注释）',
        sourceOrg: '本项目',
        scope: '仅证明对象由该脚本在指定标高/位置创建，以及塔顶管线在几何上源自常压塔顶。不构成工艺审查结论。',
        limitations: ['未经领域专家审核，不得作为正式工艺事实发布'],
      },
      {
        basisId: 'pending_process_attribution',
        version: '1.0.0',
        reviewStatus: 'draft',
        sourceTitle: '尚无审核资料',
        sourceOrg: '待补',
        scope: '换热器_1..3、泵组 A、泵 1/2 的工艺角色（属于哪条流程、处理何种介质）在现有仓库资料中无法证明。',
        limitations: ['这些对象的 systemId 一律置为 pending_process_attribution，禁止按英文名称前缀猜测工艺归属'],
      },
    ],
    limitations: [
      '教学示意模型，不用于工程设计、设备选型、强度计算或 CFD 仿真。',
      '换热器与泵组的工艺归属 pending，仅登记为装置群，不代表已确认流程位置。',
      'anchors 为教学锚点，坐标由 make_tower.py 的 ANCHORS 写入，未做现场测量。',
      'structureModes 中 full 与 half 使用同一组半剖节点；本资产没有独立的“全剖”几何。',
    ],
    license: { spdx: 'LicenseRef-Proprietary', holder: '本项目权利人', terms: '仅限本项目教学使用；对外再分发需书面许可。' },
  };

  // 11) 人读 inventory
  const inventory = {
    generatedAt: new Date().toISOString(),
    assetId: ASSET_ID,
    sourceObjects: objs.length,
    interactiveNodes: nodes.length,
    supportEntries: support.length,
    systems: systems.length,
    objects: objects.length,
    note: 'systemId 为工艺归属；换热器/泵组为 pending，见 processBasis。role/semanticId 来自 tools/make_tower.py。',
    entries: classified.map((o) => ({
      nodeName: o.name,
      nodeUid: o.nodeUid,
      semanticPath: o.semanticPath,
      assetId: ASSET_ID,
      systemId: o.c.systemId,
      objectId: o.c.objectId,
      semanticId: o.c.semanticId,
      instanceId: o.instanceId || null,
      role: o.c.role,
      interactive: o.c.interactive,
      support: !o.c.interactive,
      representations: o.c.interactive ? ['detail'] : [],
      center: o.center,
      bbox: { min: o.min.map((v) => +v.toFixed(3)), max: o.max.map((v) => +v.toFixed(3)) },
      vertices: o.count,
    })),
  };

  if (checkOnly) {
    const prev = existsSync(MANIFEST_PATH) ? readFileSync(MANIFEST_PATH, 'utf8') : '';
    const next = JSON.stringify(manifest, null, 2) + '\n';
    console.log(prev === next ? '[ok] manifest 与重新生成结果一致' : '[diff] manifest 需要更新');
    process.exit(prev === next ? 0 : 1);
  }

  mkdirSync(path.dirname(INVENTORY_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  writeFileSync(INVENTORY_PATH, JSON.stringify(inventory, null, 2) + '\n', 'utf8');

  // 12) 身份映射（供 tools/make_tower.py 盖章；规则唯一来源是本脚本的 RULES 表）
  const identity = {
    $comment: '由 tools/gen_tower_manifest.mjs 生成，供 make_tower.py 在 Blender 内写 petro 自定义属性。'
      + '按 nodeName 引导映射只是首次盖章的引导；盖章后 .blend 持有 petro，重建不再依赖名称。'
      + '新增/改名对象必须重新生成本文件，否则 make_tower.py 会 fail closed。',
    assetId: ASSET_ID,
    namespace: PROJECT_NAMESPACE,
    generatedFrom: 'web/assets/tower/tower.obj',
    objects: Object.fromEntries(classified.map((o) => [o.name, {
      nodeUid: o.nodeUid,
      assetId: ASSET_ID,
      objectId: o.c.objectId,
      semanticId: o.c.semanticId,
      instanceId: o.instanceId,
      role: o.c.role,
    }])),
  };
  writeFileSync(IDENTITY_PATH, JSON.stringify(identity, null, 2) + '\n', 'utf8');
  console.log('[ok] identity :', path.relative(ROOT, IDENTITY_PATH));

  console.log('[ok] manifest :', path.relative(ROOT, MANIFEST_PATH));
  console.log('[ok] inventory:', path.relative(ROOT, INVENTORY_PATH));
  console.log(`     对象 ${objs.length} → 可交互 ${nodes.length} + support ${support.length}`);
  console.log(`     systems ${systems.length} / objects ${objects.length} / anchors ${anchors.length}`);
  console.log(`     nodeUid 唯一 ${uidSet.size}/${objs.length}；重数实例 ${classified.filter((o) => o.instanceId).length}`);
  console.log(`     runtime.extrasStatus = ${manifest.runtime.extrasStatus} (petro ${glbHasPetro} 节点)`);
  const pendingObjs = objects.filter((o) => o.systemId === PENDING).map((o) => o.objectId);
  if (pendingObjs.length) console.log(`     [pending] ${pendingObjs.length} 个设备的工艺归属待确认：${pendingObjs.join(', ')}`);
}

main();


