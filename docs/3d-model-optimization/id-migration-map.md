# ID 迁移映射草案（Phase 1 · 只读盘点 → 目标契约）

> 依据：`docs/model-contract.md`、`docs/3d-model-optimization/reports/phase-00-baseline.md`
> 原则：**本文件是草案，不授权任何代码/资产改动。** Phase 2 才会执行迁移。
> 基线：`5519ef74`

---

## 0. 结论摘要

现有 ID **不能**直接满足 V1.1 契约，缺口集中在四处：

| 缺口 | 严重度 | 影响 |
|---|---|---|
| 全项目**没有** `assetId` 的运行时表达（registry 只有 `modelPath`） | 高 | 总览/L4/独立页无法声明"加载的是哪个资产包的哪个版本" |
| 全项目**没有** `nodeUid` | 高 | 节点身份完全依赖 `node.name`，已被 `.001` 破坏 |
| 一个设备存在**多个别名**（`separator` / `separator_three_phase` / `three_phase_separator`） | 中 | 跨模块引用不可靠，AI 上下文可能指错 |
| `semanticId` 被当成实例键（5 个 inlet port 共用） | 中 | 直接导致 nodeUid 冲突（已实测） |

---

## 1. 现有 `objectId` 清单（来自 `web/world/registry.js`）

17 个逻辑设备。`modelPath` 为 `null` 的是纯程序化几何，没有资产文件。

| objectId | modelPath | modelNode（名字路径，待替换） | anchor（名字，待校验） | 资产状态 |
|---|---|---|---|---|
| `pumpjack` | `assets/hero/pumpjack/pumpjack.obj` | `pumpjack_static/…/pumpjack_crank` | `pumpjack` | 有 Hero，3 对象 |
| `wellhead` | `assets/hero/wellhead/wellhead.obj` | `wellhead` | `wellhead` | 有 Hero，4 对象 |
| `underground_geology` | `assets/underground/underground.obj` | `geo_overburden/…` | `reservoir_anchor` | 有 Hero |
| `reservoir` | 同上 | `reservoir_lens/geo_reservoir_layer` | `reservoir_anchor` ← **与上一行重复** | 同上 |
| `wellbore` | 同上 | `well_casing/…` | `wellbore_reservoir_anchor` | 同上 |
| `three_phase_separator` | `assets/hero/separator/separator.obj` | `separator` | `separator` | ⚠ 指向**总览合并版**，L2 详情用的是另一个文件 |
| `transfer_pump` | `null` | `transfer_pump` | `transfer_pump` | 程序化，无资产 |
| `fixed_roof_tank` | `assets/hero/floating_roof_tank/floating_roof_tank.obj` | `tank_shell` | `fixed_tank` | ⚠ **固定顶罐复用了外浮顶罐的资产文件** |
| `floating_roof_tank` | 同上 | `tank_shell` | `floating_tank` | 同上 |
| `atmospheric_tower` | `assets/tower/tower.obj` | `Tower_Atmospheric_Shell` | `anchor_tower_overview` | 有 Hero(OBJ) |
| `vacuum_tower` | 同上 | `Tower_Vacuum_Shell` | `anchor_tower_vacuum` | 同上 |
| `heater` | 同上 | `Heater` | `anchor_tower_heater` ← **meta 中不存在该锚点** | 同上 |
| `fuel_dispenser` | `null` | `fuel_dispenser` | `fuel_dispenser` | 程序化 |
| `plastic_bottle` | `null` | `plastic_bottle` | `plastic` | 程序化 |
| `fiber_spool` | `null` | `fiber_spool` | `fiber` | 程序化 |
| `lubricant_can` | `null` | `lubricant_can` | `lubricant` | 程序化 |
| `asphalt_slab` | `null` | `asphalt_slab` | `asphalt` | 程序化 |

---

## 2. 已识别的冲突与别名

### C1 · 同一设备三个名字

| 出现位置 | 值 |
|---|---|
| `build_separator_hero.py:372`（manifest `assetId`） | `separator_three_phase` |
| `web/assets/hero/separator/separator.meta.json`（`asset` 字段） | `separator` |
| `web/world/registry.js`（`objectId`） | `three_phase_separator` |
| `web/levels/l2.js`（加载路径） | `assets/separator/separator.obj` |

**且这不是同一个资产**：`assets/hero/separator/separator.obj` 是 5 个材质合并对象（总览用），`assets/separator/separator.obj` 是 43 个语义对象（L2 用）。

**迁移裁定**：

- `assetId` = `separator_three_phase`（沿用已有 manifest 值，不新造）
- `objectId` = `three_phase_separator`（沿用 registry，前端已有引用）
- 总览合并版 → 同一 `assetId` 的 `representations.overview`；L2 详情 → `representations.detail`
- 旧的 `"asset": "separator"` 字段废弃

### C2 · 固定顶罐复用外浮顶罐资产

`registry.js` 中 `fixed_roof_tank.modelPath` 与 `floating_roof_tank.modelPath` **完全相同**，都指向 `floating_roof_tank.obj`；而 L3 里两个罐是程序化几何（`immersion.js:705/723`），并非该 OBJ。

**迁移裁定**：两罐当前**没有独立资产**，不得为它们伪造 Manifest。Phase 7 建模后各自分配 `assetId`（建议 `fixed_roof_tank` / `floating_roof_tank`），并删除 registry 中指向错误文件的 `modelPath`。

### C3 · 两个 objectId 共用一个 anchor

`underground_geology` 与 `reservoir` 的 `anchor` 都是 `reservoir_anchor`。按契约 `anchorId` 按 asset 唯一，同一锚点可被多个 object 引用是**合法**的，但 `registry.js` 的字段语义是"该设备的定位锚点"，二者共用会造成"选谁就高亮谁"的歧义。

**迁移裁定**：可以共用，但必须在 Manifest 中由 `ownerObjectId` 明确归属（试点 Manifest 已按此设计），registry 的 `anchor` 字段改为可选的展示提示。

### C4 · 指向不存在锚点

`heater.objectId` 的 `anchor` 是 `anchor_tower_heater`，但 `tower.meta.json` 只有 `anchor_tower_overview/feed/trays/vacuum/products` 五个锚点。`web/tower.js:228-232` 实际是用 `heater_bbox_obj_y_up` 算中心，**没有用到** `anchor_tower_heater`。

**迁移裁定**：Phase 2 生成 tower Manifest 时补 `anchor_tower_heater`（或把 registry 改为引用 `heater` 节点的 bbox 中心）。当前属**悬空引用**，校验器在 tower Manifest 落地后会报 `MISSING_ANCHOR`。

### C5 · 锚点命名风格不统一

| 风格 | 例子 |
|---|---|
| `anchor_` 前缀 | `anchor_tower_overview`、`anchor_tower_feed`、`wellbore_top_anchor`、`wellbore_reservoir_anchor`、`reservoir_anchor` |
| 裸名 | `pumpjack`、`wellhead`、`separator`、`fixed_tank`、`floating_tank`、`plastic`、`fiber`、`lubricant`、`asphalt`、`refinery_feed`、`city_gate` |

**迁移裁定**：新建资产一律用**裸名**（`separator_oil_outlet`，不含 `anchor_` 前缀），因为 `anchorId` 已经带语义；`anchor_*` 旧名在 Phase 2 一次性加别名映射后废弃。**不做无损自动重命名**——旧名会被前端硬编码引用，需同步改代码。

### C6 · zone 的入口/出口锚点多数没有对应资产

`registry.js` 的 `entryAnchor`/`exitAnchor` 共 12 个，实存性如下：

| 锚点 | 是否存在 |
|---|---|
| `separator_inlet` | ✅ 试点 Manifest 已有（几何推导） |
| `separator_outlet` | ❌ 只有 `separator_gas_outlet` / `_oil_outlet` / `_water_outlet`，**没有** `separator_outlet` |
| `wellbore_top_anchor` | ✅ `underground` manifest 有 |
| `wellhead` | ✅（作为 objectId/anchor 名） |
| `tank_inlet` / `tank_outlet` | ❌ 无储罐资产 |
| `refinery_feed` / `refinery_product` | ❌ tower 用 `anchor_tower_feed` / `anchor_tower_products` |
| `city_gate` / `city_delivery` | ❌ 无资产 |

**迁移裁定**：这些是**教学路由锚点**，不必全部对应真实管口。Phase 3 建 `process-connections.json` 时统一裁决：能对应真实管口的用真实 `anchorId`，纯导航用的登记为 `kind: "teaching_marker"` 且 `ownerObjectId` 指向所属 zone 的代表设备。

### C7 · `semanticId` 被当作实例键

`.blend` 实测：5 个 `separator_internal_inlet_port_XX` 共用 `semanticId=separator_internal_inlet_port`；7 个 `separator_internal_mist_XX` 共用 `separator_internal_mist_extractor`。

**迁移裁定**：引入 `instanceId`（试点 Manifest 已用 `00`–`06`）。Phase 2 在 `.blend` 里显式写 `petro.instanceId`。

---

## 3. 目标 ID 映射表（草案）

| 现名称 | 目标 `assetId` | 目标 `objectId` | 说明 |
|---|---|---|---|
| `assets/tower/tower.obj` + `tower.glb` | `distillation_unit_hero` ← 沿用 phase-06 manifest | `atmospheric_tower` / `vacuum_tower` / `heater` | 一资产多 object，用 Manifest `objects[]` 表达 |
| `assets/separator/separator.obj` + `.glb` | `separator_three_phase` | `three_phase_separator` | 43 节点，试点 |
| `assets/hero/separator/separator.obj` | （并入上面） | — | 作为 `representations.overview` |
| `assets/underground/underground.obj` + `.glb` | `underground_hero` ← 沿用 phase-04 manifest | `underground_geology` / `reservoir` / `wellbore` | 一资产三 object |
| `assets/hero/pumpjack/pumpjack.obj` | `pumpjack_hero`（**新命名**） | `pumpjack` | 现 meta 用 `"asset": "pumpjack"`，与 objectId 同名，需区分 |
| `assets/hero/wellhead/wellhead.obj` | `wellhead_hero`（新） | `wellhead` | 同上 |
| `assets/hero/heater/heater.obj` | `heater_hero`（新） | `heater` | ⚠ 与 tower 内的 `Heater` 节点同名概念，需注意 |
| `assets/hero/floating_roof_tank/*.obj` | `floating_roof_tank_hero`（新） | `floating_roof_tank` | 固定顶罐**不得**复用 |
| L3 程序化罐/泵 | —（暂无） | `fixed_roof_tank` / `transfer_pump` | Phase 7 建模后分配 |
| L5 程序化产品 | —（暂无） | 6 个 objectId | Phase 8 |

> `_hero` 后缀是为了让 `assetId` 与 `objectId` 不撞名。试点已用 `separator_three_phase`（无后缀）是因为该名字**已存在于既有 manifest**，保留可减少迁移面。

---

## 4. 迁移步骤建议（Phase 2 起执行）

按依赖顺序，每步都必须 `npm run validate:assets` 通过才进下一步。

| 步 | 动作 | 验收 |
|---|---|---|
| 1 | 在 `.blend` 写入 `petro.{nodeUid,assetId,objectId,semanticId,instanceId,role}`（先 separator，已由探针验证配方） | 探针 dry-run 输出 `collisions=0` |
| 2 | 用安全配方导出 GLB（先删旧扁平属性 + `export_extras=True`），**首次回写发布产物** | `validate:assets:strict` 通过 |
| 3 | 由 GLB extras 反向生成 Manifest（替换 `gen_pilot_separator_manifest.mjs` 的 ROLES 表） | Manifest 与 extras 43/43 一致 |
| 4 | tower：清 253 对象的语义归属，孤儿对象登记 `nonInteractiveSupport` | 未登记节点 = 0 |
| 5 | tower Manifest + 补 `anchor_tower_heater` | `validate:assets` 通过 |
| 6 | `registry.js` 的 `modelNode` 名字路径 → `nodeUid`；`anchor` → `anchorId` | 前端仍能选中同一设备 |
| 7 | 删除各资产的 `.meta.json` 统计卡（并入 Manifest） | 无残留引用 |

---

## 5. 兼容性风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| `nodeUid` 回写改变 GLB 字节 | `separator.glb` 会从 391,188 B 变为约 406 KB | Phase 2 有意为之；需同步更新 `phase-05` manifest 或标记为历史 |
| `tower.meta.json` 的 `groups` 被前端使用 | `tower.js`/`l4.js` 读 `groups.hotspots` | Phase 2 保留该字段并在 Manifest 中重复表达，待前端切换到 Manifest 后再删 |
| `l4.js`/`tower.js` 的正则分组 | 与 nodeUid 无关，Phase 2 才改 | 本阶段不动 |
| `state.js` 的 `structure` 只有 `external`/`half` | 契约定义 4 态 | Phase 4 扩；`state.js` 无枚举校验，可直接容纳 |
| `registry.js` 的 `modelNode` 是 `/` 分隔名字路径 | 与 `nodeUid` 无映射 | Phase 2 生成"名字路径 → nodeUid"映射表并替换 |

---

## 6. 本阶段明确不做

- ❌ 不批量给现有模型加 `petro` 属性（仅 separator 探针，且导出到临时目录）
- ❌ 不改 `registry.js` / `state.js`
- ❌ 不生成 tower / underground / hero 的 Manifest
- ❌ 不改 `l4.js` 分组、不接 `process-connections.json`
- ❌ 不改 L3 任何规则
