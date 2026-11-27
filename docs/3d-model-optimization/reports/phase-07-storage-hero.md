# Phase 07 · L3 储运 Hero 资产迁移

> 基线 `dev` @ `5c9b61a`。执行 2026-11-27。证据目录 `docs/3d-model-optimization/evidence/phase-07-2026-11-27/`

## 总体结论（分开评级，按要求）

| 维度 | 评级 | 依据 |
|---|---|---|
| **模型资产生成** | **PASS（生成）** / **NOT_RUN（美术验收）** | 三个 GLB 由 `tools/blender/build_storage_heroes.py` 真实生成，88 个 mesh、24,980 三角形，`extras.petro` 100% 覆盖，Manifest strict 5/5 通过；但**未做美术/工程审图**，属教学示意级 |
| **网页集成** | **PASS** | Phase 7 E2E **34/34**；L2/L3/L4 回归 **84/84**；`npm test` 130/130 |
| **泵送路径（要求三/E）** | **BLOCKED** | `process-connections.json` **没有** `conn_store_transfer_to_refinery` 这条连接，`l3.js` 无法"读取 connectionId"绑定到真实管线；已按规则**不绘制任何替代曲线** |

因为 E 无法完成（且不得伪造），本阶段**不能整体标 PASS**：`网页集成 PASS + 泵送连接 BLOCKED + 美术验收 NOT_RUN`。

---

## 一、资产现状检查（先查再动）

| 检查项 | 结论 |
|---|---|
| 总览外浮顶罐 OBJ 可复用吗 | **不可直接复用**。`web/assets/hero/floating_roof_tank` 存在（6,976 tri / 4 mesh），但由 `make_hero_assets.py` 的 `join_by_material()` 合并生成 —— 4 个 mesh 按材质合并，**浮盘不是独立节点**，无法单独随液面动画；且无真实半剖壳 |
| 固定顶罐源文件 | **不存在**（脚本、.blend、GLB 都没有） |
| 外浮顶罐源文件 | 有 `make_hero_assets.py::build_floating_tank()`（程序化，可重跑），但产物是总览级 |
| 泵组源文件 | **不存在**（只有 pumpjack 抽油机，不是转输泵组） |
| Blender 实际构建能力 | **有**。Blender 5.3.0 实测可无头运行；既有 `tools/blender/build_separator_hero.py` 是完整先例（真实半剖壳 `half_shell`、`obj["petro"]` 身份、`export_glb.py` 导出） |
| 来源/许可 | 仓库内脚本生成，无第三方素材；Manifest 记 `LicenseRef-Proprietary`（项目内部） |

结论：**不是"没有 Blender"的 BLOCKED**，而是"缺源资产" → 需要新写建模脚本。已实际完成。

---

## 二、建模：三个独立 Hero（真实产物）

`tools/blender/build_storage_heroes.py`（新增，约 560 行，可重跑）：

| 资产 | mesh | 三角形 | GLB | 关键节点 |
|---|---|---|---|---|
| `storage_fixed_roof_tank` | 35 | 9,880 | 255,248 B | 罐底/罐壁/**真实开口半剖壳**/锥顶/顶缘/呼吸阀+阻火器/进出口法兰/排污/人孔/4 道加强圈/盘梯 |
| `storage_floating_roof_tank` | 26 | 9,956 | 246,800 B | 罐底/罐壁/半剖壳/**独立浮盘**/边缘密封环/3 根导向柱+滚轮/抗风圈/中央排水/人孔 |
| `transfer_pump_set` | 27 | 5,144 | 155,060 B | 撬块底座/蜗壳/吸入口/排出口/轴承箱/**开口联轴器护罩**/电机+散热筋+接线盒+风扇罩/出口阀+手轮/管段/铭牌 |

**真实半剖的做法**（不是隐藏面、不是 clippingPlanes）：`half_tube_z()` 用 `from_pydata` 只生成 `angle0..angle1`（π/2…3π/2）那半圈顶点与面，近侧半圈**几何上不存在**，并带壁厚内壁。`extras.petro` 与 `uuid5` 命名空间沿用 Phase 4 约定，前端才能按 nodeUid 寻址。

**结构声明**（写进 stats → 生成器读）：
- 只有 `shell` 在 external/half 间切换；
- `roof_cone`/`roof_rim`（固定顶）、`wind_girder`（抗风圈）属"始终可见的结构"，半剖时**不能跟着罐壁消失** —— 这是第一版真实踩到的 bug（见 §五.1）。

Manifest：`tools/gen_storage_manifest.mjs`（新增）。它**不手写 nodeUid**：从 GLB 的 `extras.petro.nodeUid` 读，再用 JS 侧重算 `uuid5` **逐节点比对**，不一致直接失败。3 个 Manifest 全 strict 通过。

---

## 三、L3 前端改造

`web/levels/l3.js` 重写（564 → 约 700 行）：

- **资产走 ModelLoader**：三个 GLB 经 `window.ModelLoader.load()`，带字节/sha256 绑定 + `extras↔Manifest` 双向对账。实测 fixed 35/35、floating 26/26 全部 reconciled。
- **油面仍是本关动态对象**：半径由 Manifest `bounds` 推导（无魔法数），高度按液位缩放。第一版是整圈圆柱 → 把真实半剖开口挡住了（看起来像实心桶），已改为**与剖切同侧的半圆柱**（`thetaStart=π/2, thetaLength=π`，带半圆盖）。
- **浮盘总成**：按 Manifest `role ∈ {floating_deck, rim_seal}` + `guide_roller*` 收进 `deck_assembly` 组，整组按油面平移；位移 = 目标 Z − 锚点原始 Z。**固定顶罐没有该总成，`roof_cone` 位移恒为 0**（E2E 实测 `roofY:0`）。
- **两罐结构独立**：`applyStructure(key, mode)` 只作用于一个罐；`#l3-cut` 按钮只切"当前选中的罐"。E2E 验证 fixed=ghost 时 floating 仍 half。
- **结构一致性**：每个网格**克隆材质**再改（Phase 6 教训：GLB 材质共享，逐网格改会互相覆盖）。
- **泵送**：只认 `PETRO_CONNECTIONS.get('conn_store_transfer_to_refinery')`。未登记 → `routeInfo={routeSource:'unregistered', status:'blocked', pipe:null}`，**不建管线、不造 CatmullRom**，UI 明写「连接 conn_store_transfer_to_refinery 未登记（不绘制替代管线）」。原来那条自建 4 点 CatmullRom 已删除。
- **资产失败**：明确加徽标「⚠ 储运 HG 资产未加载」，不静默用方块冒充。

**业务规则零改动**（逐条对照）：

| 规则 | 实现位置 | 状态 |
|---|---|---|
| 70% 完成任务 | `slider` input → `if (level>=0.70 && !completed) complete()` | 未改（阈值仍 0.70） |
| 泵送是可选，不是完成前置 | `complete()` 不读 `pumpRunning` | 未改；E2E 在泵停止状态下完成任务 |
| 不要求先访问两种罐 | `observedTanks` 从不参与完成判定 | 未改；E2E 实测算到完成时 `floating_roof_tank:false` |
| 每次进入重置 2%/停泵/取消暂停/清完成/默认固定顶 | `enter()` 前 6 行 | 未改；E2E B 断言全项 |
| 任务重置清除节点完成状态 | `stage.setNodeDone(2, true)` + `mission.reset()`（未触碰） | 未改 |

---

## 四、验收 E2E（`tools/e2e/run-phase7.mjs`，34/34）

| 项 | 断言 | 实测 |
|---|---|---|
| A 任务 | 69% 未完成 → 70% 完成；全程泵未启动 | ✅ `completed:false→true`，`pumpRunning:false` |
| A 可选性 | 完成不依赖泵、不要求看两罐 | ✅ `observed.floating=false` 时仍完成 |
| B 重进 | 2% / 泵停 / 取消暂停 / 清完成 / 默认固定顶 | ✅ `level 0.02, slider "2", pumpRunning false, completed false, selected fixed_roof_tank` |
| C 模型 | 10/50/90% 油面；固定顶不动；浮盘贴液面 | ✅ `deckY === oilTop` 三次全部 **diff 0**；`roofY:0` 恒定 |
| D 结构 | external/half 身份正确、不穿模、ghost 半透明、互不影响 | ✅ half: `shell.visible=false` 且 `shell_cut.visible=true`；ghost `opacity 0.28`；fixed 切 half 后 floating 仍 external |
| E 泵送 | 绑定 connectionId；未登记不建替代管线；可独立启停 | ✅ `connectionId` 正确、`pipe:null`、`status:blocked`；启停正常 |
| F 隔离 | fixed/floating/pump 状态互不影响 | ✅ `fixed:'ghost'` + `floating:'half'` 并存；选择与 aria-pressed 同步 |

回归：`run-levels` **84/84**（L2 32 · L4 19 · L3 33）、`npm test` **130/130**、`validate:assets:strict` **5/5**、`validate:connections:strict` 仍 exit 1（Phase 3 的 B5 未被本阶段绕过）。

---

## 五、过程中发现并修掉的真实缺陷

1. **固定顶被剖切一并隐藏**：第一版把 `roof_cone/roof_rim` 放进 `showExternal`，半剖时顶没了 —— 看起来像没顶的罐。改为"始终可见"。这是 E2E 断言按**身份**（而非数量）比较后才暴露的：两种模式都隐藏 3 个节点，数量相同（32 vs 32），计数断言完全看不出来。
2. **半剖被整圈油面挡住**：油面是 360° 不透明圆柱，把真实开口遮死，视觉上像实心橙桶。改为同侧半圆柱。
3. **deviceState 写入依赖资产加载**：`applyLevel()` 原本在 `tanks[key]` 存在时才写 `level`，GLB 未就绪时读到 0 —— 这是**行为时序回归**（`run-levels` 立刻报 `min:0.7 actual:0`）。解耦为与资产无关地无条件写。
4. **`handle.anchors.liquid` 不存在**：ModelLoader 的锚点接口是 `indices.anchors.get(id)`，写错导致运行时 TypeError。
5. **取景出框**：罐体 6m 高、7.2m 直径，原相机位置会切掉罐顶。

---

## 六、禁止项自查

| 禁止 | 是否触犯 |
|---|---|
| 改 70% 阈值 | 否（`0.70` 原样） |
| 改泵送可选规则 | 否（`complete()` 不读泵状态） |
| 改每次进入 2% 重置 | 否（`enter()` 前 6 行原样） |
| 删掉原有任务回归测试 | 否（`run-levels` L3 33 条全保留并全过） |
| 用程序化方块冒充精模 | 否：三个 GLB 都是脚本真实几何（含真实开口半剖壳）；`l3.js` 不再建程序化罐体，失败时显式报错而非降级冒充 |
| 创建空 GLB | 否：255KB/247KB/155KB，88 mesh，24,980 tri |
| `l3.js` 另写 CatmullRom | 否：原自建曲线已删除，只在连接登记后才用注册表曲线 |

---

## 七、NOT_RUN / BLOCKED

- **BLOCKED｜泵送跨装置管线**：`process-connections.json` 只有 1 条 L4 连接；`conn_store_transfer_to_refinery` 未登记，且全仓无 approved 工艺依据（`decisions.md:25`）。补登需要：①storage 坐标系下的装卸/送出锚点；②经审的工艺路径。本阶段**不伪造**，因此"终点与总览一致"无法验证。
- **NOT_RUN｜美术/工程审图**：三个 Hero 是教学示意级组合体（管件、法兰、筋板均为示意），未做工程图纸核对、未做视觉走查确认。
- **NOT_RUN｜GPU 性能**：本机集显 + headless SwiftShader，帧率不可信。
- **NOT_RUN｜录屏**：本阶段只产出 4 张截图（external/half/ghost @90%、half @60%），无视频。
- **未迁移**：总览 `floating_roof_tank` 旧 OBJ 资产保持原样（不替换总览，避免一次性全站切换）。

---

## 八、可复现命令

```bash
blender -b -P tools/blender/build_storage_heroes.py   # 重建 3 个 GLB + .blend
npm run gen:storage                                   # 重建 3 个 Manifest（含 uuid5 交叉校验）
npm run validate:assets:strict                        # 5/5
npm run test:e2e:storage                              # Phase 7 A–F，34/34
node tools/e2e/run-levels.mjs                         # L2/L3/L4，84/84
npm run verify                                        # 单测 130/130 + 契约
```
