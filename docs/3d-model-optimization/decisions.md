# 前期阻断项处置与决策记录

> 输入：`docs/3d-model-optimization/reports/phase-00-baseline.md`（Phase 0 只读基线，2026-11-25，结论 PASS）
> 本文处置该报告 §9.2 的 B1–B7 blocker 与 §10 的 5 项硬前置。
> 基线提交：`5519ef74add0219c4d7eb0a62e5756abead6abcb`（未变）
> 决策性质：**技术决策，可被用户推翻**。凡标注"待用户"的，本阶段不做假设性实现。

---

## 0. 状态总览

| ID | 事项 | 类型 | 状态 |
|---|---|---|---|
| **B3** | `make_tower.py` 重跑与已提交资产不等价（锚点会落到地下） | 代码缺陷 | ✅ **已修复并逐值验证**（D-05） |
| **B2** | `tower` 的 phase-06 manifest 5/5 哈希失配 | 重建依赖 B3 | ⏸ 已解除阻塞条件；重建本身留给 Phase 2（D-04） |
| — | `cutaway_show_only` 名称失配（`Tray_`/`VacTray_`） | 数据缺陷 | ✅ **已修复**（D-06） |
| — | 3 份过期文档（inventory / tooling-readiness / asset-pipeline） | 文档 | ✅ **已更正**（D-10） |
| **B4** | Blender 版本未锁定、产物由两版本产出 | 决策 | ✅ **已决策**（D-02） |
| — | 资产目录两套并存、`models/` 不存在 | 决策 | ✅ **已决策**（D-01） |
| — | `anchorId` 有读取方无写入方 | 决策 | ✅ **已决策**（D-03） |
| — | Phase 1 试点资产选择 | 决策 | ✅ **已决策**（D-04） |
| — | L3 阈值 4 处耦合 | 决策 | ✅ **已登记为硬约束**（D-07） |
| **B1** | 无依赖可安装，Playwright/esbuild/three/AJV 均缺 | 授权 | ⛔ **待用户授权**（D-08） |
| **B6** | 无 CI 宿主 | 决策 | ⛔ **待用户决策**（D-09） |
| **B5** | 无 `approved` 工艺依据 | 外部输入 | ⛔ **待用户/领域专家**（不进 Phase 1） |
| **B7** | 目标设备 GPU 性能不可测 | 硬件 | ⛔ **无法通过代码解决**；仅能标 `NOT_MEASURED` |

---

## 1. 已决策（D-01 ～ D-04）

### D-01 资产目录唯一形态

**决策：保持现有 `web/assets/<assetId>/` 为唯一正式形态；`web/assets/hero/<assetId>/` 仅作为"总览用材质合并版"的**过渡**形态，Phase 6 之后逐步并入 `web/assets/<assetId>/`。**不新建 `web/assets/models/`。**

- **依据**：`docs/asset-pipeline.md` 建议的 `web/assets/models/` **从未建立**（Phase 0 §3.2/§3.7 已证）。现有生产路径全部指向 `web/assets/{tower,separator,underground}/`（`l1.js:13`、`l2.js:308`、`l4.js:146`、`immersion.js:1698`）。再造第三套目录会让三条加载路径同时失效。
- **`assetId` 规则**：小写 + 下划线，与目录名一致；`separator_three_phase`（脚本/ manifest 已用）与 `separator`（`hero/` 目录名）视为**两个不同 assetId**，不得混用。
- **Hero 合并版的定位**：`assets/hero/<id>/` 里 5 个 OBJ 是"按材质合并、部件身份已丢失"的中景资产（`separator.obj` 仅 5 个对象）。它们**不是** L2 那个 43 对象的 detail 资产。Phase 6 引入 GLB 后，二者应统一到同一个 `assetId` 的不同 `representations`（`overview` vs `detail`），而不是两个 assetId。
- **影响**：Phase 1 的 `docs/model-contract.md` 按此写；Phase 2 不动目录；Phase 6 做 `representations` 合并。
- **反向成本**：若用户希望改用 `models/`，需一次性改 4 处加载路径 + 2 处构建脚本输出，建议不要。

### D-02 Blender 版本锁定策略

**决策：未来所有构建统一使用 `Blender 5.3.0`（`C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`），并在 manifest 的 `build.blenderVersion` 写**实测**值；对 4.5 时代的历史产物，按"实际生成版本"如实记录，不追溯改写。**

- **依据**：Phase 0 §4.4/§7.2 实测——实机 **5.3.0**；`tower.glb` 由 Blender I/O `v5.3.43` 生成，`separator/underground/spike.glb` 由 `v4.5.51` 生成。即**产物已经混版本**，任何单一"锁定"都无法同时解释全部历史产物。
- **为什么是 5.3 而不是 4.5.16**：① 4.5.16 现已不在本机（`docs/tooling-readiness.md` 的 4.5.16 记录已过期），无法复现；② `tower` 是 P0 资产且已由 5.3 产出，Phase 2 必然要用 5.3 重建；③ 5.3.0 已验证 `--version` 与 headless 可用。
- **诚实标注要求**：`separator`/`underground` 的现有 manifest 记录的是 4.5 时代的产物，其哈希**仍然有效**（Phase 0 §3.3：4/4 匹配）。因此这两个资产**暂不重建**，manifest 的 `build.blenderVersion` 应补记为 4.5.x（实际值待用 `.blend` 重导出时确认），而不是伪造成 5.3。**不得为了让字段统一而伪报版本。**
- **须清理的历史残留**：`tools/blender/build_separator_hero.py` docstring 里硬编码 `D:\tools\blender-4.5.16-windows-x64\blender.exe`，与本机不符。该脚本**无 CLI 参数**、路径全部硬编码，Phase 2 需改为可配置或明确记录调用方式。
- **影响**：Phase 1 契约写入"构建版本 = 5.3.0"；Phase 2 的 tower 重建是第一个 5.3.0 正式产物。

### D-03 `anchorId` 的写入方

**决策：`anchorId` 由 Blender 侧的锚点空物体自定义属性写入（`obj["anchorId"]`），经 `export_extras=True` 导出为 glTF `extras.petro.anchorId`；Manifest 只做**索引与校验**，不另行维护第二套值。**

- **依据**：`tools/blender/export_glb.py:55–61` **已经在读** `objectId` / `semanticId` / `anchorId` 三个属性，但全仓库**无任何脚本写 `anchorId`**（Phase 0 §8-9），故该字段在所有现有产物中恒为 `None`。写入侧缺失是唯一缺口，读取侧已就绪。
- **已有先例可循**：`build_underground_hero.py:246–256` 的 4 个锚点空物体已带 `semanticId` + `objectId`；只差再加一个 `anchorId`。`underground.glb` 的 28 个节点已带 extras 落盘（Phase 0 §3.5a），证明 `export_extras` 通路是通的。
- **命名**：沿用 `docs/asset-pipeline.md` §4 既有约定 `anchor_<name>`（节点名）+ `anchorId = <name>`。现有 `anchor_tower_overview/feed/trays/vacuum/products` 已符合节点名约定，补属性即可。
- **禁止**：不得由前端或 Manifest 反推/生成 `anchorId`（会退化成第二套身份来源，违背 V1.1 §2.2）。
- **影响**：Phase 2 改 `make_tower.py` 时，连同 5 个 anchor 空物体一起加属性；Phase 1 的 checker 必须能报"extras 缺 anchorId"。

### D-04 Phase 1 试点资产

**决策：Phase 1 试点资产 = `separator_three_phase`（`web/assets/separator/`），次选 `underground_hero`。`distillation_unit_hero`（tower）**不**用于 Phase 1 试点。**

- **依据**（Phase 0 §3.3 哈希实测）：`phase-05` separator manifest **4/4 哈希匹配**且已含 `objects[]`/`anchors{}`/`cutaway`/`stats`；`phase-04` underground 也 4/4 匹配并已带 extras 先例。而 `tower` 的 phase-06 manifest **5/5 失配**，且其 `.001` 重名与 83 个无归属对象问题正属 Phase 2 范围。
- **为什么 separator 优于 underground**：separator 的 manifest 结构最接近 V1.1 §2.4 形状（已有 `objects[]` 与 `anchors{}`），且资产本身含真实半剖壳（`separator_cut_shell` 等），Phase 4 要用的 `structureMode` 数据也在同一资产上，试点收益可复用。
- **重要约束**：试点**不重跑 Blender**（见 §2）。试点 Manifest 由"现有已提交产物 + 实测数据"生成，不重新导出。这样既不触碰模型，又能验证 Schema 与 checker。
- **影响**：Phase 1 门禁"试点资产节点身份可追踪、唯一、导出后不丢失"用 separator 达成；但**"导出后不丢失"需一次真实导出验证** → 见 §4 待用户事项 U-1。

---

## 2. 已修复（D-05 ～ D-06）

### D-05 `make_tower.py` 锚点回归（B3）—— 已修复并逐值验证

**问题**：脚本 `ANCHORS["anchor_tower_products"]` 写的是 Blender 坐标 `(8.4, 6.0, -5.9)`，经 `:516` 的 `[x, z, -y]` 派生后网页值为 `(8.4, -5.9, -6.0)` —— **y 为负，落到地面以下**。而已提交 `tower.meta.json` 记录的是 blender `(8.4, 5.9, 1.0)` / web `(8.4, 6.0, -5.9)`，两者互相矛盾且 web 值也不等于自身 blender 值的派生结果。

**取证**：解析 `tower.obj` 的 `BatteryLimit_*` 9 个对象，实测包围盒（OBJ/Y-up，即网页坐标）：

```
x ∈ [7.95, 8.85]    y ∈ [0.00, 1.30]    z ∈ [-7.45, -4.35]
中心 (8.4, 0.65, -5.9)
```

即界区法兰在地面以上 0–1.3 m，**不是 6 m**。原 web 值 `y=6.0` 实际是把 Blender 元组 `y=6.0` 直接抄进了网页字段。真实 blender 值应为 `(8.4, 5.9, 1.0)`（其派生 web 值 `(8.4, 1.0, -5.9)` 落在实测包围盒内）。

**修复**（`tools/make_tower.py`，共 2 处）：

| 位置 | 改前 | 改后 |
|---|---|---|
| `:462`（现 `:466`） | `"anchor_tower_products": (8.4, 6.0, -5.9),` | `(8.4, 5.9, 1.0)` + 3 行依据注释 |
| `web/assets/tower/tower.meta.json` | `anchor_web_y_up.anchor_tower_products = [8.4, 6.0, -5.9]` | `[8.4, 1.0, -5.9]` |
| `web/tower.js:202` | `new THREE.Vector3(8.4, 6.0, -5.9)`（加载 meta 前的兜底位） | `new THREE.Vector3(8.4, 1.0, -5.9)` |

**验证（逐值比对，非目测）**：

```
anchor                      script(Blender)   ==meta(Blender)   [x,z,-y]派生   ==meta(web)
anchor_tower_overview       [0,0,14]          true              [0,14,0]       true
anchor_tower_feed           [-4.5,0,13]       true              [-4.5,13,0]    true
anchor_tower_trays          [0,0,16]          true              [0,16,0]       true
anchor_tower_vacuum         [7.6,0,9]         true              [7.6,9,0]      true
anchor_tower_products       [8.4,5.9,1]       true              [8.4,1,-5.9]   true
=> 5/5 Blender 源一致；5/5 web 派生一致
=> products 锚点落在 BatteryLimit_* 实测包围盒内：true
=> meta.heater_bbox_obj_y_up 与 Heater + Heater_Chimney 实测 bbox 逐值相等：true
```

**残余不确定性（必须承认）**：`tower.meta.json` 是**构建产物**，本次是**手工更正**而非重新生成。可以证明"当前脚本会产出这 5 个锚点与这个 bbox"，但**不能**声称整份文件字节级可复现 —— 完整复现需要一次真实 Blender 重跑（会同时重写 `tower.obj/.glb`）。该重跑**未执行**，留给 Phase 2（见 D-04、U-1）。

### D-06 `cutaway_show_only` 名称失配 —— 已修复

**问题**：`make_tower.py:520` 写 `"cutaway_show_only": ["Tray_", "VacTray_"]`，但脚本实际创建的对象名是 `Trays_A` / `Trays_V`（`:248,285`），两个前缀**匹配不到任何对象**。

**修复**：`make_tower.py` 改为 `["Trays_A", "Trays_V"]`；并把已提交的构建产物 `web/assets/tower/tower.meta.json` 的 `groups.cutaway_show_only` 同步修正（与 D-05 同理：产物必须等于修复后脚本的产出，否则"重建即同物"不成立）。

**验证**：4 个目标名全部在 `tower.obj` 中存在（`Trays_A`/`Trays_V`/`Tower_Atmospheric_Shell`/`Tower_Atmospheric_Dome`）；脚本与 meta 的 `cutaway_hide`/`cutaway_show_only`/`hotspots` 三组**逐值一致**；5 个 hotspot 指纹均能命中 ≥1 个真实对象（`hs_products` 命中 9 个 `BatteryLimit_*`）。

**风险评估**：全仓库搜索确认 `meta.groups.cutaway_show_only` / `cutaway_hide` **没有任何消费者**（`web/` 下 0 命中），故本次修改不影响运行时，只修正数据正确性（对将来生成 Manifest 有用）。

---

## 3. 已登记约束（D-07）

### D-07 L3 阈值 4 处耦合点 —— 硬约束

液位完成阈值散落在 4 个位置，任何一处单独修改都会使"关卡层"与"任务层"判据分叉：

| # | 位置 | 形式 |
|---|---|---|
| 1 | `web/levels/l3.js:346` | `if (level >= 0.70 && !completed) complete();`（`selectTank()` 内） |
| 2 | `web/levels/l3.js:397` | 同条件（滑块 `input` 事件内） |
| 3 | `web/mission.js:376` | `if ((state.flags.level \|\| 0) >= 70) completeStep();`（action 回调） |
| 4 | `web/mission.js:530` | 同条件（500 ms 轮询 `storageWatch`） |

**约束**：
- 禁止只改其中一处。改阈值 = 4 处同改 + 补回归测试。
- 本阶段**未改动任何 L3 阈值**（Phase 0 §5.1 已确认 5 条规则全部成立，无需修）。
- 该清单应写入 Phase 1 的 `docs/model-contract.md` 或独立回归清单，并在 Phase 7（L3 资产迁移）时逐条复验。

---

## 4. 待用户输入（未做假设性实现）

### U-1 / B1：依赖安装授权窗口

**需要你明确一句授权**，才能引入任何 npm 依赖。当前事实：无 `package.json` 依赖、无 lockfile、无 `node_modules`；`npx playwright` 需要联网下载。

Phase 1–6 需要的依赖与用途：

| 依赖 | 用途 | 引入阶段 |
|---|---|---|
| `ajv`（+ `ajv-formats`） | JSON Schema Draft 2020-12 校验 | Phase 1 |
| `playwright`（`@playwright/test`） | 浏览器 E2E / 截图证据 | Phase 5 |
| `esbuild` | 单一 THREE + GLTFLoader bundle | Phase 6 |
| `three`（精确 `0.180.0`，须实测比对 `REVISION`） | GLB 加载 | Phase 6 |

**选项**：
- (a) 现在一次性授权 Phase 1 的 `ajv`，其余按阶段再授权 —— 最小暴露面，**推荐**。
- (b) 一次性规划全部 4 个依赖 + lockfile —— 省反复确认，但会提前引入尚未验证的构建链。
- (c) 全部不装，Phase 1 的 Schema 校验先用手写只读 checker（**违背 V1.1 §2.4"禁止再造不完整手写校验器"**，不建议）。

> 注：本次已用 Node 内置能力完成了多项"本可交给依赖"的只读分析（GLB JSON chunk 解析、SHA-256 比对、锚点一致性校验），**未引入任何依赖**。Phase 1 的 Schema 校验若也要零依赖，会与 V1.1 冲突，需你裁决。

### U-2 / B6：CI 落点

两个远端都停在 `5519ef74`：`origin` = Gitee `LYU_PRO/scienceagent`，`github` = `Levine1899/Embodied-Intelligence`（方案封面写的是后者）。**V1.1 §10 要求把 Schema/Manifest/连接校验纳入 CI，当前无任何 CI 配置。**

**选项**：(a) GitHub Actions（生态最好，与方案封面一致）；(b) Gitee Go（与日常推送远端一致，但生态受限）；(c) 暂不建 CI，用本地 `npm run validate:assets` 脚本 + pre-commit（最快，但违背 §10 的"纳入 CI"）。

### U-3 / B5：工艺依据（`approved` basis）

仓库**不存在**任何 `basisId` / `reviewStatus` 字段或工艺依据文档。V1.1 §Phase 3 已预置正确退路：把试点连接标 `draft`、前端标注"待工艺审核/教学示意"、阻断正式发布。

**因此这条不阻断 Phase 1**。但请确认：Phase 3 是否接受"只做 draft + 机制验证、不做 approved 发布"？若你能提供经审阅的工艺资料，Phase 3 才可能产出 `approved` 连接。

### U-4 / B7：目标设备性能

本机只有 AMD 集显（Ryzen 7 6800H）+ 向日葵虚拟显示驱动，**无独显、无目标设备**，且 WebGL 无法读真实 VRAM。

**需要你提供**：目标设备清单（型号/GPU/浏览器），否则 V1.1 §7.3-C 与 §10.4 的性能门禁只能永久标 `NOT_MEASURED`。

---

## 5. 本次改动清单

| 文件 | 改动 | 依据 | 验证 |
|---|---|---|---|
| `tools/make_tower.py` | `anchor_tower_products` 回归修复 + 依据注释；`cutaway_show_only` 名称修正 | D-05、D-06 | `compile()` 内存语法检查通过；锚点 5/5 逐值一致；600 行 |
| `web/assets/tower/tower.meta.json` | `anchor_web_y_up.anchor_tower_products` → `[8.4, 1.0, -5.9]`；`groups.cutaway_show_only` → `["Trays_A","Trays_V"]` | D-05、D-06 | JSON 合法；与脚本产出逐值一致；4 个目标名在 OBJ 中真实存在 |
| `web/tower.js` | `hs_products` 兜底坐标 → `(8.4, 1.0, -5.9)` | D-05 | `node --check` 通过 |
| `docs/asset-inventory.md` | 加过期横幅；tower 的 obj/glb/mtl/meta 大小、面数、对象数（54→253）就地更正；补 `.blend` 存在 | D-10 | 数字来自本次实测 |
| `docs/tooling-readiness.md` | 加过期横幅；Blender 4.5.16 → **5.3.0**（含路径） | D-10 | `blender --version` 实测 |
| `docs/asset-pipeline.md` | 加偏差横幅；Blender 实测/锁定说明；§9 当前状态重写（`models/` 不存在、`.blend` 已存在、manifest 分化） | D-01、D-02、D-10 | Phase 0 报告 §3.3/§7 |
| `docs/3d-model-optimization/decisions.md` | 本文件（新增） | — | — |

**未改动**：`package.json`、lockfile（不存在）、任何 `web/levels/*`、`web/world/*`、`web/mission.js`、`web/immersion.js`、任何模型/GLB/OBJ/BLEND、任何任务与交互逻辑。

**未执行**：任何 Blender 构建脚本（未重跑、未导出、未覆盖模型）；任何依赖安装；任何浏览器/服务器启动。

---

## 6. 现在能否进入 Phase 1

**可以进入 Phase 1 的"契约与 Schema 设计"部分**，但有一处需你裁决后才能真正落地：

| Phase 1 交付项 | 现在能否做 | 阻塞 |
|---|---|---|
| `docs/model-contract.md` | ✅ 可以（D-01/D-02/D-03 已给结论） | 无 |
| `schemas/asset-manifest.schema.json` | ✅ 可以（纯设计，不校验） | 无 |
| Blender 自定义属性命名约定 | ✅ 可以 | 无 |
| `nodeUid` 生成与重复检查工具 | ✅ 可以（UUIDv5，Node 内置 `crypto`，零依赖） | 无 |
| glTF extras ↔ Manifest 一致性检查器 | ⚠️ 部分：可直接读 GLB JSON chunk 校验（本次已用此法做过分析，零依赖） | 修复后需一次真实导出才能验"导出不丢"（U-1/D-04） |
| 试点 Manifest（separator） | ✅ 可以，基于已提交产物 + 实测 | 无 |
| Schema 校验接入（AJV） | ⛔ 需 U-1 授权 | B1 |

即：**除"用 AJV 跑 Schema 校验"与"验证导出后 extras 不丢"两项外，Phase 1 其余交付均可立即开始且保持零依赖。**
