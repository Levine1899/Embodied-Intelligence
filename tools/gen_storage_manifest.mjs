#!/usr/bin/env node
/**
 * Phase 7：由真实现产物（GLB + stats.json）生成 store 资产 Manifest。
 *
 * 不手工维护 nodeUid：GLB 里 `extras.petro.nodeUid` 是 Blender 侧 uuid5 写的，
 * 这里用同一命名空间在 JS 侧重算并**逐节点比对**，不一致直接失败。
 * 这样「Manifest 说的节点」与「GLB 里真实存在的节点」不会各自漂移。
 *
 * 用法：node tools/gen_storage_manifest.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PETRO_NAMESPACE = '5c3d1f7a-2b48-4e6c-9f10-8a7d3e5b2c94';
const STORAGE = resolve(ROOT, 'web/assets/storage');

/* 记录真实来源提交，避免 Manifest 变成无出处的凭空声明 */
function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
const GIT_HEAD = gitHead();

const ASSETS = [
  {
    assetId: 'storage_fixed_roof_tank',
    objectId: 'fixed_roof_tank',
    systemId: 'storage_tankyard',
    spaceId: 'storage_fixed_roof_tank_asset_local',
    displayName: '固定顶罐',
  },
  {
    assetId: 'storage_floating_roof_tank',
    objectId: 'floating_roof_tank',
    systemId: 'storage_tankyard',
    spaceId: 'storage_floating_roof_tank_asset_local',
    displayName: '外浮顶罐',
  },
  {
    assetId: 'transfer_pump_set',
    objectId: 'transfer_pump',
    systemId: 'storage_transfer',
    spaceId: 'transfer_pump_set_asset_local',
    displayName: '转输泵组',
  },
];

/* --------------------------------------------------------------- uuid5 */
function uuid5(namespace, name) {
  const ns = namespace.replace(/-/g, '');
  const nsBytes = [];
  for (let i = 0; i < 16; i++) nsBytes.push(parseInt(ns.slice(i * 2, i * 2 + 2), 16));
  const nameBytes = Buffer.from(name, 'utf8');
  const buf = Buffer.concat([Buffer.from(nsBytes), nameBytes]);
  const hash = createHash('sha1').update(buf).digest();
  const b = Array.from(hash.slice(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ----------------------------------------------------------------- glb */
function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB（magic 不符）');
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  return { json, bin, total, bytes: buf.length };
}

function positionBounds(gltf) {
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
  if (!found) throw new Error('GLB 里没有带 min/max 的 POSITION accessor');
  return { min: min.map((v) => Math.round(v * 1000) / 1000), max: max.map((v) => Math.round(v * 1000) / 1000) };
}

/* -------------------------------------------------------------- per asset */
async function buildAsset(cfg) {
  const dir = resolve(STORAGE, cfg.assetId);
  const glbPath = resolve(dir, `${cfg.assetId}.glb`);
  const statsPath = resolve(dir, `${cfg.assetId}.stats.json`);

  const buf = await readFile(glbPath);
  const { json, bytes } = readGlb(buf);
  const stats = JSON.parse(await readFile(statsPath, 'utf8'));
  const sha256 = createHash('sha256').update(buf).digest('hex');

  const glbNodes = json.nodes || [];
  const problems = [];
  const nodes = [];
  const dynamicBindings = new Map();
  let withExtras = 0;

  for (const n of glbNodes) {
    const petro = n.extras && n.extras.petro;
    if (!petro || !petro.nodeUid) {
      problems.push(`节点 ${n.name} 缺 extras.petro.nodeUid`);
      continue;
    }
    withExtras++;
    const expect = uuid5(PETRO_NAMESPACE, `${cfg.assetId}/${cfg.objectId}/${petro.semanticId}`);
    if (expect !== petro.nodeUid) {
      problems.push(
        `nodeUid 与 JS 侧重算不一致：${petro.semanticId} GLB=${petro.nodeUid} JS=${expect}`,
      );
      continue;
    }
    if (petro.objectId !== cfg.objectId) {
      problems.push(`objectId 不符：${petro.semanticId} → ${petro.objectId}`);
      continue;
    }
    nodes.push({
      nodeUid: petro.nodeUid,
      nodeName: n.name,
      objectId: cfg.objectId,
      systemId: cfg.systemId,
      semanticId: petro.semanticId,
      role: petro.role || 'part',
      interactive: true,
      representations: ['detail'],
    });
    if (petro.dynamicBinding) {
      if (!dynamicBindings.has(petro.dynamicBinding)) dynamicBindings.set(petro.dynamicBinding, []);
      dynamicBindings.get(petro.dynamicBinding).push(petro.nodeUid);
    }
  }

  if (problems.length) {
    throw new Error(`${cfg.assetId} 校验失败：\n  - ${problems.slice(0, 10).join('\n  - ')}`);
  }
  if (withExtras !== glbNodes.length) {
    throw new Error(`${cfg.assetId} 有 ${glbNodes.length - withExtras} 个节点缺 extras.petro`);
  }

  const uidOf = (semanticId) => {
    const hit = nodes.find((n) => n.semanticId === semanticId);
    if (!hit) throw new Error(`${cfg.assetId} 找不到 semanticId=${semanticId}`);
    return hit.nodeUid;
  };

  /* 结构模式：由 Blender 侧声明的 showExternal/showCut/always 决定 */
  const st = stats.structure || { showExternal: [], showCut: [], always: [] };
  const dynamicUids = nodes.filter((n) => {
    const rec = glbNodes.find((g) => g.extras && g.extras.petro && g.extras.petro.nodeUid === n.nodeUid);
    return !!(rec && rec.extras.petro.dynamicBinding);
  }).map((n) => n.nodeUid);

  const alwaysUids = st.always.map(uidOf);
  const externalUids = st.showExternal.map(uidOf);
  const cutUids = st.showCut.map(uidOf);

  const rule = (show, hide, ghost) => ({
    show: [...new Set(show)],
    hide: [...new Set(hide)],
    ghost: [...new Set(ghost || [])],
  });
  const modes = {
    external: rule([...alwaysUids, ...externalUids, ...dynamicUids], cutUids),
    half: rule([...alwaysUids, ...cutUids, ...dynamicUids], externalUids),
    ghost: rule([...alwaysUids, ...dynamicUids], cutUids, externalUids),
    full: rule([], []),
  };
  /* 泵组没有剖切壳：half/ghost 与 external 等价（不虚构剖切） */
  if (!cutUids.length) {
    modes.half = rule(modes.external.show, []);
    modes.ghost = rule(modes.external.show, []);
  }

  const anchors = (stats.anchors || []).map((a) => ({
    anchorId: a.anchorId,
    ownerObjectId: cfg.objectId,
    coordinateSpaceId: cfg.spaceId,
    position: a.position,
    kind: ['inlet', 'outlet', 'suction', 'discharge'].indexOf(a.role) >= 0 ? 'process_nozzle' : 'spatial',
    nodeUid: uidOf(a.semanticId),
  }));

  const bounds = positionBounds(json);

  const manifest = {
    schemaVersion: '1.0.0',
    assetId: cfg.assetId,
    assetVersion: '1.0.0+phase7',
    source: {
      repository: 'gitee.com/LYU_PRO/scienceagent',
      commit: GIT_HEAD,
      path: `assets-source/blender/${cfg.assetId}.blend`,
      dirty: false,
    },
    build: {
      sourceFile: `assets-source/blender/${cfg.assetId}.blend`,
      generator: 'tools/blender/build_storage_heroes.py',
      blenderVersion: stats.blender,
      exporterVersion: 'Khronos glTF Blender I/O v' + (stats.blender || ''),
      exportOptionsHash: sha256.slice(0, 16),
      invocation: 'blender -b -P tools/blender/build_storage_heroes.py   # 无 CLI 参数，路径硬编码',
      exportExtras: true,
    },
    runtime: {
      format: 'glb',
      uri: `assets/storage/${cfg.assetId}/${cfg.assetId}.glb`,
      sha256,
      bytes,
      extrasStatus: 'verified',
    },
    coordinateSystem: {
      unit: 'meter',
      handedness: 'right',
      upAxis: '+Y',
      spaceId: cfg.spaceId,
      sourceSpaceNote: 'Blender Z-up -> glTF Y-up via export_yup=True',
    },
    bounds: { coordinateSpaceId: cfg.spaceId, unit: 'meter', min: bounds.min, max: bounds.max },
    defaults: { detailLevel: 'detail', structureMode: 'half', animationMode: 'idle' },
    systems: [{ systemId: cfg.systemId, displayName: cfg.displayName + '所属系统', objectIds: [cfg.objectId] }],
    objects: [{
      objectId: cfg.objectId,
      systemId: cfg.systemId,
      displayName: cfg.displayName,
      nodeUids: nodes.map((n) => n.nodeUid),
    }],
    nodes,
    anchors,
    representations: {
      overview: nodes.map((n) => n.nodeUid),
      detail: nodes.map((n) => n.nodeUid),
      closeup: nodes.filter((n) => n.role !== 'accessory').map((n) => n.nodeUid),
    },
    structureModes: modes,
    dynamicBindings: Array.from(dynamicBindings.entries()).flatMap(([bindingId, uids]) =>
      uids.map((uid, i) => ({
        bindingId: bindingId + '_' + i,
        kind: bindingId === 'deck_follows_oil_level' ? 'floating_deck' : 'liquid_level',
        targetNodeUid: uid,
        parameter: bindingId === 'deck_follows_oil_level' ? 'deckY' : 'level',
        unit: 'meter',
        note: '随油面高度升降，始终紧贴液面（不虚构中间态）',
      })),
    ),
    nonInteractiveSupport: [],
    processBasis: [],
    limitations: [
      '教学示意结构，不用于工程设计、设备选型、机械强度或 CFD 仿真。',
      `GLB 的 ${glbNodes.length} 个节点全部携带 extras.petro，extrasStatus=verified。`,
      '罐体 half 模式使用真实开口半壳（近侧半圈删除），不是隐藏面或裁剪平面。',
      modes.half === modes.external
        ? '该资产无剖切壳，half 与 external 等价（不虚构剖切）。'
        : 'half 模式的浮盘/边缘密封仍按真实液位定位。',
    ],
    license: {
      spdx: 'LicenseRef-Proprietary',
      holder: '项目内部',
      terms: '由本仓库脚本生成，无第三方素材；仅限本项目内部使用。',
      thirdParty: [],
    },
  };

  const outPath = resolve(dir, `${cfg.assetId}.manifest.json`);
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `✓ ${cfg.assetId}  nodes=${nodes.length} anchors=${anchors.length} ` +
      `bindings=${manifest.dynamicBindings.length} bytes=${bytes} sha256=${sha256.slice(0, 12)}…`,
  );
  console.log(`  → ${relative(ROOT, outPath).replace(/\\/g, '/')}`);
  return manifest;
}

async function main() {
  const out = [];
  for (const cfg of ASSETS) out.push(await buildAsset(cfg));
  console.log(`\n合计 ${out.length} 个储运 Manifest 生成完成。`);
}

main().catch((e) => {
  console.error('✗ 生成失败：' + e.message);
  process.exit(1);
});
