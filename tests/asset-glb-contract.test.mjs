import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATOR = resolve(ROOT, 'tools/validate_assets.mjs');
const TOWER_MANIFEST = resolve(ROOT, 'web/assets/tower/tower.manifest.json');

/**
 * 资产契约的 GLB/extras/hash 一类校验，必须拿真的 GLB 才测得出来
 * （mini fixture 没有 GLB，覆盖不到 EXTRAS_* / GLB_HASH_MISMATCH）。
 * 所以在临时目录里对真实 tower manifest 做单点变异，再交给校验器。
 */
function runValidator(manifestPath) {
  const r = spawnSync(process.execPath, [VALIDATOR, manifestPath], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return { status: r.status, out };
}

const realManifest = JSON.parse(readFileSync(TOWER_MANIFEST, 'utf8'));

function withMutatedManifest(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'petro-asset-fixture-'));
  const copy = structuredClone(realManifest);
  mutate(copy);
  const p = join(dir, 'mutated.manifest.json');
  writeFileSync(p, JSON.stringify(copy, null, 2));
  return { path: p, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** 每个用例：变异 → 跑校验器 → 断言非 0 且命中期望错误码 */
function expectFailure(name, mutate, expectedCode) {
  test(`资产契约：${name} → ${expectedCode}`, () => {
    const fx = withMutatedManifest(mutate);
    try {
      const { status, out } = runValidator(fx.path);
      assert.notEqual(status, 0, `期望校验失败但退出码为 0。输出：\n${out}`);
      assert.ok(
        out.includes(expectedCode),
        `输出里没有出现期望错误码 ${expectedCode}。实际输出：\n${out.slice(0, 2000)}`,
      );
    } finally {
      fx.cleanup();
    }
  });
}

test('资产契约：真实 tower manifest 原样应通过（阳性对照）', () => {
  const fx = withMutatedManifest(() => {});
  try {
    const { status, out } = runValidator(fx.path);
    assert.equal(status, 0, `原样副本应通过，实际退出码 ${status}。输出：\n${out.slice(0, 2000)}`);
  } finally {
    fx.cleanup();
  }
});

expectFailure('GLB sha256 与文件不符', (m) => {
  m.runtime.sha256 = 'f'.repeat(64);
}, 'GLB_HASH_MISMATCH');

expectFailure('GLB 字节数与文件不符', (m) => {
  m.runtime.bytes = 12345;
}, 'GLB_BYTES_MISMATCH');

expectFailure('GLB uri 指向不存在的文件', (m) => {
  m.runtime.uri = 'assets/tower/does-not-exist.glb';
}, 'GLB_MISSING');

/* 选一个引用最少、改 objectId 不会连带产生悬空引用的节点。
 * 优先挑 nonInteractiveSupport 里的 support 节点（它们不被 structureModes 引用）。 */
function pickNodeForObjectIdMutation(m) {
  const supportUids = new Set(m.nonInteractiveSupport.map((s) => s.nodeUid));
  const candidate = m.nodes.find((n) => supportUids.has(n.nodeUid) && n.objectId) || m.nodes.find((n) => n.objectId);
  assert.ok(candidate, '找不到可变异节点');
  return candidate;
}

expectFailure('GLB extras 的 objectId 与 Manifest 不一致', (m) => {
  const n = pickNodeForObjectIdMutation(m);
  const other = m.objects.find((o) => o.objectId !== n.objectId);
  assert.ok(other, '需要至少两个 object 才能变异 objectId');
  n.objectId = other.objectId;
}, 'EXTRAS_OBJECTID_MISMATCH');

/* 说明：校验器里另有 BAD_SUPPORT_UID，但 schema 的 uuidV5 pattern 会先拦下同样的输入，
 * 该分支属于防御性死代码（后续若放宽 schema 才会生效）。这里断言真实的拦截层。 */
expectFailure('support 条目 nodeUid 不是 UUIDv5（被 schema 拦截）', (m) => {
  assert.ok(m.nonInteractiveSupport.length > 0, '该资产应有 nonInteractiveSupport 才测得到');
  m.nonInteractiveSupport[0].nodeUid = 'not-a-uuid';
}, 'SCHEMA_');

expectFailure('same nodeUid 同时出现在 nodes 与 support', (m) => {
  assert.ok(m.nonInteractiveSupport.length > 0, '该资产应有 nonInteractiveSupport');
  m.nonInteractiveSupport[0].nodeUid = m.nodes[0].nodeUid;
}, 'SUPPORT_ALSO_NODE');

expectFailure('Manifest 引用不存在的 anchor 目标节点', (m) => {
  assert.ok(m.anchors.length > 0, '该资产应有 anchors');
  m.anchors[0].ownerObjectId = 'object_that_does_not_exist';
}, 'MISSING_OBJECT_REF');
