# Phase 00 · 工程基线只读审计报告（复审计 · `b3fd865`）

> 对应方案：《石油科普智能体 3D 模型优化实施方案 V1.1》（2026-11-25）
> 审计性质：**只读基线冻结**。本报告是本次审计中唯一被写入的文件。
> 审计时间：2026-11-27 10:42–10:52（Asia/Shanghai）
> 审计基线提交：`b3fd865af1f0150429dcd1b308054a375b7066af`（`main`，与 `origin/main` 一致）
> 结论：**PASS**（Phase 0 门禁通过；工作区用户改动已确认受保护；已登记 6 项 blocker，均不阻断 Phase 0 本身）

---

## 0. 版本说明与取代关系（务必先读）

### 0.1 本报告取代前一份 Phase 0 报告

`docs/3d-model-optimization/reports/phase-00-baseline.md` 此前已有内容，是**以 `5519ef74` 为基线**、2026-11-25 11:25–11:35 执行的首次 Phase 0 审计，随提交 `6537085` 入库。

该版本**已过期**，两条硬结论不再成立：

| 前次报告的结论 | 当前实测 | 是否仍成立 |
|---|---|---|
| "HEAD = `5519ef74`，main 未前进" | HEAD = `b3fd865`，已前进 **13** 个提交 | ❌ 失效 |
| "仓库中**无一**符合 V1.1 §2.4 形状的 Manifest" | `web/assets/separator/separator.manifest.json` 已存在（`schemaVersion: 1.0.0`） | ❌ 失效 |

因此按用户指示**覆盖本路径**，并保留前次结论摘要（§0.2）。前次报告全文仍可从 git 完整取回：

```bash
git show b3fd865:docs/3d-model-optimization/reports/phase-00-baseline.md
```

为不破坏既有交叉引用，本报告沿用前次的章节编号：`docs/asset-inventory.md` 引用的 **§3.2** 仍是"资产盘点表"，`docs/tooling-readiness.md` 引用的 **§7.1** 仍是"版本实测"。

### 0.2 前次审计（`5519ef74`）结论摘要（保留）

前次结论 **PASS**，其仍然有效的发现如下（本报告已用当前 HEAD 独立复核，标注一致性）：

| 前次发现 | 本报告复核 |
|---|---|
| `tower.obj` = 253 个命名对象 / 25,831 面 | ✅ 一致（§3.4） |
| L4 `splitAndBindDetails()` 正则只绑定 53/253 = 21%，79.1% 无归属 | ✅ 一致（§3.4） |
| `tower.glb` 258 节点、extras = **0** | ✅ 一致（§3.3） |
| `separator.glb` 43 节点、extras = **0** | ✅ 一致（§3.3） |
| `underground.glb` 28 节点、extras = **28**（全仓库唯一 extras 先例） | ✅ 一致（§3.3） |
| `spike/separator.glb` 27 节点、extras = 0 | ✅ 一致（§3.3） |
| `THREE.REVISION = 180`，全仓库仅一个 THREE runtime | ✅ 一致（§4） |
| L3 五条业务规则 5/5 成立 | ✅ 一致（§5） |
| 70% 阈值有 **4 处**耦合：`l3.js:346/397`、`mission.js:376/530` | ✅ 一致（§5.3） |
| L2 真实剖切几何**已存在**，被 `l2.js:213` 主动隐藏 | ✅ 一致（§6.1） |
| `web/data/process-connections.json` 不存在 | ✅ 仍不存在（§3.5d） |
| 生产页 0 处加载 GLB；唯一 GLB 加载点是 `_spike-separator.html` | ✅ 一致（§4.3） |
| `make_tower.py` 无 `nodeUid` / `petro` 自定义属性 | ✅ 仍无（§3.5a） |

前次报告 §13 记录的处置项（B3 锚点回归已修、`cutaway_show_only` 已修、D-01～D-07 决策已定）在当前 HEAD 中**仍然有效**，详见 [`decisions.md`](../decisions.md)。

### 0.3 本次只读边界

| 类别 | 内容 |
|---|---|
| Git 只读命令 | `rev-parse` / `log` / `status --porcelain` / `status --ignored` / `rev-list` / `merge-base --is-ancestor` / `diff --stat` / `diff --name-status` / `stash list` / `cat-file` |
| 源码读取 | `web/levels/{l1,l2,l3,l4,l5}.js`、`web/{immersion,tower,mission}.js`、`web/tower.html`、`web/{index,sandbox}.html`、`web/world/{registry,state}.js`、`package.json`、`.github/workflows/validate-assets.yml`、`server/protected-pages.json`、`server/dev.mjs`、`tools/*.py`、`tools/*.mjs` |
| 资产读取 | `web/assets/**` 126 个文件 / 40.63 MB；4 个 GLB 的 JSON chunk 逐节点解析；`tower.obj` 全量对象名解析 |
| 校验执行 | `npm run validate:assets`、`npm run validate:assets:fixtures`（纯读，无写入代码路径） |
| 环境探测 | `node -v`、`npm -v`、`pnpm -v`、`corepack`、`git --version`、`python --version`、`blender.exe --version`、Chrome 版本、`Win32_VideoController` |
| 运行时求值 | 用 Node `vm` + 浏览器全局 shim 对 `web/assets/three.browser.js` 求值，读回 `window.THREE.REVISION` |

**明确未执行**：未修改 `package.json`/源码/模型/资产（本报告除外）；未运行任何 Blender 构建脚本（仅无副作用的 `--version`）；未 `checkout` 旧 SHA、未 `fetch`、未 `stash`、未 `reset`、未 `clean`、未提交；未安装或替换依赖；未启动 dev server 或浏览器；未触碰任务与三维交互状态；未读取 `server/.env`。

---

## 1. 当前 HEAD 与 main 状态

### 1.1 分支与提交

| 项 | 值 |
|---|---|
| 当前分支 | `main` |
| HEAD | `b3fd865af1f0150429dcd1b308054a375b7066af` |
| HEAD 提交信息 | `style: 精简首页系统菜单并改为自动播放` |
| `origin/main` | `b3fd865af1f0150429dcd1b308054a375b7066af` |
| `git rev-list --left-right --count origin/main...HEAD` | `0	0`（不领先、不落后） |
| 远端 | `origin` = `git@gitee.com:LYU_PRO/scienceagent.git`；`github` = `https://github.com/Levine1899/Embodied-Intelligence.git` |

> 注：本次未执行 `ls-remote` 网络探测（前次执行过）。`origin/main` 是本地跟踪引用，与 HEAD 完全一致，已足以判定"本地已同步"；远端实时状态属 §9.1-U8 未确认项。

### 1.2 最近 10 条提交

```
b3fd865 style: 精简首页系统菜单并改为自动播放
c9564a8 style: 首页系统菜单移动到标注区域
a9b9c40 feat: 首页系统菜单改版并修复油宝推荐问题
3308f0c 统一视频播放地址配置
f818765 改善科普视频播放和返回体验
86865db 统一科普视频页的品牌文字
fbc9ba0 feat: 全站内容页接入油宝并统一页面标题
a8fe44d feat: 沉浸式讲解标题叠入三维画面
786d288 feat: 沉浸式讲解标题与理解深度移入场景
d87382a fix: 科普视频页纳入登录保护
```

### 1.3 main 是否已超过 `5519ef74` —— **是，已前进 13 个提交**

`git merge-base --is-ancestor 5519ef74 HEAD` 返回 0，即 `5519ef74` 是 HEAD 的祖先，**未发生 rebase 或强制推送**，历史线性可追溯。

13 个提交对**本方案**的影响分级：

| 影响 | 提交 | 内容 | 对本方案的后果 |
|---|---|---|---|
| **高** | `6537085` | 登录认证 + 沉浸式章节树 + 首页油宝；**同一提交内附带** V1.1 方案文档、`docs/3d-model-optimization/**`、`schemas/asset-manifest.schema.json`、`tools/validate_assets.mjs`、`tools/gen_pilot_separator_manifest.mjs`、`tools/blender/asset_identity_probe.py`、`web/assets/separator/separator.manifest.json`、`.github/workflows/validate-assets.yml`、`tools/make_tower.py` 锚点修复 | **Phase 0 与 Phase 1 已经执行完毕并入库**。V1.1 的阶段编号已实际推进到"Phase 1 已交付、待 Phase 2" |
| **高** | `b3fd865` + `c9564a8` + `a9b9c40` | 首页系统菜单改版、**首页改为自动播放预录视频** | 首页 `index.html` **不再加载 Three.js**；总览 3D 入口只剩 `sandbox.html`（§8-1） |
| **中** | `a8fe44d` + `786d288` | 沉浸式讲解标题/理解深度移入三维画面 | 改动 `web/immersion-chapters.js`、`immersion-chapter-tree.js`，未触碰 `immersion.js` 场景装配逻辑 |
| **中** | `d87382a` + `6537085` 的认证部分 | 全站内容页纳入登录保护 | **所有 3D 页面现受登录保护**，任何浏览器 E2E 必须先过认证（§8-5） |
| **低** | `3308f0c`、`f818765`、`86865db`、`fbc9ba0`、`da01142`、`f41bb71` | 视频播放、品牌文字、合并分支 | 与三维资产/连接数据无关 |

**结论：V1.1 §1.1 记录的代码审查基线 `5519ef74` 已失效。本报告以 `b3fd865` 为新基线。**

---

## 2. 工作区状态与用户改动保护

### 2.1 是否干净 —— **是（完全干净）**

`git status --porcelain=v1` 输出为**空**。即：无未跟踪文件、无暂存改动、无已跟踪文件的修改或删除。

这与前次审计不同（前次有 2 条未跟踪项：`.codegraph/` 与方案文档）。原因：`.codegraph/` 已被 `6537085` 加入 `.gitignore`（第 24–25 行），方案文档已随 `6537085` 入库。

### 2.2 被忽略但存在于工作区的条目（**不得清理**）

`git status --ignored=matching` 显示：

| 条目 | 忽略依据 | 说明 |
|---|---|---|
| `.codegraph/` | `.gitignore:24-25` | 代码索引缓存（tooling 产物） |
| `.dsh-project-memory/` | 目录内自带 `.gitignore` | Agent 记忆库，非用户代码 |
| `dist/` | `.gitignore:8` | 历史抓帧证据（前次实测 1,776.2 MB / 6,494 文件） |
| `node_modules/` | `.gitignore:1` | 依赖树（见 §7.1） |
| `server/.env` | `.gitignore:11` | 本地密钥，**未读取** |

### 2.3 已存在的 stash（用户状态，**严禁操作**）

```
stash@{0}: On main: phase07 png noise
```

该 stash 在审计开始前即存在，**不属于本次产出**。严禁 `stash pop/drop/clear`。

### 2.4 保护结论

- 无任何用户未提交改动需要逐项列出——工作区本身是干净的。
- 审计期间**未对任何已跟踪文件产生改动**（本报告写入前后，`git status` 唯一变化将是本报告自身）。
- 未触碰 stash、未清理任何被忽略目录。
- **唯一有意写入**：本报告（用户明确授权覆盖该路径）。

---

## 3. 资产 / 代码盘点

### 3.1 代码骨架

| 层级 | 文件 | 大小 | 职责 | 关键事实 |
|---|---|---|---|---|
| 总览 | `web/immersion.js` | 108,005 B | Three.js 总览场景、程序化几何、Hero OBJ 装配、渲染循环 | 现**仅由 `sandbox.html` 加载**（`?v=fix92`）；已不再由首页加载 |
| 运行库 | `web/assets/three.browser.js` | 2,006,898 B | 经典 `<script>` 注入 `window.THREE` | 见 §4 |
| OBJ 解析 | `web/assets/obj-lite.js` | 5,101 B | 自研 OBJ/MTL 解析，按 `o`/`g`+`usemtl` 分桶 | `mesh.name = 桶名`，**身份完全依赖名字** |
| 场景注册表 | `web/world/registry.js` | 12,871 B | `zoneId/stageId/objectId/anchor` 单一来源 | 每个 device 含 `modelPath` / **`modelNode`（名字路径）** / `anchor`（名字） |
| 设备状态 | `web/world/state.js` | 4,747 B | 逻辑设备状态 + `representations` 绑定 | 有 `bind(objectId, rep, object3d)` 与 `reset()`；`structure` 取值无枚举校验 |
| L1 | `web/levels/l1.js` | 67,649 B | 地下地质 + 井筒 | `ObjLite.load('assets/underground/underground.obj')`（`:298`） |
| L2 | `web/levels/l2.js` | 32,669 B | 三相分离器 | 布尔 `structMode`；见 §6 |
| L3 | `web/levels/l3.js` | 29,533 B | 储运罐区 + 转输泵 | 见 §5 |
| L4 | `web/levels/l4.js` | 34,739 B | 常减压装置 | 名称正则权威分组，见 §3.4 |
| L5 | `web/levels/l5.js` | 13,107 B | 产品/材料/制品 | 全程序化几何，`oil: true/false` 布尔分类 |
| 独立塔页 | `web/tower.html` + `web/tower.js` | 9,192 B + 28,013 B | 独立常减压塔交互页 | **自带第二套 OBJ 解析器**（`parseOBJ` @ `tower.js:99`） |
| 任务 | `web/mission.js` | 26,006 B | 五段任务状态机 | 见 §5 |
| 主沙盘入口 | `web/sandbox.html` | 54,764 B | 主三维沙盘 | 按序注入 22 个 `<script>`，大量手工 `?v=` |
| 首页 | `web/index.html` | 7,275 B | **预录视频**（`assets/tower/hero-loop.mp4`） | **不加载 three.browser.js / immersion.js**（§8-1） |
| 开发服务器 | `server/dev.mjs` | — | 静态托管 `web/` + 页面保护 + `/api/*` 反代 | 见 §7.3 |

### 3.2 资产盘点表

> 口径：`assetId` 只填仓库中**已有明示值**的；"Manifest"指符合 `schemas/asset-manifest.schema.json` 形状的机读索引；"稳定 nodeUid"指 GLB 内实测 `extras.petro.nodeUid` 或 Manifest 内 `nodes[].nodeUid`。

| # | assetId | 环节 | 源文件 | 网页运行文件 | 构建入口 | 加载方式 | Manifest | nodeUid | anchor | 当前缺陷 | 证据路径 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `distillation_unit_hero`（仅旧 phase-06 manifest 内） | L4 炼化 / 独立塔页 | `assets-source/blender/tower_hero.blend`（493,146 B） | `web/assets/tower/tower.obj` **3,837,432 B / 253 对象 / 25,831 面**；`tower.glb` 3,843,452 B（**258 节点，extras=0**）**生产页不加载** | `tools/make_tower.py`（默认输出 `tools/out`） | `ObjLite.load('assets/tower/tower.obj?v=08')`（`l4.js:146`、`immersion.js:1698`）；`tower.js` **另写一套**解析器（`tower.js:99`） | ✗（仅旧 phase-06 manifest，哈希 5/5 失配） | ✗ | △ 5 个 `anchor_tower_*` 空节点；`anchor_tower_products` 已修 | 正则分组 **79.1% 对象无归属**；3 处 `.001` 重名；`make_tower.py` **无 `petro`/`nodeUid` 写入**；手工 `?v=08` | `web/assets/tower/`、`tools/make_tower.py:457–468`、`web/tower.meta.json` |
| 2 | `separator_three_phase` | L2 地面处理 | `assets-source/blender/separator_hero.blend`（1,119,702 B） | `web/assets/separator/separator.obj`（495,915 B，43 对象，含真实半剖壳）；`separator.glb` 391,188 B（**43 节点，extras=0**） | `tools/blender/build_separator_hero.py`（无 CLI 参数，硬编码路径） | `ObjLite.load('assets/separator/separator.obj?v=08')`（`l2.js:308`） | ✓ `web/assets/separator/separator.manifest.json`（schema 1.0.0；33 nodes / 5 anchors / 1 object / 1 system；`assetVersion 1.0.0+phase1pilot`） | △ Manifest 内 33 个 UUIDv5 ✓，但 **GLB 实测 extras = 0/43**，`extrasStatus=pending_rebuild` | ✓ 5 个（`separator_inlet` 等，含 position/direction） | 真实剖切几何**已存在却被代码隐藏**（`l2.js:213`）；结构仅布尔两态；extras 未回写发布产物 | `web/assets/separator/`、`web/assets/separator/README.md` |
| 3 | `underground_hero` | L1 地下地质/井筒 | `assets-source/blender/underground_hero.blend`（1,180,982 B） | `web/assets/underground/underground.obj`（823,552 B，23 对象，12,380 面）；`underground.glb` 710,412 B | `tools/blender/build_underground_hero.py`（无参数） | `ObjLite.load('assets/underground/underground.obj')`（`l1.js:298`） | ✗（旧 phase-04 manifest 非本 Schema 形状，但哈希 4/4 匹配） | ✗ 无 nodeUid；**但 GLB 28/28 节点带 extras** `{semanticId, objectId, layerIndex, flowDirection, assetId, source, license, teachingNote}` —— **全仓库唯一 extras 先例** | △ 4 个锚点 | extras 命名空间不是 `petro`；OBJ 路径下属性全部失效 | `web/assets/underground/` |
| 4 | `separator`（`hero/separator.meta.json`） | 总览 Hero | `tools/make_hero_assets.py`（程序化，无 .blend） | `web/assets/hero/separator/separator.obj`（463,302 B，5 个材质合并对象） | `tools/make_hero_assets.py -- [--render]` | `ObjLite.load('assets/hero/separator/separator.obj')`（`immersion.js:1753`） | ✗（`.meta.json` 是统计卡） | ✗ | △ `meta.json` 内 4 个锚点 | 按材质合并后部件身份丢失；与 #2 是**两个不同资产** | `web/assets/hero/index.json` |
| 5 | `pumpjack` | 总览 Hero / L1 采油 | 同上 | `web/assets/hero/pumpjack/pumpjack.obj`（67,117 B） | 同上 | `ObjLite.load(...)`（`immersion.js:1650`） | ✗ | ✗ | △ 4 个 | 3 个静态/梁/曲柄对象 | `web/assets/hero/pumpjack/` |
| 6 | `wellhead` | 总览 Hero / L1 井口 | 同上 | `web/assets/hero/wellhead/wellhead.obj`（206,140 B） | 同上 | 同上 | ✗ | ✗ | △ 2 个 | 4 个材质桶，无部件语义 | `web/assets/hero/wellhead/` |
| 7 | `heater` | 总览 Hero / L4 加热炉 | 同上 | `web/assets/hero/heater/heater.obj`（74,831 B） | 同上 | 同上 | ✗ | ✗ | △ 3 个 | 4 对象、490 面 | `web/assets/hero/heater/` |
| 8 | `floating_roof_tank` | 总览 Hero / 储运 | 同上 | `web/assets/hero/floating_roof_tank/floating_roof_tank.obj`（406,629 B） | 同上 | 同上 | ✗ | ✗ | △ 3 个 | 浮盘在关卡里另建程序化几何，资产本身无浮盘语义 | `web/assets/hero/floating_roof_tank/` |
| 9 | —（无） | L3 固定顶罐 / 外浮顶罐 / 转输泵组 | **无源文件、无 .blend、无 OBJ** | **纯程序化几何**（`immersion.js:688/705/723`、`l3.js` 内建） | **无** | 代码 `cylinder()/box()` 构造 | ✗ | ✗ | △ 仅 `registry.js` 内名字 | V1.1 §4.3 核心缺口：无独立 Hero、无半剖 representation | `web/assets/models/` 为空（仅 `.gitkeep`） |
| 10 | —（无） | L5 产品/材料/制品 | 无 | **纯程序化几何**（`l5.js`） | **无** | 代码构造 `box/cyl/sphere/cone` | ✗ | ✗ | ✗ | `oil: true/false` 二元分类（`l5.js:16–25`） | `web/levels/l5.js` |
| 11 | —（spike） | 技术验证（非生产） | `web/assets/spike/separator.blend`、`tools/spike_separator.py` | `web/assets/spike/separator.obj` + `.glb`（27 对象/节点） | `tools/spike_separator.py` | 仅 `_spike-separator.html` 经自研 `MiniGLB` 加载 GLB | ✗ | ✗ | ✗ | **全仓库唯一 GLB 加载点，且为非生产页** | `web/_spike-separator.html:120`、`web/assets/spike/glb-mini.js` |

### 3.3 Manifest 与 GLB extras 真实性（本次实测）

逐节点解析 4 个 GLB 的 JSON chunk：

| GLB | 节点数 | 带 `extras` 的节点 | extras 键 | 判定 |
|---|---|---|---|---|
| `web/assets/tower/tower.glb` | 258 | **0** | — | ✗ 无任何身份信息 |
| `web/assets/separator/separator.glb` | 43 | **0** | — | ✗ Manifest 已定义 33 个 nodeUid，**产物未回写** |
| `web/assets/underground/underground.glb` | 28 | **28** | `semanticId, objectId, layerIndex, flowDirection, assetId, source, license, teachingNote` | ✅ 机制先例（但无 `nodeUid`、非 `petro` 命名空间） |
| `web/assets/spike/separator.glb` | 27 | **0** | — | ✗ |

校验器实测输出（`npm run validate:assets`，退出码 0）：

```
Schema 编译通过：schemas/asset-manifest.schema.json  (draft 2020-12, AJV 8.20.0)
△ web/assets/separator/separator.manifest.json
    · GLB 节点 43 个，其中带 extras.petro 的 0 个；extrasStatus=pending_rebuild
    ! [EXTRAS_ABSENT] runtime.extrasStatus: GLB 无 extras.petro
合计 1 个 Manifest：通过 1，失败 0，带告警 1
```

`npm run validate:assets:fixtures` 5/5 符合期望（`DUP_NODEUID`、`MISSING_NODE_REF`、`SCHEMA_REQUIRED`、`NODE_NOT_IN_GLB` 四类失败 fixture + 1 个合法 fixture 全部按期望通过）。

**关键判断**：Phase 1 报告 §8 声称"Blender 属性 / GLB extras / Manifest 三处 nodeUid 一致 43/43"，该结论针对的是**导出到系统临时目录的探针产物**，不是**已发布的 `separator.glb`**。发布产物的 extras 通路**仍未闭环**，`strict` 模式据 CI 注释"会因 `extrasStatus=pending_rebuild` 而失败"。

### 3.4 L4 分组覆盖率实测（Phase 2 的核心量化基线）

用 `web/levels/l4.js:117–119` 的**原文正则**逐条匹配 `web/assets/tower/tower.obj` 的 253 个对象名（本次独立复算）：

| 指标 | 数量 | 占比 |
|---|---|---|
| OBJ 对象总数 | 253 | 100% |
| 绑定到 `atmospheric_tower` | 32 | 12.6% |
| 绑定到 `vacuum_tower` | 19 | 7.5% |
| 绑定到 `heater` | 2 | 0.8% |
| **合计被绑定** | **53** | **20.9%** |
| **无任何 detail 归属** | **200** | **79.1%** |
| 不同基名数 | 250 | — |
| 存在 `.001` 类重名后缀的基名 | **3** | `Exchanger_1_Saddle` / `Exchanger_2_Saddle` / `Exchanger_3_Saddle` |

无归属对象前缀聚类（示例）：`Railing_*`、`Post_*`、`Ladder*`、`Exchanger_*`、`RundownRack_*`、`Pump_*`、`Stripper_*`、`Reflux_Drum*`、`BatteryLimit_*`、`SideRack_*`。

**这精确量化了 V1.1 §4.1"未知节点数量为 0"门禁与现状的差距：200 个对象无法被任何数据解释。**

### 3.5 资产身份与坐标的硬证据

**（a）无 `nodeUid`、无 `petro` extras**

`tools/make_tower.py` 全文**不含** `nodeUid` / `petro` / 自定义属性写入（仅 `ANCHORS` 字典与空物体）；`build_separator_hero.py`、`build_underground_hero.py`、`make_hero_assets.py` 同样不含。仅 `tools/blender/export_glb.py` 出现 1 处相关读取（`objectId`/`semanticId`/`anchorId`），与 `tools/blender/asset_identity_probe.py`（Phase 1 新增探针）负责验证通路。

**（b）`.001` 重名已固化进产物** — `tower.glb` 中 3 个 `Exchanger_*_Saddle.001`，成因在 `make_tower.py` 的 `exchanger()` 内两个支座使用同一固定名。

**（c）`anchor_tower_products` 三处矛盾已在 `6537085` 中修复** — `make_tower.py:457–468` 现为 `(8.4, 5.9, 1.0)`（Blender Z-up），派生网页值 `(8.4, 1.0, -5.9)`，与 `tower.meta.json` 及 `tower.js:202` 一致。前次报告的 B3 已闭环。

**（d）连接坐标仍多处重复定义**

| 路线要素 | 定义位置 | 现状 |
|---|---|---|
| 侧线抽出标高 | `make_tower.py:304–308`（Blender 源） / `tower.js:512–514`（手抄）/ `l4.js:31–34`（×0.46 缩放） | 三套并存 |
| 塔顶冷凝线 | 模型 28.85 ／ `tower.js:515` 用 27.4 | **已漂移 1.45** |
| 分离器气/油出口 | `build_separator_hero.py` 与 `l2.js:300–301` | 逐字手抄重复 |
| L4 教学流线 | `l4.js:313–362` 自建 `CatmullRomCurve3`/`TubeGeometry` | 与 Blender 实体管线**两套独立定义** |

`web/data/process-connections.json` **不存在**（`web/data/` 目录亦不存在）。`schemas/` 下只有 `asset-manifest.schema.json`，**无 `process-connections.schema.json`**。

### 3.6 证据目录

- `dist/`（被忽略）：历史抓帧证据，前次实测 6,494 文件 / 1,776.2 MB。
- `docs/phase-reports/evidence/**`：227 个已跟踪文件（含 PNG/JSON），入仓库。
- `docs/3d-model-optimization/evidence/phase-01/extras-pipeline-evidence.json`：306,000 B 级 extras 通路证据。

含义：V1.1 §11 要求"实际网页截图 + 自动断言"，后续阶段证据必须落到 `docs/` 侧跟踪目录，`dist/` 不入库。

### 3.7 既有文档的过期情况

| 文档 | 状态 |
|---|---|
| `docs/asset-inventory.md` | 顶部已加过期横幅，塔相关数字已就地更正为 253 对象 / 25,831 面 ✅ |
| `docs/tooling-readiness.md` | 顶部已加更正横幅（Blender 5.3.0），但**正文 Chrome 版本记为 157，实测为 158.0.8127.88** ⚠️ |
| `docs/asset-pipeline.md` | 顶部已加更正横幅（`web/assets/models/` 从未建立）✅ |

---

## 4. Three.js 版本确认

### 4.1 双重核对（源码常量 + 实际运行求值）

| 核对方式 | 证据 | 结果 |
|---|---|---|
| ① 源码常量 | `web/assets/three.browser.js:10` → `const REVISION = '180';` | **180** |
| | 同文件版权头 `Copyright 2010-2025 Three.js Authors` | 与 2025 年发布的 r180 一致 |
| ② 实际求值 | Node `vm` + `window`/`AbortController`/`performance` 等 shim 求值该 2.0 MB bundle | `window.THREE` 存在；**`THREE.REVISION === 180`** |

**结论：当前实际运行库为 Three.js r180，双重核对一致。**

### 4.2 全仓库只有一个 THREE runtime

`web/assets/three.browser.js:10` 是唯一 `const REVISION` 定义。加载它的页面仅 3 个：`sandbox.html:206`、`tower.html:141`、`_spike-separator.html:41`。**首页 `index.html` 已不加载**。

V1.1 §5.2"不得同时加载两个 THREE runtime"当前仍是**已满足的既成事实**；Phase 6 的风险是"引入第二个"。

### 4.3 没有 GLTFLoader

- 页面代码搜索 `GLTFLoader` → **0 个加载点**（仅 `three.browser.js` 内的文档注释提及）。
- 全仓库唯一 GLB 加载点是 `web/_spike-separator.html:120`，走自研 `MiniGLB`（`web/assets/spike/glb-mini.js`）。
- `tower.glb`（3.8 MB）、`separator.glb`、`underground.glb` **目前是死产物**。

因此 Phase 6 的准确表述是**从零建立 GLB 通道**，不是"切换格式"。

### 4.4 npm 侧仍无 Three.js 依赖

`package.json` 现有依赖：`devDependencies: ajv 8.20.0, ajv-formats 3.0.1`；`dependencies: proper-lockfile 4.1.2`。**无 `three`、无 `esbuild`**。`package-lock.json` 已提交（4,492 B），`node_modules/` 已安装 10 个包。

V1.1 §5.1"精确锁定 `three@0.180.0`"仍是**待建立**状态；r180 ↔ `three@0.180.0` 的对应关系**尚未在仓库内验证**。

---

## 5. L3 任务规则确认（V1.1 §1.2 / §4.3 强制回归项）

### 5.1 逐条确认：**5/5 全部仍然成立**

| # | 规则 | 代码证据 | 判定 |
|---|---|---|---|
| 1 | 液位到 **70%** 即完成任务 | `l3.js:346` `if (level >= 0.70 && !completed) complete();`（`selectTank` 内）<br>`l3.js:397` 滑块 `input` 内同条件<br>`mission.js:376` `if ((state.flags.level \|\| 0) >= 70) completeStep();`<br>`mission.js:530` 轮询内同条件 | ✅ 成立（关卡层与任务层两处独立触发） |
| 2 | **不要求**启动泵送 | `complete()`（`l3.js:401–412`）**完全不读取** `pumpRunning`/`pumpPaused`；四个泵按钮（`:388–390`）只改动画与 `deviceState.animation` | ✅ 成立 |
| 3 | **不要求**先观察两种罐型 | `observedTanks` 仅 3 处**写入**（`l3.js:241/490/513`），**全文件无任何读取用于判定**；`complete()` 不引用 | ✅ 成立 |
| 4 | 每次重新进入 L3：液位 **2%**、停泵、清暂停、清完成、默认固定顶 | `enter()` @ `l3.js:481–492`：`level = 0.02`（:485）、`pumpRunning = false`（:486）、`pumpPaused = false`（:487）、`completed = false`（:488）、`selectedTankId = 'fixed_roof_tank'`（:489）、`observedTanks` 复位（:490）、`pumpFlow.speed = 0`（:491）、`slider.value = '2'`（:492）；`:513–517` 再次复位并清 `done` class / `pulse` / 按钮文案 | ✅ 成立（`:514` 有一处 `completed = false` 重复赋值，无害冗余） |
| 5 | 任务重置清除节点完成状态 | `mission.js:451–466` `reset()`：先 `leaveLevel()` → `state = blank()` → 清 `localStorage` → **`for (i in STEP_DEFS) setNodeDone(i, false)`**（:457–459）→ `setMode('free')` → 派发 `mission-reset` | ✅ 成立（覆盖全部 5 个节点） |

**补充**：`window.__l3`（`l3.js:554`）暴露 `level`/`completed`/`pumpRunning`/`pumpPaused`/`cutMode` 只读探针与 `setLevel(pct)`/`startPump()`/`pausePump()`。`setLevel` 走 `dispatchEvent(new Event('input'))`，会**真实触发**完成逻辑——可直接用于 Phase 7 的回归断言。

### 5.2 与 L3 规则相关的状态残留（非 V1.1 明文强制，但需登记）

| 项 | 事实 | 影响 |
|---|---|---|
| `cutMode` | 声明默认 `true`（`l3.js:10`），`enter()` **不复位** `cutMode` | 上次若"恢复罐壁"（`cutMode=false`）后退出，下次进入仍不剖切 |
| L2 `structMode` | `l2.js:13` 布尔；`enter()` **不调用** `applyStructure` | 重进后保留上次内部结构状态，直接对应 V1.1 §4.2-6 |
| `deviceState.reset()` | `state.js:96` 存在，但 `l2.js`/`l3.js` 的 `enter()` 均未调用 | Phase 4/7 应改为调用它 |

### 5.3 阈值耦合点（**改动必须 4 处同改**）

```
web/levels/l3.js:346    if (level >= 0.70 && !completed) complete();
web/levels/l3.js:397    if (level >= 0.70 && !completed) complete();
web/mission.js:376      if ((state.flags.level || 0) >= 70) completeStep();
web/mission.js:530      if ((state.flags.level || 0) >= 70) completeStep();
```

本次全仓库搜索 `0.70|>= 70` 确认**仍为这 4 处**，无新增分叉。两层判据语义一致，`mission.js:508` 的 `syncStorageState()` 从 `__l3` 单向同步，无反向驱动。

---

## 6. L2 剖切现状（Phase 4 的真实起点）

### 6.1 真实剖切几何**已存在**，但被代码主动隐藏

`separator.obj` 已含 `separator_cut_shell`、`separator_cut_edge_top`、`separator_cut_edge_bottom`、`separator_cutaway_rim`。但 `l2.js:213` 无条件执行 `cutShell.forEach(m => m.visible = false)`，`applyStructure()` 也从不让它可见。

**因此当前"打开内部结构"实际只产生 ghost 效果**（`opacity 0.10` + `depthWrite=false`），与 V1.1 §4.2 对 `half` 的要求（真实剖切壳 + 封边）不符。

### 6.2 结构状态仍是布尔两态

`l2.js:13` `let structMode = false`；`applyStructure(show)` 只有开/关。`structure` 上报值仅 `'half'`/`'external'`（`:193`），**没有 `ghost`/`full`，也没有独立状态机**。

**Phase 4 的工作重点是状态机 + 显隐映射，不是重建资产** —— 这与前次审计判断一致。

---

## 7. 可用工具与运行命令

### 7.1 版本实测

| 工具 | 实测 | 说明 |
|---|---|---|
| Node.js | **v22.20.0** | 满足 `engines.node >=22.0.0` |
| npm | **10.9.3** | 项目实际使用的是 npm（有 `package-lock.json`） |
| pnpm | 9.15.9（已装） | **项目未使用**，无 `pnpm-lock.yaml` |
| corepack | 0.34.0 | 可用 |
| Git | 2.45.1.windows.1 | — |
| Python | 3.12.7 | 供 `http.server` 与资产脚本 |
| **Blender** | **5.3.0**（build 2026-11-10） | `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`，**不在 PATH** |
| Chrome | **158.0.8127.88** | `C:\Program Files\Google\Chrome\Application\chrome.exe`（`tooling-readiness.md` 记 157，已过期） |
| Playwright | **未安装** | `node_modules` 无、仓库无依赖、无 `playwright.config.*`；`npx playwright` 会要求联网安装 |
| Puppeteer | **未安装** | 同上 |
| AJV | 8.20.0 + ajv-formats 3.0.1 | **已安装**，Schema 校验可用 |
| 操作系统 | Windows 11 家庭版 | — |
| GPU | **AMD Radeon(TM) Graphics（集显）**，AdapterRAM 512 MB；另有 `OrayIddDriver` 虚拟显示驱动 | **无独立显卡** |

### 7.2 Blender headless 可用性

- `blender.exe --version` 实测输出 `Blender 5.3.0`（build date 2026-11-10，build commit date 2026-11-09），**headless 可启动**。
- 未在 PATH，所有脚本调用需显式绝对路径。
- `tools/blender/build_separator_hero.py` **硬编码** `D:\tools\blender-4.5.16-…` 路径且无 CLI 参数 —— 这是 Phase 2 触碰该脚本前必须处理的已知问题。

### 7.3 现有可运行命令

| 命令 | 作用 | 本轮是否执行 |
|---|---|---|
| `npm run dev` | 静态托管 `web/`（**5173**）+ 启动 `server/proxy.mjs`（**8790**），含页面登录保护与 `/api/*` 反代 | ✗（未启动） |
| `npm run start` / `npm run api` | 仅启动 `server/proxy.mjs`（8790） | ✗ |
| `npm test` | `node --test tests/*.test.mjs`（含 auth-*、chapter-tree 共 7 个测试文件） | ✗（未执行，避免测试产生临时写入） |
| `npm run test:auth` | 只跑 6 个认证测试文件 | ✗ |
| `npm run validate:assets` | Manifest Schema + ID 引用 + GLB 一致性 | ✅ **已执行，通过（1 告警）** |
| `npm run validate:assets:fixtures` | 校验器自测（4 类失败 + 1 类通过 fixture） | ✅ **已执行，5/5 符合期望** |
| `npm run validate:assets:strict` | 额外要求 `extrasStatus === "verified"` | ✗（当前必定失败，CI 中亦被注释） |
| `npm run manifest:pilot` | 重新生成 separator 试点 Manifest | ✗（会写文件） |
| `blender.exe -b -P tools/make_tower.py -- <outDir>` | 生成 tower 资产 | ✗（**禁止**在本阶段执行） |
| `tools/level-e2e.cjs`、`tools/fps-probe.cjs`、`phase0x-*.cjs` | 历史 CDP 驱动的 E2E / FPS / 抓帧脚本 | ✗（依赖外部 Chrome 9333，非零依赖） |

### 7.4 CI

**存在** `.github/workflows/validate-assets.yml`（1,719 B）：

- 触发：`push` 到 `main`（路径过滤：`schemas/**`、`tools/validate_assets.mjs`、`tools/gen_pilot_separator_manifest.mjs`、`tools/blender/**`、`web/assets/**/*.manifest.json`、`web/assets/**/*.glb`、`tests/fixtures/asset-manifests/**`、`package.json`、`package-lock.json`、workflow 自身）、`pull_request`（子集）、`workflow_dispatch`。
- 步骤：`actions/checkout@v4` → `setup-node@v4`（node 22，npm cache）→ `npm ci` → `validate:assets:fixtures` → `validate:assets`。
- `strict` 步骤**被注释**，注释原文说明"当前会因 `extrasStatus=pending_rebuild` 而失败"。
- **无 E2E、无 WebGL smoke、无 Blender 构建**。

### 7.5 目标 GPU 性能是否可实际测量 —— **否（`NOT_MEASURED`）**

- 本机只有 AMD 集显 + 远程桌面虚拟显示驱动，**无目标设备**。
- `renderer.info.memory.*` 只能给资源计数；真实 VRAM 字节数**无法从当前浏览器可靠读取**。
- 结论与前次一致：性能门禁在 Phase 10 之前保持 `NOT_MEASURED`，**不得报 `PASS`**。

---

## 8. V1.1 与仓库之间的新差异（以 `b3fd865` 为基线）

前次审计的 13 条差异中，**#3、#4（部分）、#5、#6、#7、#8、#9、#11、#12、#13 仍然成立**；以下只列**本次新发现或状态已改变**的条目，按影响排序。

| # | 差异 | 方案/前次假设 | 当前实测 | 影响 |
|---|---|---|---|---|
| **1** | **首页已不再渲染 3D** | V1.1 §1.3 将 `web/immersion.js` 视为"总览"；§7.2 "首屏只加载总览必需资产" | `index.html` 只播放预录视频 `web/assets/tower/hero-loop.mp4`（3,339,354 B，poster `hero-poster.jpg`），**不加载 three.browser.js / immersion.js**；总览入口变为 `sandbox.html`（"沉浸式讲解"） | **首屏性能目标、按需加载策略、LOD 计量的落点必须改指 `sandbox.html`**；首页视频的体积（3.3 MB）成为独立的首屏性能议题，V1.1 完全未覆盖 |
| **2** | **Phase 0 与 Phase 1 已执行完毕并入库** | 本次任务按"Prompt 00"编排 | `6537085` 已附带 Phase 0 报告、Phase 1 报告、`schemas/asset-manifest.schema.json`、`tools/validate_assets.mjs`、试点 Manifest、extras 探针、CI | 阶段编号已推进：**下一阶段是 Prompt 02 / Phase 2（L4 语义清单）**，不是 Prompt 01。V1.1 §12 的执行顺序需整体前移一格 |
| **3** | **所有 3D 页面现受登录保护** | V1.1 §Phase 5 只要求"Playwright 浏览器交互 E2E" | `server/protected-pages.json` 将 `/index.html`、`/sandbox.html`、`/tower.html`、`/_spike-separator.html`、`/chapter.html` 等全部列 `protected`；`sandbox.html:135`、`tower.html:92` 均注入 `auth-guard.js`；未列出的 HTML 默认按受保护处理（fail closed） | **任何浏览器 E2E 必须先解决认证**：需要测试账号、会话注入或 dev 绕过机制。这是 V1.1 未预见的新增前置工作 |
| **4** | **依赖与 lockfile 已引入** | 前次 B1：无依赖、无 lockfile、无 `node_modules` | 现有 `ajv`/`ajv-formats`（dev）+ `proper-lockfile`（prod），`package-lock.json` 已提交，`node_modules/` 已安装 | 前次 **B1 部分解除**：Schema 校验已可离线运行。但 **`three`/`esbuild` 仍缺**，Phase 6 仍需一次安装授权 |
| **5** | **CI 已存在，但覆盖面窄** | 前次 B6：无 CI 宿主 | `.github/workflows/validate-assets.yml` 已入库 | 前次 **B6 解除**。但 CI **不跑 E2E、不跑 WebGL smoke、不跑 Blender 构建**，V1.1 §8-Phase 5 的"自动化验收与证据基线"仍只完成约 1/3 |
| **6** | **试点 Manifest 已存在但 extras 未回写发布产物** | 前次："仓库中无一符合 V1.1 §2.4 形状的 Manifest" | `separator.manifest.json` 符合 Schema（1.0.0），含 33 nodeUid / 5 anchors / structureModes / dynamicBindings；但发布 `separator.glb` **43 节点 extras = 0**，`extrasStatus=pending_rebuild` | Phase 1 门禁的"导出后不丢失"仅在**探针临时产物**上成立，**发布链未闭环**。Phase 2 第一件事应是回写 extras 并启用 CI `strict` |
| **7** | **`make_tower.py` 锚点已修，但仍无稳定 ID** | V1.1 §4.1-4 要求"每个对象同时持有稳定 nodeUid" | `anchor_tower_products` 已修（前次 B3 闭环）；但 `make_tower.py` 全文**仍无** `nodeUid`/`petro` 自定义属性写入 | Phase 2 需从零为该脚本加身份写入；`tower` 的 Manifest 仍不存在 |
| **8** | **手工 `?v=` 版本参数更多了** | V1.1 §5.5 "禁止散落手工 `?v=08`、日期串或随意递增版本参数" | `sandbox.html`：`?v=fix92`、`?v=kb13`、`?v=v80`、`?v=v77`、`?v=v65`、`?v=v44`…；`tower.js` 内 `?v=20261125e`；`l2.js:308`/`l4.js:146` 仍 `?v=08` | §5.5 的违反面**扩大**。内容哈希改造（Phase 6）需覆盖更多入口 |
| **9** | **`.gitignore` 已扩展** | 前次将 `.codegraph/` 列为"未跟踪目录" | `.gitignore:24-25` 新增 `.codegraph/` | 工作区因此变为干净；`.codegraph/` 不应再被当作待处理项 |
| **10** | **`web/assets/models/` 仍是空目录** | `docs/asset-pipeline.md` 曾建议 `models/<assetId>/` | 仅 `.gitkeep`（D-01 决策已定为保持 `web/assets/<assetId>/`） | 该目录要么删除要么明确保留用途，避免后续误造第三套 |

---

## 9. 尚不能确认的事实与 blocker

### 9.1 尚不能确认（本次只读范围内无法定论）

| # | 未能确认的事实 | 原因 | 建议确认方式 |
|---|---|---|---|
| U1 | 已提交的 `tower.obj/.glb` 由**哪条命令、哪次 Blender 运行**生成 | 仓库无构建日志；`make_tower.py` 默认输出 `tools/out`，只有显式传参才覆盖 `web/assets/tower` | Phase 2 建立 build 元数据后重跑比对 |
| U2 | 浏览器内**实际渲染**的 `THREE.REVISION` | 本阶段未启动浏览器。已用 Node `vm` 求值 = 180 | Phase 5 起在页面内读 `window.__THREE__` 做第三重 |
| U3 | `MiniGLB`（`glb-mini.js`）能否完整正确加载 `tower.glb` | 只读调用点，未执行 | Phase 6 评估（大概率不适用） |
| U4 | `docs/phase-reports/evidence/**` 227 个证据文件是否与当前资产版本一致 | 未逐张比对 | Phase 2 重新生成后标注"取代"关系 |
| U5 | `web/assets/tower/render-overview.png` / `render-cutaway.png` 是否与当前 `tower.obj` 同版本 | 无哈希关联（旧 phase-06 manifest 已失配） | 同 U1 |
| U6 | 本机 Chrome 158 + 集显能否稳定跑 WebGL2 | 未启动浏览器 | Phase 5 跑一次 `fps-probe.cjs` 建立本机基线 |
| U7 | `npm test`（7 个测试文件）当前是否全绿 | 本次未执行，避免测试过程产生临时写入 | 由用户或 Phase 5 授权后执行 |
| U8 | Gitee / GitHub 远端 `main` 的**实时**状态 | 本次未做 `ls-remote`；本地 `origin/main` 已与 HEAD 一致 | 需要时执行 `git ls-remote origin refs/heads/main` |
| U9 | 部署侧（`120.26.198.46` / nginx `v92`）与当前 `main` 是否完全一致 | 不在本次审计范围（无 SSH 授权） | 若需对齐线上，单独授权 |

### 9.2 Blocker（进入对应阶段前必须解决）

| ID | Blocker | 阻断阶段 | 具体事实 | 与前次对比 |
|---|---|---|---|---|
| **B1'** | **`three` / `esbuild` 仍未安装；Playwright / Puppeteer 完全缺失** | Phase 5（E2E）、Phase 6（esbuild + GLTFLoader） | `package.json` 无相关依赖；`node_modules` 无；`npx playwright` 会要求联网安装 | 前次 B1 的**子集解除**（AJV 已装），联网安装授权仍需一次 |
| **B2** | **`tower` 的既有 manifest 完全失效（5/5 哈希不符）** | Phase 2 | 旧 phase-06 manifest 不可作基线 | 未变 |
| **B3'** | **`separator.glb` 发布产物 extras 未回写（0/43）** | Phase 2 | `extrasStatus=pending_rebuild`；CI `strict` 被注释 | **新增**（前次记为 U-1，现确认为阻断 Phase 1 收尾的硬项） |
| **B4** | **Blender 版本已锁定 5.3.0，但历史产物由 4.5 与 5.3 两个版本产出** | Phase 1、2、5 | `tower.glb` 生成器 `v5.3.43`；`separator`/`underground`/`spike` 为 `v4.5.51` | 决策已定（D-02），**复现性仍未建立** |
| **B5** | **无已批准工艺依据（`approved` basis）** | Phase 3 | 仓库无 `basisId`/`reviewStatus` 体系与工艺依据文档；`processBasis` 为空 | 未变。V1.1 §Phase 3 已预置 `draft` 退路，**不得自行补画** |
| **B6'** | **3D 页面全部要求登录，E2E 无可用认证通道** | Phase 5 | `protected-pages.json` 全覆盖；`auth-guard.js` 注入 `sandbox.html`/`tower.html` | **新增**，V1.1 未预见 |
| **B7** | **目标 GPU 性能不可测（`NOT_MEASURED`）** | Phase 10 | 仅集显 + 虚拟显示驱动；VRAM 不可读 | 未变 |

---

## 10. 建议进入下一阶段前必须解决的事项

> **重要**：V1.1 的 "Prompt 01 / Phase 1（资产契约与 Schema）" **已经执行并 PASS**（见 [`phase-01-asset-contract.md`](phase-01-asset-contract.md)）。因此本节按**下一阶段 = Phase 2（L4 语义清单和对象归属）**编排，并保留 V1.1 §8-Phase 2 的原始门禁。

### 10.1 硬前置（4 项，不解决会做错）

1. **先回写 `separator.glb` 的 `extras.petro`（B3'）**
   Phase 1 报告已把它列为"Phase 2 第一件事"。用 `tools/blender/asset_identity_probe.py` 的已验证配方改 `build_separator_hero.py`，重导出、把 `extrasStatus` 改为 `verified`、启用 CI `strict`。
   → 在此之前 `strict` 恒红，`nodeUid ↔ GLTF node` 的映射在发布产物中**始终未被证明**。

2. **给 `make_tower.py` 加稳定身份写入（B2 / §8-7）**
   现有脚本**零** `nodeUid`/`petro` 写入。Phase 2 的门禁是"所有 GLB node 均有唯一 nodeUid；未知节点为 0 或列入 support"——不先补写入，`tower` Manifest 无从生成。
   → 同时须处理 `Exchanger_*_Saddle` 的 3 处 `.001` 重名（根因在 `exchanger()` 内两个支座同名）。

3. **确认 `tower` 重建即同物（B4 / 前次 B3 的剩余部分）**
   锚点回归已修，但**仍无任何一次"重跑脚本 → 产物与已提交资产字节可比对"的记录**。Phase 2 触碰该脚本前必须先建立该闭环，否则每跑一次就漂移。
   → 建议先在 `%TEMP%` 导出一次、与已提交 `tower.obj` 做对象名/面数/包围盒比对，再决定是否覆盖。

4. **为 Phase 2 的 200 个无归属对象定归属规则**
   §3.4 已量化：53/253 绑定，200 个无归属，其中 `Railing_*`/`Post_*`/`Ladder*`/`RundownRack_*`/`BatteryLimit_*` 等属明显支撑或界区件。
   → Phase 2 需先产出"设备 / 系统 / `nonInteractiveSupport`"三分归属表，再谈 Manifest；否则 Manifest 无法满足 Schema 的"未登记节点须列入 `nonInteractiveSupport`"。

### 10.2 建议同期完成（3 项，不阻断但会拖后）

1. **解决 E2E 认证通道（B6'）** —— Phase 5 之前必须有测试账号或 dev 绕过；否则 Playwright 无法进入 `sandbox.html` / `tower.html`。建议现在就把它写入 decisions.md，避免 Phase 5 临时造机制。
2. **更新 `docs/tooling-readiness.md` 的 Chrome 版本**（157 → 158.0.8127.88），并把 Playwright/`node_modules` 现状同步。
3. **裁决 `web/assets/models/` 空目录去留**（D-01 已定 `web/assets/<assetId>/`，该目录与之冲突）。

### 10.3 明确不应在 Phase 2 做的事

- ❌ 不要在 extras 回写前把 `separator.manifest.json` 当"已发布"。
- ❌ 不要用 `gen_pilot_separator_manifest.mjs` 生成 `tower` Manifest（其 `ROLES` 表 separator 专用，会直接抛错，这是有意设计）。
- ❌ 不要在本阶段接 `process-connections.json`（Phase 3）或 GLTFLoader（Phase 6）。
- ❌ 不要改 L3 的 70% 阈值、泵送可选性或进入重置行为（§5.3 的 4 处耦合）。
- ❌ 不要为"画面更像炼厂"增删设备或管线。

---

## 11. 关键文件 SHA-256（基线指纹，前 16 位）

| 文件 | SHA-256（截断） |
|---|---|
| `web/immersion.js` | `1638e68fe2f6b5ab` |
| `web/assets/three.browser.js` | `b6155eab5f769f8f` |
| `web/assets/obj-lite.js` | `13be340b690d145b` |
| `web/levels/l1.js` | `7ed07f7bfd5be196` |
| `web/levels/l2.js` | `15deb5378a5173f2` |
| `web/levels/l3.js` | `44d2c6cc94cbcf79` |
| `web/levels/l4.js` | `432099a2924170d9` |
| `web/levels/l5.js` | `03c454253ac6a91f` |
| `web/levels/entry.js` | `cdc7bc24b2d08924` |
| `web/tower.js` | `145215aa8bc580db` |
| `web/tower.html` | `f49ec5b1f8427660` |
| `web/mission.js` | `eed95de4a4554138` |
| `web/sandbox.html` | `3094f729bf08244f` |
| `web/world/registry.js` | `4db6433ce049d12c` |
| `web/world/state.js` | `a3f21d793b45dee6` |
| `tools/make_tower.py` | `15dc115d6500414f` |
| `tools/make_hero_assets.py` | `e28c6ffe785630f1` |
| `tools/blender/build_separator_hero.py` | `9785ad36e56c1e26` |
| `tools/blender/build_underground_hero.py` | `08496d5dd965d285` |
| `tools/blender/export_glb.py` | `731fae337f7611d3` |
| `tools/blender/asset_identity_probe.py` | `546db8deb12bc1fa` |
| `tools/validate_assets.mjs` | `3f283650b350af73` |
| `tools/gen_pilot_separator_manifest.mjs` | `dc9c188408c049b3` |
| `schemas/asset-manifest.schema.json` | `ca2acf09cf28c0d9` |
| `web/assets/separator/separator.manifest.json` | `8b0d739f3620366d` |
| `package.json` | `a4bec51aeb5cbd46` |
| `package-lock.json` | `82686e79d292684a` |

---

## 12. 结论

### 12.1 PASS / BLOCKED

> ## **PASS**

### 12.2 判定依据

用户设定的 PASS 条件为"只读检查有明确结果，且工作区用户改动得到保护"，逐条满足：

| 条件 | 结果 |
|---|---|
| 只读 Git 检查有明确结果 | ✅ 分支/HEAD/10 条提交/工作区状态/与 `5519ef74` 关系（前进 13 提交、线性祖先）全部实测确认 |
| 三维代码与资产盘点有明确结果 | ✅ 11 类资产逐项定位；4 个 GLB 逐节点解析；L4 覆盖率独立复算 20.9%/79.1% |
| 运行环境能力有明确结果 | ✅ Node/npm/Blender/Chrome/AJV 实测；Playwright/Puppeteer 确认为缺失；THREE.REVISION=180 双重核对 |
| L3 业务规则有明确结果 | ✅ 5/5 全部成立，且阈值 4 处耦合点已定位 |
| 工作区用户改动得到保护 | ✅ 工作区本就干净；stash 未动；被忽略目录未清理；除本报告外零写入 |
| 未 checkout 旧 SHA / 未回滚用户代码 | ✅ 未执行任何写型 git 命令 |

### 12.3 为何不是 BLOCKED

7 项 blocker 中，**没有一项阻断 Phase 0 本身**：

- B2/B3'/B4 阻断的是 **Phase 2**，而 Phase 2 尚未开始，且解决路径明确（回写 extras → 补身份写入 → 建立重建可比对闭环）。
- B1'（`three`/`esbuild`/Playwright 安装）阻断 **Phase 5/6**，属流程性授权问题，需用户开一次安装窗口。
- B5（工艺依据）、B7（目标 GPU）阻断 **Phase 3 / Phase 10**，需领域专家与目标设备，不是工程可自决项。
- B6'（E2E 认证通道）阻断 **Phase 5**，需用户决定测试账号方案。

这些都不影响"把当前 HEAD 冻结为可信基线"这一 Phase 0 目标。

### 12.4 移交 Prompt 02 的一句话摘要

> 基线已冻结在 `b3fd865`（工作区干净）。Phase 1 已 PASS 但 `separator.glb` 的 extras 仍是 `pending_rebuild`（0/43），Phase 2 第一件事是回写 extras 并启用 CI `strict`；`tower` 侧 `make_tower.py` 仍零身份写入、200/253 对象无归属、旧 manifest 5/5 失配——**先补身份写入与归属表，再谈 tower Manifest**；另需注意 3D 页面现已全部要求登录（B6'），Phase 5 的 E2E 必须先解决认证。

---

*本报告是 Phase 00 只读复审计的唯一产出。审计期间（2026-11-27 10:42–10:52）未修改、未删除、未移动、未重命名任何其他仓库文件，未安装依赖，未运行 Blender 构建，未改变任务与三维交互状态。*

*前一份以 `5519ef74` 为基线的报告全文可从 `git show b3fd865:docs/3d-model-optimization/reports/phase-00-baseline.md` 取回；其仍然有效的结论已在本报告 §0.2 中摘要保留。*
