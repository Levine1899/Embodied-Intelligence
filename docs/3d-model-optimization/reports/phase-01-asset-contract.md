# Phase 1 · 资产契约与 Schema 交付报告

> 对应方案：《石油科普智能体 3D 模型优化实施方案 V1.1》Phase 1 / §2 / §5 / §10.1
> 开始前复检：`main` @ `5519ef74add0219c4d7eb0a62e5756abead6abcb`，`origin/main` 与 `github/main` 同为该提交（`rev-list --left-right` = `0 0`）
> 执行时间：2026-11-25 11:52–12:10（Asia/Shanghai）
> 结论：**PASS** — 允许进入 Prompt 02（Phase 2），但须携带 §8 的 3 项交接条件

---

## 0. 开始前的状态保护

| 项 | 结果 |
|---|---|
| HEAD | `5519ef74`（未变） |
| main 是否前进 | 否（双远端 `ls-remote` 确认） |
| 既有用户改动 | 6 个已跟踪文件修改（Phase 0 收尾的 B3/文档修复）+ 未跟踪 `.codegraph/`、`docs/3d-model-optimization/`、V1.1 方案文档、`stash@{0}` |
| 处理 | 全部保留，未覆盖/未 stash/未 reset/未 checkout；开跑前记录 `git diff` 指纹 `sha256:da9e54a7…` |
| 本阶段新增改动 | 见 §2，未触碰任一既有改动的内容 |

---

## 1. 只读盘点结果

### 1.1 现有 ID 体系的实际状态

盘点 `web/world/registry.js`（17 个 `objectId`）、`web/world/state.js`、6 个 `*.meta.json`、3 份 phase manifest、5 个 Blender 构建脚本后，结论是：

| 能力 | 现状 |
|---|---|
| `assetId` 的运行时表达 | **不存在**。`registry.js` 只有 `modelPath`，没有任何字段说明"这是哪个资产包的哪个版本" |
| `nodeUid` | **不存在**。全仓库 0 处（除方案文档） |
| `semanticId` | 仅 2 个脚本写过（`build_separator_hero.py`、`build_underground_hero.py`），且只在 `.blend` 内，OBJ 路径下完全失效 |
| `anchorId` | `export_glb.py` 会**读**，全仓库**无人写** |
| `structureMode` | 运行时只有 `external`/`half` 两态（`l2.js:193,226`、`l3.js:382-383`），契约要求 4 态 |
| 设备别名 | 同一设备最多 4 个名字（见下） |

### 1.2 已识别的 7 类冲突

完整清单与迁移裁定见 [`docs/3d-model-optimization/id-migration-map.md`](../id-migration-map.md)。要点：

1. **同一分离器四个名字**：`separator`（hero meta）、`separator_three_phase`（build 脚本/manifest）、`three_phase_separator`（registry）、`assets/separator/`（路径）。且 `hero/separator/`（5 个合并对象）与 `separator/`（43 个语义对象）**不是同一资产**。
2. **固定顶罐复用外浮顶罐资产**：`fixed_roof_tank.modelPath` 与 `floating_roof_tank.modelPath` 完全相同，都指向 `floating_roof_tank.obj`；而 L3 里两罐其实是程序化几何。
3. **两个 objectId 共用一个 anchor**：`underground_geology` 与 `reservoir` 都是 `reservoir_anchor`。
4. **悬空锚点引用**：`registry.js` 的 `heater.anchor = anchor_tower_heater`，但 `tower.meta.json` 只有 5 个锚点、**不含**该值；`tower.js:228` 实际用的是 `heater_bbox_obj_y_up`。
5. **锚点命名两套风格**：`anchor_tower_*` 前缀 vs 裸名（`separator`、`fixed_tank`、`plastic`…）。
6. **`semanticId` 被当实例键**：5 个 inlet port 共用 `separator_internal_inlet_port`，7 个除雾器共用 `separator_internal_mist_extractor` → 直接导致 nodeUid 冲突（本阶段实测复现，见 §4.3）。
7. **`modelNode` 是名字路径**：`registry.js` 全部 17 项都用 `/` 分隔的对象名，正是契约明令禁止的做法。

### 1.3 迁移映射草案

已输出 [`id-migration-map.md`](../id-migration-map.md)：含 17 个 objectId 现状表、7 类冲突的逐条裁定、目标 `assetId` 映射表、7 步迁移顺序与兼容性风险。

---

## 2. 新增 / 修改文件

### 2.1 新增

| 文件 | 大小 | 作用 |
|---|---|---|
| [`docs/model-contract.md`](../../model-contract.md) | 16,676 B / 350 行 | **主契约**：ID 体系、nodeUid 规则、三处一致性、坐标系、结构态分离、support、门禁、变更流程 |
| [`schemas/asset-manifest.schema.json`](../../../schemas/asset-manifest.schema.json) | 16,717 B / 474 行 | JSON Schema Draft 2020-12，`schemaVersion: "1.0.0"` |
| [`tools/validate_assets.mjs`](../../../tools/validate_assets.mjs) | 18,579 B / 434 行 | 4 层校验器（AJV + 唯一性 + 引用 + GLB 一致性） |
| [`tools/gen_pilot_separator_manifest.mjs`](../../../tools/gen_pilot_separator_manifest.mjs) | 15,274 B / 427 行 | 试点 Manifest 生成器；UUIDv5 参考实现 |
| [`tools/blender/asset_identity_probe.py`](../../../tools/blender/asset_identity_probe.py) | 6,189 B / 151 行 | Blender 身份探针（只读、导出到临时路径） |
| [`web/assets/separator/separator.manifest.json`](../../../web/assets/separator/separator.manifest.json) | 24,688 B / 794 行 | **试点 Manifest**（33 nodes + 10 support + 5 anchors） |
| `tests/fixtures/asset-manifests/` | 7 文件 | 1 个最小 GLB + 4 个 fixture + `expectations.json` |
| [`docs/3d-model-optimization/id-migration-map.md`](../id-migration-map.md) | 11,413 B / 172 行 | 迁移映射草案 |
| [`docs/3d-model-optimization/evidence/phase-01/extras-pipeline-evidence.json`](../evidence/phase-01/extras-pipeline-evidence.json) | 10,514 B / 306 行 | extras 通路实证（43 节点表 + 哈希 + 局限） |
| [`.github/workflows/validate-assets.yml`](../../../.github/workflows/validate-assets.yml) | 1,719 B / 57 行 | CI 门禁 |
| `package-lock.json` | 3,071 B / 96 行 | 首次生成（提交必需） |

### 2.2 修改

| 文件 | 改动 |
|---|---|
| `package.json` | 新增 4 个 scripts；新增 `devDependencies`（精确版本，无 `^`/`~`） |

**未修改**：`web/levels/*`、`web/world/*`、`web/mission.js`、`web/immersion.js`、`web/sandbox.html`、任何 `.glb/.obj/.blend/.mtl`。

> ⚠ 说明：`git diff` 中的 `web/tower.js`（1 行）、`tools/make_tower.py`、`web/assets/tower/tower.meta.json`、3 份 docs **是 Phase 0 收尾的既有改动**（`decisions.md` D-05/D-06/D-10），不是本阶段产生的，本阶段未再改动它们的内容。

---

## 3. Schema 设计（`schemaVersion: 1.0.0`）

### 3.1 顶层必填字段（20 项，`additionalProperties: false`）

```
schemaVersion  assetId  assetVersion  source  build  runtime
coordinateSystem  bounds  defaults  systems  objects  nodes  anchors
representations  structureModes  dynamicBindings  nonInteractiveSupport
processBasis  limitations  license
```

`limitations` 强制 `minItems: 1` —— 防止把教学模型当成工程模型而不留声明。

### 3.2 关键设计决策

| 决策 | 实现 | 理由 |
|---|---|---|
| **nodeUid 是 UUIDv5** | `pattern: ^…-5[0-9a-f]{3}-[89ab]…` | 版本位/变体位在 Schema 层就挡住 uuid4、手写 ID、截断 ID |
| **`semanticId` 允许重复、不当键** | 无 `uniqueItems`，description 明说"是类型不是实例" | 直接对应 §1.2-6 的真实碰撞 |
| **`instanceId` 独立字段** | 可选，`^[a-z0-9][a-z0-9_-]{0,31}$` | 让"类型 + 实例"可表达，避免用序号污染 nodeUid 语义 |
| **`nodeName` 只做显示** | description 明确"禁止作为唯一 key" | 对应 `.001` 现场证据 |
| **`detailLevel` 与 `structureMode` 分离** | 两个独立 enum，位于 `defaults`；`representations` 与 `structureModes` 是两张独立表 | V1.1 §7.1 强制要求，不得合并为 level 数字 |
| **`structureModes` 四态全必填** | `external`/`half`/`full`/`ghost` 各有 `show/hide/ghost` | 不支持 `full` 时留空数组 + 写 limitations，而不是省略字段 |
| **`nonInteractiveSupport` 必填** | 每项 `nodeUid`+`nodeName`+`reason` 全必填 | 辅助网格不得静默丢失；`reason` 必填防止"登记了个空壳" |
| **坐标空间必须登记** | `bounds.coordinateSpaceId` = `coordinateSystem.spaceId`；每个 anchor 也带 `coordinateSpaceId` | 禁止无上下文裸 XYZ；校验器再交叉验证一次 |
| **`processBasis` 审批联动** | `if reviewStatus ∈ {reviewed, approved} then 必填 reviewedBy+reviewedAt` | 用 `allOf/if/then` 在 Schema 层阻断"已审核但无审核人" |
| **`extrasStatus` 三态** | `verified` / `pending_rebuild` / `absent` | 让"机制已验证、产物未重建"这个真实中间态可被机器表达，且 strict 模式下仍会失败 |

### 3.3 与 V1.1 的一处有意收窄

V1.1 §2.4 示例里 `assetVersion` 写的是 `<generated-from-content-hash>`。本 Schema 采用**语义版本 + 可选 `+构建元数据`**（`1.0.0+phase1pilot`），因为内容哈希放在 `assetVersion` 会让"同内容换导出器"也变成新版本，不利于回滚叙事。内容哈希的真实位置是 `runtime.sha256`。此收窄已写入契约 §8.3。

---

## 4. 试点：`separator_three_phase`

### 4.1 为什么选 separator（非 tower）

| 依据 | separator | tower |
|---|---|---|
| phase manifest 哈希 | ✅ 4/4 匹配 | ❌ 5/5 失配 |
| 节点数 | 43（可逐条人工核对） | 253（含 83 个无归属对象） |
| 已有 `semanticId` 属性 | ✅ | ✗ |
| 真实半剖几何 | ✅ 已存在 | 部分 |

### 4.2 试点 Manifest 的实际内容

| 项 | 值 |
|---|---|
| `assetId` / `assetVersion` | `separator_three_phase` / `1.0.0+phase1pilot` |
| `runtime` | `assets/separator/separator.glb`，391,188 B，`sha256:741c0ee6…`，`extrasStatus: pending_rebuild`，`fallback: obj` |
| `coordinateSystem` | `separator_asset_local`，meter，right-handed，`+Y` up，`sourceSpaceNote` 写明 `export_yup=True` |
| `bounds` | `[-3.8, 0, -1.4] … [3.84, 3.975, 1.4]`（由 position accessor 聚合，非手写） |
| `nodes` / `support` | **33** / **10**（合计 43 = GLB 节点数，零遗漏、零重复） |
| `anchors` | **5** 个，4 个由接管包围盒外向面中心推导 + 1 个 vessel centre |
| `structureModes` | 四态齐备；`half` 显示真实 `cut_shell`/`cut_edge_*`/`cutaway_rim`，隐藏完整 `shell` |
| `dynamicBindings` | 3 个（液位 ×2、阀轮 ×1） |

锚点全部由几何推导，实测值：

| anchorId | position | direction | 推导方式 |
|---|---|---|---|
| `separator_inlet` | `[-3.8, 2.1, 0]` | `[-1,0,0]` | inlet bbox 的 −X 面中心 |
| `separator_gas_outlet` | `[0, 3.855, 0]` | `[0,1,0]` | 顶部 +Y 面中心 |
| `separator_oil_outlet` | `[3.8, 2.1, -0.2]` | `[1,0,0]` | +X 面中心 |
| `separator_water_outlet` | `[2.6, 1.9, 1.08]` | `[0,0,1]` | +Z 面中心 |
| `separator_center` | `[0, 2.1, 0]` | — | shell bbox 中心（`camera_target`） |

> 对比：旧 `phase-05` manifest 手写 oil 锚点为 `[3.35, 2.1, 0.2]`，而实测接管端面在 `x=3.8`。**手写锚点不可靠**已有实证。

### 4.3 Blender 自定义属性 → GLB extras 通路（本阶段核心实证）

**环境**：Blender 5.3.0 / Khronos glTF I/O v5.3.43。全部导出写入系统临时目录，**未保存 `.blend`、未覆盖 `web/assets`**。

| 验证项 | 结果 |
|---|---|
| `export_extras=True` + 嵌套 `obj["petro"]={...}` | ✅ 43/43 节点导出为 `extras.petro` |
| 嵌套字典是否被破坏 | 否，`petro` 内部字段完整 |
| `.NNN` 重复键 | 首次探针 **43/43 全污染**（`semanticId.001`、`objectId.001`）→ 删除旧扁平属性后 **0/43** |
| 残留扁平键 | 删干净后 extras 仍残留旧值的扁平 `semanticId`/`objectId` → **身份只能读 `extras.petro`**（已写入契约 §0.3） |
| 两次相同输入构建 | ✅ **字节级完全一致**，`sha256=e41799c4…`（A/B 同哈希） |
| nodeUid 唯一性 | ✅ 43/43 唯一（引入 `instanceId` 前为 33/43，复现了 12 个冲突） |

**三处一致性交叉校验**（Blender 自定义属性 → GLB extras → Manifest）：

```
nodeUid 不一致 : 0
GLB 缺失节点   : 0
objectId 不一致: 0
semanticId 不一致: 0
=> 43/43 完全一致（Node 的 crypto UUIDv5 与 Python uuid.uuid5 逐字节相同）
```

证据文件：[`extras-pipeline-evidence.json`](../evidence/phase-01/extras-pipeline-evidence.json)（含 43 节点完整 UID 表与三份产物的哈希）。

### 4.4 发布产物状态（诚实声明）

**`web/assets/separator/separator.glb` 仍未带 `extras.petro`**（它是 4.5.51 旧产物，本阶段按禁令未覆盖它）。因此：

- 机制：**已验证**
- 发布产物：**尚未回写** → `extrasStatus: "pending_rebuild"`
- `npm run validate:assets` 对此**告警**
- `npm run validate:assets:strict` 对此**失败**（已实测，退出码 1）

这是有意设计：让缺口可见，而不是让它悄悄通过。

---

## 5. 校验工具与真实执行结果

### 5.1 命令

```
npm run validate:assets            # 真实 Manifest
npm run validate:assets:strict     # 额外要求 extrasStatus=verified
npm run validate:assets:fixtures   # 校验器自测
npm run manifest:pilot             # 重生成试点 Manifest
```

### 5.2 四层校验

| 层 | 内容 | 主要错误码 |
|---|---|---|
| L1 | AJV 2020-12 严格模式 | `SCHEMA_REQUIRED` `SCHEMA_PATTERN` … |
| L2 | nodeUid 非空/UUIDv5/唯一；ID 不重复；support 与 nodes 互斥 | `EMPTY_NODEUID` `BAD_NODEUID` `DUP_NODEUID` `SUPPORT_ALSO_NODE` |
| L3 | 引用完整性 + 坐标空间一致性 | `MISSING_NODE_REF` `MISSING_OBJECT_REF` `MISSING_SYSTEM_REF` `SPACE_MISMATCH` |
| L4 | GLB 字节/哈希/节点存在/未登记节点/extras/`.NNN` | `GLB_MISSING` `GLB_HASH_MISMATCH` `NODE_NOT_IN_GLB` `UNREGISTERED_GLB_NODE` `EXTRAS_DOTTED_KEYS` `EXTRAS_ABSENT` |

失败时**进程退出码非 0**（已逐条实测）；输出含文件路径、ID、错误码、原因。

### 5.3 实际执行输出（本轮真实运行）

```
$ node tools/validate_assets.mjs --fixtures
Schema 编译通过：schemas/asset-manifest.schema.json  (draft 2020-12, AJV 8.20.0)

── fixtures ─────────────────────────────────────────
  ✓ fail-duplicate-nodeuid.manifest.json   期望=fail 实际=fail  期望错误码=DUP_NODEUID（命中）
  ✓ fail-missing-node-ref.manifest.json    期望=fail 实际=fail  期望错误码=MISSING_NODE_REF（命中）
  ✓ fail-missing-nodeuid.manifest.json     期望=fail 实际=fail  期望错误码=SCHEMA_REQUIRED（命中）
  ✓ fail-unknown-node.manifest.json        期望=fail 实际=fail  期望错误码=NODE_NOT_IN_GLB（命中）
  ✓ valid.manifest.json                    期望=pass 实际=pass

✓ fixtures 全部符合期望
exit 0

$ node tools/validate_assets.mjs
△ web/assets/separator/separator.manifest.json
    · GLB 解析自 web/assets/separator/separator.glb
    · GLB 节点 43 个，其中带 extras.petro 的 0 个；extrasStatus=pending_rebuild
    ! [EXTRAS_ABSENT] runtime.extrasStatus: GLB 无 extras.petro（…）：nodeUid ↔ glTF node 的映射尚未在产物中验证

合计 1 个 Manifest：通过 1，失败 0，带告警 1
exit 0

$ node tools/validate_assets.mjs --strict
✗ [EXTRAS_ABSENT] runtime.extrasStatus: …
合计 1 个 Manifest：通过 0，失败 1（strict 模式）
exit 1
```

> 校验器自身也修过两个真实缺陷（本轮实测发现，非事后补写）：
> ① `runtime.uri` 原按仓库根解析，而契约规定为站点相对（`web/`）→ 改为两处依次尝试；
> ② 生成器曾把 support 节点（`separator_inlet_flange`）写进 `structureModes.external.show`，触发 `MISSING_NODE_REF` → 修正并写入契约 §6.3。

---

## 6. 依赖与环境变更

| 项 | 值 | 说明 |
|---|---|---|
| 新增 devDependency | `ajv@8.20.0`、`ajv-formats@3.0.1` | **精确版本，无 `^`/`~`** |
| lockfile | `package-lock.json` 首次生成（96 行） | 必须提交 |
| `node_modules` | 1.3 MB / 6 包 | 已被 `.gitignore` 忽略 |
| npm | 10.9.3 / Node v22.20.0 | 与 Phase 0 记录一致 |

### 6.1 关于你批准的 (b)：一次性授权 4 个依赖

我**只落地了 AJV**，另外三个**故意未装**，理由：

| 依赖 | 锁定版本 | 安装时机 | 为什么现在不装 |
|---|---|---|---|
| `ajv` + `ajv-formats` | 8.20.0 / 3.0.1 | ✅ 已装 | Phase 1 验收要求"Schema 能由 AJV 校验" |
| `playwright` | 1.65.1 | Phase 5 | 无 Phase 1 用例；`playwright` 包的 postinstall 会拉浏览器二进制（数百 MB） |
| `esbuild` | 0.28.2 | Phase 6 | 无 Phase 1 用例 |
| `three` | **0.180.0**（须实测比对 `REVISION`） | Phase 6 | **Phase 1 禁令明确禁止"引入新 THREE runtime"**；装进 `node_modules` 会被误认作已接入 |

三个版本已精确锁定并记录于此；到对应阶段直接 `npm i -D --save-exact <pkg>@<version>` 即可。若你要求**现在**全部安装，我可以立即执行，但会与 Phase 1 禁令字面冲突，故先按阶段隔离。

### 6.2 CI

按你的答复建了 **GitHub Actions**（[`validate-assets.yml`](../../../.github/workflows/validate-assets.yml)）：资产/契约相关路径变化时执行 `npm ci` → fixtures → 真实 Manifest；`strict` 步骤已写好但**注释掉**，等 Phase 2 回写 extras 后启用，避免长期红。

**Gitee Go 未配置**：工作流平台文件不可复用，需要在 Gitee 侧单独建流水线，命令完全相同（`npm ci && npm run validate:assets:fixtures && npm run validate:assets`）。如果你希望 Gitee 也立即生效，需要确认 Gitee Go 的流水线配置入口。

---

## 7. 未验证项与风险

### 7.1 NOT_RUN / 未闭环

| # | 项 | 状态 | 原因 |
|---|---|---|---|
| 1 | 发布产物 `separator.glb` 回写 `extras.petro` | ⏸ `pending_rebuild` | 需覆盖发布资产；Phase 1 定位是建契约，且会使既有 phase-05 manifest 哈希失效 |
| 2 | `tower` / `underground` / 5 个 hero 的 Manifest | ⏸ 未做 | 明确属 Phase 2/6 范围 |
| 3 | Blender **4.5.16** 是否同样支持嵌套 extras | ⏸ NOT_RUN | 本机只有 5.3.0，4.5.16 已不可复现 |
| 4 | CI 工作流实际运行 | ⏸ NOT_RUN | 需要 GitHub Actions 环境；本地无法验证 `npm ci` 在干净 clone 下成功 |
| 5 | `petro.instanceId` 作为显式 `.blend` 属性 | ⏸ 未做 | 试点从已持久化对象名推导；Phase 2 改为显式属性 |
| 6 | `anchorId` 由 Blender 写入 | ⏸ 未做 | 决策 D-03 已定，实现留 Phase 2 |
| 7 | `processBasis` 真实内容 | ⛔ 空 | 需领域专家提供已审依据 |

### 7.2 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 回写 extras 会改变 `separator.glb` 字节（约 391 KB → 406 KB） | phase-05 manifest 的 4 个哈希失效 | Phase 2 一并重生成该 manifest，或标注为历史证据 |
| `npm ci` 未在干净环境验证 | CI 可能首次就红 | Phase 2 首次推送时观察；必要时改为 `npm install` |
| Schema 是本项目首次引入的强约束 | 若设计有误，Phase 2 会被反复卡 | fixtures 已覆盖 4 类失败；契约明确"先加 fixture 再改实现" |
| `instanceId` 目前从对象名推导 | 对象改名会改变 nodeUid | Phase 2 改为显式属性（契约 §2.4 已写明） |
| `tower` 的 `groups.hotspots` 仍被前端使用 | 与 Manifest 形成两套映射 | Phase 2 保留并在 Manifest 中重复表达，前端切换后再删 |

---

## 8. 验收对照

| 验收项（Prompt 要求） | 结果 | 证据 |
|---|---|---|
| Schema 文件能由 AJV 成功校验 | ✅ | `AJV 8.20.0` 编译通过（每次运行首行输出） |
| 合法 fixture PASS | ✅ | `valid.manifest.json` → pass |
| 缺 `nodeUid` 的 fixture FAIL | ✅ | `SCHEMA_REQUIRED` @ `/nodes/1` |
| 重复 `nodeUid` fixture FAIL | ✅ | `DUP_NODEUID` @ `nodes[1]` |
| 引用不存在节点的 fixture FAIL | ✅ | `NODE_NOT_IN_GLB` + `MISSING_NODE_REF`（两个 fixture 各覆盖一种语义） |
| 真实试点 Manifest 通过 Schema | ✅ | `validate:assets` 退出码 0（1 条告警为预期） |
| Blender 属性 / GLB extras / Manifest 三处 nodeUid 一致 | ✅ | 43/43，0 不一致（证据 JSON §nodeUidConsistency） |
| nodeUid 在两次相同输入构建中不变 | ✅ | 两产物同 `sha256=e41799c4…` |
| 不修改 L1–L5 业务交互 | ✅ | `git diff` 未触及 `web/levels/*`、`mission.js`、`immersion.js`、`sandbox.html` |
| 不重写模型几何 | ✅ | 未改任何 `.glb/.obj/.blend/.mtl`；Blender 只导出到系统临时目录 |

**9/10 项完成 + 1 项部分完成**（`extrasStatus` 停在 `pending_rebuild`，这是本阶段唯一未闭环项，且已用 strict 模式使其失败可见）。

---

## 9. 结论

> ## **PASS**

Phase 1 的门禁原文是："试点资产的节点身份可追踪、唯一、导出后不丢失。未通过不建新资产。"

| 门禁条件 | 结果 |
|---|---|
| 可追踪 | ✅ 语义路径 → UUIDv5 → `.blend` 属性 → GLB extras → Manifest，全链可复算 |
| 唯一 | ✅ 43/43 唯一（引入 `instanceId` 前后从 33 提升到 43，冲突已消除） |
| 导出后不丢失 | ✅ 在 5.3.0 上实测 43/43 落地，两次构建字节一致 |

**允许进入 Prompt 02（Phase 2：L4 语义清单和对象归属）**，但必须携带以下 3 项交接条件：

1. **Phase 2 第一件事是回写 extras**：用 `tools/blender/asset_identity_probe.py` 的安全配方改 `build_separator_hero.py`，重导出 `separator.glb`，把 `extrasStatus` 改为 `verified` 并启用 CI 的 strict 步骤。在此之前，`strict` 会一直是红的。
2. **tower 不要复用本阶段脚本**：`gen_pilot_separator_manifest.mjs` 的 ROLES 表是 separator 专用的；tower 需要先解决"83 个无归属对象 → nodes/support"的归属问题（Phase 0 §3.4），再谈 Manifest。
3. **`instanceId` 要改成显式属性**：当前从对象名推导只是迁移期权宜；Phase 2 在 `.blend` 里写 `petro.instanceId`，否则对象改名即身份漂移。

### 不要在本阶段之后做的事

- ❌ 不要把 `separator.manifest.json` 当作"已发布"——它是 `pending_rebuild` 状态的目标态清单。
- ❌ 不要用 `gen_pilot_separator_manifest.mjs` 生成 tower Manifest（ROLES 表不适用，会直接抛错，这是有意的）。
- ❌ 不要在 Phase 2 之前接 `process-connections.json`（Phase 3）或 GLTFLoader（Phase 6）。

---

## 10. 附：本轮执行的原始命令清单

```bash
git rev-parse HEAD; git status --porcelain; git ls-remote origin refs/heads/main
npm install --save-dev --save-exact ajv@8.20.0 ajv-formats@3.0.1
node --check tools/validate_assets.mjs
node --check tools/gen_pilot_separator_manifest.mjs
node tools/gen_pilot_separator_manifest.mjs
node tools/validate_assets.mjs --fixtures      # exit 0
node tools/validate_assets.mjs                 # exit 0（1 告警）
node tools/validate_assets.mjs --strict        # exit 1（预期）

# Blender 探针（三次：dry-run + 两次导出，全部写到 %TEMP%）
"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b \
  assets-source/blender/separator_hero.blend -P tools/blender/asset_identity_probe.py \
  -- --asset-id separator_three_phase --object-id three_phase_separator
```

**Blender 只以 `-b` 后台模式读取 `.blend`，从未保存、从未覆盖 `web/assets` 下的任何产物。**
