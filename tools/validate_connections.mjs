// 工艺连接校验：把「唯一数据源 + 发布门禁」变成可执行的失败条件。
//
// 校验什么（任何一条不满足即退出码非 0）：
//   1. JSON 通过 schemas/process-connections.schema.json（AJV draft 2020-12）
//   2. coordinateSpaceId 三方一致：顶层 / 每条 connection / tower.manifest.json
//   3. connectionId 不重复
//   4. from/to 的 anchorId 必须存在于 Manifest anchors[]，且 anchor.ownerObjectId === endpoint.objectId
//   5. objectId 必须存在于 Manifest objects[]
//   6. waypoint 必须是 3 个有限数，且不得与任一端点重合（端点坐标不得重复保存）
//   7. 解析后的路径首点 === from 锚点、末点 === to 锚点（容差内）
//   8. 依据门禁：approved/reviewed 必须有 reviewedBy+reviewedAt；rejected 禁止渲染；pendingBasis 阻断正式发布
//   9. GLB 反查：geometryRefs 命中的节点必须带 extras.petro.connectionId，且该 connection 至少要有一段实体几何
//
// 两种模式：
//   默认      开发门禁：结构/引用/几何/依据字段合法性；允许非 approved 连接（仅告警）。
//   --strict  发布门禁：在默认之上，**任何非 approved 或 pendingBasis 的连接都使校验失败（退出码 1）**。
//             用于「准备正式发布」时，而不是每次提交时——push 不等于发布。

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
/* 允许指向别的连接文件，便于在临时副本上验证「approved 时应当通过」，
 * 而不必改动仓库里的正式数据。 */
const CONN_PATH = process.env.PETRO_CONNECTIONS_PATH
  ? path.resolve(process.env.PETRO_CONNECTIONS_PATH)
  : path.join(ROOT, 'web/data/process-connections.json');
const SCHEMA_PATH = path.join(ROOT, 'schemas/process-connections.schema.json');
const MANIFEST_PATH = path.join(ROOT, 'web/assets/tower/tower.manifest.json');
const GLB_PATH = path.join(ROOT, 'web/assets/tower/tower.glb');

const STRICT = process.argv.includes('--strict');
const TOLERANCE = 1e-6;          // 端点重合判定
const errors = [];
const warnings = [];
/* 收集"未获 approved 依据"的连接；strict 模式下这些必须让校验失败。 */
const blockedForPublish = [];

function fail(code, message) { errors.push({ code, message }); }
function warn(code, message) { warnings.push({ code, message }); }

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const close = (a, b) => Math.abs(a - b) <= TOLERANCE;

function parseGlbJson(glbPath) {
  const buf = readFileSync(glbPath);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB');
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
}

async function main() {
  for (const [label, p] of [['连接数据', CONN_PATH], ['Schema', SCHEMA_PATH], ['Manifest', MANIFEST_PATH], ['GLB', GLB_PATH]]) {
    if (!existsSync(p)) {
      fail('MISSING_FILE', `${label} 不存在：${path.relative(ROOT, p)}`);
    }
  }
  if (errors.length) return report();

  const conns = readJson(CONN_PATH);
  const schema = readJson(SCHEMA_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const gltf = parseGlbJson(GLB_PATH);

  // ---- 1) Schema
  const { default: Ajv2020 } = await import('ajv/dist/2020.js');
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(conns)) {
    for (const e of validate.errors || []) {
      fail('SCHEMA', `${e.instancePath || '/'} ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`);
    }
  }
  if (errors.length) return report();   // 结构不合法时后续检查无意义

  // ---- 2) 坐标空间三方一致
  const topSpace = conns.coordinateSpace?.coordinateSpaceId;
  const cs = manifest.coordinateSystem || {};
  const manifestSpace = cs.spaceId
    ?? manifest.bounds?.coordinateSpaceId
    ?? manifest.coordinateSpace?.coordinateSpaceId
    ?? null;
  if (!manifestSpace) {
    fail('MANIFEST_SPACE_MISSING', 'Manifest 未声明坐标空间（coordinateSystem.spaceId / bounds.coordinateSpaceId），无法核对');
  } else if (topSpace !== manifestSpace) {
    fail('SPACE_MISMATCH', `顶层 coordinateSpaceId=${topSpace} 与 Manifest=${manifestSpace} 不一致`);
  }
  // 单位/朝向/手性也必须一致，否则「同一个 assetRoot 变换」这句话不成立
  for (const [key, manifestKey] of [['unit', 'unit'], ['upAxis', 'upAxis'], ['handedness', 'handedness']]) {
    const a = conns.coordinateSpace?.[key];
    const b = cs[manifestKey];
    if (b && a !== b) {
      fail('SPACE_AXIS_MISMATCH', `coordinateSpace.${key}=${a} 与 Manifest coordinateSystem.${manifestKey}=${b} 不一致`);
    }
  }
  if (conns.coordinateSpace?.rootObjectId !== manifest.assetId) {
    fail('ROOT_MISMATCH', `rootObjectId=${conns.coordinateSpace?.rootObjectId} 与 Manifest assetId=${manifest.assetId} 不一致`);
  }

  // ---- 索引
  const anchorById = new Map((manifest.anchors || []).map((a) => [a.anchorId, a]));
  const objectIds = new Set((manifest.objects || []).map((o) => o.objectId));
  const seenConnIds = new Set();
  const glbNodes = gltf.nodes || [];
  const glbByConnection = new Map();
  for (const n of glbNodes) {
    const cid = n.extras?.petro?.connectionId;
    if (!cid) continue;
    if (!glbByConnection.has(cid)) glbByConnection.set(cid, []);
    glbByConnection.get(cid).push(n.name);
  }

  const resolved = [];

  for (const c of conns.connections) {
    const where = c.connectionId;

    // ---- 3) ID 重复
    if (seenConnIds.has(c.connectionId)) fail('DUP_CONNECTION_ID', `connectionId 重复：${where}`);
    seenConnIds.add(c.connectionId);

    // ---- 2b) 每条 connection 的坐标空间
    if (c.coordinateSpaceId !== topSpace) {
      fail('CONN_SPACE_MISMATCH', `${where}: coordinateSpaceId=${c.coordinateSpaceId} 与顶层 ${topSpace} 不一致`);
    }

    // ---- 4/5) 端点
    for (const [side, ep] of [['from', c.from], ['to', c.to]]) {
      if (!objectIds.has(ep.objectId)) {
        fail('UNKNOWN_OBJECT', `${where}.${side}.objectId=${ep.objectId} 不在 Manifest objects[]`);
      }
      const anchor = anchorById.get(ep.anchorId);
      if (!anchor) {
        fail('MISSING_ANCHOR', `${where}.${side}.anchorId=${ep.anchorId} 不在 Manifest anchors[]`);
        continue;
      }
      if (anchor.ownerObjectId !== ep.objectId) {
        fail('ANCHOR_OBJECT_MISMATCH',
          `${where}.${side}: anchor ${ep.anchorId} 的 ownerObjectId=${anchor.ownerObjectId}，与声明的 objectId=${ep.objectId} 不符`);
      }
      if (anchor.coordinateSpaceId && anchor.coordinateSpaceId !== topSpace) {
        fail('ANCHOR_SPACE_MISMATCH', `${where}.${side}: 锚点坐标空间 ${anchor.coordinateSpaceId} 与 ${topSpace} 不一致`);
      }
    }

    // ---- 6) waypoint 合法性
    const fromAnchor = anchorById.get(c.from.anchorId);
    const toAnchor = anchorById.get(c.to.anchorId);
    c.waypoints.forEach((w, i) => {
      if (!Array.isArray(w) || w.length !== 3 || w.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
        fail('BAD_WAYPOINT', `${where}.waypoints[${i}] 不是 3 个有限数`);
        return;
      }
      if (fromAnchor && [0, 1, 2].every((k) => close(w[k], fromAnchor.position[k]))) {
        fail('WAYPOINT_DUP_ENDPOINT', `${where}.waypoints[${i}] 与 from 端点重合；端点坐标不得重复保存`);
      }
      if (toAnchor && [0, 1, 2].every((k) => close(w[k], toAnchor.position[k]))) {
        fail('WAYPOINT_DUP_ENDPOINT', `${where}.waypoints[${i}] 与 to 端点重合；端点坐标不得重复保存`);
      }
    });

    // ---- 7) 解析路径（端点来自 manifest，只有中间点来自 JSON）
    if (fromAnchor && toAnchor) {
      const off = c.display.displayOffset || [0, 0, 0];
      const pts = [fromAnchor.position, ...c.waypoints, toAnchor.position].map((p) => [p[0] + off[0], p[1] + off[1], p[2] + off[2]]);
      const first = pts[0], last = pts[pts.length - 1];
      if (![0, 1, 2].every((k) => close(first[k], fromAnchor.position[k] + off[k]))) {
        fail('ENDPOINT_DRIFT', `${where}: 路径首点偏离 from 锚点`);
      }
      if (![0, 1, 2].every((k) => close(last[k], toAnchor.position[k] + off[k]))) {
        fail('ENDPOINT_DRIFT', `${where}: 路径末点偏离 to 锚点`);
      }
      resolved.push({ connectionId: c.connectionId, points: pts, basisStatus: c.basis.reviewStatus });
    }

    // ---- 8) 依据门禁
    const b = c.basis;
    if ((b.reviewStatus === 'approved' || b.reviewStatus === 'reviewed')
        && (!b.reviewedBy || !b.reviewedAt)) {
      fail('BASIS_UNAPPROVED', `${where}: reviewStatus=${b.reviewStatus} 但缺少 reviewedBy/reviewedAt`);
    }
    if (b.reviewStatus === 'rejected') {
      fail('BASIS_REJECTED', `${where}: basis 已被 rejected，禁止正式渲染`);
    }
    if (b.reviewStatus === 'approved' && b.pendingBasis) {
      fail('BASIS_CONTRADICTION', `${where}: approved 却标记 pendingBasis=true`);
    }
    if (b.reviewStatus !== 'approved' || b.pendingBasis) {
      blockedForPublish.push({
        connectionId: c.connectionId,
        reviewStatus: b.reviewStatus,
        pendingBasis: !!b.pendingBasis,
      });
    }
    if (b.reviewStatus === 'draft' || b.pendingBasis) {
      warn('BASIS_DRAFT', `${where}: reviewStatus=${b.reviewStatus}，pendingBasis=${!!b.pendingBasis} —— 仅开发态展示，不得进入正式发布清单`);
    }

    // ---- 9) GLB 反查
    const refs = c.geometryRefs || [];
    const glbNames = glbByConnection.get(c.connectionId) || [];
    if (!refs.length) {
      warn('NO_GEOMETRY_REFS', `${where}: 未声明 geometryRefs，无法反查实体几何`);
    } else if (!glbNames.length) {
      fail('NO_CONNECTION_GEOMETRY', `${where}: GLB 中没有任何节点带 connectionId=${c.connectionId}；实体管线未由该连接生成`);
    } else {
      const orphan = glbNames.filter((n) => !refs.some((r) => n.startsWith(r)));
      if (orphan.length) {
        fail('UNLISTED_CONNECTION_GEOMETRY', `${where}: 以下节点带该 connectionId 但不匹配任何 geometryRefs：${orphan.join(', ')}`);
      }
      const unmatched = refs.filter((r) => !glbNames.some((n) => n.startsWith(r)));
      if (unmatched.length) {
        fail('GEOMETRY_REF_NOT_FOUND', `${where}: geometryRefs 在 GLB 中无匹配节点：${unmatched.join(', ')}`);
      }
    }
  }

  // ---- 10) 反向：GLB 里带 connectionId 的节点必须能对上某条 connection
  for (const [cid, names] of glbByConnection) {
    if (!seenConnIds.has(cid)) {
      fail('ORPHAN_GLB_CONNECTION', `GLB 节点 ${names.join(', ')} 引用了不存在的 connectionId=${cid}`);
    }
  }

  // ---- 输出
  console.log(`连接数据：${path.relative(ROOT, CONN_PATH)}`);
  console.log(`坐标空间：${topSpace}（unit=${conns.coordinateSpace.unit}, up=${conns.coordinateSpace.upAxis}, ${conns.coordinateSpace.handedness}-handed）`);
  console.log(`连接条数：${conns.connections.length}`);
  for (const r of resolved) {
    console.log(`  · ${r.connectionId}  basis=${r.basisStatus}  路径点 ${r.points.length}`);
    r.points.forEach((p, i) => console.log(`      [${i}] ${p.map((v) => Number(v).toFixed(3)).join(', ')}`));
  }
  const draft = conns.connections.filter((c) => c.basis.reviewStatus !== 'approved');
  console.log(`已 approved：${conns.connections.length - draft.length} 条；非 approved：${draft.length} 条`);

  return report();
}

function report() {
  for (const w of warnings) console.log(`  [warn] ${w.code}: ${w.message}`);
  if (errors.length) {
    console.error(`\n[FAIL] ${errors.length} 个连接校验错误：`);
    for (const e of errors) console.error(`  ✗ ${e.code}: ${e.message}`);
    process.exit(1);
  }

  /* 发布门禁：strict 下非 approved 连接必须让校验失败。
   * 之前这里只打印一句 "BLOCKED" 却仍 exit 0，等于门禁只是标签。 */
  if (STRICT && blockedForPublish.length) {
    console.error(`\n[BLOCKED] 生产工艺连接门禁未通过：${blockedForPublish.length} 条连接没有 approved 依据`);
    for (const b of blockedForPublish) {
      console.error(`  ✗ ${b.connectionId}: reviewStatus=${b.reviewStatus}, pendingBasis=${b.pendingBasis}`);
    }
    console.error('  这些连接允许开发态展示，但不得进入正式发布清单。');
    console.error('  解除方式：补齐 basis 并把 reviewStatus 改为 approved、pendingBasis 改为 false。');
    process.exit(1);
  }

  if (blockedForPublish.length) {
    console.log(`\n[note] ${blockedForPublish.length} 条连接未获 approved 依据，仅开发态可用；发布前请跑 validate:connections:strict`);
  }
  console.log('\n✓ 连接校验通过');
  process.exit(0);
}

main().catch((err) => {
  console.error('[FATAL]', err && err.stack || err);
  process.exit(1);
});
