# 工艺连接契约（process connections contract）

> Phase 3 交付。约束「谁能定义连接、连接存哪、谁消费、怎么判失败」。
> 配套：`schemas/process-connections.schema.json`、`web/data/process-connections.json`、`tools/validate_connections.mjs`

---

## 1. 唯一数据源

`web/data/process-connections.json` 是**唯一**的工艺连接数据。

以下五处必须全部从它读取，任何一处出现坐标副本都视为违约：

| 消费方 | 读取方式 |
|---|---|
| Blender 实体管线 | `tools/make_tower.py` → `_load_connection()` |
| 前端教学线 | `web/world/connections.js` → `resolvePoints()` |
| 粒子动画 | 同上 → `create()` 里按 `display.particleSpeed/particleCount` 生成 |
| 方向箭头 | 同上 → `resolveCurve()` 的切线 |
| 总览 / tower.html | 必须引用同一 `connectionId` |

**禁止**：在关卡脚本里另写一组 CatmullRomCurve3 控制点；在 Blender 脚本里硬编码该路径的点；在 `tower.meta.json` 里再放一份映射。

---

## 2. 坐标约束

```
coordinateSpaceId = distillation_unit_asset_local   ← 与 tower.manifest.json 的 coordinateSystem.spaceId 完全一致
unit              = meter
upAxis            = +Y
handedness        = right
```

- 端点坐标**不写进连接 JSON**，一律由 `tower.manifest.json` 的 `anchors[].position` 提供。
- `waypoints` 只存**中间控制点**（assetLocal，米），不得与任一端点重合。
- Blender 侧换算：`blender = (x, -z, y)`（`make_tower.py` 的 `_yup_to_blender`，与 `anchor_web_y_up = [x, z, -y]` 互为逆运算）。
- 前端侧换算：几何在 assetLocal 里生成，**整体挂到 `unit`（assetRoot）下**，由 `unit.scale(SCALE)` 统一换算。关卡脚本不得再叠加任何未声明偏移。
- 需要让路线偏离实体管线以便观察时，只能写 `display.displayOffset`（仍在 assetLocal，米），且拓扑、起终点、物流含义不变。

---

## 3. 字段语义

| 字段 | 约束 |
|---|---|
| `connectionId` | `conn_[a-z0-9_]{2,60}`，全局唯一 |
| `from` / `to` | 只含 `objectId` + `anchorId`；两者必须与 Manifest 的 `anchors[].ownerObjectId` 吻合 |
| `waypoints` | 中间点数组，可为空；每项 3 个有限数 |
| `medium` / `phase` / `direction` | 物流含义；`phase` ∈ vapor/liquid/mixed/solid；`direction` ∈ forward/reverse/bidirectional |
| `displayColorToken` | CSS 变量名，形如 `--flow-vapor` |
| `display` | `overview` / `detail` / `particles` 开关 + `displayOffset` + 粒子参数 |
| `teachingSimplification` | 必填。相较真实工艺做了哪些简化 |
| `basis` | 工艺依据（见 §4） |
| `geometryRefs` | 实体管线对象名前缀，用于从 GLB 反查该连接生成的几何 |

---

## 4. 依据与发布门禁

每条 connection 自带完整 `basis`：`basisId / version / sourceTitle / sourceOrg / sourceUrlOrDoc / sourceSection / scope / limitations / reviewStatus / reviewedBy / reviewedAt`。

| `reviewStatus` | 允许渲染 | 允许进入正式发布清单 | 额外要求 |
|---|---|---|---|
| `approved` | ✅ | ✅ | 必须填 `reviewedBy` + `reviewedAt`；`pendingBasis` 必须为 false |
| `reviewed` | ✅ | ❌ | 必须填 `reviewedBy` + `reviewedAt` |
| `draft` | ✅（开发态） | ❌ | UI 必须显示"待工艺审核 · 教学示意" |
| `pendingBasis` | ✅（开发态） | ❌ | 同 draft |
| `rejected` | ❌ | ❌ | 校验直接失败 |

**当前状态：仓库内不存在任何 `approved` 级工艺依据**（`docs/3d-model-optimization/decisions.md` B5）。因此本阶段唯一的连接 `conn_atm_overhead_to_condenser` 为 `draft` + `pendingBasis: true`，**生产工艺连接门禁为 BLOCKED**。

---

## 5. 校验与失败条件

两种模式，**退出码语义不同**：

```bash
npm run validate:connections           # 开发门禁：结构/引用/几何/依据字段合法性；非 approved 仅告警，exit 0
npm run validate:connections:strict    # 发布门禁：任何非 approved 或 pendingBasis 连接都 exit 1
```

- **默认模式**用于日常提交：只保证"数据本身没错"，允许 draft 连接存在。
- **strict 模式**用于真正要发布时：`[BLOCKED]` + 逐条列出未获依据的连接，exit 1。
- `PETRO_CONNECTIONS_PATH=<file>` 可指向临时副本，用于在不动仓库数据的前提下验证门禁（例如确认 approved 时能通过）。
- CI 里 strict 放在独立的 `publish-gate` job，只在手动触发或打 tag 时运行——**push 不等于发布**，让日常 CI 常年变红等于取消门禁。

任一条即失败（退出码 1）：

| 错误码 | 触发条件 |
|---|---|
| `SCHEMA` | 不满足 JSON Schema |
| `SPACE_MISMATCH` / `CONN_SPACE_MISMATCH` / `SPACE_AXIS_MISMATCH` / `ROOT_MISMATCH` | 坐标空间或单位/朝向/手性与 Manifest 不一致 |
| `MISSING_ANCHOR` | `anchorId` 不在 Manifest `anchors[]` |
| `ANCHOR_OBJECT_MISMATCH` | 锚点 `ownerObjectId` 与端点的 `objectId` 不符 |
| `UNKNOWN_OBJECT` | `objectId` 不在 Manifest `objects[]` |
| `DUP_CONNECTION_ID` | `connectionId` 重复 |
| `BAD_WAYPOINT` | waypoint 不是 3 个有限数 |
| `WAYPOINT_DUP_ENDPOINT` | waypoint 与端点重合（端点坐标被重复保存） |
| `ENDPOINT_DRIFT` | 解析路径首/末点偏离锚点（容差 1e-6） |
| `BASIS_UNAPPROVED` / `BASIS_REJECTED` / `BASIS_CONTRADICTION` | 依据门禁 |
| `NO_CONNECTION_GEOMETRY` | GLB 中没有任何节点带该 `connectionId` |
| `GEOMETRY_REF_NOT_FOUND` / `UNLISTED_CONNECTION_GEOMETRY` | `geometryRefs` 与 GLB 实际节点不一致 |
| `ORPHAN_GLB_CONNECTION` | GLB 节点引用了不存在的 `connectionId` |

---

## 6. 追踪链

```
web/data/process-connections.json  ← connectionId + waypoints（唯一控制点）
        │
        ├─► tools/make_tower.py ──► tower.obj / tower.glb
        │                              每个由该连接生成的对象写入 extras.petro.connectionId
        │
        └─► web/world/connections.js ──► 教学线 / 箭头 / 粒子
                                      端点取自 tower.manifest.json anchors[]
```

反查命令：

```bash
node -e "const b=require('fs').readFileSync('web/assets/tower/tower.glb');const l=b.readUInt32LE(12);const g=JSON.parse(b.subarray(20,20+l));g.nodes.filter(n=>n.extras&&n.extras.petro&&n.extras.petro.connectionId).forEach(n=>console.log(n.name,n.extras.petro.connectionId))"
```

---

## 7. 变更流程

改一条连接：

1. 改 `web/data/process-connections.json`（只改需要改的字段）。
2. `npm run validate:connections` —— 先让数据合法。
3. 若改了 `waypoints`，必须重跑 Blender（对象数可能变化，见 §8）：
   ```bash
   # 引导轮：产出 OBJ
   blender -b -P tools/make_tower.py -- <outDir1>
   # 用新 OBJ 生成身份
   PETRO_TOWER_OBJ=<outDir1>/tower.obj PETRO_ALLOW_ASSET_CHANGE=1 node tools/gen_tower_manifest.mjs
   # 盖章轮
   PETRO_TOWER_STAMP=1 blender -b -P tools/make_tower.py -- <outDir2>
   # 发布 outDir2 的 obj/mtl/glb/meta，再定稿
   PETRO_ALLOW_ASSET_CHANGE=1 node tools/gen_tower_manifest.mjs
   ```
4. `npm run validate:assets:strict` + `npm run validate:connections`。
5. 前端无需改代码——只刷新页面。

---

## 8. 已知限制

| 限制 | 说明 |
|---|---|
| `pipe_poly` 只做轴对齐段 | 非轴对齐的 waypoint 会被投影成轴向管段，不会生成斜管。改 waypoint 时优先保持轴向。 |
| 对象数随点数变化 | 改动 waypoint **数量**会改变 OBJ 对象数，生成器的 253 基准守卫会拒绝，需 `PETRO_ALLOW_ASSET_CHANGE=1` 并确认分类无遗漏。 |
| `instanceId` 由几何质心派生 | 段/弯头移动即换 `nodeUid`（实体变了本就该换）；端点锚点不受影响。 |
| 只有 1 条连接 | 本阶段只做垂直切片；`Pipe_Condenser_To_Drum` 等既有几何尚未纳入连接数据（无 approved 依据前不扩展）。 |
| L4 侧线馏分路径（`fractionTarget`）未迁移 | 属另一套"馏分去向"教学曲线，不在本阶段范围，仍为手写；迁移前不得声称"全部路径单一来源"。 |
