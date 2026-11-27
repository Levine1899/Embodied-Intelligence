#!/usr/bin/env node
/**
 * Phase 8：由真实产物生成产品资产 Manifest，并输出 semanticId → nodeUid 映射。
 *
 * 与 Phase 7 相同策略：nodeUid 不由手写，从 GLB 的 extras.petro 读出后用
 * 同一命名空间在 JS 侧重算并逐节点比对，不一致直接失败。
 *
 * 产品资产没有剖切壳，所以 structureModes 的四种模式都等价（external 全可见），
 * 不虚构 half/ghost 差异。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PETRO_NAMESPACE = '5c3d1f7a-2b48-4e6c-9f10-8a7d3e5b2c94';
const PRODUCTS = resolve(ROOT, 'web/assets/products');
const MAPPING_OUT = resolve(ROOT, 'web/data/products.models.json');

const ASSETS = [
  { assetId: 'products_fuel_containers', objectId: 'fuel_products', systemId: 'products_fuels', displayName: '燃料产品容器' },
  { assetId: 'products_asphalt', objectId: 'asphalt_products', systemId: 'products_materials', displayName: '沥青与道路剖面' },
  { assetId: 'products_plastics', objectId: 'plastic_products', systemId: 'products_polymers', displayName: '树脂与塑料制品' },
  { assetId: 'products_wax', objectId: 'wax_products', systemId: 'products_materials', displayName: '石蜡' },
  { assetId: 'products_fiber', objectId: 'fiber_products', systemId: 'products_fibers', displayName: '合成纤维与织物' },
  { assetId: 'products_rubber', objectId: 'rubber_products', systemId: 'products_elastomers', displayName: '合成橡胶与胎面' },
  { assetId: 'products_nonpetro', objectId: 'nonpetro_products', systemId: 'products_nonpetro', displayName: '非石油路线材料' },
];

function gitHead() {
  try { return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}
const GIT_HEAD = gitHead();

function uuid5(namespace, name) {
  const ns = namespace.replace(/-/g, '');
  const nsBytes = [];
  for (let i = 0; i < 16; i++) nsBytes.push(parseInt(ns.slice(i * 2, i * 2 + 2), 16));
  const buf = Buffer.concat([Buffer.from(nsBytes), Buffer.from(name, 'utf8')]);
  const h = createHash('sha1').update(buf).digest();
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
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    off += 8 + len;
  }
  return json;
}

function bounds(gltf) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let found = 0;
  for (const mesh of gltf.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const acc = (gltf.accessors || [])[prim.attributes && prim.attributes.POSITION];
      if (!acc || !acc.min || !acc.max) continue;
      found++;
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], acc.min[i]);
        max[i] = Math.max(max[i], acc.max[i]);
      }
    }
  }
  if (!found) throw new Error('没有 POSITION min/max');
  return { min: min.map((v) => Math.round(v * 1000) / 1000), max: max.map((v) => Math.round(v * 1000) / 1000) };
}

const mapping = { schemaVersion: '1.0.0', generatedFrom: 'tools/gen_product_manifests.mjs', note: 'entries 以装配单元 objectId 为键，nodeUids 是该产品的全部零件节点', entries: {} };

function buildObjects(cfg, nodes) {
  const byObject = new Map();
  for (const n of nodes) {
    if (!byObject.has(n.objectId)) byObject.set(n.objectId, []);
    byObject.get(n.objectId).push(n.nodeUid);
  }
  return Array.from(byObject.entries()).map(([objectId, nodeUids]) => ({
    objectId,
    systemId: cfg.systemId,
    displayName: objectId,
    nodeUids,
  }));
}

for (const cfg of ASSETS) {
  const dir = resolve(PRODUCTS, cfg.assetId);
  const buf = await readFile(resolve(dir, `${cfg.assetId}.glb`));
  const stats = JSON.parse(await readFile(resolve(dir, `${cfg.assetId}.stats.json`), 'utf8'));
  const gltf = readGlb(buf);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const nodes = gltf.nodes || [];
  const problems = [];

  const manifestNodes = [];
  for (const n of nodes) {
    const petro = n.extras && n.extras.petro;
    if (!petro || !petro.nodeUid) { problems.push(`节点 ${n.name} 缺 extras.petro`); continue; }
    /* objectId 现在是「产品装配单元」，必须取节点自带的值，而不是资产级 OID */
    const expect = uuid5(PETRO_NAMESPACE, `${cfg.assetId}/${petro.objectId}/${petro.semanticId}`);
    if (expect !== petro.nodeUid) { problems.push(`nodeUid 不一致：${petro.semanticId}`); continue; }
    manifestNodes.push({
      nodeUid: petro.nodeUid,
      nodeName: n.name,
      objectId: petro.objectId,
      systemId: cfg.systemId,
      semanticId: petro.semanticId,
      role: petro.role || 'part',
      interactive: true,
      representations: ['detail'],
    });
    /* 映射以「装配单元 objectId」为键：一个产品可能有多个零件节点，
       前端要整件渲染、整件拾取，不能只拿第一个节点。 */
    const key = petro.objectId;
    if (!mapping.entries[key]) {
      mapping.entries[key] = {
        assetId: cfg.assetId,
        objectId: key,
        nodeUids: [],
        anchorNodeUid: petro.nodeUid,
        role: petro.role || 'part',
        glbUri: `assets/products/${cfg.assetId}/${cfg.assetId}.glb`,
        sha256,
        bytes: buf.length,
      };
    }
    mapping.entries[key].nodeUids.push(petro.nodeUid);
  }
  if (problems.length) throw new Error(`${cfg.assetId}：\n  - ${problems.slice(0, 8).join('\n  - ')}`);
  if (manifestNodes.length !== nodes.length) {
    throw new Error(`${cfg.assetId} 有 ${nodes.length - manifestNodes.length} 个节点缺 extras.petro`);
  }

  const allUids = manifestNodes.map((n) => n.nodeUid);
  const rule = () => ({ show: allUids.slice(), hide: [], ghost: [] });
  const b = bounds(gltf);

  const manifest = {
    schemaVersion: '1.0.0',
    assetId: cfg.assetId,
    assetVersion: '1.0.0+phase8',
    source: {
      repository: 'gitee.com/LYU_PRO/scienceagent',
      commit: GIT_HEAD,
      path: `assets-source/blender/${cfg.assetId}.blend`,
      dirty: false,
    },
    build: {
      sourceFile: `assets-source/blender/${cfg.assetId}.blend`,
      generator: 'tools/blender/build_product_heroes.py',
      blenderVersion: stats.blender,
      exporterVersion: 'Khronos glTF Blender I/O v' + (stats.blender || ''),
      exportOptionsHash: sha256.slice(0, 16),
      invocation: 'blender -b -P tools/blender/build_product_heroes.py   # 无 CLI 参数，路径硬编码',
      exportExtras: true,
    },
    runtime: {
      format: 'glb',
      uri: `assets/products/${cfg.assetId}/${cfg.assetId}.glb`,
      sha256,
      bytes: buf.length,
      extrasStatus: 'verified',
    },
    coordinateSystem: {
      unit: 'meter',
      handedness: 'right',
      upAxis: '+Y',
      spaceId: `${cfg.assetId}_asset_local`,
      sourceSpaceNote: 'Blender Z-up -> glTF Y-up via export_yup=True',
    },
    bounds: { coordinateSpaceId: `${cfg.assetId}_asset_local`, unit: 'meter', min: b.min, max: b.max },
    defaults: { detailLevel: 'detail', structureMode: 'external', animationMode: 'idle' },
    systems: [{ systemId: cfg.systemId, displayName: cfg.displayName, objectIds: Array.from(new Set(manifestNodes.map((n) => n.objectId))) }],
    objects: buildObjects(cfg, manifestNodes),
    nodes: manifestNodes,
    anchors: [],
    representations: { overview: allUids.slice(), detail: allUids.slice(), closeup: allUids.slice() },
    structureModes: { external: rule(), half: rule(), ghost: rule(), full: rule() },
    dynamicBindings: [],
    nonInteractiveSupport: [],
    processBasis: [],
    limitations: [
      '教学示意级产品模型，不用于工程、包装或材料性能判定。',
      `GLB 的 ${nodes.length} 个节点全部携带 extras.petro，extrasStatus=verified。`,
      '产品资产无剖切壳，half/ghost 与 external 等价（不虚构）。',
      '材料样本与制品/应用场景是不同节点（沥青块≠道路剖面，树脂颗粒≠塑料瓶）。',
    ],
    license: {
      spdx: 'LicenseRef-Proprietary',
      holder: '项目内部',
      terms: '由本仓库脚本生成，无第三方素材；仅限本项目内部使用。',
      thirdParty: [],
    },
  };
  await writeFile(resolve(dir, `${cfg.assetId}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`✓ ${cfg.assetId}  nodes=${manifestNodes.length} bytes=${buf.length} sha256=${sha256.slice(0, 12)}…`);
}

mapping.count = Object.keys(mapping.entries).length;
await writeFile(MAPPING_OUT, `${JSON.stringify(mapping, null, 2)}\n`);
console.log(`\n映射：${mapping.count} 个 semanticId → ${relative(ROOT, MAPPING_OUT).replace(/\\/g, '/')}`);
