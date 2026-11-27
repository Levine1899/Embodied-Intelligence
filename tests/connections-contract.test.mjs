// 工艺连接校验器（tools/validate_connections.mjs）契约测试。
//
// 目的：用「每个只注入一种错误」的非法 fixture 证明校验器确实能挡住各类错误，
// 而不是只证明它「退出码非 0」。每个用例都断言具体错误码出现在输出里，
// 并断言输出中出现的错误码集合与预期完全一致（防止 fixture 顺带注入第二种错误）。
//
// 实测说明（以校验器实际代码为准）：
//   - waypoint 只有 2 个数字、approved 缺 reviewedBy/reviewedAt、approved+pendingBasis
//     会先被 JSON Schema（Ajv）拦下，实际门禁码是 SCHEMA；更靠后的
//     BASIS_UNAPPROVED / BASIS_CONTRADICTION 因此不可达，bad-waypoint.json 亦然。
//   - 非有限 waypoint（字面量 1e999 → JSON.parse 得 Infinity）能通过 schema 的 number，
//     由校验器语义检查 BAD_WAYPOINT 拦下——说明该码可达，不伪造。
//   - 因此这些 fixture 断言实际门禁码，并额外断言具体报错路径（如 /waypoints/0），
//     仍然精确证明「这一类错误被挡住」。
//
// 测试自包含：用 fileURLToPath(import.meta.url) 定位仓库根，不依赖 cwd 之外的绝对路径。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const VALIDATOR = path.join(ROOT, 'tools', 'validate_connections.mjs');
const FIXTURES = path.join(HERE, 'fixtures', 'connections');
const REAL_CONNECTIONS = path.join(ROOT, 'web', 'data', 'process-connections.json');
const REAL_MANIFEST = path.join(ROOT, 'web', 'assets', 'tower', 'tower.manifest.json');
const REAL_GLB = path.join(ROOT, 'web', 'assets', 'tower', 'tower.glb');
const EMPTY_GLB = path.join(FIXTURES, 'glb-override', 'empty.glb');
const OVERRIDE_MANIFEST = path.join(FIXTURES, 'manifest-override', 'tower.manifest.json');

const fixture = (name) => path.join(FIXTURES, name);

/* 清掉继承来的 PETRO_* 变量，再注入本用例需要的覆盖：
 * 父进程或 CI 上残留的覆盖值不应让契约测试产生假阳性/假阴性。 */
function runValidator({ args = [], env = {} } = {}) {
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('PETRO_')) delete childEnv[key];
  }
  Object.assign(childEnv, env);

  const res = spawnSync(process.execPath, [VALIDATOR, ...args], {
    cwd: ROOT,
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(res.error, undefined, `spawn 校验器失败：${res.error && res.error.message}`);

  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  return { status: res.status, stdout, stderr, output: `${stdout}${stderr}` };
}

/* 校验器的错误行形如：  ✗ DUP_CONNECTION_ID: conn_xxx: ... */
function errorCodes(output) {
  const codes = [...output.matchAll(/✗\s+([A-Z][A-Z0-9_]+):/gu)].map((m) => m[1]);
  return [...new Set(codes)];
}

function assertNoErrorCodes(result) {
  assert.deepEqual(errorCodes(result.output), [], `不应出现错误码：\n${result.output}`);
}

function assertFailsWithSingleCode(result, expectedCodes, extraChecks = []) {
  assert.notEqual(result.status, 0, `期望非 0 退出码，实际 ${result.status}：\n${result.output}`);
  assert.equal(result.status, 1, `校验器对校验错误固定 exit 1，实际 ${result.status}：\n${result.output}`);
  assert.deepEqual(
    errorCodes(result.output),
    expectedCodes,
    `错误码集合与预期不符（fixture 应只注入一种错误）：\n${result.output}`,
  );
  for (const expected of expectedCodes) {
    assert.ok(
      result.output.includes(`✗ ${expected}:`),
      `输出缺少错误码 ${expected}：\n${result.output}`,
    );
  }
  for (const text of extraChecks) {
    assert.ok(result.output.includes(text), `输出缺少「${text}」：\n${result.output}`);
  }
}

// ---------------------------------------------------------------------------
// 1) 合法副本必须通过
// ---------------------------------------------------------------------------

test('valid.json：合法连接副本在默认模式退出码 0', () => {
  const result = runValidator({ env: { PETRO_CONNECTIONS_PATH: fixture('valid.json') } });
  assert.equal(result.status, 0, `合法 fixture 应通过：\n${result.output}`);
  assert.match(result.stdout, /✓ 连接校验通过/);
  assertNoErrorCodes(result);
});

test('valid.json：显式用环境变量指向仓库真实 manifest/glb 时仍通过（覆盖默认值但不改变语义）', () => {
  const result = runValidator({
    env: {
      PETRO_CONNECTIONS_PATH: fixture('valid.json'),
      PETRO_TOWER_MANIFEST_PATH: REAL_MANIFEST,
      PETRO_TOWER_GLB_PATH: REAL_GLB,
    },
  });
  assert.equal(result.status, 0, `显式覆盖真实资产路径后应通过：\n${result.output}`);
  assertNoErrorCodes(result);
});

test('valid.json：--strict 下仍被 draft 依据阻断（结构合法 ≠ 可发布）', () => {
  const result = runValidator({
    args: ['--strict'],
    env: { PETRO_CONNECTIONS_PATH: fixture('valid.json') },
  });
  assert.equal(result.status, 1, `draft fixture 在 strict 下必须失败：\n${result.output}`);
  assert.match(result.stderr, /\[BLOCKED\]/);
  assert.match(result.stderr, /conn_atm_overhead_to_condenser/);
});

// ---------------------------------------------------------------------------
// 2) 非法 fixture：每个只注入一种错误
// ---------------------------------------------------------------------------

const CASES = [
  {
    name: 'dup-connection-id.json',
    codes: ['DUP_CONNECTION_ID'],
    description: '两条连接使用同一 connectionId',
    checks: ['conn_atm_overhead_to_condenser'],
  },
  {
    name: 'missing-anchor.json',
    codes: ['MISSING_ANCHOR'],
    description: 'from.anchorId 不在 Manifest anchors[]',
    checks: ['anchor_does_not_exist'],
  },
  {
    name: 'bad-space.json',
    codes: ['CONN_SPACE_MISMATCH'],
    description: 'connection.coordinateSpaceId 与顶层/Manifest 不一致',
    checks: ['distillation_unit_other_local'],
  },
  {
    name: 'basis-draft-approved.json',
    codes: ['SCHEMA'],
    description: 'reviewStatus=approved 却缺 reviewedBy/reviewedAt（schema allOf 先拦下）',
    checks: ['/connections/0/basis', 'reviewedBy', 'reviewedAt'],
  },
  {
    name: 'basis-contradiction.json',
    codes: ['SCHEMA'],
    description: 'reviewStatus=approved 却 pendingBasis=true（schema 常量约束先拦下）',
    checks: ['/connections/0/basis/pendingBasis'],
  },
  {
    name: 'basis-rejected.json',
    codes: ['BASIS_REJECTED'],
    description: 'reviewStatus=rejected 禁止渲染（语义门禁可达）',
    checks: ['禁止正式渲染'],
  },
  {
    name: 'bad-waypoint.json',
    codes: ['SCHEMA'],
    description: 'waypoint 只有 2 个数字（schema vec3 先拦下）',
    checks: ['/connections/0/waypoints/0'],
  },
  {
    name: 'bad-waypoint-nonfinite.json',
    codes: ['BAD_WAYPOINT'],
    description: 'waypoint 含非有限值 1e999（JSON.parse → Infinity，schema number 放行，语义门禁拦下）',
    checks: ['waypoints[0] 不是 3 个有限数'],
  },
  {
    name: 'waypoint-dup-endpoint.json',
    codes: ['WAYPOINT_DUP_ENDPOINT'],
    description: 'waypoint 与 from 端点（anchor_atm_overhead_outlet）重合',
    checks: ['与 from 端点重合'],
  },
  {
    name: 'no-geometry.json',
    codes: ['NO_CONNECTION_GEOMETRY'],
    description: '连接 JSON 不变，但 GLB 副本中没有任何节点带该 connectionId',
    env: () => ({ PETRO_TOWER_GLB_PATH: EMPTY_GLB }),
    checks: ['实体管线未由该连接生成'],
  },
  {
    name: 'anchor-owner-mismatch.json',
    codes: ['ANCHOR_OBJECT_MISMATCH'],
    description: '端点 objectId 与 anchor.ownerObjectId 不符',
    checks: ['reflux_drum', 'ownerObjectId=atmospheric_tower'],
  },
  {
    name: 'geometry-ref-not-found.json',
    codes: ['GEOMETRY_REF_NOT_FOUND'],
    description: 'geometryRefs 含 GLB 中不存在的对象前缀',
    checks: ['Pipe_Does_Not_Exist'],
  },
  {
    name: 'unlisted-geometry.json',
    codes: ['UNLISTED_CONNECTION_GEOMETRY'],
    description: 'GLB 节点带该 connectionId，但不匹配声明的 geometryRefs',
    checks: ['Pipe_Top_Vapor_Elbow'],
  },
];

for (const testCase of CASES) {
  test(`非法 fixture：${testCase.name} → ${testCase.codes.join(' / ')}（${testCase.description}）`, () => {
    const result = runValidator({
      env: {
        PETRO_CONNECTIONS_PATH: fixture(testCase.name),
        ...(testCase.env ? testCase.env() : {}),
      },
    });
    assertFailsWithSingleCode(result, testCase.codes, testCase.checks);
  });
}

// ---------------------------------------------------------------------------
// 3) manifest 侧错误：用 manifest 副本 + PETRO_TOWER_MANIFEST_PATH
// ---------------------------------------------------------------------------

test('非法 manifest 副本：spaceId 不一致 → SPACE_MISMATCH（PETRO_TOWER_MANIFEST_PATH 生效）', () => {
  const result = runValidator({
    env: {
      PETRO_CONNECTIONS_PATH: fixture('valid.json'),
      PETRO_TOWER_MANIFEST_PATH: OVERRIDE_MANIFEST,
    },
  });
  assertFailsWithSingleCode(result, ['SPACE_MISMATCH'], [
    'distillation_unit_override_local',
    'distillation_unit_asset_local',
  ]);
});

// ---------------------------------------------------------------------------
// 4) 仓库真实数据的两种门禁语义（关键回归）
// ---------------------------------------------------------------------------

test('真实数据（默认模式，开发门禁）：退出码 0，仅告警 draft', () => {
  const result = runValidator();
  assert.equal(result.status, 0, `真实数据默认模式应通过：\n${result.output}`);
  assert.match(result.stdout, /✓ 连接校验通过/);
  assert.match(result.stdout, /\[warn\] BASIS_DRAFT/);
  assertNoErrorCodes(result);
});

test('真实数据（--strict，发布门禁）：退出码 1，因为当前连接是 draft', () => {
  const result = runValidator({ args: ['--strict'] });
  assert.equal(result.status, 1, `真实数据 strict 模式必须被 draft 阻断：\n${result.output}`);
  assert.match(result.stderr, /\[BLOCKED\]/);
  assert.match(result.stderr, /conn_atm_overhead_to_condenser/);
  assert.match(result.stderr, /reviewStatus=draft/);
});
