#!/usr/bin/env node
/**
 * Phase 9：为 L1 地下资产生成 Manifest + 锚点映射。
 *
 * 与 Phase 7/8 同一套契约：nodeUid = uuid5(NS, "{assetId}/{objectId}/{semanticId}")，
 * 从 GLB 的 extras.petro 读出后在 JS 侧独立重算，逐节点比对，不一致直接失败。
 *
 * 额外产出 `web/data/underground.anchors.json`：
 *   - wellhead_outlet / perforation_zone / reservoir_top / reservoir_bottom
 * 供粒子路径与剖切定位引用（Phase 9 要求"粒子路径引用 anchors"）。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NS = '5c3d1f7a-2b48-4e6c-9f10-8a7d3e5b2c94';
const DIR = resolve(ROOT, 'web/assets/underground');
const ANCHORS_OUT = resolve(ROOT, 'web/data/underground.anchors.json');

const ASSETS = [
  {
    assetId: 'underground_strata', objectId: 'geology', systemId: 'underground_geology',
    displayName: '地层剖面', reps: { overview: ['stratum'], detail: ['stratum', 'bedding'], closeup: ['stratum', 'bedding', 'reservoir_body'] },
  },
  {
    assetId: 'underground_wellbore', objectId: 'wellbore', systemId: 'underground_wellbore',
    displayName: '井筒剖面', reps: { overview: ['casing', 'cement', 'tubing'], detail: ['casing', 'cement', 'tubing', 'perforation'], closeup: ['casing', 'cement', 'tubing', 'perforation'] },
  },
  {
    assetId: 'underground_wellhead', objectId: 'wellhead', systemId: 'underground_wellhead',
    displayName: '井口装置', reps: { overview: ['tree', 'valve', 'outlet', 'flowline', 'pad'], detail: ['tree', 'valve', 'valve_wheel', 'flange', 'outlet', 'flowline', 'pad'], closeup: ['tree', 'valve', 'valve_wheel', 'flange', 'outlet', 'flowline', 'pad'] },
  },
  {
    assetId: 'reservoir_micro', objectId: 'micro', systemId: 'reservoir_micro',
    displayName: '储层孔隙微观', reps: { overview: ['grain', 'pore'], detail: ['grain', 'pore', 'throat'], closeup: ['grain', 'pore', 'throat', 'oil'] },
  },
];

function gitHead() {
  try { return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}
const HEAD = gitHead();

function uuid5(namespace, name) {
  const nsBytes = [];
  for (let i = 0; i < 16; i++) nsBytes.push(parseInt(namespace.replace(/-/g, '').slice(i * 2, i * 2 + 2), 16));
  const h = createHash('sha1').update(Buffer.concat([Buffer.from(nsBytes), Buffer.from(name, 'utf8')])).digest();
  const b = Array.from(h.slice(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB');
  let off = 12, json = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) json = JSON.parse(buf.subarray(off + 8, off + 8 + len).toString('utf8'));
    off += 8 + len;
  }
  return json;
}

const anchors = { schemaVersion: '1.0.0', generatedFrom: 'tools/gen_underground_manifests.mjs', anchors: {} };

for (const cfg of ASSETS) {
  const buf = await readFile(resolve(DIR, cfg.assetId, `${cfg.assetId}.glb`));
  const stats = JSON.parse(await readFile(resolve(DIR, cfg.assetId, `${cfg.assetId}.stats.json`), 'utf8'));
  const gltf = readGlb(buf);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const nodes = [];
  const problems = [];

  for (const n of gltf.nodes || []) {
    const petro = n.extras && n.extras.petro;
    if (!petro || !petro.nodeUid) { problems.push(`节点 ${n.name} 缺 extras.petro`); continue; }
    const expect = uuid5(NS, `${cfg.assetId}/${petro.objectId}/${petro.semanticId}`);
    if (expect !== petro.nodeUid) { problems.push(`nodeUid 不一致：${petro.semanticId}`); continue; }
    nodes.push({
      nodeUid: petro.nodeUid, nodeName: n.name, objectId: petro.objectId, systemId: cfg.systemId,
      semanticId: petro.semanticId, role: petro.role || 'part', interactive: true, representations: ['detail'],
    });
  }
  if (problems.length) throw new Error(`${cfg.assetId}：\n  - ${problems.join('\n  - ')}`);

  /* 每个 representation 按角色筛出可见节点——这就是 overview/detail/closeup 分层加载的依据 */
  const byRole = (roles) => nodes.filter((n) => roles.includes(n.role)).map((n) => n.nodeUid);
  const reps = {};
  for (const [key, roles] of Object.entries(cfg.reps)) {
    reps[key] = byRole(roles);
  }
  const allUids = nodes.map((n) => n.nodeUid);
  const rule = () => ({ show: allUids.slice(), hide: [], ghost: [] });

  const manifest = {
    schemaVersion: '1.0.0',
    assetId: cfg.assetId,
    assetVersion: '2.0.0+phase9',
    source: { repository: 'gitee.com/LYU_PRO/scienceagent', commit: HEAD, path: `assets-source/blender/${cfg.assetId}.blend`, dirty: false },
    build: {
      sourceFile: `assets-source/blender/${cfg.assetId}.blend`,
      generator: 'tools/blender/build_underground_v2.py',
      blenderVersion: stats.blender,
      exporterVersion: 'Khronos glTF Blender I/O',
      exportOptionsHash: sha256.slice(0, 16),
      invocation: 'blender -b -P tools/blender/build_underground_v2.py',
      exportExtras: true,
    },
    runtime: { format: 'glb', uri: `assets/underground/${cfg.assetId}/${cfg.assetId}.glb`, sha256, bytes: buf.length, extrasStatus: 'verified' },
    coordinateSystem: { unit: 'meter', handedness: 'right', upAxis: '+Y', spaceId: `${cfg.assetId}_asset_local`, sourceSpaceNote: 'Blender Z-up -> glTF Y-up via export_yup=True' },
    bounds: { coordinateSpaceId: `${cfg.assetId}_asset_local`, unit: 'meter', min: stats.bounds.min, max: stats.bounds.max },
    defaults: { detailLevel: 'detail', structureMode: 'external', animationMode: 'idle' },
    systems: [{ systemId: cfg.systemId, displayName: cfg.displayName, objectIds: Array.from(new Set(nodes.map((n) => n.objectId))) }],
    objects: Array.from(new Set(nodes.map((n) => n.objectId))).map((oid) => ({
      objectId: oid, systemId: cfg.systemId, displayName: oid, nodeUids: nodes.filter((n) => n.objectId === oid).map((n) => n.nodeUid),
    })),
    nodes,
    anchors: [],
    representations: { overview: reps.overview, detail: reps.detail, closeup: reps.closeup },
    structureModes: { external: rule(), half: rule(), ghost: rule(), full: rule() },
    dynamicBindings: [],
    nonInteractiveSupport: [],
    processBasis: [],
    limitations: [
      '教学示意资产；地层厚度与比例不代表真实地质参数。',
      '不含任何孔隙度、渗透率、压力等数值——只表达拓扑与层级关系。',
      '井筒/井口尺寸为示意，非工程图。',
      ...(stats.notes || []),
    ],
    license: { spdx: 'LicenseRef-Proprietary', holder: '项目内部', terms: '由本仓库脚本生成，无第三方素材。', thirdParty: [] },
  };

  await writeFile(resolve(DIR, cfg.assetId, `${cfg.assetId}.manifest.json`), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ ${cfg.assetId}  nodes=${nodes.length} reps=${JSON.stringify(Object.fromEntries(Object.entries(reps).map(([k, v]) => [k, v.length])))}`);

  /* 锚点：从节点包围盒推导，供粒子路径与剖切定位引用 */
  if (cfg.assetId === 'underground_wellbore') {
    const casing = nodes.find((n) => n.semanticId === 'well_casing');
    const perf = nodes.find((n) => n.semanticId === 'well_perforation_00');
    if (casing) anchors.anchors['wellbore_top'] = { nodeUid: casing.nodeUid, space: `${cfg.assetId}_asset_local`, point: [0, 1.3, 0] };
    if (perf) anchors.anchors['perforation_zone'] = { nodeUid: perf.nodeUid, space: `${cfg.assetId}_asset_local`, point: [0.0, -5.7, 0.0] };
  }
  if (cfg.assetId === 'underground_wellhead') {
    const outlet = nodes.find((n) => n.semanticId === 'wellhead_outlet');
    if (outlet) anchors.anchors['wellhead_outlet'] = { nodeUid: outlet.nodeUid, space: `${cfg.assetId}_asset_local`, point: [1.5, 0.86, 0] };
  }
  if (cfg.assetId === 'underground_strata') {
    anchors.anchors['reservoir_top'] = { nodeUid: null, space: 'l1_geology_local', point: [0, -4.02, 0] };
    anchors.anchors['reservoir_bottom'] = { nodeUid: null, space: 'l1_geology_local', point: [0, -7.27, 0] };
  }
}

anchors.count = Object.keys(anchors.anchors).length;
await writeFile(ANCHORS_OUT, JSON.stringify(anchors, null, 2) + '\n');
console.log(`\n锚点 ${anchors.count} 个 → web/data/underground.anchors.json`);
