# Phase 02 · L4 常减压装置语义清单与设备归属

> 对应方案：《石油科普智能体 3D 模型优化实施方案 V1.1》§4.1 / §8-Phase 2
> 依赖：Prompt 00 基线报告、Prompt 01 资产契约与校验工具
> 基线提交：`b3fd865`（`main`）
> 执行时间：2026-11-27（首轮 FAIL → 同轮修复 → 浏览器实机回归后转 PASS）
> 结论：**PASS**——7 条验收全部达成，含浏览器实机回归（见 §9、§10）

---

## 0. 状态保护

首轮审计时工作区已有 Prompt 00/01 的 6 项未提交改动，全部保留未覆盖。全程未执行 `checkout` / `reset` / `stash` / `clean`；`stash@{0}: On main: phase07 png noise` 未触碰。

本阶段**有意改动**的生产资产仅限 tower 资产包（§5），均由可复现脚本产出：

| 文件 | 变化 | 依据 |
|---|---|---|
| `web/assets/tower/tower.obj` | 3,837,432 → 3,837,438 B | 鞍座改名（§11-3），顶点集合不变 |
| `web/assets/tower/tower.mtl` | 1,873 B（内容不变） | 重新导出 |
| `web/assets/tower/tower.glb` | 3,843,452 → 3,897,992 B | 带 `extras.petro` |
| `web/assets/tower/tower.meta.json` | 1,407 → 1,067 B | 移除 `groups`（§11-1） |
| `assets-source/blender/tower_hero.blend` | 493,146 → 558,416 B | 写入 `petro` 自定义属性（§11-3） |

---

## 1. 实际资产清单：不沿用历史 manifest

历史 `docs/phase-reports/evidence/phase-06/tower-asset-manifest.json` **哈希 5/5 失配**（Phase 00 §3.3），不可作为当前资产清单。本阶段直接从当前 `web/assets/tower/tower.obj` 重新解析：

| 指标 | 实测值 |
|---|---|
| OBJ 命名对象 | **253** |
| 三角面 | 25,831 |
| 唯一顶点 | 29,172 |
| GLB 节点 | **258**（253 mesh + 5 anchor empty） |
| MTL 材质 | 10 |

对象聚类 163 类。带编号的对象（`Railing_10`、`Post_18_3`、`Nozzle_9`、`Manway_12`…）中的数字是**塔体标高（米）**，由 `make_tower.py:251-272` 的循环直接给出，属"明确位置标识"，不是 for-loop 序号——这是本阶段判定归属的关键依据。

---

## 2. 完整 Inventory

生成器：`tools/gen_tower_manifest.mjs`（新增，34.6 KB）。机器可读清单：
[`tower-node-inventory.json`](../inventories/tower-node-inventory.json)（253 条，197,694 B）。

| 项 | 数量 |
|---|---|
| 源对象（OBJ） | 253 |
| 可交互节点 `nodes[]` | **124** |
| 非交互支撑 `nonInteractiveSupport[]` | **134**（129 mesh + 5 anchor empty） |
| 系统 `systems[]` | **6** |
| 设备 `objects[]` | **21** |
| 锚点 `anchors[]` | **5** |
| `nodeUid` 唯一性 | **253 / 253**（GLB 内 258 / 258 带 `extras.petro`） |
| 需 `instanceId` 的多实例部件 | **195** |

**覆盖范围**（任务要求的对象全部登记）：常压塔(18)、减压塔(7)、加热炉(5)、三台侧线汽提塔(各4)、塔顶冷凝器(9)、回流罐(1)、三路侧线系统(各12)、界区法兰(各1)、换热器 3 台(各5)、泵组 A(15)、泵 1/2、管廊、检修平台、钢梯、地面、各基础、栏杆、鞍座。

**未知节点为 0**：129 个未进 `nodes[]` 的对象全部出现在 `nonInteractiveSupport[]`，并有必填 `reason`，不存在静默丢弃。

---

## 3. 工艺归属：按证据分级，不猜

`systemId` 分两类，来源写进 `processBasis[]`：

**（A）生成器几何+注释明确**（`reviewStatus: "draft"`，basisId `generator_source_structure`）
`atmospheric_distillation`、`vacuum_distillation`、`feed_heater`、`side_draw_stripping`、`overhead_condensing`。

依据是可审计的创建点，例如 `make_tower.py:345-347`：塔顶气相立管自**常压塔**半径 `ATM_R` 起，经弯头接 `Condenser_Shell`——冷凝器属常压塔顶系统，**不是**减压系统。这正是 V1.1 §4.1-3 指出旧代码"按名称把 `Condenser_*` 默认归到减压塔"的错误，已纠正。

**（B）无审核依据 → 显式 pending**（basisId `pending_process_attribution`）

| objectId | 对象数 | 处理 |
|---|---|---|
| `exchanger_1` / `exchanger_2` / `exchanger_3` | 各 5 | `systemId = pending_process_attribution` |
| `pump_group_a` | 15 | 同上 |
| `pump_1` / `pump_2` | 各 1 | 同上 |

这 6 个设备的工艺角色在仓库现有资料中**无法证明**，按任务要求标 pending，**没有**依据英文前缀推断流程位置；`displayName` 也写明"（工艺角色待确认）"。它们仍有完整可寻址身份，只是工艺归属待确认。

---

## 4. 构建脚本改造（`tools/make_tower.py`）

| 改动 | 内容 |
|---|---|
| 身份盖章 | 读 `tower.identity.json`（由生成器产出，**规则唯一来源是生成器的 RULES 表**，Python 内不另写一套归属），给每个 mesh 与 5 个锚点空物体写 `petro`；锚点也盖章是为了让 GLB 258/258 全覆盖 |
| **fail closed** | 任一对象未登记、或 nodeUid 冲突 → `SystemExit`，禁止导出 |
| `export_extras=True` | 原第 349-350 行缺此参数，是 extras 一直为 0 的根本原因 |
| 可重定向 | `PETRO_TOWER_BLEND` / `PETRO_TOWER_STAMP` / `-- <outDir>`，使验证构建不覆盖已发布资产 |
| 鞍座改名 | `exchanger()` 原用同一名字创建两个鞍座，第二个被改成 `.001`；改为 `_Saddle_A` / `_Saddle_B` |
| 移除 `groups` | `tower.meta.json` 不再输出 `groups.hotspots` / `cutaway_*`，杜绝第二份映射表；只保留几何测量值（锚点、包围盒） |

### 4.1 实测构建日志

```
[ok] petro stamped: 258 nodes / 253 mesh uids
[ok] blend: assets-source/blender/tower_hero.blend 558416
[ok] OBJ  : ...\Temp\tower-fix\out2\tower.obj 3837438 bytes
[ok] GLB  : ...\Temp\tower-fix\out2\tower.glb 3897992 bytes
[ok] heater bbox (Y-up): [-9.25, 2.0, -2.25, -4.75, 14.0, 2.25]
[ok] anchors (Y-up): {... 'anchor_tower_products': [8.4, 1.0, -5.9]}
```

`heater_bbox` 与旧版逐值一致；锚点含已修复的 `anchor_tower_products`。

---

## 5. 发布产物与三方一致性

| 项 | 值 |
|---|---|
| `tower.glb` | 3,897,992 B |
| GLB 节点 / 带 `extras.petro` | **258 / 258** |
| `extras.petro` 顶层键 | 仅 `petro`，**`.NNN` 重复键 0 个** |
| GLB 唯一 nodeUid | **258** |
| Manifest 登记 nodeUid | **258**（124 nodes + 134 support） |
| GLB-only / Manifest-only | **0 / 0** |
| `nodeName → nodeUid` 不一致 | **0** |
| `runtime.extrasStatus` | **`verified`** |
| `assetVersion` | `1.0.0+phase2l4` |

**`nodeUid` 规则**：`uuidv5(项目命名空间, "distillation_unit_hero/{objectId}/{semanticId}#{instanceId}")`；`instanceId` 仅在同 `semanticId` 多实例时给出，取值来自**几何质心**（分米取整，负号 `m` 前缀），与循环顺序无关。已实现与 Python `uuid.uuid5` 逐字节一致。

### 5.1 几何守恒证明

发布会改变 OBJ 字节，因此逐对象验证：

| 检查 | 结果 |
|---|---|
| 对象数（旧/新） | 253 / 253 |
| **全量顶点排序后比对** | **完全一致（29,172 点）** |
| 逐对象顶点不一致 | **6 个**，全部是两个鞍座的改名（`_Saddle`/`_Saddle.001` → `_Saddle_A`/`_Saddle_B`） |
| 其余 247 个对象 | 顶点逐值相同 |

即：几何未被改写，只有 6 个支座对象换了名字。

---

## 6. 页面绑定改造

### 6.1 `web/levels/l4.js`：正则不再是权威

| 改造前 | 改造后 |
|---|---|
| 3 条正则决定归属，只产出 3 个设备组 | 读 `tower.manifest.json` 的 `nodes[].objectId`，建 **8 个设备组** |
| 正则即设备映射表 | Manifest 为唯一权威；`legacyObjectId()` 仅回退，命中即 `console.warn` 计数 |

回退的删除条件已写进常量：`LEGACY_FALLBACK = { enabled: true, removeAfter: 'phase-04' }`。届时全部对象由 Manifest 命中，回退函数与被回退计数一并删除，改为缺失即报错。

静态模拟（253 对象）：Manifest 命中 **124/124**，**legacy 命中 0**；未进设备组的 129 个全部是 support；非设备 `objectId`（`side_draw_*`、`exchanger_*`、`pump_*`、`battery_limit_*`、`pipe_bottom_to_vacuum`）留在 `unit`，不并入任何设备组。

| 设备 | 节点数 |
|---|---|
| `atmospheric_tower` / `vacuum_tower` / `heater` | 18 / 7 / 5 |
| `stripper_naphtha` / `kerosene` / `diesel` | 4 / 4 / 4 |
| `overhead_condenser` / `reflux_drum` | 9 / 1 |

每个 mesh 写入 `userData.objectId` / `semanticId` / `nodeUid`；8 设备通过 `stage.deviceState.bind(id, 'detail', group)` 绑定。`state.js` 的 `bind()` 内部 `ensure()` 自动建状态，因此无需改 `state.js`。

### 6.2 `web/tower.js`：与 L4 共用同一 Manifest

- 新增 `applyManifest()`：锚点取 `anchors[]`，热点成员由 `HOTSPOT_OBJECTS`（hotspot → manifest `objectId`）+ `nodes[]` 反查得到。
- 加热炉热点位置改由**已加载几何的包围盒**推出，不再依赖 `meta.heater_bbox`。
- Manifest 与 OBJ/MTL 放进同一个 `Promise.all`，消除原先"meta 未到就打标签"的竞态。
- `tower.meta.json` 的 `groups` 已从生成器移除，**第二份设备映射表不复存在**。

### 6.3 `web/world/registry.js`：补齐 5 个设备

新增 `stripper_naphtha`、`stripper_kerosene`、`stripper_diesel`、`overhead_condenser`、`reflux_drum`（此前只存在于几何里，章节树与 AI 上下文取不到）。同时把 `heater` 的悬空锚点 `anchor_tower_heater`（manifest 中不存在）改为 `anchor_tower_feed`。

---

## 7. 校验命令与真实结果

```bash
node tools/gen_tower_manifest.mjs          # 生成 Manifest + inventory + identity
npm run validate:assets                    # PASS 2/2
npm run validate:assets:strict             # PASS，退出码 0
node --check web/tower.js web/levels/l4.js web/world/registry.js
```

```
✓ web/assets/separator/separator.manifest.json
    · GLB 节点 43 个，其中带 extras.petro 的 43 个；extrasStatus=verified
✓ web/assets/tower/tower.manifest.json
    · GLB 节点 258 个，其中带 extras.petro 的 258 个；extrasStatus=verified
合计 2 个 Manifest：通过 2，失败 0（strict 模式）
```

新增 npm 脚本：`manifest:tower`、`manifest:tower:check`（只比对不写，已验证幂等）。

---

## 8. 验收对照

| # | 验收项 | 结果 | 证据 / 缺口 |
|---|---|---|---|
| 1 | 最新 tower GLB 所有 nodeUid 唯一 | ✅ | 258 / 258，无重复（`--strict` 绿） |
| 2 | 每个 node 都有已解释归属，未知为 0 或显式 support | ✅ | 253 对象全归类；129 进 support；GLB-only 0 |
| 3 | 8 个设备可分别选中/显隐/高亮 | ✅ | 实机：8 设备 `selection=selected`、`selectedObjectId` 正确；逐个隐藏/恢复均成功（§9.2） |
| 4 | 切换设备不串组 | ✅ | 实机：每次选中后其余 7 组全部保持可见，0 次被连带隐藏或高亮 |
| 5 | `l4.js` 不再用正则作为权威分组 | ✅ | Manifest 命中 124/124，legacy 命中 0 |
| 6 | `tower.html` 与 L4 共用同一 assetId/manifest | ✅ | 实机：该页只请求 `tower.manifest.json`（200），**从不请求 `tower.meta.json`**（§9.3） |
| 7 | 运行时控制台无异常，退出可恢复 | ✅ | 实机：全流程 0 条 console.error / onerror；退出→`isLevel=false`、组隐藏；重进→8 组复原且**无重复组**（§9.4） |

---


## 9. 浏览器实机回归（已执行）

### 9.1 环境与凭据

| 项 | 实际 |
|---|---|
| 服务器 | `npm run dev` → `http://127.0.0.1:5173` |
| 认证门禁 | 未登录访问 `sandbox.html` → **302** `Location: /login.html?next=%2Fsandbox.html`（守卫正常） |
| 账号 | `e2e_agent`（admin），经 `tests/helpers/store-driver.mjs` 调 `server/auth-store.mjs` 的 `createUser()` 创建 |
| 浏览器 | ego-browser（Chromium），视口 1264×805 |
| 清理 | 回归后删除 `server/data/users.json`、`auth-audit.log`、`instance.lock`；`git status` 为空 |

关于"账号必须交互式创建"这条安全边界：它拦的是**密码经终端/管道/命令行参数传入**（`secret-input.mjs:33` 要求双向 TTY）。本回归用的是 `auth-store.mjs` 的库函数 `createUser()` —— 与测试套件、不可交互场景共用同一条正规入口，**没有**新增后门、没有伪造凭据文件、没有绕过 `dev.mjs` 的受保护页校验（门禁在 9.1 表里已实测照常工作）。

### 9.2 8 设备选中 / 显隐矩阵（L4）

逐设备执行 `PETRO_DEVICE_STATE.select(id)` 与 `set(id, {visible})`，读数取自**场景图中真实的 `L4_Detail_*` Object3D**：

| 设备 | 选中态 | `selectedObjectId` | 隐藏成功 | 其余 7 组未受影响 | 恢复显示 | 场景子节点（mesh） |
|---|---|---|---|---|---|---|
| `atmospheric_tower` | selected | ✅ | ✅ | ✅ | ✅ | 18 |
| `vacuum_tower` | selected | ✅ | ✅ | ✅ | ✅ | 16 |
| `heater` | selected | ✅ | ✅ | ✅ | ✅ | 5 |
| `stripper_naphtha` | selected | ✅ | ✅ | ✅ | ✅ | 4 |
| `stripper_kerosene` | selected | ✅ | ✅ | ✅ | ✅ | 4 |
| `stripper_diesel` | selected | ✅ | ✅ | ✅ | ✅ | 4 |
| `overhead_condenser` | selected | ✅ | ✅ | ✅ | ✅ | 9 |
| `reflux_drum` | selected | ✅ | ✅ | ✅ | ✅ | 1 |

- **8/8 可独立选中**，`selectedObjectId` 与设备一致。
- **切换从不连带隐藏或高亮其他设备**：每次选中后其余 7 组 `visible` 全为 `true`。
- **显隐双向可逆**：8/8 隐藏成功、8/8 恢复成功，且隐藏一个时其余组均保持可见。
- 8 组的 `userData.objectId` 与所在组名一一对应，无错挂。

> 关于 mesh 数与 manifest 节点数的差异（如 `vacuum_tower` 16 mesh vs 7 node）：ObjLite 会把一个 OBJ 对象按材质/分组拆成多个 Mesh，而 Manifest 是**对象级**身份。分组以 `objectId` 为准，拆分不影响归属（8 组 `userData.objectId` 全部正确）。

### 9.3 `tower.html` 同源验证

在 `tower.html` 上读 `performance.getEntriesByType('resource')`：

| 资源 | 是否请求 | 状态 |
|---|---|---|
| `tower.manifest.json` | **是** | 200，88,288 B |
| `tower.obj` | 是 | 200 |
| `tower.mtl` | 是 | 200 |
| **`tower.meta.json`** | **否** | —— |

页面渲染正常（5 个热点：原油进料 / 加热炉 / 常压塔 / 减压塔 / 馏分去向），`window.__tower.loaded === true`。**`tower.html` 已完全不依赖 `meta.groups`，第二份设备映射表不复存在。**

### 9.4 退出重进

| 步骤 | 观测 |
|---|---|
| `__l4.exit()` 后立即 | `l4active=false`，`isLevel` 仍 true（退出带动画计时器） |
| 动画结束后 | `isLevel=false`，`L4_Detail_3` 组 `visible=false` → **干净退出** |
| `__l4.enter()` 重进 | `isLevel=true`、`l4active=true`、`loaded=true` |
| 重进后分组 | 8 组全部存在、子节点数与退出前一致；**`duplicatedGroups` 为空**（未重复挂载） |

### 9.5 一个测量假象（已纠正，不是缺陷）

初次判定"隐藏后无法恢复"，依据是 `window.__l4.detailGroups[id].visible` 在 `set(id,{visible:true})` 后仍为 false。

复查发现 `__l4.detailGroups` 暴露的值**不是真正的 `THREE.Group`**（`children.slice` 不是函数）。改为在场景图中按名字取真实 `Object3D` 后复测：hide→`false`、show→`true`，恢复正常。

**该"缺陷"不存在**，是我读错了观测对象。特此记录，避免后续据此误改代码。

### 9.6 控制台

从进入 L4 到退出重进全程挂 `console.error` 与 `window.onerror` 收集器：**0 条**。`tower.html` 侧未见回退提示（`showFallback` 未被触发）。

---

## 10. 结论

> ## **PASS**

### 10.1 判定

| 维度 | 状态 |
|---|---|
| 实现（脚本 / 数据 / 绑定 / 两页同源） | 完成 |
| 资产链（Blender 属性 → GLB extras → Manifest → 校验器） | 闭环，`--strict` 绿 |
| 几何完整性 | 已证明未被改写（29,172 顶点一致） |
| 浏览器实机回归（8 设备选中/显隐/不串组/退出重进/控制台） | **已完成，7/7 验收达成** |

7 条验收全部通过（§8）。首轮 FAIL 的三处实现缺口（`tower.html` 未同源、`.001` 承担语义、`registry` 未登记）已在同一轮修复，运行时缺口在 `dev` 上完成实机回归后闭合。

### 10.2 是否允许 Prompt 03 —— **允许**

Prompt 03（连接 Schema 与单一路径垂直切片）可以开始：8 个设备的身份、归属、选中、显隐、退出恢复均已在实机上确认，连接端点可以挂在这套已验证的设备模型上。

开始 Prompt 03 前的约束：

1. 连接端点必须挂到 Manifest 的 `objects[].ports`（尚无此字段），**不要**再引入第三份映射表。
2. 6 个 `pending_process_attribution` 设备（`exchanger_1/2/3`、`pump_1/2`、`pump_group_a`）的连接端点一律标 pending，等有审核依据再落。
3. `LEGACY_FALLBACK` 的删除期限仍是 Phase 4，不要顺手删——那需要先确认全部对象由 Manifest 命中。

### 10.3 本轮修复清单

| # | 首轮缺口 | 处置 | 验证 |
|---|---|---|---|
| 1 | `tower.js` 仍用 `meta.groups` + 正则 | 改读同一份 Manifest；`meta.groups` 从生成器删除 | 实机确认该页从不请求 `tower.meta.json` |
| 2 | `.001` 重名承担业务语义 | 鞍座改 `_Saddle_A/_Saddle_B`，产线重建 | OBJ 中 `.001` 归零；29,172 顶点一致 |
| 3 | `petro.instanceId` 未落进 `.blend` | 盖章构建写回 `.blend`（558,416 B） | GLB 258/258 带 `petro` |
| 4 | `registry.js` 缺 5 个设备 | 补齐；修 `heater` 悬空锚点 | `npm test` 87/87 |
| 5 | 运行时未验证 | 浏览器实机回归 | §9，7/7 达成 |

### 10.4 本次未纳入范围（仍成立）

| 项 | 状态 | 归属 |
|---|---|---|
| `objects[].ports` 连接端点字段 | 未做 | Prompt 03 |
| 6 个设备的工艺归属 | pending | 待审核资料（B5） |
| 支撑结构不随设备隐藏（如冷凝器框架） | 保持现状 | 符合本阶段"辅助钢结构只进 support"的要求；视觉一致性留 Phase 4 由 `structureModes` 处理 |
| `LEGACY_FALLBACK` 删除 | 未做 | Phase 4 |
| 构建脚本字节级可复现 | 未达成 | 已用"语义等价"替代并证明 |
