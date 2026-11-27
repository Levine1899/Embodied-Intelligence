# 工艺连接校验器 fixture（`tools/validate_connections.mjs`）

每个非法 fixture 都是「仓库真实连接数据的一个副本 + **只注入一种错误**」，供
`tests/connections-contract.test.mjs` 用 `spawnSync(process.execPath, ...)` 逐个跑校验器，
断言退出码非 0 且输出命中**具体错误码**。

`valid.json` 是 `web/data/process-connections.json` 的可通过副本（默认即指向仓库真实
`web/assets/tower/tower.manifest.json` + `tower.glb`）。它当前是 `draft` / `pendingBasis=true`：
默认模式（开发门禁）退出码 0，`--strict`（发布门禁）退出码 1——结构合法 ≠ 可发布。

## fixture 一览

| fixture | 注入的错误 | 期望错误码（实测） | 说明 |
| --- | --- | --- | --- |
| `valid.json` | 无（合法副本） | 退出码 0 | 默认模式通过；`--strict` 下因 draft 输出 `[BLOCKED]` 并退出 1 |
| `dup-connection-id.json` | 第二条连接复用同一 `connectionId` | `DUP_CONNECTION_ID` | 语义门禁 |
| `missing-anchor.json` | `from.anchorId` 不在 Manifest `anchors[]` | `MISSING_ANCHOR` | 语义门禁 |
| `bad-space.json` | connection 级 `coordinateSpaceId` 与顶层/Manifest 不一致 | `CONN_SPACE_MISMATCH` | 语义门禁 |
| `basis-draft-approved.json` | `reviewStatus=approved` 且 `reviewedBy/reviewedAt=null` | `SCHEMA` | 被 schema `allOf`（approved ⇒ 必须有 reviewedBy/At）先拦下；校验器的 `BASIS_UNAPPROVED` 不可达 |
| `basis-contradiction.json` | `reviewStatus=approved` 且 `pendingBasis=true` | `SCHEMA` | schema 常量约束（approved ⇒ pendingBasis=false）先拦下；`BASIS_CONTRADICTION` 不可达 |
| `basis-rejected.json` | `reviewStatus=rejected` | `BASIS_REJECTED` | 语义门禁可达，禁止渲染 |
| `bad-waypoint.json` | waypoint 只有 2 个数字 | `SCHEMA` | schema `vec3`（3 项）先拦下，语义 `BAD_WAYPOINT` 不可达 |
| `bad-waypoint-nonfinite.json` | waypoint 第三项写成字面量 `1e999`（JSON.parse → Infinity） | `BAD_WAYPOINT` | schema `number` 放行 Infinity，由语义检查拦下（该码可达） |
| `waypoint-dup-endpoint.json` | waypoint 与 `from` 锚点坐标重合 | `WAYPOINT_DUP_ENDPOINT` | 语义门禁 |
| `no-geometry.json` | JSON 与 `valid.json` 相同；GLB 副本里没有该 `connectionId` 的节点 | `NO_CONNECTION_GEOMETRY` | 需 `PETRO_TOWER_GLB_PATH=glb-override/empty.glb` |
| `anchor-owner-mismatch.json` | `from.objectId` 与锚点 `ownerObjectId` 不符 | `ANCHOR_OBJECT_MISMATCH` | 语义门禁 |
| `geometry-ref-not-found.json` | `geometryRefs` 含 GLB 中不存在的前缀 | `GEOMETRY_REF_NOT_FOUND` | 语义门禁 |
| `unlisted-geometry.json` | GLB 节点带该 connectionId 但不匹配任何 `geometryRefs` | `UNLISTED_CONNECTION_GEOMETRY` | 语义门禁 |

## 辅助资产

- `glb-override/empty.glb`：极简合法 GLB（只有 JSON chunk、`nodes: []`），用于让
  `no-geometry.json` 只触发 `NO_CONNECTION_GEOMETRY`（若靠 JSON 改 `connectionId` 会同时触发
  `ORPHAN_GLB_CONNECTION`，就不是「只注入一种错误」了）。
- `manifest-override/tower.manifest.json`：真实 manifest 的副本，仅把
  `coordinateSystem.spaceId` 改为 `distillation_unit_override_local`；配 `valid.json` 使用时
  只触发 `SPACE_MISMATCH`，用于证明 `PETRO_TOWER_MANIFEST_PATH` 生效。

## 环境变量

校验器默认读取仓库真实资产；以下变量只用于 fixture 覆盖（默认值不变）：

| 变量 | 作用 |
| --- | --- |
| `PETRO_CONNECTIONS_PATH` | 指定连接数据文件 |
| `PETRO_TOWER_MANIFEST_PATH` | 指定 `tower.manifest.json` 副本 |
| `PETRO_TOWER_GLB_PATH` | 指定 `tower.glb` 副本 |

## 为什么有些校验器错误码没有对应 fixture

位于 schema 校验之后的语义码，只有在其结构已被 schema 放行时才可达；实测结论：

- `BAD_WAYPOINT`：**部分可达**。waypoint 项数不是 3 时被 schema `vec3` 先拦下（对外显示
  `SCHEMA`）；但 `1e999` 这类字面量经 `JSON.parse` 得到 `Infinity`，schema 的 `number` 放行，
  由语义检查输出 `BAD_WAYPOINT`（见 `bad-waypoint-nonfinite.json`）。
- `BASIS_UNAPPROVED` / `BASIS_CONTRADICTION`：schema `allOf` 已要求 approved 必须带非空
  `reviewedBy`/`reviewedAt` 且 `pendingBasis=false`，任何违反都会先报 `SCHEMA`，故这两个码
  用 JSON 无法只触发。契约测试如实断言实际门禁码 `SCHEMA`（并校验报错路径
  `/connections/0/basis/...`），不伪造校验器不会输出的错误码。
- `ENDPOINT_DRIFT`：由构造决定不可达——路径端点始终取自 Manifest 锚点，`displayOffset`
  对两端一致施加，JSON 无法让首/末点偏离锚点。

## 手工复现

```powershell
$env:PETRO_CONNECTIONS_PATH = 'tests/fixtures/connections/anchor-owner-mismatch.json'
node tools/validate_connections.mjs          # 退出码 1，输出 ANCHOR_OBJECT_MISMATCH
```
