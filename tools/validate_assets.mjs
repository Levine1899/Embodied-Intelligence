#!/usr/bin/env node
/**
 * tools/validate_assets.mjs — 资产 Manifest 只读校验器
 *
 * 依据：docs/model-contract.md、V1.1《实施方案》§2.4、§10.1
 *
 * 校验层次（任一失败 → 退出码 1）：
 *   L1 Schema       AJV 2020-12 严格模式校验 schemas/asset-manifest.schema.json
 *   L2 唯一性       nodeUid 非空、格式为 UUIDv5、Manifest 内不重复；assetId/objectId/anchorId 不重复
 *   L3 引用完整性   systems↔objects、object.systemId、node.objectId、anchors、
 *                   representations/structureModes/dynamicBindings/nonInteractiveSupport 中的 nodeUid
 *   L4 GLB 一致性   读取 runtime.uri 指向的真实 GLB：
 *                    - sha256 / 字节数与 Manifest 一致
 *                    - Manifest 声明的每个节点确实存在于 GLB
 *                    - GLB 中不存在"未登记"节点（必须出现在 nodes[] 或 nonInteractiveSupport[]）
 *                    - extrasStatus=verified 时，逐节点核对 extras.petro.{nodeUid,objectId,semanticId}
 *
 * 用法：
 *   node tools/validate_assets.mjs                # 校验 web/assets/**\/*.manifest.json
 *   node tools/validate_assets.mjs <path...>      # 校验指定 Manifest
 *   node tools/validate_assets.mjs --fixtures     # 校验 tests/fixtures/asset-manifests 并按期望判定
 *   node tools/validate_assets.mjs --strict       # extrasStatus!=="verified" 时也判失败
 *
 * 只读：本工具不写入任何文件。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AJV_VERSION = () => require('ajv/package.json').version;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = path.join(ROOT, 'schemas', 'asset-manifest.schema.json');
const FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'asset-manifests');
const DEFAULT_GLOB_DIR = path.join(ROOT, 'web', 'assets');

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/* ---------------------------------------------------------------- 结果收集 */
class Report {
  constructor(file) {
    this.file = file;
    this.errors = [];
    this.warnings = [];
    this.notes = [];
  }
  error(code, where, message) {
    this.errors.push({ code, where, message });
  }
  warn(code, where, message) {
    this.warnings.push({ code, where, message });
  }
  note(message) {
    this.notes.push(message);
  }
  get ok() {
    return this.errors.length === 0;
  }
}

/* ---------------------------------------------------------------- 工具函数 */
async function walkJson(dir, suffix, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walkJson(p, suffix, out);
    else if (e.name.endsWith(suffix)) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/** 解析 GLB 的 JSON chunk；纯读取，不依赖 Three.js。 */
async function readGlbJson(absPath) {
  const buf = await readFile(absPath);
  if (buf.length < 20) throw new Error('文件过短，不是合法 GLB');
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'glTF') throw new Error(`magic 不是 glTF（实际 "${magic}"）`);
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(`glTF 版本 ${version} 不受支持（要求 2）`);
  const jsonLen = buf.readUInt32LE(12);
  const jsonType = buf.toString('ascii', 16, 20);
  if (jsonType !== 'JSON') throw new Error(`首个 chunk 不是 JSON（实际 "${jsonType}"）`);
  const text = buf.toString('utf8', 20, 20 + jsonLen).replace(/\u0000+$/, '');
  return { json: JSON.parse(text), bytes: buf.length, buffer: buf };
}

/** 全项目唯一的 UUIDv5 命名空间（与 Blender/Python 侧一致）。 */
export const PETRO_NAMESPACE = '5c3d1f7a-2b48-4e6c-9f10-8a7d3e5b2c94';

/* ---------------------------------------------------------------- 校验主体 */
function validateReferences(m, rep) {
  const objectIds = new Set();
  const systemIds = new Set();
  const nodeUids = new Set();
  const anchorIds = new Set();
  const supportUids = new Set();

  // L2 唯一性 + 基础集合
  for (const s of m.systems) {
    if (systemIds.has(s.systemId)) rep.error('DUP_SYSTEM_ID', `systems[${s.systemId}]`, 'systemId 重复');
    systemIds.add(s.systemId);
  }
  for (const [i, o] of m.objects.entries()) {
    if (objectIds.has(o.objectId)) rep.error('DUP_OBJECT_ID', `objects[${i}].objectId=${o.objectId}`, 'objectId 重复');
    objectIds.add(o.objectId);
  }
  for (const [i, n] of m.nodes.entries()) {
    const where = `nodes[${i}] (${n.nodeName})`;
    if (!n.nodeUid || !n.nodeUid.trim()) {
      rep.error('EMPTY_NODEUID', where, 'nodeUid 为空');
    } else if (!UUID_V5.test(n.nodeUid)) {
      rep.error('BAD_NODEUID', `${where} nodeUid=${n.nodeUid}`, 'nodeUid 必须是 UUIDv5（版本 5、variant 8/9/a/b）');
    }
    if (nodeUids.has(n.nodeUid)) {
      rep.error('DUP_NODEUID', `${where} nodeUid=${n.nodeUid}`, 'nodeUid 在本 Manifest 内重复');
    }
    nodeUids.add(n.nodeUid);
  }
  for (const [i, s] of m.nonInteractiveSupport.entries()) {
    const where = `nonInteractiveSupport[${i}] (${s.nodeName})`;
    if (!UUID_V5.test(s.nodeUid)) rep.error('BAD_SUPPORT_UID', where, 'support 条目 nodeUid 必须是 UUIDv5');
    if (supportUids.has(s.nodeUid)) rep.error('DUP_SUPPORT_UID', where, 'support nodeUid 重复');
    supportUids.add(s.nodeUid);
    if (nodeUids.has(s.nodeUid)) {
      rep.error('SUPPORT_ALSO_NODE', where, '同一 nodeUid 同时出现在 nodes[] 与 nonInteractiveSupport[]');
    }
  }
  for (const [i, a] of m.anchors.entries()) {
    if (anchorIds.has(a.anchorId)) rep.error('DUP_ANCHOR_ID', `anchors[${i}].anchorId=${a.anchorId}`, 'anchorId 重复');
    anchorIds.add(a.anchorId);
  }

  // L3 引用完整性
  for (const s of m.systems) {
    for (const oid of s.objectIds) {
      if (!objectIds.has(oid)) {
        rep.error('MISSING_OBJECT_REF', `systems[${s.systemId}].objectIds`, `引用了不存在的 objectId "${oid}"`);
      }
    }
  }
  for (const o of m.objects) {
    if (!systemIds.has(o.systemId)) {
      rep.error('MISSING_SYSTEM_REF', `objects[${o.objectId}].systemId`, `引用了不存在的 systemId "${o.systemId}"`);
    }
    for (const uid of o.nodeUids) {
      if (!nodeUids.has(uid)) {
        rep.error('MISSING_NODE_REF', `objects[${o.objectId}].nodeUids`, `引用了不存在的 nodeUid "${uid}"`);
      }
    }
  }
  for (const n of m.nodes) {
    if (!objectIds.has(n.objectId)) {
      rep.error('MISSING_OBJECT_REF', `nodes (${n.nodeName}).objectId`, `引用了不存在的 objectId "${n.objectId}"`);
    }
  }
  for (const a of m.anchors) {
    if (!objectIds.has(a.ownerObjectId)) {
      rep.error('MISSING_OBJECT_REF', `anchors[${a.anchorId}].ownerObjectId`, `引用了不存在的 objectId "${a.ownerObjectId}"`);
    }
    if (a.nodeUid && !nodeUids.has(a.nodeUid)) {
      rep.error('MISSING_NODE_REF', `anchors[${a.anchorId}].nodeUid`, `引用了不存在的 nodeUid "${a.nodeUid}"`);
    }
  }
  for (const level of ['overview', 'detail', 'closeup']) {
    for (const uid of m.representations[level]) {
      if (!nodeUids.has(uid)) {
        rep.error('MISSING_NODE_REF', `representations.${level}`, `引用了不存在的 nodeUid "${uid}"`);
      }
    }
  }
  for (const mode of ['external', 'half', 'full', 'ghost']) {
    for (const bucket of ['show', 'hide', 'ghost']) {
      for (const uid of m.structureModes[mode][bucket]) {
        if (!nodeUids.has(uid)) {
          rep.error('MISSING_NODE_REF', `structureModes.${mode}.${bucket}`, `引用了不存在的 nodeUid "${uid}"`);
        }
      }
    }
  }
  for (const b of m.dynamicBindings) {
    if (!nodeUids.has(b.targetNodeUid)) {
      rep.error('MISSING_NODE_REF', `dynamicBindings[${b.bindingId}]`, `引用了不存在的 nodeUid "${b.targetNodeUid}"`);
    }
  }

  // bounds / coordinateSystem 空间一致性
  if (m.bounds.coordinateSpaceId !== m.coordinateSystem.spaceId) {
    rep.error('SPACE_MISMATCH', 'bounds.coordinateSpaceId',
      `bounds 空间 "${m.bounds.coordinateSpaceId}" 与 coordinateSystem.spaceId "${m.coordinateSystem.spaceId}" 不一致`);
  }
  for (const a of m.anchors) {
    if (a.coordinateSpaceId !== m.coordinateSystem.spaceId) {
      rep.error('SPACE_MISMATCH', `anchors[${a.anchorId}].coordinateSpaceId`,
        `锚点空间 "${a.coordinateSpaceId}" 未在 coordinateSystem 中登记`);
    }
  }

  return { nodeUids, supportUids, objectIds };
}

async function validateGlb(m, rep, strict) {
  const uri = m.runtime.uri.replace(/^\//, '');
  // URI 按站点根（web/）解析；同时也接受仓库根相对路径，便于 fixture 与构建产物共存。
  const candidates = [path.join(ROOT, 'web', uri), path.join(ROOT, uri)];
  const glbAbs = candidates.find((p) => existsSync(p));
  if (!glbAbs) {
    rep.error('GLB_MISSING', 'runtime.uri',
      `GLB 不存在：${uri}（已尝试 web/${uri} 与 ${uri}）`);
    return;
  }
  rep.note(`GLB 解析自 ${rel(glbAbs)}`);
  let parsed;
  try {
    parsed = await readGlbJson(glbAbs);
  } catch (e) {
    rep.error('GLB_UNREADABLE', 'runtime.uri', `${glbRel}: ${e.message}`);
    return;
  }
  const { json, bytes, buffer } = parsed;

  // 字节数与哈希
  if (bytes !== m.runtime.bytes) {
    rep.error('GLB_BYTES_MISMATCH', 'runtime.bytes', `Manifest 记录 ${m.runtime.bytes}，实际 ${bytes}`);
  }
  const { createHash } = await import('node:crypto');
  const sha = createHash('sha256').update(buffer).digest('hex');
  if (sha !== m.runtime.sha256) {
    rep.error('GLB_HASH_MISMATCH', 'runtime.sha256', `Manifest 记录 ${m.runtime.sha256.slice(0, 16)}…，实际 ${sha.slice(0, 16)}…`);
  }

  const gltfNodes = json.nodes || [];
  const byName = new Map();
  for (const [i, n] of gltfNodes.entries()) {
    const nm = n.name || `(node ${i})`;
    if (!byName.has(nm)) byName.set(nm, []);
    byName.get(nm).push({ index: i, node: n });
  }

  // 1) Manifest 声明的节点必须真的存在于 GLB（按显示名做初步对齐，nodeUid 才是权威）
  const declaredNames = new Set();
  for (const n of m.nodes) {
    declaredNames.add(n.nodeName);
    const hit = byName.get(n.nodeName);
    if (!hit) {
      rep.error('NODE_NOT_IN_GLB', `nodes (${n.nodeName})`, `GLB 中不存在同名节点；nodeName 仅用于对齐，缺失说明 Manifest 与产物不同步`);
    } else if (hit.length > 1) {
      rep.warn('NODE_NAME_AMBIGUOUS', `nodes (${n.nodeName})`, `GLB 中有 ${hit.length} 个同名节点；这正是禁止用 name 当主键的原因`);
    }
  }
  for (const s of m.nonInteractiveSupport) declaredNames.add(s.nodeName);

  // 2) GLB 里不允许出现"未登记"节点（防止辅助网格静默丢失）
  for (const [nm, list] of byName) {
    if (!declaredNames.has(nm)) {
      rep.error('UNREGISTERED_GLB_NODE', `GLB node "${nm}" (index ${list[0].index})`,
        'GLB 中存在未登记节点：必须写入 nodes[] 或 nonInteractiveSupport[]');
    }
  }

  // 3) extras 一致性
  const extrasNodes = gltfNodes.filter((n) => n.extras && n.extras.petro);
  rep.note(`GLB 节点 ${gltfNodes.length} 个，其中带 extras.petro 的 ${extrasNodes.length} 个；extrasStatus=${m.runtime.extrasStatus}`);

  const dotted = gltfNodes.filter((n) => n.extras && Object.keys(n.extras).some((k) => /\.\d{3}$/.test(k)));
  if (dotted.length) {
    rep.error('EXTRAS_DOTTED_KEYS', 'runtime.uri',
      `${dotted.length} 个节点的 extras 含 .NNN 重复键（如 ${JSON.stringify(Object.keys(dotted[0].extras))}）；` +
      '这是导出前未清理旧自定义属性所致，会污染身份。必须清理后重建。');
  }

  if (m.runtime.extrasStatus === 'verified') {
    if (extrasNodes.length !== gltfNodes.length) {
      rep.error('EXTRAS_INCOMPLETE', 'runtime.extrasStatus',
        `声明 verified，但仅 ${extrasNodes.length}/${gltfNodes.length} 个节点带 extras.petro`);
    }
    const extrasUid = new Set();
    for (const n of extrasNodes) {
      const p = n.extras.petro;
      if (!p.nodeUid || !UUID_V5.test(p.nodeUid)) {
        rep.error('EXTRAS_BAD_UID', `GLB node "${n.name}"`, `extras.petro.nodeUid 非法：${p.nodeUid}`);
        continue;
      }
      if (extrasUid.has(p.nodeUid)) {
        rep.error('EXTRAS_DUP_UID', `GLB node "${n.name}"`, `extras.petro.nodeUid 重复：${p.nodeUid}`);
      }
      extrasUid.add(p.nodeUid);
      const declared = m.nodes.find((x) => x.nodeName === n.name);
      if (declared && declared.nodeUid !== p.nodeUid) {
        rep.error('EXTRAS_UID_MISMATCH', `GLB node "${n.name}"`,
          `Manifest ${declared.nodeUid} ≠ extras ${p.nodeUid}`);
      }
      if (declared && p.objectId && declared.objectId !== p.objectId) {
        rep.error('EXTRAS_OBJECTID_MISMATCH', `GLB node "${n.name}"`,
          `Manifest objectId ${declared.objectId} ≠ extras ${p.objectId}`);
      }
      if (declared && declared.semanticId && p.semanticId && declared.semanticId !== p.semanticId) {
        rep.error('EXTRAS_SEMANTICID_MISMATCH', `GLB node "${n.name}"`,
          `Manifest semanticId ${declared.semanticId} ≠ extras ${p.semanticId}`);
      }
    }
  } else if (extrasNodes.length === 0) {
    const msg = `GLB 无 extras.petro（extrasStatus=${m.runtime.extrasStatus}）：nodeUid ↔ glTF node 的映射尚未在产物中验证`;
    if (strict) rep.error('EXTRAS_ABSENT', 'runtime.extrasStatus', msg);
    else rep.warn('EXTRAS_ABSENT', 'runtime.extrasStatus', msg);
  }
}

async function validateManifest(absPath, ajv, strict) {
  const rep = new Report(rel(absPath));
  let manifest;
  try {
    manifest = JSON.parse(await readFile(absPath, 'utf8'));
  } catch (e) {
    rep.error('JSON_INVALID', 'file', e.message);
    return rep;
  }

  if (!ajv(manifest)) {
    for (const err of ajv.errors || []) {
      rep.error('SCHEMA_' + (err.keyword || 'ERROR').toUpperCase(),
        `${err.instancePath || '/'}${err.params && err.params.missingProperty ? ' (缺少 ' + err.params.missingProperty + ')' : ''}`,
        err.message || 'schema 校验失败');
    }
    return rep; // Schema 不通过时后续检查无意义
  }

  validateReferences(manifest, rep);
  await validateGlb(manifest, rep, strict);
  return rep;
}

/* ---------------------------------------------------------------- fixtures */
async function runFixtures(ajv) {
  const expPath = path.join(FIXTURE_DIR, 'expectations.json');
  if (!existsSync(expPath)) {
    console.error(`✗ 缺少 fixture 期望文件：${rel(expPath)}`);
    return false;
  }
  const expectations = JSON.parse(await readFile(expPath, 'utf8'));
  const files = (await readdir(FIXTURE_DIR)).filter((f) => f.endsWith('.json') && f !== 'expectations.json').sort();
  let allGood = true;
  console.log('\n── fixtures ─────────────────────────────────────────');
  for (const f of files) {
    const expected = expectations[f];
    if (!expected) {
      console.log(`  ? ${f}  未在 expectations.json 中登记`);
      allGood = false;
      continue;
    }
    const rep = await validateManifest(path.join(FIXTURE_DIR, f), ajv, false);
    const actual = rep.ok ? 'pass' : 'fail';
    const good = actual === expected.expectedOutcome;
    if (!good) allGood = false;
    const firstErr = rep.errors[0];
    console.log(`  ${good ? '✓' : '✗'} ${f.padEnd(38)} 期望=${expected.expectedOutcome.padEnd(4)} 实际=${actual.padEnd(4)}` +
      (expected.expectCode ? `  期望错误码=${expected.expectCode}` +
        (rep.errors.some((e) => e.code === expected.expectCode) ? '（命中）' : '（未命中！）') : '') +
      (firstErr ? `\n        ↳ ${firstErr.code} @ ${firstErr.where}: ${firstErr.message}` : ''));
    if (expected.expectCode && !rep.errors.some((e) => e.code === expected.expectCode)) allGood = false;
  }
  return allGood;
}

/* ---------------------------------------------------------------- 入口 */
async function main() {
  const argv = process.argv.slice(2);
  const strict = argv.includes('--strict');
  const fixturesMode = argv.includes('--fixtures');
  const explicit = argv.filter((a) => !a.startsWith('--'));

  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  let validateFn;
  try {
    validateFn = ajv.compile(schema);
  } catch (e) {
    console.error(`✗ Schema 本身无法编译：${e.message}`);
    process.exit(1);
  }
  console.log(`Schema 编译通过：${rel(SCHEMA_PATH)}  (draft 2020-12, AJV ${AJV_VERSION()})`);

  if (fixturesMode) {
    const ok = await runFixtures(validateFn);
    console.log(`\n${ok ? '✓ fixtures 全部符合期望' : '✗ fixtures 存在不符合期望的用例'}`);
    process.exit(ok ? 0 : 1);
  }

  let files;
  if (explicit.length) {
    files = explicit.map((p) => path.resolve(ROOT, p));
  } else {
    files = await walkJson(DEFAULT_GLOB_DIR, '.manifest.json');
  }
  if (!files.length) {
    console.error(`✗ 未找到任何 *.manifest.json（搜索起点 ${rel(DEFAULT_GLOB_DIR)}）`);
    process.exit(1);
  }

  let failed = 0;
  let warned = 0;
  console.log('');
  for (const f of files.sort()) {
    const rep = await validateManifest(f, validateFn, strict);
    const badge = rep.ok ? (rep.warnings.length ? '△' : '✓') : '✗';
    console.log(`${badge} ${rep.file}`);
    for (const n of rep.notes) console.log(`    · ${n}`);
    for (const w of rep.warnings) console.log(`    ! [${w.code}] ${w.where}: ${w.message}`);
    for (const e of rep.errors) console.log(`    ✗ [${e.code}] ${e.where}: ${e.message}`);
    if (!rep.ok) failed += 1;
    else if (rep.warnings.length) warned += 1;
  }

  console.log(`\n合计 ${files.length} 个 Manifest：通过 ${files.length - failed}，失败 ${failed}` +
    (warned ? `，带告警 ${warned}` : '') + (strict ? '（strict 模式）' : ''));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('✗ 校验器内部错误：', e);
  process.exit(1);
});
