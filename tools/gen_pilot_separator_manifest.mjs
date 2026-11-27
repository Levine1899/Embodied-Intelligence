#!/usr/bin/env node
/**
 * tools/gen_pilot_separator_manifest.mjs
 *
 * Phase 1 试点 Manifest 生成器（仅 separator_three_phase）。
 * 用途：证明「UUIDv5 语义路径 → nodeUid → Manifest」这条链可以完全由脚本推导，
 *       而不是手工维护第二套 ID。Phase 2 起应由 Blender 侧的 petro 自定义属性反向生成，
 *       届时本脚本改为读取 GLB extras，不再需要下面的 ROLES 表。
 *
 * 只读取 web/assets/separator/separator.glb，只写 web/assets/separator/separator.manifest.json。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLB = path.join(ROOT, 'web', 'assets', 'separator', 'separator.glb');
const OUT = path.join(ROOT, 'web', 'assets', 'separator', 'separator.manifest.json');

/* ---- 固定命名空间：全项目唯一，必须与 Blender/Python 侧完全一致 ---- */
const PETRO_NAMESPACE = '5c3d1f7a-2b48-4e6c-9f10-8a7d3e5b2c94';
const ASSET_ID = 'separator_three_phase';
const OBJECT_ID = 'three_phase_separator';
const SYSTEM_ID = 'three_phase_separation';

/* ---- 多实例部件：对象名主干 → 部件类型 + 末段序号为实例标识 ----
 * 键是 .blend 中对象名的主干（separator_internal_mist_00 的主干是 separator_internal_mist），
 * 值是 .blend 自定义属性 semanticId 记录的类型名（separator_internal_mist_extractor），
 * 两者不一致是历史命名所致，必须按实际值对齐，否则 nodeUid 会与 Blender 侧不一致。 */
const MULTI_INSTANCE = [
  { stem: 'separator_internal_inlet_port', type: 'separator_internal_inlet_port' },
  { stem: 'separator_internal_mist', type: 'separator_internal_mist_extractor' },
];

/* ---- 节点处置表：role / 是否交互 / 是否属于 support ---- */
const SUPPORT_ROLES = {
  separator_saddle_left: 'saddle',
  separator_saddle_right: 'saddle',
  separator_base_left: 'foundation',
  separator_base_right: 'foundation',
  separator_skid: 'skid',
  separator_manway_ring: 'manway_ring',
  separator_inlet_flange: 'flange',
  separator_gas_outlet_flange: 'flange',
  separator_oil_outlet_flange: 'flange',
  separator_water_outlet_flange: 'flange',
};

const ROLE_BY_PREFIX = [
  ['separator_cut_shell', 'cut_shell'],
  ['separator_cut_edge_', 'cut_edge'],
  ['separator_cutaway_rim', 'cut_rim'],
  ['separator_internal_vortex_breaker', 'internal_vortex_breaker'],
  ['separator_internal_inlet_distributor', 'internal_distributor'],
  ['separator_internal_inlet_port', 'internal_port'],
  ['separator_internal_mist', 'internal_mist'],
  ['separator_internal_weir', 'internal_weir'],
  ['separator_internal_baffle', 'internal_baffle'],
  ['separator_internal_water', 'internal_fluid'],
  ['separator_internal_oil', 'internal_fluid'],
  ['separator_internal_gas', 'internal_fluid'],
  ['separator_shell', 'shell'],
  ['separator_head_', 'head'],
  ['separator_valve_wheel', 'valve_wheel'],
  ['separator_manway', 'manway'],
  ['separator_gauge', 'gauge'],
  ['separator_inlet', 'nozzle'],
  ['separator_gas_outlet', 'nozzle'],
  ['separator_oil_outlet', 'nozzle'],
  ['separator_water_outlet', 'nozzle'],
];

/** 从 GLB 节点名还原 {部件类型, 实例标识}。 */
function splitInstance(nodeName) {
  for (const m of MULTI_INSTANCE) {
    const hit = nodeName.match(new RegExp('^' + m.stem + '_(\\d{2})$'));
    if (hit) return { type: m.type, instance: hit[1] };
  }
  return { type: nodeName, instance: null };
}
const semanticTypeOf = (nodeName) => splitInstance(nodeName).type;
const instanceOf = (nodeName) => splitInstance(nodeName).instance;
function roleOf(nodeName) {
  if (SUPPORT_ROLES[nodeName]) return SUPPORT_ROLES[nodeName];
  // 多实例节点按主干匹配 role；单实例按全名匹配
  const key = instanceOf(nodeName) ? nodeName.replace(/_\d{2}$/, '') : nodeName;
  for (const [prefix, role] of ROLE_BY_PREFIX) {
    if (key === prefix || key.startsWith(prefix)) return role;
  }
  throw new Error(`未定义 role 的节点：${nodeName}（必须在 ROLE_BY_PREFIX 中登记）`);
}

/* ---- UUIDv5：与 Python uuid.uuid5 逐字节一致 ---- */
function uuid5(namespace, name) {
  const nsHex = namespace.replace(/-/g, '');
  const nsBytes = Buffer.from(nsHex, 'hex');
  const nameBytes = Buffer.from(name, 'utf8');
  const hash = createHash('sha1').update(Buffer.concat([nsBytes, nameBytes])).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // variant RFC4122
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function semanticPath(semanticId, instanceId) {
  return `${ASSET_ID}/${OBJECT_ID}/${semanticId}${instanceId ? '#' + instanceId : ''}`;
}

/* ---- 读 GLB ---- */
function readGlb(buf) {
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('不是 GLB');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen).replace(/\u0000+$/, ''));
  return { json, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const center = (a, b) => r3((a + b) / 2);

const buf = await readFile(GLB);
const { json, bytes, sha256 } = readGlb(buf);

const nodes = json.nodes || [];
const posAccessor = (n) => json.accessors[json.meshes[n.mesh].primitives[0].attributes.POSITION];

// 全模型 bounds
const bmin = [Infinity, Infinity, Infinity];
const bmax = [-Infinity, -Infinity, -Infinity];
for (const n of nodes) {
  const a = posAccessor(n);
  for (let i = 0; i < 3; i++) {
    bmin[i] = Math.min(bmin[i], a.min[i]);
    bmax[i] = Math.max(bmax[i], a.max[i]);
  }
}

// 节点清单
const manifestNodes = [];
const supportEntries = [];
for (const n of nodes) {
  const semanticId = semanticTypeOf(n.name);
  const instanceId = instanceOf(n.name);
  const role = roleOf(n.name);
  const nodeUid = uuid5(PETRO_NAMESPACE, semanticPath(semanticId, instanceId));
  if (SUPPORT_ROLES[n.name]) {
    supportEntries.push({
      nodeUid,
      nodeName: n.name,
      reason: `${SUPPORT_ROLES[n.name]}：结构必需但不参与交互选择，登记以防被静默丢弃`,
    });
  } else {
    manifestNodes.push({
      nodeUid,
      nodeName: n.name,
      objectId: OBJECT_ID,
      semanticId,
      ...(instanceId ? { instanceId } : {}),
      role,
      interactive: true,
      representations: ['detail'],
    });
  }
}

// 重复校验（生成期即失败，不等到校验器）
const seen = new Map();
for (const n of [...manifestNodes, ...supportEntries]) {
  if (seen.has(n.nodeUid)) {
    throw new Error(`nodeUid 冲突：${n.nodeName} 与 ${seen.get(n.nodeUid)} 都是 ${n.nodeUid}`);
  }
  seen.set(n.nodeUid, n.nodeName);
}

// 由真实几何推导锚点（取接管包围盒的外向面中心）
const bboxOf = (name) => {
  const n = nodes.find((x) => x.name === name);
  if (!n) throw new Error(`找不到节点 ${name}`);
  const a = posAccessor(n);
  return { min: a.min, max: a.max };
};
const anchorFromNozzle = (anchorId, nodeName, axis, sign) => {
  const { min, max } = bboxOf(nodeName);
  const pos = [
    sign > 0 ? max[0] : min[0],
    sign > 0 ? max[1] : min[1],
    sign > 0 ? max[2] : min[2],
  ];
  // 除轴向外的两轴取包围盒中心
  const keep = axis;
  for (let i = 0; i < 3; i++) if (i !== keep) pos[i] = center(min[i], max[i]);
  const dir = [0, 0, 0];
  dir[axis] = sign;
  const ownerNode = manifestNodes.find((n) => n.nodeName === nodeName);
  return {
    anchorId,
    ownerObjectId: OBJECT_ID,
    coordinateSpaceId: 'separator_asset_local',
    position: pos.map(r3),
    direction: dir,
    kind: 'process_nozzle',
    ...(ownerNode ? { nodeUid: ownerNode.nodeUid } : {}),
  };
};

const anchors = [
  anchorFromNozzle('separator_inlet', 'separator_inlet', 0, -1),
  anchorFromNozzle('separator_gas_outlet', 'separator_gas_outlet', 1, 1),
  anchorFromNozzle('separator_oil_outlet', 'separator_oil_outlet', 0, 1),
  anchorFromNozzle('separator_water_outlet', 'separator_water_outlet', 2, 1),
  {
    anchorId: 'separator_center',
    ownerObjectId: OBJECT_ID,
    coordinateSpaceId: 'separator_asset_local',
    position: [0, center(bboxOf('separator_shell').min[1], bboxOf('separator_shell').max[1]), 0],
    kind: 'camera_target',
  },
];

const uidOf = (name) => {
  const n = [...manifestNodes, ...supportEntries].find((x) => x.nodeName === name);
  if (!n) throw new Error(`找不到节点 ${name}`);
  return n.nodeUid;
};
const uids = (...names) => names.map(uidOf);

const manifest = {
  schemaVersion: '1.0.0',
  assetId: ASSET_ID,
  assetVersion: '1.0.0+phase1pilot',
  source: {
    repository: 'gitee.com/LYU_PRO/scienceagent',
    commit: '5519ef74add0219c4d7eb0a62e5756abead6abcb',
    path: 'assets-source/blender/separator_hero.blend',
    dirty: false,
  },
  build: {
    sourceFile: 'assets-source/blender/separator_hero.blend',
    generator: 'tools/blender/build_separator_hero.py',
    blenderVersion: '4.5.16',
    exporterVersion: 'Khronos glTF Blender I/O v4.5.51',
    exportOptionsHash: sha256.slice(0, 16),
    invocation:
      'blender -b -P tools/blender/build_separator_hero.py   # 该脚本无 CLI 参数，路径全部硬编码；现有产物即由此命令生成',
    exportExtras: false,
  },
  runtime: {
    format: 'glb',
    uri: 'assets/separator/separator.glb',
    sha256,
    bytes,
    extrasStatus: 'pending_rebuild',
    fallback: {
      format: 'obj',
      uri: 'assets/separator/separator.obj',
      mtlUri: 'assets/separator/separator.mtl',
    },
  },
  coordinateSystem: {
    unit: 'meter',
    handedness: 'right',
    upAxis: '+Y',
    spaceId: 'separator_asset_local',
    sourceSpaceNote:
      'Blender Z-up -> glTF Y-up via export_yup=True；GLB 内 43 个节点均无 matrix/translation/rotation/scale，' +
      '故 position accessor 的 min/max 即 assetLocal 坐标',
  },
  bounds: {
    coordinateSpaceId: 'separator_asset_local',
    unit: 'meter',
    min: bmin.map(r3),
    max: bmax.map(r3),
  },
  defaults: {
    detailLevel: 'detail',
    structureMode: 'external',
    animationMode: 'idle',
  },
  systems: [
    {
      systemId: SYSTEM_ID,
      displayName: '三相分离系统',
      objectIds: [OBJECT_ID],
    },
  ],
  objects: [
    {
      objectId: OBJECT_ID,
      systemId: SYSTEM_ID,
      displayName: '三相分离器',
      nodeUids: manifestNodes.map((n) => n.nodeUid),
    },
  ],
  nodes: manifestNodes,
  anchors,
  representations: {
    overview: uids(
      'separator_shell',
      'separator_head_left',
      'separator_head_right',
      'separator_inlet',
      'separator_gas_outlet',
      'separator_oil_outlet',
      'separator_water_outlet'
    ),
    detail: manifestNodes.map((n) => n.nodeUid),
    closeup: uids(
      'separator_internal_water',
      'separator_internal_oil',
      'separator_internal_gas',
      'separator_internal_weir',
      'separator_internal_baffle',
      'separator_internal_vortex_breaker',
      'separator_cut_shell',
      'separator_cut_edge_top',
      'separator_cut_edge_bottom',
      'separator_cutaway_rim'
    ),
  },
  structureModes: {
    external: {
      // 注意：support 节点（法兰/鞍座/底座/撬座）不属于 nodes[]，因此不得出现在
      // representations / structureModes 中，否则会触发 MISSING_NODE_REF。
      show: uids(
        'separator_shell',
        'separator_head_left',
        'separator_head_right',
        'separator_inlet',
        'separator_gas_outlet',
        'separator_oil_outlet',
        'separator_water_outlet'
      ),
      hide: uids(
        'separator_cut_shell',
        'separator_cut_edge_top',
        'separator_cut_edge_bottom',
        'separator_cutaway_rim',
        'separator_internal_water',
        'separator_internal_oil',
        'separator_internal_gas'
      ),
      ghost: [],
    },
    half: {
      show: uids(
        'separator_cut_shell',
        'separator_cut_edge_top',
        'separator_cut_edge_bottom',
        'separator_cutaway_rim',
        'separator_internal_water',
        'separator_internal_oil',
        'separator_internal_gas',
        'separator_internal_weir',
        'separator_internal_baffle',
        'separator_internal_inlet_distributor',
        'separator_internal_vortex_breaker'
      ),
      hide: uids('separator_shell'),
      ghost: uids('separator_head_left', 'separator_head_right'),
    },
    full: { show: [], hide: [], ghost: [] },
    ghost: {
      show: uids(
        'separator_internal_water',
        'separator_internal_oil',
        'separator_internal_gas',
        'separator_internal_weir',
        'separator_internal_baffle'
      ),
      hide: uids('separator_cut_shell'),
      ghost: uids('separator_shell', 'separator_head_left', 'separator_head_right'),
    },
  },
  dynamicBindings: [
    {
      bindingId: 'separator_liquid_level',
      kind: 'liquid_level',
      targetNodeUid: uidOf('separator_internal_water'),
      parameter: 'level',
      unit: 'percent',
      range: [0, 100],
      note: '教学示意值，未经标定，不得解释为真实容积百分比',
    },
    {
      bindingId: 'separator_oil_level',
      kind: 'liquid_level',
      targetNodeUid: uidOf('separator_internal_oil'),
      parameter: 'level',
      unit: 'percent',
      range: [0, 100],
    },
    {
      bindingId: 'separator_inlet_valve',
      kind: 'valve_wheel',
      targetNodeUid: uidOf('separator_valve_wheel'),
      parameter: 'openAngle',
      unit: 'degree',
      range: [0, 360],
    },
  ],
  nonInteractiveSupport: supportEntries,
  processBasis: [],
  limitations: [
    '教学示意结构，不用于工程设计、设备选型、机械强度或 CFD 仿真。',
    '内部挡板/堰板/除雾器数量与位置为示意值，未按工程图纸校核。',
    'processBasis 为空：本资产尚未登记任何工艺依据，任何物流连接必须标记为 draft 后方可开发预览。',
    '现有 GLB 未携带 extras.petro，nodeUid 与 glTF 节点的映射已在临时构建中验证但尚未回写到发布产物（extrasStatus=pending_rebuild）。',
    'build.blenderVersion=4.5.16 系由导出器标识 v4.5.51 与 docs/tooling-readiness.md 的旧记录推断，未在本机实测（本机仅安装 5.3.0）。',
    'structureModes.full 的 show/hide/ghost 三个数组为空：本资产只有完整壳（separator_shell）与沿 z=0 切开的真半剖壳（separator_cut_shell），不存在完整全剖表示，因此不提供 full 模式。Phase 4 只实现 external/half/ghost 三态。',
  ],
  license: {
    spdx: 'LicenseRef-Proprietary',
    holder: '项目内部',
    terms: '仅限本项目内部使用；对外再分发需书面许可。',
    thirdParty: [],
  },
};

await writeFile(OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`✓ 已生成 ${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
console.log(`  nodes=${manifestNodes.length}  support=${supportEntries.length}  anchors=${anchors.length}`);
console.log(`  GLB bytes=${bytes}  sha256=${sha256.slice(0, 16)}…`);
console.log(`  唯一 nodeUid=${seen.size} / 总节点=${nodes.length}`);
if (seen.size !== nodes.length) {
  console.error('✗ nodeUid 未覆盖全部 GLB 节点');
  process.exit(1);
}
