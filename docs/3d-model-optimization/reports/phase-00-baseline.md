# Phase 00 · 工程基线只读审计报告

> 对应方案：《石油科普智能体 3D 模型优化实施方案 V1.1》（2026-11-25）
> 审计性质：**只读基线冻结**。本报告是本次审计中唯一被创建的文件。
> 审计时间：2026-11-25 11:25–11:35（Asia/Shanghai）
> 审计基线提交：`5519ef74add0219c4d7eb0a62e5756abead6abcb`
> 结论：**PASS**（Phase 0 门禁通过；已登记 7 项须在后续 Prompt 前解决的 blocker / 决策，均不阻断 Phase 0 本身）

---

## 0. 审计范围与只读声明

### 0.1 本次实际执行的读取

| 类别 | 内容 |
|---|---|
| Git 只读命令 | `rev-parse` / `status` / `log` / `branch -a` / `remote -v` / `rev-list` / `ls-remote` / `ls-files` / `stash list` / `check-ignore` |
| 源码读取 | `web/immersion.js`、`web/tower.js`、`web/tower.html`、`web/sandbox.html`、`web/mission.js`、`web/levels/{entry,l1,l2,l3,l4,l5}.js`、`web/world/{registry,state}.js`、`web/assets/obj-lite.js`、`web/assets/three.browser.js`（头部 + REVISION）、`server/dev.mjs`、`package.json` |
| 资产读取 | 9 个运行时 OBJ 的对象/面数统计、4 个 GLB 的 JSON chunk 解析、6 个 `*.meta.json`、`hero/index.json` |
| Manifest 核验 | 3 份 phase 证据 manifest 的 SHA-256 与当前文件逐一比对 |
| 环境探测 | `node -v`、`npm -v`、`pnpm -v`、`corepack`、`git --version`、`python --version`、`blender --version`、Chrome 版本、`Win32_VideoController` |
| 运行时求值 | 用 Node `vm` 在隔离沙箱中求值 `web/assets/three.browser.js`，读取 `THREE.REVISION` |

### 0.2 明确未执行（遵守本阶段禁令）

- 未修改 `package.json`、任何源码、模型、资产、文档（本报告除外）。
- 未运行任何 Blender 构建脚本（`make_tower.py`、`build_*.py`、`export_glb.py`、`make_hero_assets.py`）；仅执行无副作用的 `blender.exe --version`。
- 未 `git checkout` 旧 SHA、未 `fetch`、未 `stash`、未 `reset`、未 `clean`、未提交。
- 未安装/下载/替换任何依赖；未创建 `node_modules`。
- 未启动 dev server、未启动浏览器、未触碰任务或三维交互状态。
- 未读取 `server/.env`（被忽略的本地密钥文件）。

### 0.3 只读性自证

审计结束后 `git status --porcelain` 仍为审计开始时的两条未跟踪项（见 §2），**无任何被跟踪文件发生改动**。

---

## 1. 当前 HEAD 与 main 状态

### 1.1 分支与提交

| 项 | 值 |
|---|---|
| 当前分支 | `main` |
| HEAD | `5519ef74add0219c4d7eb0a62e5756abead6abcb` |
| HEAD 提交信息 | `fix: complete storage level at level threshold without device click` |
| HEAD 作者 / 时间 | 鲁鑫 / `Wed Nov 25 10:43:19 2026 +0800` |
| 与 V1.1 记录基线 | **完全一致**（V1.1 第 6、55–59 行记录的基线即 `5519ef74…`） |

### 1.2 最近 10 条提交

```
5519ef7 fix: complete storage level at level threshold without device click
1c33b1b fix: reset storage level on re-entry and task reset
3ab78bc fix: complete storage task at level threshold
174d977 fix: complete storage mission from live level and pump state
2480c9a fix: deploy prebuilt audio path fix
75daeac fix: resolve prebuilt audio path
8d1d8be perf: pre-generate fixed iFlytek narration audio
e0ac240 feat: build supported side stripper and overhead systems
c07a240 fix: embed side draw lines into tower shell
5fea3ce fix: use continuous tower overhead line in hero
```

说明：方案 §1.1 提到的 4 个提交（`5519ef74`、`1c33b1b`、`3ab78bc`、`174d977`）与仓库实际内容一致，且 `174d977` 之后到 `5519ef7` 之间的 3 个提交全部是 L3 储运任务判定链的修复，**正好对应本方案 §1.2、§4.3 要保护的 L3 业务规则**。

### 1.3 main 是否已超过 `5519ef74` —— 否

用两种独立口径确认：

| 口径 | 结果 |
|---|---|
| 本地跟踪引用 `origin/main` | `5519ef74add0219c4d7eb0a62e5756abead6abcb` |
| `git rev-list --left-right --count HEAD...origin/main` | `0	0`（不领先、不落后） |
| `git ls-remote origin refs/heads/main`（只读网络探测） | `5519ef74…` |
| `git ls-remote github refs/heads/main`（只读网络探测） | `5519ef74…` |

**结论：`5519ef74` 之后没有新提交，`main` 未前进。V1.1 的代码审查基线当前有效，无需更新基线报告。**

补充事实（影响后续"基线是否会被悄悄推进"的判断）：

- 本仓库有 **两个远端**：`origin` = `git@gitee.com:LYU_PRO/scienceagent.git`，`github` = `https://github.com/Levine1899/Embodied-Intelligence.git`。二者 `main` 均在 `5519ef74`。
- 方案封面写的是 `Levine1899/Embodied-Intelligence`，但**日常推送远端是 Gitee 的 `origin`**。后续阶段判断"main 是否前进"时必须两个远端都查，否则会漏判。
- `.git/FETCH_HEAD` 的修改时间为 2026-11-25 09:01:37，早于 HEAD 提交时间 10:43:19；说明该 ref 不是普通 fetch 获得的，故本次改用 `ls-remote` 直接向远端求证，未写本地引用。
- 本地另有分支 `feature/immersive-hall`、`tts-v59-backup`，远端另有 `origin/feature/261121-cuiyue-dev`；与本方案无关，未切换、未改动。

---

## 2. 工作区状态与用户改动保护清单

### 2.1 是否干净 —— 否（仅未跟踪，无跟踪文件改动）

`git status --porcelain=v1` 的全部输出只有 2 行，均为未跟踪（`??`）：

| # | 条目 | 类型 | 大小 / 说明 | 处理 |
|---|---|---|---|---|
| 1 | `.codegraph/` | 未跟踪目录 | 代码索引缓存（tooling 产物，非源码） | **未触碰**。不要删除、不要提交，除非用户另行决定 |
| 2 | `docs/石油科普智能体_3D模型优化实施方案_V1.1_2026-11-25.md` | 未跟踪文件 | 45,676 B / 898 行；本方案正文 | **未触碰**。这是本次审计的输入文档，属用户资产，后续阶段应纳入版本管理但本阶段不得代为提交 |

**无暂存改动、无已跟踪文件的修改或删除。**

### 2.2 被忽略但存在于工作区的条目（不得清理）

`git status --ignored=matching` 额外显示：

| 条目 | 忽略原因 | 说明 |
|---|---|---|
| `.dsh-project-memory/` | 目录内自带 `.gitignore` 自我忽略 | Agent 记忆库，非用户代码 |
| `dist/` | `.gitignore` 第 8 行 | **1,776.2 MB / 6,494 个文件**，phase-04～07 的 JPEG 抓帧，见 §3.6 |
| `server/.env` | `.gitignore` 第 11 行 | 本地密钥，**未读取** |

### 2.3 已存在的 stash（用户状态，禁止操作）

```
stash@{0}: On main: phase07 png noise
```

该 stash 在审计开始前即存在，**不属于本次产出**。严禁 `stash pop/drop/clear`，否则会破坏用户既有状态。

### 2.4 保护结论

工作区用户改动（2 项未跟踪 + 1 个 stash + 3 类忽略目录）已逐项登记，审计全程未覆盖、未 stash、未 reset、未 clean、未 checkout 任何旧 SHA。**符合 PASS 条件之一。**

---

## 3. 资产 / 代码盘点

### 3.1 场景与关卡的代码骨架

| 层级 | 文件 | 行数/大小 | 职责 | 关键实现事实 |
|---|---|---|---|---|
| 总览 | `web/immersion.js` | 108,005 B | Three.js 总览场景、程序化几何、Hero OBJ 装配、渲染循环、统计 | 单一 `requestAnimationFrame` 循环；`renderer.info.render/memory` 已在 `stats()` 暴露（§2193–2195） |
| 运行库 | `web/assets/three.browser.js` | 2,006,898 B / 77,443 行 | 经典 `<script>` 注入 `window.THREE` | 见 §4 |
| OBJ 解析 | `web/assets/obj-lite.js` | 5,101 B / 123 行 | 自研轻量 OBJ/MTL 解析，按 `o`/`g`+`usemtl` 分桶成 Mesh | 无纹理/无平滑组/无负索引；`mesh.name = 桶名`，**身份完全依赖名字** |
| 场景注册表 | `web/world/registry.js` | 12,871 B / 189 行 | `zoneId/stageId/objectId/anchor` 单一来源：6 区、7 机位、**17 设备**、5 路线、3 端点 | 每个 device 含 `modelPath` / **`modelNode`（名字路径）** / `anchor`（名字）/ `capabilities` |
| 设备状态 | `web/world/state.js` | 4,747 B / 147 行 | 逻辑设备状态单一来源：`selection/structure/animation/level/visible` + `representations` 绑定 | 已有 `bind(objectId, rep, object3d)` 与 `reset()`；`structure` 取值无枚举校验 |
| 关卡入口 | `web/levels/entry.js` | 10,529 B | 关卡通用按钮列、组互斥、操作示意动画 | `__lvlEntry(index, label, fn)` |
| L1 | `web/levels/l1.js` | 67,649 B | 地下地质 + 井筒 | 加载 `assets/underground/underground.obj`；失败时降级程序化剖面，并明示"不能作为资产门禁通过" |
| L2 | `web/levels/l2.js` | 32,669 B / 705 行 | 三相分离器 | 布尔 `structMode`，见 §6.2 |
| L3 | `web/levels/l3.js` | 29,533 B / 564 行 | 储运罐区 + 转输泵 | 见 §5 |
| L4 | `web/levels/l4.js` | 34,739 B / 732 行 | 常减压装置 | 名称正则权威分组，见 §3.4 |
| L5 | `web/levels/l5.js` | 13,107 B | 产品/材料/制品 | 全程序化几何，`oil: true/false` 布尔分类 |
| 独立塔页 | `web/tower.html` + `web/tower.js` | 9,120 B + 28,612 B | 独立常减压塔交互页 | **自带第二套 OBJ 解析器**（`parseOBJ` @ `tower.js:99`），只加载 three + state + tower.js |
| 任务 | `web/mission.js` | 26,006 B / 553 行 | 五段任务状态机 | 见 §5.3 |
| 页面入口 | `web/sandbox.html` | 52,584 B | 主三维沙盘 | 经典脚本按序注入 **21 个** `<script>`，带手工 `?v=` 参数 |
| 开发服务器 | `server/dev.mjs` | 4,325 B | 静态托管 `web/` + `/api/*` 反代 8790 | 见 §7 |

### 3.2 资产盘点表

> 口径：`assetId` 只填仓库中**已有明示值**的（来自 JSON 或脚本常量）；仓库中不存在统一 `assetId` 体系，未明示者标 `—(无)`。
> "Manifest" 指符合 V1.1 §2.4 形状（`schemaVersion`/`assetId`/`runtime.hash`/`nodes[]`…）的机读索引；仓库中**无一符合**，见 §3.3。

| # | assetId（已有） | 环节 | 源文件 | 网页运行文件 | 构建入口 | 加载方式 | Manifest | 稳定 nodeUid | anchor | 当前缺陷（要点） | 证据路径 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `distillation_unit_hero`（仅 phase-06 manifest 内） | L4 炼化 / 总览 / 独立塔页 | `assets-source/blender/tower_hero.blend`（493,146 B） | `web/assets/tower/tower.obj`（3,837,432 B，**253 对象 / 25,831 面**）+ `.mtl`；`tower.glb` 3,843,452 B **未被生产页加载** | `tools/make_tower.py`（`blender -b -P … -- <输出目录>`，默认输出 `tools/out`） | `ObjLite.load('assets/tower/tower.obj?v=08')`（`l4.js:146`、`immersion.js:1698`）；`tower.js` **另写一套解析器**（`tower.js:472–477`） | ✗（phase-06 manifest 全哈希失配，见 §3.3） | ✗（GLB 258 节点 **extras=0**） | △ 5 个空物体节点 `anchor_tower_*` 存在于 GLB/OBJ 名；但**三处坐标互相矛盾**（见 §3.5） | 正则权威分组，79.1% 对象无归属（§3.4）；`.001` 重名；重跑脚本不可复现（§3.5） | `web/assets/tower/`、`tools/make_tower.py`、`docs/phase-reports/evidence/phase-06/tower-asset-manifest.json` |
| 2 | `separator_three_phase`（`build_separator_hero.py:372`） | L2 地面处理 | `assets-source/blender/separator_hero.blend`（1,119,702 B） | `web/assets/separator/separator.obj`（495,915 B，**43 对象 / 3,374 面**，含真实半剖壳） | `tools/blender/build_separator_hero.py`（**无 CLI 参数**，硬编码路径） | `ObjLite.load('assets/separator/separator.obj?v=08')`（`l2.js:308`） | △ phase-05 manifest（**哈希全部匹配**），但无 `schemaVersion`/`assetVersion` | ✗（脚本设了 `semanticId`/`objectId` 自定义属性，但 GLB 导出未开 `extras`，GLB 内 extras=0） | △ manifest 内 4 个手写锚点字面量，与 `l2.js:300–301` 手抄重复 | 真实剖切几何**已存在却被代码隐藏**（`l2.js:213`）；结构仅布尔两态 | `web/assets/separator/`、`docs/phase-reports/evidence/phase-05/separator-asset-manifest.json` |
| 3 | `underground_hero`（manifest + 根空物体） | L1 地下地质/井筒 | `assets-source/blender/underground_hero.blend`（1,180,982 B） | `web/assets/underground/underground.obj`（823,552 B，**23 对象 / 12,380 面**） | `tools/blender/build_underground_hero.py`（无参数） | `ObjLite.load('assets/underground/underground.obj')`（`l1.js:298`） | △ phase-04 manifest（**哈希全部匹配**，含 sha256），无 `schemaVersion` | ✗ **无 nodeUid**；但 GLB 28 节点 **全部带 extras** `{semanticId, objectId, layerIndex}` —— 这是仓库内唯一已有的 extras 先例 | △ 4 个锚点在 manifest 与 GLB 空物体；OBJ 中不存在（空物体不写 OBJ） | extras 命名空间不是 `petro`；OBJ 路径下属性全部失效 | `web/assets/underground/`、`docs/phase-reports/evidence/phase-04/underground-asset-manifest.json` |
| 4 | `separator`（`hero/separator.meta.json`） | 总览 Hero | `tools/make_hero_assets.py`（程序化，无 .blend） | `web/assets/hero/separator/separator.obj`（463,302 B，**5 个材质合并对象**） | `tools/make_hero_assets.py -- [--render]` | `ObjLite.load('assets/hero/separator/separator.obj')`（`immersion.js:1752`） | ✗（`.meta.json` 为统计卡，非 manifest） | ✗ | △ `meta.json` 内 4 个锚点（Blender Z-up 字面量，无变换） | 按材质合并后部件身份丢失；与 L2 用的 43 对象版**是两个不同资产** | `web/assets/hero/index.json`、`web/assets/hero/separator/` |
| 5 | `pumpjack` | 总览 Hero / L1 采油 | `tools/make_hero_assets.py` | `web/assets/hero/pumpjack/pumpjack.obj`（67,117 B，3 对象） | 同上 | `ObjLite.load(...)`（`immersion.js:1650`） | ✗ | ✗ | △ meta 内 4 锚点 | 3 组静态/梁/曲柄；细节偏中景 | `web/assets/hero/pumpjack/` |
| 6 | `wellhead` | 总览 Hero / L1 井口 | `tools/make_hero_assets.py` | `web/assets/hero/wellhead/wellhead.obj`（206,140 B，4 对象） | 同上 | 同上 | ✗ | ✗ | △ meta 内 2 锚点 | 4 个材质桶，无部件语义 | `web/assets/hero/wellhead/` |
| 7 | `heater` | 总览 Hero / L4 加热炉 | `tools/make_hero_assets.py` | `web/assets/hero/heater/heater.obj`（74,831 B，4 对象） | 同上 | 同上 | ✗ | ✗ | △ meta 内 3 锚点 | 4 对象、490 面，近景结构简单 | `web/assets/hero/heater/` |
| 8 | `floating_roof_tank` | 总览 Hero / 储运 | `tools/make_hero_assets.py` | `web/assets/hero/floating_roof_tank/floating_roof_tank.obj`（406,629 B，4 对象） | 同上 | 同上 | ✗ | ✗ | △ meta 内 3 锚点 | 浮盘在关卡里另建程序化几何，资产本身无浮盘语义 | `web/assets/hero/floating_roof_tank/` |
| 9 | —（无） | L3 固定顶罐 / 外浮顶罐 / 转输泵组 | **无源文件、无 .blend、无 OBJ** | **纯程序化几何**（`immersion.js:705/723/688`、`l3.js` 内建） | **无** | 代码直接 `cylinder()/box()` 构造 | ✗ | ✗ | △ 仅名字（`fixed_tank`/`floating_tank`/`transfer_pump` 在 registry） | V1.1 §4.3 的核心缺口：无独立 Hero、无半剖 representation | `web/immersion.js:688–723`、`web/world/registry.js:73–92` |
| 10 | —（无） | L5 产品/材料/制品 | 无 | **纯程序化几何**（`l5.js`） | **无** | 代码构造 `box/cyl/sphere/cone` | ✗ | ✗ | ✗ | `oil: true/false` 二元分类（`l5.js:16–25`） | `web/levels/l5.js` |
| 11 | —（spike） | 技术验证（非生产） | `web/assets/spike/separator.blend`、`tools/spike_separator.py` | `web/assets/spike/separator.obj`+.glb（27 对象） | `tools/spike_separator.py` | 仅 `_spike-separator.html` 经 `MiniGLB` 加载 GLB | ✗ | ✗ | ✗ | **全仓库唯一的 GLB 加载点，且为非生产页** | `web/_spike-separator.html:40,118`、`web/assets/spike/glb-mini.js` |

### 3.3 现有 Manifest 真实性核验（SHA-256 逐文件比对）

V1.1 §1.4-7 要求重新生成统计与 Manifest。实测结果**分化**：

| Manifest | assetId | 记录文件数 | 哈希比对结果 | 判定 |
|---|---|---|---|---|
| `docs/phase-reports/evidence/phase-04/underground-asset-manifest.json` | `underground_hero` | 4（blend/obj/mtl/glb） | **4/4 匹配** | ✅ 当前有效（2026-11-23 生成） |
| `docs/phase-reports/evidence/phase-05/separator-asset-manifest.json` | `separator_three_phase` | 4（blend/obj/mtl/glb） | **4/4 匹配** | ✅ 当前有效，且含 `objects[]`/`anchors{}`/`cutaway`/`stats` |
| `docs/phase-reports/evidence/phase-06/tower-asset-manifest.json` | `distillation_unit_hero` | 7（blend/obj/mtl/glb/meta/2 png） | **0/5 匹配**（逐项均不符） | ❌ **整体失效** |

phase-06 衰变的具体数字（这是 Phase 2 能否直接沿用旧 manifest 的关键）：

| 文件 | manifest 记录大小 | 实际大小 | 哈希 |
|---|---|---|---|
| `tower_hero.blend` | 2,522,243 | **493,146** | 不匹配 |
| `tower.obj` | 1,523,037 | **3,837,432** | 不匹配 |
| `tower.mtl` | 2,062 | **1,873** | 不匹配 |
| `tower.glb` | 1,698,140 | **3,843,452** | 不匹配 |
| `tower.meta.json` | 1,482 | 1,489 | 不匹配 |
| 记录 `meshObjects` | 151 | 实际对象 **253** | — |

**结论：`tower`（L4，本方案最高优先级 P0 资产）的既有 manifest 完全不可作为基线；`separator`、`underground` 的 manifest 可作为 Phase 1 试点 Manifest 的起点。**

### 3.4 L4 分组覆盖率实测（Phase 2 的核心量化基线）

用 `web/levels/l4.js:117–119` 的**原文正则**逐条匹配 `web/assets/tower/tower.obj` 的 253 个对象名：

| 指标 | 数量 | 占比 |
|---|---|---|
| OBJ 对象总数 | 253 | 100% |
| 被 `splitAndBindDetails()` 绑定到 `atmospheric_tower`/`vacuum_tower`/`heater` | **53** | 21.0% |
| **无任何 detail 归属** | **200** | **79.1%** |
| 既不归属设备、也不满足 `l4.js:180` 的 `towerPart` 标记 | **87** | 34.4% |
| 其中另有专门处理（`Insulation_Band_*` 3 个、`Ground` 1 个） | 4 | — |
| **完全无任何语义路径的孤儿对象** | **83** | **32.8%** |

未归属对象按前缀聚类（TOP）：`Ladder` 25、`Exchanger` 24（含 3 个 `.001`）、`RundownRack` 18、`Pump` 17、`Post` 12、`SideRack` 12、`Stripper` 12、`Pipe_Rundown` 12、`Stair` 10。

孤儿示例（无任何正则命中）：`Stripper_{Naphtha,Kerosene,Diesel}_{Shell,Skirt,Dome,Foundation}`、`Reflux_Drum*`（8 个）、`BatteryLimit_*`（9 个）、`RundownRack_*`（18 个）、`SideRack_Col_*`（12 个）、`Pipe_Rundown_*`、`Pipe_Condenser_To_Drum_*`、`Post_10_*`/`Post_18_*`（12 个）。

这直接量化了方案 §1.4-1 与 §4.1"未知节点数量为 0"的门禁差距：**当前 83 个对象无法被任何数据解释**。

### 3.5 资产身份与坐标的硬证据

**（a）无 `nodeUid`，无 `petro` extras**

| GLB | 节点 | Mesh | 材质 | 节点带 extras | 带 `petro` extras | 生成器 |
|---|---|---|---|---|---|---|
| `web/assets/tower/tower.glb` | 258 | 253 | 10 | **0** | 0 | `Khronos glTF Blender I/O v5.3.43` |
| `web/assets/separator/separator.glb` | 43 | 43 | 7 | **0** | 0 | `Khronos glTF Blender I/O v4.5.51` |
| `web/assets/underground/underground.glb` | 28 | 23 | 8 | **28** | 0（键为 `semanticId`/`objectId`/`layerIndex`） | `v4.5.51` |
| `web/assets/spike/separator.glb` | 27 | 27 | 5 | 0 | 0 | `v4.5.51` |

全仓库 `nodeUid` / `petro.` 只出现在方案文档本身，**代码与资产中零实现**。

**（b）`.001` 重名已被固化进产物**

`tower.glb` 中存在 3 个 Blender 自动后缀名：`Exchanger_1_Saddle.001`、`Exchanger_2_Saddle.001`、`Exchanger_3_Saddle.001`。成因在 `tools/make_tower.py:383–390`：`exchanger()` 内两个支座的 `box()` 使用**同一个固定名** `name + "_Saddle"`，第二个必被 Blender 改名。V1.1 §1.4-2 的判断成立且已进入发布资产。

**（c）同一 anchor 的三处矛盾取值（`anchor_tower_products`）**

| 来源 | 值 | 坐标声明 |
|---|---|---|
| `tools/make_tower.py:462`（脚本当前源） | `(8.4, 6.0, -5.9)` | Blender Z-up |
| 该脚本 `:516` 计算出的网页值 `[x, z, -y]` | `(8.4, -5.9, -6.0)` | Y-up —— **落到地面以下** |
| 已提交 `web/assets/tower/tower.meta.json:53–57` | `[8.4, 6.0, -5.9]`（blender 侧为 `[8.4, 5.9, 1.0]`） | Y-up |
| `docs/phase-reports/evidence/phase-06/tower-asset-manifest.json` | `[9.5, 17.0, -0.0]` | 未声明 |
| `web/tower.js:202`（前端兜底） | 硬编码 `(8.4, 6.0, -5.9)` | Y-up |

**四个来源给出三种不同值**，且脚本重跑会把该热点移到地下。这是 V1.1 §2.5"禁止无上下文裸 XYZ"、§3.1"唯一权威"最直接的证据。

**（d）同一路线坐标的重复定义（含已漂移）**

| 路线要素 | 定义位置 | 现状 |
|---|---|---|
| 侧线抽出标高 21.0 / 18.4 / 15.8 | `tools/make_tower.py:304–308` | Blender 源 |
| 同上（网页值） | `web/tower.js:512–514` | 手抄 21 / 18.4 / 15.8 |
| 同上（关卡内 ×0.46） | `web/levels/l4.js:31–34`（`SCALE=0.46` @ `:29`） | 9.66 / 8.46 / 7.27 |
| 塔顶冷凝线 | 模型 28.85 ／ `tower.js:515` 用 27.4 | **已漂移 1.45** |
| 分离器气/油出口 | `build_separator_hero.py:387–393` 与 `l2.js:300–301` | 逐字手抄重复 |
| L4 教学流线 | `l4.js:313–362` 自建 `CatmullRomCurve3`/`TubeGeometry` | 与 Blender 实体管线**两套独立定义** |

`web/data/process-connections.json` **不存在**（目录 `web/data/` 亦不存在）。

### 3.6 已有截图 / 证据目录

| 目录 | 文件数 | 大小 | 是否入库 |
|---|---|---|---|
| `dist/capture-phase04` | 1,055 | — | **否**（`.gitignore:8`） |
| `dist/capture-phase05` | 1,431 | — | 否 |
| `dist/capture-phase06` | 1,103 | — | 否 |
| `dist/capture-phase07-mission` | 1,496 | — | 否 |
| `dist/capture-phase07-tour` | 1,409 | — | 否 |
| 合计 | **6,494** | **1,776.2 MB** | — |
| `docs/phase-reports/evidence/**` | 227 个已跟踪文件（含 PNG/JSON） | — | **是** |

含义：V1.1 §11 要求"实际网页截图 + 自动断言"作为交付物；`dist/` 下的截图**不进仓库**，后续阶段的证据必须落到 `docs/`-side 跟踪目录（现有 phase-01～08 evidence 的先例）。

### 3.7 既有文档资产的过期情况（3 处硬矛盾）

| 文档 | 记录 | 实际 | 影响 |
|---|---|---|---|
| `docs/asset-inventory.md`（2026-11-22） | tower.obj「1,040.7 KB，20,670 面，**54 个命名对象**，无 `.blend`」 | 3,748 KB，25,831 面，**253 对象**，`.blend` 存在 | 统计落后约 4.7 倍，**不可作为 Phase 2 清点基线** |
| 同上 | tower.glb「1,213.6 KB」 | 3,843,452 B（3,753 KB） | 同上 |
| `docs/tooling-readiness.md`（2026-11-22） | Blender「4.5.16 LTS」 | **Blender 5.3.0**（见 §4.4） | 环境已变，文档需更新 |
| `docs/asset-pipeline.md` | 建议目录 `web/assets/models/<assetId>/` | **该目录不存在**；实际是 `web/assets/<asset>/` 与 `web/assets/hero/<asset>/` 两套并存 | Phase 1 命名须先裁决 |

---

## 4. Three.js 版本确认

### 4.1 双重核对（源码常量 + 实际运行求值）

| 核对方式 | 证据 | 结果 |
|---|---|---|
| ① 源码常量 | `web/assets/three.browser.js:10` → `const REVISION = '180';` | `180` |
|  | 同文件 `:77295` → `exports.REVISION = REVISION;` | 对外导出 |
|  | 同文件 `:58771` → `window.__THREE__ = REVISION;` | 全局可探 |
|  | 同文件 `:3–7` 版权头 `Copyright 2010-2025` | 与 2025 年发布的 r180 一致 |
| ② 实际求值 | 用 Node `vm` 在隔离沙箱（stub 掉 `window`/`document` 等）求值该 2.0 MB bundle，读回全局 | `window.THREE` 存在；**`THREE.REVISION === 180`**；`window.__THREE__ === 180` |
|  | 同次求值统计 | 导出键 **422** 个；`WebGLRenderer`/`Scene`/`PerspectiveCamera`/`MeshStandardMaterial`/`CatmullRomCurve3`/`AnimationMixer`/`LOD` 等全部存在 |
|  | 注意 | 该构建**无 `THREE.VERSION`**（模块构建的既有行为），故只能用 `REVISION` 判定 |

**结论：当前实际运行库为 Three.js r180，双重核对一致。**

### 4.2 全仓库只有一个 THREE runtime

对整个仓库（排除 `.git`、`.codegraph`、`dist`）搜索 `const REVISION` / `THREE.REVISION` / `__THREE__`，**唯一命中** `web/assets/three.browser.js:10`。

即 V1.1 §5.2"不得同时加载两个 THREE runtime"当前是**已满足的既成事实**，Phase 6 的风险是"引入第二个"，而非"清理已有的第二个"。

### 4.3 没有 GLTFLoader（关键事实）

- 全仓库搜索 `GLTFLoader` → **0 命中**（除方案文档）。
- 生产页面（`sandbox.html`、`tower.html`）只注入 `three.browser.js` + `obj-lite.js`。
- 全仓库**唯一的 GLB 加载点**是技术验证页 `web/_spike-separator.html`，走自研 `MiniGLB`（`web/assets/spike/glb-mini.js`）。
- 因此：`tower.glb`（3.8 MB）、`separator.glb`、`underground.glb` **目前是死产物**——构建了但生产路径不加载。

这与 V1.1 §5.1/§5.2 的判断一致，也意味着 Phase 6 是"从零建立 GLB 通道"，不能描述为"切换到 GLB"。

### 4.4 npm 侧无任何 Three.js 依赖

`package.json` 只有 `scripts`（`dev`/`api`/`start`）与 `engines.node>=18`，**无 `dependencies`、无 `devDependencies`**，且**无 lockfile**（无 `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` / `npm-shrinkwrap.json`），**无 `node_modules`**。

V1.1 §5.1"精确锁定 `three@0.180.0`"目前是**待建立**状态，且 r180 ↔ `three@0.180.0` 的对应关系**尚未在仓库内验证**（需在 Phase 6 安装时以 `THREE.REVISION` 实测比对确认，不得凭命名推定）。

---

## 5. L3 任务规则确认（V1.1 §1.2 / §4.3 强制回归项）

### 5.1 逐条确认结果：5/5 全部仍然成立

| # | 规则 | 代码证据 | 判定 |
|---|---|---|---|
| 1 | 液位到 **70%** 即完成任务 | `l3.js:346` `if (level >= 0.70 && !completed) complete();`<br>`l3.js:397` 滑块 `input` 内同条件<br>`mission.js:376` `if ((state.flags.level \|\| 0) >= 70) completeStep();`<br>`mission.js:530` 500 ms 轮询内同条件 | ✅ 成立（两处独立触发：关卡内与任务层） |
| 2 | **不要求**启动泵送 | `complete()`（`l3.js:401–412`）**完全不读取** `pumpRunning`/`pumpPaused`<br>`mission.js:374–376`：`start_pump` 只置 `state.flags.pump = true`，随后判据仍是 `level >= 70`；注释明写「泵送演示保留为可选延伸，不阻塞任务」<br>`mission.js:46` 任务简介：「液位超过 70% 即完成本段；两种罐型都可完成。」 | ✅ 成立 |
| 3 | **不要求**先观察固定顶与外浮顶两种罐型 | `observedTanks` 只有 3 处写入（`l3.js:323/490/513`），**全文件无任何读取用于判定**（grep 证实）；`complete()` 不引用它 | ✅ 成立 |
| 4 | 每次重新进入 L3：液位 **2%**、停泵、清暂停、清完成、默认固定顶 | `enter()` @ `l3.js:481–492`：<br>`level = 0.02`（:485）<br>`pumpRunning = false`（:486）<br>`pumpPaused = false`（:487）<br>`completed = false`（:488）<br>`selectedTankId = 'fixed_roof_tank'`（:489）<br>`observedTanks` 复位（:490）<br>`pumpFlow.speed = 0`（:491）<br>`slider.value = '2'`（:492）<br>随后 `:513–517` 再复位一次并清 `done` class / `pulse` / 按钮文案 | ✅ 成立（:514 有一处 `completed = false` 重复赋值，无害冗余） |
| 5 | 任务重置清除节点完成状态 | `mission.js:451–466` `reset()`：若在关卡先 `leaveLevel()`；`state = blank()`；清 `localStorage`；**`for (i in STEP_DEFS) setNodeDone(i, false)`**（:457–459）；`setMode('free')`；派发 `mission-reset` | ✅ 成立（覆盖全部 5 个节点，不止 L3） |

补充说明：`window.__l3`（`l3.js:554`）对外暴露 `level`/`completed`/`pumpRunning`/`pumpPaused`/`setLevel(pct)` 等只读探针，可供 Phase 5 的 E2E 直接断言；`setLevel` 走 `dispatchEvent(new Event('input'))`，因而会**真实触发**完成逻辑——做回归测试时可用它复现 70% 判定。

### 5.2 与 L3 规则相关的两处"未被消除"的状态残留（非 V1.1 明文强制，但需登记）

| 项 | 事实 | 影响 |
|---|---|---|
| `cutMode` | 声明默认 `true`（`l3.js:10`），但 `enter()` **不复位** `cutMode` | 用户上次若"恢复罐壁"（`cutMode=false`）后退出，下次进入仍是不剖切 |
| L2 `structMode` | `l2.js:13` 布尔；`enter()`（:629–675）**不调用 `applyStructure`**，故重进后会保留上次的内部结构状态 | 直接对应 V1.1 §4.2-6「三种模式切换、退出重进…均恢复正确状态」，Phase 4 必须处理 |

`stage.deviceState.reset()` 在 `state.js:96` 存在，但 `l2.js`/`l3.js` 的 `enter()` 均未调用它。

### 5.3 任务层与关卡层的判据一致性

- `mission.js:508` `syncStorageState()` 从 `global.__l3.level`/`pumpRunning` 同步实时值，`l3.js` 不反向驱动任务层；两层判据（`l3.js:346/397` 与 `mission.js:376/530`）都是"液位 ≥ 70%"，**语义一致，无冲突**。
- 因此后续若改 L3 阈值，**必须同时改 4 处**：`l3.js:346`、`l3.js:397`、`mission.js:376`、`mission.js:530`。这是本次审计发现的一个"隐性耦合点"，V1.1 未列举，建议写入 Phase 7 的回归清单。

---

## 6. L2 剖切现状（Phase 4 的真实起点）

### 6.1 真实剖切几何**已存在**，但被代码主动隐藏

`web/assets/separator/separator.obj`（L2 实际加载的文件，43 个对象）中已包含：

```
separator_cut_shell | separator_cut_edge_top | separator_cut_edge_bottom | separator_cutaway_rim
```

即**封闭的真实半剖壳 + 切边上下缘 + 剖切边框都在资产里**。

但 `l2.js:198–217` `applyStructure()` 中：

```js
/* Use a ghost shell in the web view: it keeps the vessel silhouette without
   hiding the cutaway internals. The exported half shell remains in the .blend. */
cutShell.forEach(function (m) { m.visible = false; });   // ← l2.js:213
```

`cutShell` 被 `push` 进来（`l2.js:336`）后**立即被强制隐藏**，实际呈现的是"完整壳透明 10%（`opacity: 0.10`, `:205`）+ 内部件可见"的 ghost 效果。

**修正了 V1.1 §4.2 的一处表述**：方案说"如果没有真实剖切端面，则修改 Blender 资产构建脚本产生封闭切面"。实测**资产侧已经具备**，Phase 4 的主工作量是**状态机与显隐映射**（移除对 `cutShell` 的硬隐藏、补 `half` 分支），**不需要重建资产**。这是一个好消息，但会改变 Phase 4 的工作量估计。

### 6.2 结构状态仍是布尔两态

`l2.js:198` `function applyStructure(show, record)`，`structMode` 是布尔（`:13`），`deviceState` 里写的是 `structure: structMode ? 'half' : 'external'`（`:193`、`:226`）。**不存在 `setStructureMode(mode)`**，也没有 `ghost`/`full` 分支——与 V1.1 §4.2-3 的差距确认。

`web/world/state.js` 的 `structure` 字段本身可容纳任意字符串（无枚举校验，`:17`、`:61`），因此扩成四态**不需要改 store 结构**，只需改 L2 与 Manifest。

---

## 7. 可用工具与运行命令

### 7.1 版本实测

| 工具 | 实测值 | 状态 | 备注 |
|---|---|---|---|
| Node.js | **v22.20.0** | ✅ | 满足 `engines.node>=18`；自带全局 `WebSocket`（现有 CDP 脚本依赖它） |
| npm | **10.9.3** | ✅ | — |
| pnpm | **9.15.9** | ✅（本机全局，但项目未使用） | 仓库**无** pnpm 配置/lockfile |
| yarn | 未安装 | — | — |
| corepack | 0.34.0 | ✅ | 未启用 |
| Git | **2.45.1.windows.1** | ✅ | — |
| Python | **3.12.7** | ✅ | 仅部分资产脚本/工具参考 |
| Blender | **5.3.0**（build 2026-11-10） | ✅ 可 headless 启动 | 路径 `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`；**不在 PATH** |
| Google Chrome | **157.0.8103.79** | ✅ | 现有 CDP 测试路径的目标浏览器 |
| Microsoft Edge | 已安装 | ✅ | 备用 |
| @gltf-transform/cli | 4.5.1（全局） | ✅ | 可做 GLB 只读分析/优化，非项目依赖 |
| Playwright | **未安装** | ❌ | 仓库无依赖，`node_modules` 不存在；`npx playwright` 需联网下载 |
| Puppeteer | **未安装** | ❌ | — |

### 7.2 Blender headless 可用性

`blender.exe --version` 正常返回 `Blender 5.3.0`（build 2026-11-10），说明可执行文件健全。`-b`/`-P` headless 模式**未实际执行**（遵守"不运行会写入模型的构建脚本"），但其参数形式在 `docs/asset-pipeline.md` 与各脚本 docstring 中有既有先例。

**须注意的版本事实（重要）**：

- `docs/tooling-readiness.md` 记录的是 **Blender 4.5.16 LTS**，本机现为 **5.3.0** → 环境已变。
- 现有 GLB 产物的生成器版本**不一致**：`tower.glb` 由 `Blender I/O v5.3.43` 生成（对应 Blender 5.3），`separator.glb`/`underground.glb`/`spike.glb` 由 `v4.5.51` 生成（对应 Blender 4.5）。
- `tools/blender/build_separator_hero.py` 的 docstring 里硬编码了 `D:\tools\blender-4.5.16-windows-x64\blender.exe`，与本机 5.3.0 路径不符。

### 7.3 现有可运行命令

| 命令 | 实际行为 | 是否可用 | 证据 |
|---|---|---|---|
| `npm run dev` | `node server/dev.mjs` → 静态托管 `web/` 于 **`http://127.0.0.1:5173`**，并 `spawn` 一个 `proxy.mjs`（`:8790`）做 `/api/*` 反代 | ✅（本次未启动） | `server/dev.mjs:20,127–134` |
| `npm run api` | `node server/proxy.mjs`（仅 API，8790） | ✅ | `package.json:12` |
| `npm start` | **同上，仅 API**（不是启动站点） | ⚠️ 语义易误解 | `package.json:13` |
| 站点入口 | `http://127.0.0.1:5173/sandbox.html`（主三维沙盘）、`/tower.html`、`/index.html` | ✅ | `web/sandbox.html`、`web/tower.html` |
| 关卡 E2E | `node tools/level-e2e.cjs` | ⚠️ 需**外部已启动** Chrome 且 `--remote-debugging-port=9333`，并已打开 `sandbox.html` | `tools/level-e2e.cjs:3,18–19` |
| FPS 探针 | `node tools/fps-probe.cjs` | ⚠️ 同上依赖；输出 `fps/frames/p50/p95/longFrames/maxGap` + `WEBGL_debug_renderer_info` 渲染器串 + DPR | `tools/fps-probe.cjs:14,36–52` |
| 录屏 | `node tools/screencast.cjs` | ⚠️ 同上依赖 | `tools/screencast.cjs` |
| 各阶段校验 | `node tools/phase0{4..8}-verify.cjs` | ⚠️ 同上依赖 | `tools/phase04-verify.cjs` 等 |
| 资产校验 | `npm run validate:assets` | ❌ **不存在**（无该 script，无 `tools/validate_assets.mjs`） | `package.json:10–14` |
| 单测 / E2E 套件 | `npm run test:e2e` | ❌ **不存在** | 同上 |

**测试栈的真实形态**：零依赖的 Node + `http` + 全局 `WebSocket` 直连 CDP，**不是 Playwright/Puppeteer**。V1.1 §5 与 §Phase 5 要求"统一采用 Playwright"，与现状是"从零引入"，且需要联网安装依赖（本阶段禁止）。

### 7.4 CI

**不存在**：无 `.github/`、无 `.gitlab-ci.yml`、无 `.circleci/`、无 `.npmrc`。

V1.1 §10 要求把 Schema/Manifest/连接/导出一致性"纳入 CI"，**当前没有 CI 宿主**，Phase 5 必须先决定 CI 落在哪个平台。

### 7.5 目标 GPU 性能是否可实际测量

| 项 | 事实 |
|---|---|
| 本机 GPU | `AMD Radeon(TM) Graphics`（Ryzen 7 6800H **集成显卡**），驱动 `31.0.12028.6002`；另有 `OrayIddDriver Device`（向日葵远程桌面虚拟显示驱动） |
| 独显 | **无** |
| 目标设备 | 未提供。V1.1 §7.3-C 要求"目标设备、浏览器、驱动/系统" |
| 可测内容 | 用 `tools/fps-probe.cjs` 可在本机 Chrome 上测 FPS/P50/P95/长帧/DPR，并能取到 `UNMASKED_RENDERER_WEBGL` 字符串 —— 属"本机集显实测" |
| 不可测内容 | **真实 VRAM 不可读**（WebGL 无可靠接口）；**目标设备/低端设备性能不可外推**；远程桌面虚拟显示驱动会干扰结果 |
| 结论 | **`NOT_MEASURED`**。本机数据可作回归参考，**不得作为 §7.3-C 目标设备性能通过依据**，也不得把 `renderer.info.memory.*` 当作显存字节数 |

---

## 8. V1.1 与仓库之间的新差异（V1.1 未预见或需修正）

按重要性排序。这些是"方案写完到审计执行"之间新发现的事实，**其中 #1、#2 会直接改变 Phase 4 / Phase 2 的工作量估计**。

| # | 差异 | 方案原文 | 实测 | 影响 |
|---|---|---|---|---|
| 1 | **L2 真实剖切几何已存在于运行资产** | §4.2-2「如果没有真实剖切端面，则修改 Blender 资产构建脚本产生封闭切面」 | `separator.obj` 已含 `separator_cut_shell`/`cut_edge_top`/`cut_edge_bottom`/`cutaway_rim`，代码 `l2.js:213` 主动隐藏 | Phase 4 **不需要重建资产**，重点是状态机 + 显隐映射；工作量下降、风险点从"建模"转为"状态污染" |
| 2 | **L4 分组覆盖率已可精确量化** | §4.1-2 只说"分别建立显式归属" | 253 对象仅 **53（21%）** 被绑定；**83 个对象完全无任何语义路径** | Phase 2 有明确验收数字：孤儿对象从 83 → 0（或全部登记 support） |
| 3 | **L3 阈值存在 4 处耦合** | §1.2 只列规则，未列位置 | `l3.js:346`、`l3.js:397`、`mission.js:376`、`mission.js:530` | 任何阈值改动必须 4 处同改，否则关卡与任务层判据分叉 |
| 4 | **`make_tower.py` 重跑不可复现** | 未提及 | 脚本当前源会把 `anchor_tower_products` 移到地下（`:462` + `:516`）；`cutaway_show_only` 写的是 `Tray_`/`VacTray_`（`:520`），而实际对象是 `Trays_A`/`Trays_V` | Phase 2 触碰该脚本前必须先确立"重建即同物"，否则每跑一次就漂移 |
| 5 | **Blender 版本已从 4.5.16 变为 5.3.0，且产物混合两个版本** | §Phase 5 只说"项目实际 Blender 版本" | 文档 4.5.16 / 实机 5.3.0；GLB 生成器 5.3.43 与 4.5.51 混存 | Phase 1/2 必须**显式锁定**版本并写进 build 元数据，否则 manifest 无法复现 |
| 6 | **两份远端、日常远端是 Gitee** | 封面写 `Levine1899/Embodied-Intelligence` | `origin` = Gitee、`github` = GitHub，两者都停在 `5519ef74` | "检查 main 是否前进"必须双远端确认 |
| 7 | **已有 manifest 质量分化** | §1.4-7「旧 Manifest 可能不同步，必须重新生成」 | phase-04/phase-05 **哈希全匹配可用**；phase-06（tower）**5/5 全失配** | Phase 1 试点可直接从 `separator` 或 `underground` manifest 起步，不必从零设计 |
| 8 | **已有 extras 先例** | §2.3 要求 `petro` 命名空间 | `underground.glb` 28 节点全带 `{semanticId, objectId, layerIndex}` extras | 机制上已有通路（`export_extras=True` 已在 `build_underground_hero.py:297` 与 `export_glb.py:81` 用过），迁移成本低于预期 |
| 9 | **`anchorId` 有读取方但无写入方** | §2.1 定义了 `anchorId` | `export_glb.py:55–61` 会读 `objectId`/`semanticId`/`anchorId`；**全仓库无任何脚本写 `anchorId`** | 该字段在所有现有产物中恒为 `None`，需新建写入约定 |
| 10 | **GLB 全是死产物** | §5 讨论"迁移到 GLB" | 生产页 0 处加载 GLB；唯一加载点是 `_spike-separator.html` | 准确表述应为"从零建立 GLB 通道"，不是"切换格式" |
| 11 | **资产目录有两套并存** | §5.3 示例用 `assets/models/<assetId>/` | 实际 `web/assets/<asset>/`（tower/separator/underground）与 `web/assets/hero/<asset>/`（5 个 hero）并存，`models/` 不存在 | Phase 1 命名约定须先裁决，否则会造出第三套 |
| 12 | **`make_hero_assets.py` 的 `.meta.json` 与 `.stats.json` 内容逐字节相同** | — | 同一 dict dump 两次（`:237–240`） | 不是两套数据，后续不要误当作交叉校验 |
| 13 | **L5 的数量比方案举例更少** | §4.4 列 9 个展示项 | 实际 10 项（含玻璃/棉花/水泥/食盐 4 个 `oil:false`） | Phase 8 的数据模型要能容纳"非石油来源"项，不只是石油产品 |

---

## 9. 尚不能确认的事实与 blocker

### 9.1 尚不能确认（本次只读范围内无法定论）

| # | 未能确认的事实 | 原因 | 建议的确认方式 |
|---|---|---|---|
| U1 | 提交进仓库的 `tower.obj/.glb` 究竟是**哪一条命令**、哪次 Blender 运行生成的 | 仓库无构建日志；`make_tower.py` 默认输出 `tools/out`，只有显式传参会覆盖 `web/assets/tower`；无 `build` 字段记录 | Phase 1 建立 build 元数据后重跑一次并比对；在解决 §9.2-B3 前**不要**重跑 |
| U2 | 浏览器内**实际渲染**的 `THREE.REVISION` | 本阶段未启动浏览器（避免产生运行时副作用与临时文件） | 已用 Node `vm` 对同一 bundle 求值得 `180`；如需第三重，Phase 5 起在页面里读 `window.__THREE__` |
| U3 | `MiniGLB`（`web/assets/spike/glb-mini.js`）是否能完整正确加载 `tower.glb` | 只读了调用点，未执行；且该加载器只服务 spike 页 | Phase 6 评估是否可作为 GLTFLoader 的临时替代（结论大概率：不适合） |
| U4 | `docs/phase-reports/evidence/**` 里 227 个已跟踪证据文件是否与当前资产版本一致 | 未逐张比对截图与当前模型 | Phase 1/2 重新生成证据后标注"取代"关系 |
| U5 | `web/assets/tower/render-overview.png` / `render-cutaway.png` 与当前 `tower.obj` 是否同一版本 | 无哈希关联（phase-06 manifest 已失配） | 同 U1 |
| U6 | 本机 Chrome 在此 GPU 上能否稳定跑 WebGL2（未启动验证） | 未启动浏览器 | Phase 5 起跑一次 `fps-probe.cjs` 建立本机基线 |
| U7 | 部署侧（`120.26.198.46` / nginx `v16`）与当前 `main` 的差异 | 不在本次审计范围（无 SSH 访问授权） | 若后续需对齐线上，单独申请 |

### 9.2 Blocker（进入对应阶段前必须解决）

| ID | Blocker | 阻断哪个阶段 | 具体事实 |
|---|---|---|---|
| **B1** | **无任何联网安装能力被授权，而 Playwright / lockfile / esbuild / three 均不存在** | Phase 5（E2E）、Phase 6（esbuild + GLTFLoader） | 无 `node_modules`、无 lockfile、无 Playwright。本阶段明令禁止"下载或替换依赖"，因此这是**流程性 blocker**：需要用户明确授权一次依赖安装窗口 |
| **B2** | **`tower` 的既有 manifest 完全失效（5/5 哈希不符）** | Phase 2 | 见 §3.3。不得把它当基线；须重新生成，且重新生成依赖 B3 先解决 |
| **B3** | **`tools/make_tower.py` 重跑与已提交资产不等价** | Phase 2 | 重跑会把 `anchor_tower_products` 移到地下（`:462`+`:516`）；`cutaway_show_only` 名称失配（`:520`）。即"重建即同物"不成立 |
| **B4** | **Blender 版本未锁定，且现有产物由两个版本产出** | Phase 1、Phase 2、Phase 5 | 实机 5.3.0；文档记 4.5.16；GLB 生成器 5.3.43 / 4.5.51 混存。manifest 的 `build.blenderVersion` 必须是实测值 |
| **B5** | **无已批准工艺依据（`approved` basis）** | Phase 3 | 仓库无 `basisId`/`reviewStatus` 体系，无工艺依据文档（docs 中只有方案文档提及"依据"）。V1.1 §Phase 3 已预置退路：应把试点连接标 `draft` 并阻断正式发布，不得自行补画 |
| **B6** | **无 CI 宿主** | Phase 5 | 无 `.github/`、无 `.gitlab-ci.yml`。V1.1 §10 要求校验器进 CI，需先决定落点 |
| **B7** | **目标设备 GPU 性能不可测（`NOT_MEASURED`）** | Phase 10（性能门禁） | 仅集显 + 远程桌面虚拟显示驱动；无目标设备；VRAM 不可读。V1.1 §10.4 明确"未实测即 `NOT_MEASURED`，不是 `PASS`" |

---

## 10. 建议进入 Prompt 01（Phase 1：资产契约与 Schema）前必须解决的事项

按"必须先做完 / 建议同期做完"分级。前 5 项属"不解决就会做错"的硬前置。

### 10.1 硬前置（5 项）

1. **裁决资产目录与命名**（对应 §8-11）
   现有 `web/assets/<asset>/` 与 `web/assets/hero/<asset>/` 两套并存，`docs/asset-pipeline.md` 建议的 `web/assets/models/` 又不存在。Phase 1 的 `docs/model-contract.md` 必须**先在其中选一套并写明迁移策略**，否则 Schema 落地时会造出第三套目录。
   → 建议在 Prompt 01 的第一条交付里就固定：`assetId` 的字符串规则 + 目录唯一形态 + 迁移是否分批。

2. **锁定 Blender 版本并写入契约**（对应 B4）
   以实机 `5.3.0` 为准还是回退到文档记录的 `4.5.16`，必须二选一并登记；同时确认 `tools/blender/build_separator_hero.py` 里硬编码的 `D:\tools\blender-4.5.16-…` 路径如何处理（该脚本无 CLI 参数）。
   → 未锁定前，manifest 的 `build.blenderVersion` 无法给出可复现的值。

3. **裁决 `anchorId` 的写入方**（对应 §8-9）
   `export_glb.py:55–61` 已在读 `anchorId`，但全仓库无人写它。Phase 1 必须明确：由 Blender 自定义属性写、还是由构建脚本按命名约定生成、还是由 Manifest 独占。
   → 否则 Phase 1 交付的 Schema 会含一个永远为 `null` 的必填/可选字段。

4. **确认 Phase 1 试点资产候选**
   建议选 **`separator_three_phase`**：其 phase-05 manifest **4/4 哈希匹配**（§3.3），已有 `objects[]`/`anchors{}`/`cutaway`/`stats`，且已设 `semanticId`/`objectId` 自定义属性（`build_separator_hero.py:49–54`），迁移到 V1.1 §2.4 形状的增量最小。
   → `underground_hero` 是次优（哈希也匹配，且 extras 先例在它身上）。`tower` 因 B2/B3 **不适合**做试点。

5. **明确本阶段"不重跑 Blender"这一事实如何进入契约**
   B3 未解决前，任何"重新生成 manifest"的动作都会改变模型。Phase 1 若需真实 Manifest，必须要么(a)先修 `make_tower.py`，要么(b)只用 `separator`/`underground` 做试点并在契约里注明 tower 待修复。
   → 建议明确选 (b) 以保持 Phase 1 范围收敛。

### 10.2 建议同期完成（4 项，不阻断但会拖后）

6. **决定测试与依赖策略**（对应 B1）
   必须先获得一次显式授权窗口才能引入 Playwright / esbuild / three / AJV。建议在 Prompt 01 或 02 一次性规划"依赖引入清单 + 精确版本 + lockfile 提交"，避免每个阶段申请一次。

7. **决定 CI 落点**（对应 B6）
   GitHub（`Levine1899/Embodied-Intelligence`）还是 Gitee（`LYU_PRO/scienceagent`）？两者都在 `5519ef74`，但 CI 生态差异大。

8. **在 Prompt 01 交付物里新增"L3 阈值耦合点清单"**
   把 §8-3 的 4 处位置写入 `docs/model-contract.md` 或单独的回归清单，作为"禁止单点改动"的显式约束。

9. **同步修正 3 份过期文档**
   `docs/asset-inventory.md`（tower 54→253 对象等）、`docs/tooling-readiness.md`（Blender 4.5.16→5.3.0）、`docs/asset-pipeline.md`（`models/` 目录不存在）。
   → 本阶段只读，**未修改**。建议作为 Phase 1 的附带交付，或明确"由生成器重写"（V1.1 §9 P2 已提出这一方向）。

### 10.3 明确不应在 Prompt 01 做的事

- 不要因为"资产清单过期"就在 Phase 1 重跑 `make_tower.py`（B3 未解决，会污染 tower 资产）。
- 不要把 `renderer.info.memory.*` 写进 manifest 当作显存。
- 不要给 Phase 1 的 Schema 加 `structureMode: external|half|ghost|full` 之外的第五态；L2 现状是布尔两态，扩四态已足够（`state.js` 无枚举校验，可直接容纳）。
- 不要在两个 THREE runtime 之间做任何"并行加载兼容"的尝试（现仓库只有一个，这是资产不是风险）。

---

## 11. 关键文件 SHA-256（Phase 0 交付项：基线指纹）

| 文件 | 大小(B) | SHA-256（前 16 位） |
|---|---|---|
| `web/immersion.js` | 108,005 | `1638E68FE2F6B5AB` |
| `web/mission.js` | 26,006 | `EED95DE4A4554138` |
| `web/levels/l1.js` | 67,649 | `7ED07F7BFD5BE196` |
| `web/levels/l2.js` | 32,669 | `15DEB5378A5173F2` |
| `web/levels/l3.js` | 29,533 | `44D2C6CC94CBCF79` |
| `web/levels/l4.js` | 34,739 | `432099A2924170D9` |
| `web/levels/entry.js` | 10,529 | `CDC7BC24B2D08924` |
| `web/world/registry.js` | 12,871 | `4DB6433CE049D12C` |
| `web/world/state.js` | 4,747 | `A3F21D793B45DEE6` |
| `web/tower.js` | 28,612 | `07BBDB97E46F99CD` |
| `web/levels/l5.js` | 13,107 | `03C454253AC6A91F` |
| `web/sandbox.html` | 52,584 | `651AB6C9ED21574D` |
| `package.json` | 467 | `5539D017F669E8D6` |
| `web/assets/three.browser.js` | 2,006,898 | `const REVISION='180'`；r180（双重核对） |
| `web/assets/tower/tower.obj` | 3,837,432 | 与 phase-06 manifest 记录**不符** |
| `web/assets/tower/tower.glb` | 3,843,452 | 与 phase-06 manifest 记录**不符** |
| `web/assets/separator/separator.obj` | 495,915 | 与 phase-05 manifest **相符** |
| `web/assets/underground/underground.obj` | 823,552 | 与 phase-04 manifest **相符** |

> 注：本表 SHA-256 以前 16 位压缩呈现以免报告膨胀，可用 `Get-FileHash <path> -Algorithm SHA256` 复算完整值。凡标注"与 manifest 相符/不符"的行，均为**逐字节全量 SHA-256 比对**的结论，非抽样。

---

## 12. 结论

### 12.1 PASS / BLOCKED

> ## **PASS**

判定依据（严格对照本次任务的放行条件）：

| 放行条件 | 实际结果 | 是否满足 |
|---|---|---|
| 只读检查有明确结果 | 5 项指定检查全部完成且结论确定：Git 基线（无前进）、资产/代码盘点（含哈希与节点级实测）、THREE r180 双重核对、可用工具与命令、L3 五条规则 5/5 确认 | ✅ |
| 工作区用户改动得到保护 | 2 项未跟踪（`.codegraph/`、V1.1 方案文档）+ 1 个既有 stash + 3 类忽略目录，逐项登记；全程零覆盖、零 stash、零 reset、零 clean、零 checkout、零提交 | ✅ |
| 未越界 | 未改 `package.json`/代码/模型/资产/文档（本报告除外）；未跑 Blender 构建；未装依赖；未动任务与交互 | ✅ |

### 12.2 为何不是 BLOCKED

`BLOCKED` 应保留给"无法得出确定结论"或"用户状态未能保护"的情形。本次两者皆不成立：

- 所有要求的检查都得到了可复核的确定值（含数字级结论：79.1% 无归属、83 个孤儿对象、5/5 哈希失配、REVISION=180）。
- 发现的问题（B1–B7）是**后续阶段的准入门槛**，不是本阶段的失败——V1.1 §Phase 0 的门禁原文是"没有完成只读盘点，不进入写代码阶段"，盘点已完成。

### 12.3 移交 Prompt 01 的一句话摘要

基线冻结在 `5519ef74`（双远端一致、无前进、工作区仅 2 项未跟踪且已保护）；Three.js 确认为 r180（源码 + 运行求值双重核对）；L3 的 70%/泵送可选/双罐非必需/重进复位 2%/重置清节点完成，**5 条全部成立且已定位 4 处阈值耦合点**；Phase 1 请以 `separator_three_phase` 为试点资产（manifest 哈希有效），**不要**以 `tower` 为试点（其 manifest 5/5 失效、且 `make_tower.py` 重跑会把 products 锚点移到地下），并在动 Schema 前先裁决"资产目录唯一形态"与"Blender 版本锁定"这两件事。

---

## 13. 后续处置进展（2026-11-25 追加）

> 本节为审计交付后追加，记录 §9.2 / §10 各阻断项的处置结果。审计快照数据本身未改动；新增改动见 [`docs/3d-model-optimization/decisions.md`](../decisions.md)。

| 项 | 处置 | 结果 |
|---|---|---|
| **B3** `make_tower.py` 锚点回归 | 用 `BatteryLimit_*` 实测包围盒（web `x∈[7.95,8.85] y∈[0,1.30] z∈[-7.45,-4.35]`，中心 `(8.4,0.65,-5.9)`）定位错值根因：Blender 元组被误抄进网页字段 | ✅ 已修，5/5 锚点双向逐值一致，`heater_bbox` 亦被复现 |
| `cutaway_show_only` 名称失配 | 确认该字段无任何运行时消费者 | ✅ 已修（`Tray_`/`VacTray_` → `Trays_A`/`Trays_V`） |
| **B2** tower manifest 失效 | 重建依赖 B3，B3 已修；但重建需真实 Blender 重跑，未执行 | ⏸ 留给 Phase 2 |
| **B4** Blender 版本 | 决策：统一 5.3.0；历史 4.5 产物按实际版本如实记录，不追溯改写 | ✅ 决策完成 |
| §10-1 资产目录 | 决策：保持 `web/assets/<assetId>/`，不建 `models/` | ✅ 决策完成 |
| §10-3 `anchorId` 写入方 | 决策：Blender 自定义属性写入 → `extras.petro.anchorId`；Manifest 只索引 | ✅ 决策完成 |
| §10-4 试点资产 | 决策：`separator_three_phase`（哈希有效），不用 tower | ✅ 决策完成 |
| §8-3 L3 阈值 4 处耦合 | 已登记为硬约束（`l3.js:346/397`、`mission.js:376/530`） | ✅ 已登记，阈值未改动 |
| §10-9 三份过期文档 | `asset-inventory.md`、`tooling-readiness.md`、`asset-pipeline.md` 已加过期横幅并更正数字 | ✅ 已更正 |
| **B1** 依赖安装 | 需用户授权窗口；本次零依赖完成全部只读分析 | ⛔ 待用户 |
| **B6** CI 落点 | 需用户在 Gitee / GitHub 之间选择 | ⛔ 待用户 |
| **B5** 工艺依据 | 无 `approved` basis；Phase 3 走 `draft` 退路 | ⛔ 待用户/领域专家 |
| **B7** 目标 GPU | 无目标设备、无独显、VRAM 不可读 | ⛔ `NOT_MEASURED` |

**Phase 1 可启动范围**：契约、Schema 设计、命名约定、`nodeUid` 工具（Node 内置 `crypto`，零依赖）、extras 一致性 checker（直接读 GLB JSON chunk）、separator 试点 Manifest —— **均可立即开始且零依赖**。仅"用 AJV 跑 Schema 校验"与"验证导出后 extras 不丢"两项分别受 B1 与 U-1 限制。

---

*本报告是 Phase 0 只读审计的唯一产出。审计执行期间（2026-11-25 11:25–11:35）未修改、未删除、未移动、未重命名任何其他仓库文件，未安装依赖，未运行 Blender 构建，未改变任务与三维交互状态。*
*§13 记录的后续修复发生在本报告交付之后，涉及文件与验证方式已逐项列于 `decisions.md` §5，不属于本次只读审计范围。*
