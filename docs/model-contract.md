# 三维资产身份契约（Model Contract）

> 版本：1.0.0（Phase 1 交付）
> 依据：《石油科普智能体 3D 模型优化实施方案 V1.1》§2、§5、§7、§10
> 基线：`main` / `5519ef74add0219c4d7eb0a62e5756abead6abcb`
> 配套文件：`schemas/asset-manifest.schema.json`、`tools/validate_assets.mjs`
> 上游依据：`docs/3d-model-optimization/reports/phase-00-baseline.md`、`docs/3d-model-optimization/decisions.md`

本契约定义"一个可交互的三维部件，如何在 Blender、GLB、Manifest、Three.js 与 AI 场景上下文中被**唯一定位**"。
它不描述美术风格，也不授权任何几何改动。

---

## 0. 三条不可妥协的规则

1. **`node.name` 不是身份。** glTF 的 `name` 是可选的显示字段，允许重复、允许被导出器改写（如 `Foo.001`）。任何以名字作为唯一 key 的代码都是待修缺陷。
2. **身份只有一个权威来源。** Blender 自定义属性 → GLB `extras.petro` → Manifest 索引，三者是同一份数据的三种投影。**禁止**手工维护两套值。
3. **机器身份只读 `extras.petro`。** 已在 Blender 5.3 上实测：即使对象上的扁平属性被删除，导出后的 extras 里仍可能残留旧值的扁平键（见 §4.3）。因此**任何读取 `extras.semanticId`、`extras.objectId` 等扁平键的代码都视为 bug**。

---

## 1. ID 体系

### 1.1 职责与唯一性范围

| 字段 | 职责 | 唯一性范围 | 是否稳定主键 | 示例 |
|---|---|---|---|---|
| `assetId` | 可发布模型资产包 | 全项目 | ✅ | `separator_three_phase` |
| `systemId` | 工艺/设备子系统 | 全项目 | ✅ | `three_phase_separation` |
| `objectId` | 前端可交互逻辑设备 | 全项目 | ✅ | `three_phase_separator` |
| `semanticId` | 部件**类型** | 按 assetId 命名空间，**允许重复** | ❌ 不能当唯一键 | `separator_internal_mist_extractor` |
| `instanceId` | 同类部件的实例区分 | 按 `semanticId` 命名空间 | ✅（配合 semanticId） | `00` … `06` |
| `nodeUid` | glTF 节点身份主键 | 按 assetId | ✅ **唯一主键** | `97d95d55-5ce7-5fd7-…` |
| `anchorId` | 管口/端口/空间锚点 | 按 assetId | ✅ | `separator_oil_outlet` |
| `connectionId` | 工艺/教学连接 | 全工艺图 | ✅ | （Phase 3 定义） |

**关键澄清：`semanticId` 是类型，不是实例。** 实测 separator：5 个进口分布器共用 `separator_internal_inlet_port`，7 个除雾器共用 `separator_internal_mist_extractor`。若用 `semanticId` 派生 ID，这 12 个对象会得到同一 UUID（已在 Phase 1 探针中复现，见 §4.2）。

### 1.2 命名规范

- `assetId` / `systemId` / `objectId` / `semanticId` / `anchorId`：`^[a-z][a-z0-9_]{1,63}$`（小写下划线，字母开头，2–64 字符）。
- `instanceId`：`^[a-z0-9][a-z0-9_-]{0,31}$`。
- `nodeUid`：RFC 4122 **UUID 版本 5**，小写带连字符。
- 显示名（`displayName`、`nodeName`、`Blender 对象名`）不受此约束，可用中文；**但它们永远不参与寻址**。

---

## 2. `nodeUid` 生成与持久化

### 2.1 固定命名空间

```
PETRO_NAMESPACE = 5c3d1f7a-2b48-4e6c-9f10-8a7d3e5b2c94
```

此常量在以下三处必须逐字节一致：

| 位置 | 值 |
|---|---|
| `tools/blender/asset_identity_probe.py` → `NAMESPACE` | 同左 |
| `tools/gen_pilot_separator_manifest.mjs` → `PETRO_NAMESPACE` | 同左 |
| `tools/validate_assets.mjs` → `PETRO_NAMESPACE` | 同左 |

更换命名空间等于让全项目 ID 全部失效，**属于破坏性变更，需单独的迁移阶段**。

### 2.2 语义路径

```
semanticPath = <assetId> "/" <objectId> "/" <semanticId> [ "#" <instanceId> ]
nodeUid      = UUIDv5(PETRO_NAMESPACE, semanticPath)
```

已实测：Node 的 `crypto` 实现与 Python `uuid.uuid5`、与 Blender 导出结果**逐字节一致**（43/43 节点吻合，见 `docs/3d-model-optimization/evidence/phase-01/extras-pipeline-evidence.json`）。

示例：

| 节点 | semanticPath | nodeUid |
|---|---|---|
| `separator_shell` | `separator_three_phase/three_phase_separator/separator_shell` | `d1a2…`（见证据文件） |
| `separator_internal_mist_00` | `separator_three_phase/three_phase_separator/separator_internal_mist_extractor#00` | `97d95d55-5ce7-5fd7-b621-f99da65d3293` |

### 2.3 禁止项（违反即构建失败）

- ❌ 随机 UUID（`uuid4`）、时间戳、自增计数。
- ❌ 用循环下标、对象创建顺序、数组索引派生身份。
- ❌ 用 `node.name` / Blender 对象名派生身份（含 Blender 自动追加的 `.001`）。
- ❌ 复制节点后沿用旧 ID（必须新分配）。
- ❌ 节点删除后复用旧 ID。
- ❌ 用 `semanticId` 单独作为键（会碰撞，见 §1.1）。

### 2.4 允许的实例标识来源

`instanceId` 必须是**建模时已持久化的编写值**，而不是运行时遍历顺序：

| 允许 | 不允许 |
|---|---|
| `.blend` 中的对象名末段（如 `separator_internal_mist_03` 的 `03`），因为该名字本身是持久化产物 | `for i, obj in enumerate(objects)` 里的 `i` |
| 显式写入的自定义属性 `petro.instanceId` | 导出器为消除重名自动生成的 `.001` 后缀 |
| 有语义的方位编号（`north`/`south`、`A`/`B`） | `objects[3]` 这类数组位置 |

> 迁移期允许从"已持久化的对象名"提取实例标识；**Phase 2 起应改为显式写入 `petro.instanceId` 属性**，使对象改名不再影响身份。

### 2.5 持久化时机

- **手工资产**：创建时生成一次并写入 `.blend`，之后改名/移动/改网格都不得重新生成。
- **程序化资产**：构建脚本用固定命名空间 + 语义路径计算，写入 `.blend` 自定义属性，再导出。
- 删除/合并节点必须留下可审计的映射记录（旧 UID → 新 UID 或 `retired`）。

---

## 3. 三处一致性：Blender / GLB / Manifest

### 3.1 分层职责

| 层 | 角色 | 权威性 |
|---|---|---|
| Blender 自定义属性 | 建模时的身份源 | **权威**（`.blend` 是源） |
| GLB `extras.petro` | 导出副本，供离开 Blender 后定位 | 只读副本，必须与源一致 |
| Manifest | 发布索引（系统/对象/锚点/表示/结构态） | 由产物生成，**不得手写第二套** |

### 3.2 自定义属性结构

每个需要被寻址的 Blender 对象写一个**嵌套**属性：

```python
obj["petro"] = {
    "nodeUid":    "<uuid-v5>",
    "assetId":    "separator_three_phase",
    "objectId":   "three_phase_separator",
    "semanticId": "separator_internal_mist_extractor",
    "instanceId": "00",          # 单实例留空字符串
    "role":       "internal_mist",
}
```

导出后对应 glTF：

```json
{ "name": "separator_internal_mist_00",
  "extras": { "petro": { "nodeUid": "97d95d55-...", "assetId": "...", "objectId": "...",
                          "semanticId": "...", "instanceId": "00", "role": "..." } } }
```

### 3.3 已验证的安全导出配方（Blender 5.3.0 / glTF I/O v5.3.43）

```python
# 1) 先清除旧的扁平属性，否则 extras 会出现 semanticId.001 / objectId.001
for key in ("semanticId", "objectId", "anchorId", "nodeUid"):
    if key in obj:
        del obj[key]

# 2) 只写嵌套 petro
obj["petro"] = {...}

# 3) 导出时必须开启 export_extras
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_extras=True)
```

实测结论：

| 做法 | `extras.petro` | `.NNN` 重复键 |
|---|---|---|
| 保留旧扁平属性 + 写新属性 | 43/43 | **43/43（污染）** |
| 先删旧扁平属性再导出 | 43/43 | **0/43（干净）** |

### 3.4 已实测的导出器行为（必须写进测试，不要靠记忆）

1. 嵌套字典 `obj["petro"] = {...}` 能完整导出为 `extras.petro`（**不需要扁平化**）。
2. 覆盖已存在的自定义属性会产生 `.001` 重复键 → **必须先删除**。
3. 即使删除后断言 `"semanticId" not in obj` 为真，extras 里仍可能出现**残留旧值**的扁平键。
   → 这正是"只读 `extras.petro`"这条硬规则的实证来源。
4. 同一 `.blend` 连续两次导出**字节级完全一致**（sha256 相同），可作为 nodeUid 稳定性的验收手段。
5. 现有 `tower.glb` 即含 `Exchanger_1_Saddle.001` 等自动后缀 → 名字不可作键的现场证据。

---

## 4. 坐标系契约

### 4.1 空间登记

| 项 | 规则 |
|---|---|
| 单位 | 米（线性） |
| 运行坐标系 | 右手、`+Y` 向上（glTF 2.0 约定） |
| 源坐标系 | Blender `+Z` up；轴变换在导出边界执行**一次** |
| `coordinateSystem.spaceId` | 每个资产一个 `assetLocal` 空间 ID，必须被 `bounds` 与 `anchors` 引用 |
| `sourceSpaceNote` | 必填，必须写明变换方式与方向，例如 `Blender Z-up -> glTF Y-up via export_yup=True` |

### 4.2 变换链

```
Blender source -> glTF assetLocal -> assetRoot -> levelRoot -> world
```

- 转换只在**边界**发生一次。
- 路径控制点、锚点坐标一律以 `assetLocal` 保存，运行时用同一个 `assetRoot.matrixWorld` 变换。
- **禁止**在 L2/L3/L4 各自硬编码同一连接的额外旋转/缩放/偏移。
- **禁止**无上下文的裸 XYZ：任何坐标必须附 `coordinateSpaceId`。

### 4.3 已知历史坑（迁移时必须处理）

| 资产 | 问题 | 证据 |
|---|---|---|
| tower | 同一锚点 `anchor_tower_products` 存在三种取值；旧值把热点抬高约 5 m | Phase 0 报告 §3.5c（已在 Phase 0 收尾修正） |
| separator | 旧 `phase-05` manifest 的手写锚点与真实几何不符（如 oil 出口记 `x≈3.35`，实测 `x=3.8`） | Phase 1 实测（见报告 §4） |
| separator | 旧 manifest 锚点疑似按 `(x, z, y)` 而非 `(x, z, -y)` 书写 | 同上 |

> 规则：**锚点必须由几何推导，不得手写。** 试点 Manifest 的 5 个锚点全部由 `position` accessor 的 `min/max` 计算得出。

---

## 5. 细节等级与结构状态必须分离

| 概念 | 取值 | 含义 |
|---|---|---|
| `detailLevel` | `overview` / `detail` / `closeup` | 观察距离/细节预算 |
| `structureMode` | `external` / `half` / `full` / `ghost` | 剖切与内部可见性 |
| `animationMode` | `idle` / `running` / `paused` | 运行动画 |

**禁止**用一个 `level` 数字同时表达二者。Manifest 中三者是三个独立字段（`defaults.*`），`representations` 与 `structureModes` 是两张独立映射表。

若底层 Three.js 使用 `THREE.LOD`，必须在适配层把 `detailLevel` 映射为距离阈值，**不得让渲染 LOD 与剖切模式耦合**。

`structureModes` 的四个模式各自声明 `show` / `hide` / `ghost` 三个 nodeUid 列表。资产若不支持 `full`，三个数组留空并在 `limitations` 说明。

---

## 6. 辅助结构不得静默丢失

`nonInteractiveSupport[]` 是**必填**字段（可为空数组），每项含 `nodeUid` / `nodeName` / `reason`。

规则：

1. GLB 中**每个**节点必须出现在 `nodes[]` 或 `nonInteractiveSupport[]` 之一。
2. 同一 `nodeUid` 不得同时出现在两处（校验器 `SUPPORT_ALSO_NODE`）。
3 `nonInteractiveSupport` 中的节点**不得**出现在 `representations` / `structureModes` / `dynamicBindings` / `objects[].nodeUids`（它们不是可交互节点）。
4. `reason` 必填，取值如 `platform` / `railing` / `foundation` / `ladder` / `flange` / `saddle` / `skid`。

这条是 V1.1"未知节点为 0 或明确列入 support"的机制化表达，也是 L4 那 83 个孤儿对象在 Phase 2 的收敛出口。

---

## 7. 工艺依据门禁

`processBasis[]` 每项必须含 `basisId` / `version` / `reviewStatus` / `sourceTitle` / `sourceOrg` / `scope` / `limitations`。

| `reviewStatus` | 允许行为 |
|---|---|
| `approved` | 可作为正式流程内容发布 |
| `draft` / `reviewed` | 仅开发预览；前端**必须**标注"待工艺审核/教学示意" |
| `rejected` | 禁止渲染为正式流程 |

`reviewed` / `approved` 必须附 `reviewedBy` + `reviewedAt`（Schema 用 `if/then` 强制）。

**当前状态：全项目 `processBasis` 为空。** 任何连接在 Phase 3 只能先做 `draft`。

---

## 8. 目录与构建约定

### 8.1 资产目录（Phase 0 决策 D-01）

```
web/assets/<assetId>/            ← 唯一正式形态
  <assetId>.glb                  ← 运行时产物
  <assetId>.mtl / .obj           ← 迁移期回退（GLB 试点通过前保留）
  <assetId>.manifest.json        ← 发布索引
  <assetId>.meta.json            ← 历史统计卡（逐步废弃）
web/assets/hero/<assetId>/       ← 过渡：总览用材质合并版，Phase 6 后并入 representations
assets-source/blender/<assetId>.blend   ← 唯一可编辑源
```

**不新建 `web/assets/models/`。** `docs/asset-pipeline.md` 中该路径从未落地。

### 8.2 构建版本（Phase 0 决策 D-02）

- 统一使用 **Blender 5.3.0**（`C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`，不在 PATH）。
- `build.blenderVersion` 写**实测**值；历史 4.5 时代产物如实标注，不得伪造成 5.3。
- `build.invocation` 必须写出可复现的完整命令。

### 8.3 URL 与版本

- GLB 文件名首轮允许无语义哈希，但**禁止**手工 `?v=08`、日期串、递增版本。
- 同一 `assetId` 在总览/L4/`tower.html` 必须加载同一 `assetVersion`。

---

## 9. 校验与门禁

### 9.1 命令

| 命令 | 作用 | 说明 |
|---|---|---|
| `npm run validate:assets` | 校验 `web/assets/**/*.manifest.json` | 失败退出码 1 |
| `npm run validate:assets:strict` | 同上，且要求 `extrasStatus=verified` | Phase 2 回写 extras 后启用 |
| `npm run validate:assets:fixtures` | 用固定 fixture 自测校验器 | 期望结果写死在 `expectations.json` |
| `npm run manifest:pilot` | 重新生成 separator 试点 Manifest | 只写 `separator.manifest.json` |

### 9.2 校验层次

| 层 | 内容 | 典型错误码 |
|---|---|---|
| L1 | AJV 2020-12 严格模式 | `SCHEMA_*` |
| L2 | nodeUid 非空/UUIDv5/不重复；各 ID 不重复 | `EMPTY_NODEUID` `BAD_NODEUID` `DUP_NODEUID` `DUP_OBJECT_ID` |
| L3 | 引用完整性（system↔object↔node↔anchor↔representation↔binding） | `MISSING_NODE_REF` `MISSING_OBJECT_REF` `MISSING_SYSTEM_REF` |
| L4 | GLB 字节数/哈希/节点存在/未登记节点/extras 一致/`.NNN` 键 | `GLB_MISSING` `GLB_HASH_MISMATCH` `NODE_NOT_IN_GLB` `UNREGISTERED_GLB_NODE` `EXTRAS_DOTTED_KEYS` |

`extrasStatus !== "verified"` 时，extras 未落地只产生**告警**（`EXTRAS_ABSENT`）；`--strict` 下升级为错误。这是为了在"机制已验证、产物尚未重建"的中间态下仍可运行门禁，同时不掩盖缺口。

### 9.3 CI

`.github/workflows/validate-assets.yml` 在资产/契约相关路径变化时执行 `npm ci` + fixtures + 真实 Manifest 校验。
Gitee Go 作为镜像方案，命令完全相同（见报告 §6）。

---

## 10. 与既有业务逻辑的边界

Phase 1 **不改变**任何运行时行为。以下为硬约束：

1. **L3 任务规则不得回退**：液位 ≥70% 即完成、泵送可选、不要求观察双罐、每次进入重置 2%/停泵/清完成/默认固定顶。
2. **阈值 4 处耦合**：`l3.js:346`、`l3.js:397`、`mission.js:376`、`mission.js:530`，任何阈值改动必须 4 处同改。
3. **不引入第二个 THREE runtime**，不接 GLTFLoader（Phase 6）。
4. **不接 `process-connections.json`**（Phase 3）。
5. **不改 L4 分组**（Phase 2）。

---

## 11. 变更流程

| 变更类型 | 要求 |
|---|---|
| 新增资产 | 先有 `.blend` + `petro` 属性 + Manifest + `validate:assets` 通过 |
| 改语义路径 | 破坏性变更，须附旧→新映射表，并保留旧 UID 的 `retired` 记录 |
| 改命名空间 | 禁止在普通阶段进行，需独立迁移阶段 |
| 改 Schema | 升 `schemaVersion`，同步更新 fixtures 与 `expectations.json` |
| 改校验器 | 必须先加一个 fixture 复现问题，再改实现 |

---

## 12. 已知未闭环项（移交 Phase 2）

| 项 | 状态 | 说明 |
|---|---|---|
| `separator.glb` 的 `extras.petro` | ⏸ `pending_rebuild` | 现有产物是 4.5.51 导出，无 extras；机制已在 5.3 临时构建中验证 |
| `tower` 的 Manifest | ❌ 不存在 | phase-06 旧 manifest 5/5 哈希失配，须在 Phase 2 重建后重新生成 |
| `tower` 253 个对象的语义归属 | ❌ 未定义 | 83 个对象无任何语义路径（Phase 0 §3.4） |
| `petro.instanceId` 显式属性 | ⏸ 未写入 `.blend` | 当前试点从对象名推导，Phase 2 改为显式属性 |
| `anchorId` 写入方 | ⏸ 未落地 | 决策已定（D-03），实现留 Phase 2 |
| `processBasis` | ❌ 空 | 需领域专家提供依据 |
