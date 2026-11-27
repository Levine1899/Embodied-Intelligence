# Phase 03 · 工艺连接 Schema 与垂直切片

> 对应方案：《石油科普智能体 3D 模型优化实施方案 V1.1》§Phase 3
> 依赖：Phase 1 资产契约、Phase 2 的 L4 anchors / nodeUid
> 基线提交：`dev` @ `9f7cc91`
> 执行时间：2026-11-27
>
> ## 结论（两个必须分开看）
> - **机制验证：PASS** —— 同一份 JSON 确实同时驱动了 Blender 实体管线、前端教学线、粒子动画与方向箭头，且做过真实数据变更验证。
> - **生产工艺连接门禁：BLOCKED** —— 仓库内不存在任何 `approved` 级工艺依据（`decisions.md` B5），因此本阶段唯一连接为 `draft` + `pendingBasis`，**不得进入正式发布清单，也不得宣称工艺已验收**。

---

## 1. 工艺依据调研（先查依据，后定连接）

### 1.1 检索结果

| 检索对象 | 结果 |
|---|---|
| `basisId` / `reviewStatus` / `approved` / 审批 / 工艺依据 全仓检索 | 仅命中 `docs/3d-model-optimization/decisions.md` 与 Phase 0 报告的自述，**无任何依据文档本身** |
| 炼油工艺简化流程图 / 教学依据 / 评审记录 | **不存在** |
| `web/data/` 目录 | 本阶段前**不存在** |
| `schemas/` | 仅有 `asset-manifest.schema.json` |

### 1.2 结论

`decisions.md:172-176` 明确记载：

> 仓库**不存在**任何 `basisId` / `reviewStatus` 字段或工艺依据文档。V1.1 §Phase 3 已预置正确退路：把试点连接标 `draft`、前端标注"待工艺审核/教学示意"、阻断正式发布。

因此：

- **不新增、不推断任何工艺路线。** 本阶段唯一连接完全来自 `tools/make_tower.py` 里**已经存在的**塔顶气相几何，不是新补的流程。
- 用户建议的可选扩展「冷凝器出口 → 回流罐入口」**未实施** —— 该扩展的前提是"有已审核依据"，当前不满足。既有几何对象 `Pipe_Condenser_To_Drum` 保持原样，**未纳入**连接数据。

### 1.3 依据字段实填（`basis_pending_process_review`）

| 字段 | 值 |
|---|---|
| `version` | `0.1.0-draft` |
| `sourceTitle` | 塔顶气相线程序化几何（本项目 build 脚本） |
| `sourceOrg` | 本项目（无外部权威来源） |
| `sourceUrlOrDoc` | `tools/make_tower.py`「塔顶 → 冷凝器」段 |
| `sourceSection` | `Pipe_Top_Vertical / Pipe_Top_Elbow / Pipe_Top_Condenser` |
| `scope` | 仅描述本项目几何里已有的塔顶气相走向；不代表经审核的炼油工艺设计 |
| `limitations` | 4 条：未经任何工艺文件/教材/专家核对；未含空冷器、水冷器、回流泵、不凝气排放；管径/标高/走向为示意非真实尺寸；仓库无 approved 依据 |
| `reviewStatus` | `draft` |
| `reviewedBy` / `reviewedAt` | `null` / `null` |
| `pendingBasis` | `true` |

UI 呈现：`web/world/connections.js` 的 `statusLabel()` 对该连接返回 **"待工艺审核 · 教学示意"**，L4 加载时会 `console.warn` 输出该状态。

---

## 2. 交付物清单

| 文件 | 作用 |
|---|---|
| `schemas/process-connections.schema.json` | 连接 JSON Schema（draft 2020-12） |
| `web/data/process-connections.json` | **唯一数据源**（2843 B） |
| `tools/validate_connections.mjs` | 门禁校验器（15 类失败条件） |
| `web/world/connections.js` | 前端可复用渲染层（教学线/箭头/粒子） |
| `tools/make_tower.py` | 改为消费 JSON；新增 2 个端点锚点 |
| `tools/gen_tower_manifest.mjs` | 锚点归属映射 + 连接几何的语义规则 |
| `web/levels/l4.js` | 挂载连接可视化，帧循环推进粒子 |
| `web/sandbox.html` | 引入 `world/connections.js` |
| `package.json` | `validate:connections[:strict]` 脚本 |
| `docs/3d-model-optimization/process-connection-contract.md` | 契约文档 |

---

## 3. 连接数据

唯一连接：

```json
{
  "connectionId": "conn_atm_overhead_to_condenser",
  "from": { "objectId": "atmospheric_tower",  "anchorId": "anchor_atm_overhead_outlet" },
  "to":   { "objectId": "overhead_condenser", "anchorId": "anchor_condenser_inlet" },
  "coordinateSpaceId": "distillation_unit_asset_local",
  "waypoints": [[2.2, 28.85, 0.0]],
  "medium": "常压塔顶油气", "phase": "vapor", "direction": "forward",
  "displayColorToken": "--flow-vapor",
  "display": { "overview": true, "detail": true, "particles": true,
               "displayOffset": [0,0,0], "particleCount": 18, "particleSpeed": 0.32,
               "particleSize": 0.075, "lineRadius": 0.028 },
  "geometryRefs": ["Pipe_Top_Vapor"]
}
```

- **端点不存坐标**，只存 `anchorId`；解析时从 `tower.manifest.json` 的 `anchors[].position` 取。
- `waypoints` 只有 1 个中间点（弯头），端点不重复保存。

### 3.1 新增的端点锚点

| anchorId | Blender 坐标 | assetLocal (Y-up) | owner |
|---|---|---|---|
| `anchor_atm_overhead_outlet` | (2.2, 0, 26.0) | [2.2, 26.0, 0] | `atmospheric_tower` |
| `anchor_condenser_inlet` | (5.8, 0, 28.85) | [5.8, 28.85, 0] | `overhead_condenser` |

锚点由 `make_tower.py` 的 `ANCHORS` 建立为空物体，随 GLB 导出为节点并盖 `petro` 章；Manifest 的 `anchors[]` 现在 **7 条**。

---

## 4. Blender 侧：实体管线由 JSON 生成

### 4.1 改动

```python
CONNECTION_ID = "conn_atm_overhead_to_condenser"
CONNECTION = _load_connection(CONNECTION_ID)                 # 读 web/data/process-connections.json
CONNECTION_PTS = ([ATM_OVERHEAD_OUTLET]
                  + [_yup_to_blender(w) for w in CONNECTION["waypoints"]]
                  + [CONDENSER_INLET])
pipe_poly("Pipe_Top_Vapor", CONNECTION_PTS, r=0.40, seg=16)
```

- 删除了原来 3 个硬编码图元（`Pipe_Top_Vertical` / `Pipe_Top_Elbow` / `Pipe_Top_Condenser`），替换为按数据生成的 5 个对象（2 段 + 3 弯头）。
- `pipe_poly()` 作为**通用几何工具**保留（按用户允许），但这条工艺路径的点**不再来自脚本**。
- 坐标换算 `_yup_to_blender(p) = (x, -z, y)`，与 `meta.anchor_web_y_up = [x, z, -y]` 互逆。
- 支撑/弯头等几何件：弯头由 `pipe_poly` 从**同一组点**派生，天然带同一 `connectionId`。

### 4.2 追踪

每个由该连接生成的对象写入 `petro.connectionId`：

```
Pipe_Top_Vapor_Elbow0 -> conn_atm_overhead_to_condenser | semanticId overhead_vapor_elbow
Pipe_Top_Vapor_Elbow1 -> conn_atm_overhead_to_condenser | semanticId overhead_vapor_elbow
Pipe_Top_Vapor_Elbow2 -> conn_atm_overhead_to_condenser | semanticId overhead_vapor_elbow
Pipe_Top_Vapor_Seg0   -> conn_atm_overhead_to_condenser | semanticId overhead_vapor_segment
Pipe_Top_Vapor_Seg1   -> conn_atm_overhead_to_condenser | semanticId overhead_vapor_segment
```

段与弯头分属不同 `semanticId`（`overhead_vapor_segment` / `overhead_vapor_elbow`），不再共用一个语义角色。

### 4.3 产物

| 文件 | 值 |
|---|---|
| `tower.obj` | 3,989,992 B（255 对象） |
| `tower.glb` | 4,033,676 B，sha256 `e9aca088…` |
| `tower.meta.json` | 1,387 B |
| `tower_hero.blend` | 568,012 B（含 `petro`） |
| Manifest | 255 对象 → 126 可交互 + 136 support；7 anchors；**262/262** 节点带 `extras.petro`，`extrasStatus=verified` |

---

## 5. 前端侧：同一份数据

`web/world/connections.js` 暴露 `window.PETRO_CONNECTIONS`：

| 方法 | 作用 |
|---|---|
| `load()` / `setManifest()` | 读 JSON、注入 Manifest 提供锚点坐标 |
| `resolvePoints(id)` | assetLocal 折线（端点来自 Manifest + waypoints + `displayOffset`） |
| `resolveCurve(id)` | `CurvePath` + `LineCurve3` —— **不用 CatmullRom**，避免把弯头圆角化后与实体管线不一致 |
| `create(id)` | 建 Group：教学线 + 方向箭头 + N 个粒子，全部带 `connectionId` |
| `statusLabel(id)` | 非 approved 时的 UI 文案 |
| `update(dt)` | 推进全部粒子 |

L4 集成：

- 几何在 **assetLocal** 里生成，然后 `unit.add(group)` —— 由 `unit.scale(SCALE=0.46)` 统一换算。**关卡脚本不叠加任何未声明偏移**（实测 worldPoints = assetLocal × 0.46 + 场景位移，与 `unit` 变换一致）。
- 帧循环里 `PETRO_CONNECTIONS.update(dt)`，实测 `dt ∈ [0.0053, 0.0176]` 恒为正。
- **没有**为该连接手工创建 `CatmullRomCurve3`。既有的侧线馏分曲线（`fractionTarget`）属另一套"馏分去向"教学曲线，**未迁移，已登记为限制**（契约 §8）。

---

## 6. 单一来源实测（最关键验收）

### 6.1 变更前基线

| 项 | 值 |
|---|---|
| waypoint | `[2.2, 28.85, 0]` |
| 实体管线包围盒（Blender） | min `[1.752, 25.552, -0.448]` / max `[6.248, **29.298**, 0.448]` |
| 端点锚点 | `atm` uid `672807ad…` pos `[2.2,26,0]`；`con` uid `8eee96fe…` pos `[5.8,28.85,0]` |
| 前端解析路径 | `[2.2,26,0] → [2.2,28.85,0] → [5.8,28.85,0]` |

### 6.2 只改一个 waypoint

`web/data/process-connections.json` 中 `[2.2, 28.85, 0.0]` → `[2.8, 30.2, 0.0]`，**其余一字未动**。

### 6.3 实体侧变化（Blender 重建）

| 项 | 变更前 | 变更后 | 判定 |
|---|---|---|---|
| 包围盒 Y 上限 | 29.298 | **30.648** | = 30.2 + 0.448（管半径）✅ |
| 包围盒 X min/max | 1.752 / 6.248 | 1.752 / 6.248 | 未变 ✅ |
| 对象数 | 5 | 5 | 点数相同，拓扑不变 ✅ |
| `Pipe_Top_Vapor_Seg0` nodeUid | `91be98c1…` | `a0c0cdde…` | 几何移动→身份更新 ✅ |
| `Pipe_Top_Vapor_Seg1` nodeUid | `11efe758…` | `adaa818a…` | 同上 ✅ |
| `Pipe_Top_Vapor_Elbow1` nodeUid | `51f239ea…` | `673453e3…` | 同上 ✅ |
| `Pipe_Top_Vapor_Elbow0` nodeUid | `7b7c327d…` | `7b7c327d…` | **未动，身份不变** ✅ |
| `Pipe_Top_Vapor_Elbow2` nodeUid | `71efde2f…` | `71efde2f…` | **未动，身份不变** ✅ |

### 6.4 端点是否漂移（硬要求）

| 端点 | 变更前 uid / pos | 变更后 uid / pos | 判定 |
|---|---|---|---|
| `anchor_atm_overhead_outlet` | `672807ad…` / `[2.2,26,0]` | `672807ad…` / `[2.2,26,0]` | **零漂移** ✅ |
| `anchor_condenser_inlet` | `8eee96fe…` / `[5.8,28.85,0]` | `8eee96fe…` / `[5.8,28.85,0]` | **零漂移** ✅ |

### 6.5 前端侧变化（同一份 JSON，页面刷新即可）

刷新 `sandbox.html` 后读取 `window.__l4Connections.handles[0].points`：

| | 变更前 | 变更后 |
|---|---|---|
| 解析路径 | `[2.2,26,0] → [2.2,28.85,0] → [5.8,28.85,0]` | `[2.2,26,0] → **[2.8,30.2,0]** → [5.8,28.85,0]` |
| 首/末点 | `[2.2,26,0]` / `[5.8,28.85,0]` | **完全相同** |
| 粒子数 / 状态 | 18 / 待工艺审核 · 教学示意 | 18 / 同一文案 |
| worldPoints | `[25.01,11.96,-11] … [26.67,13.27,-11]` | 中间点随之上移，端点不动 |

截图留档：`docs/3d-model-optimization/screenshots/phase03-waypoint-mutated.png`（改动态）。

### 6.6 恢复

恢复 `[2.2, 28.85, 0.0]` → 重跑完整管线 → 包围盒精确回到 **29.298**；前端解析路径回到正式值；两道门禁均通过。

### 6.7 这次验证排除了什么

- 不是"只验证 JSON 能被读取"：**几何真的动了**，且改为按数据重建。
- 不是"只验证两个端点重合"：验证的是**中间 waypoint 驱动**，端点被证明**不漂移**。
- 不是"前端自算一套"：前端不存坐标，端点只有 Manifest 一个来源，偏移只来自 `displayOffset`。

---

## 7. 门禁与错误处理

`npm run validate:connections` 实测输出：

```
连接数据：web\data\process-connections.json
坐标空间：distillation_unit_asset_local（unit=meter, up=+Y, right-handed）
连接条数：1
  · conn_atm_overhead_to_condenser  basis=draft  路径点 3
      [0] 2.200, 26.000, 0.000
      [1] 2.200, 28.850, 0.000
      [2] 5.800, 28.850, 0.000
已 approved：0 条；非 approved：1 条
  [warn] BASIS_DRAFT: … 仅开发态展示，不得进入正式发布清单
✓ 连接校验通过
```

15 类失败条件全部实现（见契约 §5），其中"缺 anchor / object 不匹配 / 坐标空间错 / ID 重复 / waypoint 非法 / 端点超容差"均会退出码 1。

校验器在开发过程中**真的抓到过一个缺口**：Manifest 顶层没有 `coordinateSpaceId`（实际在 `coordinateSystem.spaceId`），校验器先按严格假设报 `MANIFEST_SPACE_MISSING`，据此修正读取路径，并把 `unit/upAxis/handedness` 也纳入比对。

---

## 8. 命令与日志

```bash
# 重建（改动 waypoints 后必须走）
blender -b -P tools/make_tower.py -- <out1>                        # 引导轮
PETRO_TOWER_OBJ=<out1>/tower.obj PETRO_ALLOW_ASSET_CHANGE=1 \
  node tools/gen_tower_manifest.mjs                                # 身份
PETRO_TOWER_STAMP=1 blender -b -P tools/make_tower.py -- <out2>    # 盖章轮
# 发布 <out2> 的 obj/mtl/glb/meta
PETRO_ALLOW_ASSET_CHANGE=1 node tools/gen_tower_manifest.mjs       # 定稿

# 门禁
npm run validate:assets:strict      # PASS 2/2
npm run validate:connections        # PASS
npm test                            # 87/87
```

关键日志：

```
[ok] petro stamped: 262 nodes / 255 mesh uids
[ok] blend: assets-source/blender/tower_hero.blend 568012
[ok] OBJ  : ... 3989992 bytes
[ok] GLB  : ... 4033676 bytes
    对象 255 → 可交互 126 + support 136
    systems 6 / objects 21 / anchors 7
    runtime.extrasStatus = verified (petro 262 节点)
```

### 8.1 顺带修掉的一个守卫缺陷

`gen_tower_manifest.mjs` 原本硬性要求 `tower.obj` 对象数 === 253。连接几何的点数一变，对象数就会变（点数 → 段数/弯头数），守卫会直接 `[FATAL]`。已改为：

- 默认仍然拒绝（保持"资产变了必须重新核对规则表"的初衷）；
- 显式设 `PETRO_ALLOW_ASSET_CHANGE=1` 才放行，且**放行时打印实际数量与警告**，绝不静默通过。

---

## 9. 验收对照

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 先查依据、无 approved 不得当正式事实 | ✅ | §1；全仓检索无依据文档；唯一连接标 draft/pendingBasis |
| 2 | Schema + 唯一 JSON + 契约文档 | ✅ | 三件套已建；`validate:connections` 通过 |
| 3 | 每条连接含全部必填字段 | ✅ | Schema required 12 项；`basis` 11 项 |
| 4 | 坐标约束（assetLocal/meter/+Y/端点来自 anchor/无裸 XYZ） | ✅ | Schema 强制；校验器比对三方坐标空间与轴向 |
| 5 | Blender 消费唯一 JSON，无第二套硬编码路径 | ✅ | 删除 3 个硬编码图元，改为 `_load_connection()` |
| 6 | 支撑/弯头从同一条 connection 派生 | ✅ | 弯头由同一组点经 `pipe_poly` 生成，带同一 `connectionId` |
| 7 | 实体对象写入 connectionId 且可从 GLB 追踪 | ✅ | 5/5 节点带 `extras.petro.connectionId`；校验器双向核对 |
| 8 | 可复用前端模块，l4.js 不手工建冲突曲线 | ✅ | `world/connections.js`；L4 无该连接的 CatmullRom |
| 9 | 粒子/高亮线/箭头/方向由 connectionId 驱动 | ✅ | `create()` 一处生成；实测 18 粒子在动（dt 恒正） |
| 10 | tower.html/总览如需展示须同一 ID | ⚠️ **未接入** | 本阶段 `tower.html` 未展示该连接；契约 §1 已写明约束 |
| 11 | displayOffset 显式且不改变拓扑 | ✅ | Schema 字段；当前为 `[0,0,0]` |
| 12 | 单一来源实测（改 waypoint → 双侧同步） | ✅ | §6，含端点不漂移证明 |
| 13 | 恢复正式 waypoint 并重建校验 | ✅ | 包围盒回到 29.298；双门禁绿 |
| 14 | 发布门禁与错误处理 | ✅ | 15 类失败条件；draft 阻发布并告警 |
| 15 | 截图/网格对比 | ⚠️ **部分** | 有改动态截图；仅一张，且操作卡遮挡部分画面；以数值证据为主 |

---

## 10. 结论

### 10.1 机制验证：**PASS**

同一份 `web/data/process-connections.json` 确实同时驱动了：

Blender 实体管线（包围盒随 waypoint 变化）→ GLB `extras.petro.connectionId` → 前端教学线/箭头/粒子（解析路径同步变化，端点零漂移）。

这不是"代码结构看起来统一"，而是**改一处数据、两侧同时改变**的实测结果。

### 10.2 生产工艺连接门禁：**BLOCKED**

- 仓库**不存在**任何 `approved` 级工艺依据（B5 未解除）。
- 唯一连接 `conn_atm_overhead_to_condenser` 为 `draft` + `pendingBasis: true`，UI 标注"待工艺审核 · 教学示意"，`validate:connections` 明确告警其**不得进入正式发布清单**。
- 因此：**不得宣称工艺已验收**。本阶段交付的是"连接数据的机制与门禁"，不是"经审核的炼油工艺"。

解除条件：领域专家提供可核对的工艺资料（含版本、适用范围、审核人、审核日期），填入 `basis` 并把 `reviewStatus` 改为 `approved`、`pendingBasis: false`，再跑 `validate:connections:strict`。

### 10.3 是否允许 Prompt 04

**允许**，但带三条约束：

1. 新连接同样必须是 `draft`——除非依据到位；
2. 连接端点要挂到 Manifest 已有锚点，需要新锚点时先在 Blender 建空物体并重跑管线，不要在 JSON 里写裸坐标；
3. 不要绕过 `validate:connections`，它会拦住"找不到锚点/object 对不上/坐标空间错"这类最容易悄悄发生的错误。

### 10.4 未纳入本阶段（已登记，不得含糊）

| 项 | 状态 | 原因/归属 |
|---|---|---|
| 冷凝器→回流罐连接 | 未做 | 扩展需 approved 依据；既有 `Pipe_Condenser_To_Drum` 几何保持原样 |
| `tower.html` 展示该连接 | 未接入 | 接入时必须用同一 `connectionId`；本阶段未改 |
| L4 侧线馏分路径（`fractionTarget`） | 未迁移 | 另一套教学曲线；迁移前不得声称"全部路径单一来源" |
| `pipe_poly` 斜管 | 不支持 | 只生成轴对齐段；非轴向 waypoint 会被投影 |
| 批量补齐各环节物流 | 未做 | 本阶段明确禁止 |
| L3 业务规则 | 未动 | 70% 阈值 4 处耦合点未触碰 |
| 工艺 approved 依据 | **BLOCKED** | B5 |
