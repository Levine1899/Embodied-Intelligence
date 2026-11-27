# Phase 04 · L2 三相分离器结构模式（external / half / ghost）

> 对应方案：《石油科学智能体 3D 模型优化实施方案 V1.1》§Phase 4
> 依赖：Phase 1 资产 Manifest（separator）、Phase 0 资产盘点
> 基线提交：`dev` @ `e0930cb`
> 执行时间：2026-11-27

---

## 结论：**PASS**

三态语义真实、可重复、可自动验收；半剖由**真实切割几何**实现，不再用"整壳调透明"冒充。

| 模式 | 实现方式 | 违规数 |
|---|---|---|
| external | 完整壳不透明，半剖壳/封边/内部件隐藏 | 0 |
| half | **完整壳隐藏**，真半剖壳 + 切面封边不透明显示，内部件显示 | 0 |
| ghost | 完整壳与两个封头降为 0.16 半透明、不写深度，内部件不透明显示 | 0 |
| full | **不提供**（资产无完整全剖表示，见 §4） | — |

连续切换 20 轮 × 3 模式 = 60 次：**0 失败**。

---

## 1. 资产几何实测：`separator_cut_*` 是真半剖，不是命名占位

先测量再改代码（避免"看名字下结论"）：

| 对象 | 顶点 | 面 | bbox (min → max) | 判定 |
|---|---:|---:|---|---|
| `separator_shell` | 96 | 50 | `[-3.00, 1.10, -1.00] → [3.00, 3.10, 1.00]` | 完整壳，跨切面两侧 |
| `separator_cut_shell` | 58 | **28** | `[-3.02, 1.09, **0.00**] → [3.02, 3.11, 1.01]` | **真半壳**：z ≥ 0 一侧，面数约为完整壳一半 |
| `separator_cut_edge_top` | 20 | 12 | `y≈3.08–3.13, z≈±0.03, x 全长` | 切面处上壁封边（真实面片） |
| `separator_cut_edge_bottom` | 20 | 12 | `y≈1.07–1.12, z≈±0.03, x 全长` | 切面处下壁封边 |
| `separator_cutaway_rim` | 576 | 576 | `x≈±0.03, y 1.06–3.14, z ±1.04` | x=0 处环形切口边条 |

**剖切方向**：沿 `z = 0` 平面（水平圆柱的竖直中剖面）切开，保留 z ≥ 0 半边。
**封边**：切面与薄壁相交得到上下两条矩形条带，与几何一致，不是缺面。

结论：**资产无需重建**。问题 100% 在 `l2.js`。

---

## 2. 原实现的三个错误

`web/levels/l2.js` 改造前：

```js
let structMode = false;                       // ← 布尔，只有开/关

m.material.transparent = structMode;
m.material.opacity = structMode ? 0.10 : 1;   // ← 把完整壳调到 10% 冒充半剖
m.material.depthWrite = !structMode;

cutShell.forEach(m => { m.visible = false; }); // ← 真半剖壳永远隐藏
/* Use a ghost shell in the web view… The exported half shell remains in the .blend. */
```

1. **布尔二态**：external 与一个混合体（10% 透明整壳 + 内部件），没有真正 half，也没有 ghost。
2. **真半剖壳被永久隐藏**——注释还写着"保留在 .blend 里"，等于承认网页端没有实现。
3. **分类靠对象名前缀**（`indexOf('separator_cut_')` 等），与 Manifest 已声明的 `structureModes` 脱节。

---

## 3. 改造：Manifest 驱动的显式状态机

### 3.1 单一权威

`separator.manifest.json` 里**已经**声明了 `structureModes`，按 `nodeUid` 给出 show / hide / ghost 三个列表。改造后前端只消费它，不再有任何名称匹配：

```js
Promise.all([ ObjLite.load(OBJ), fetch(separator.manifest.json) ]) …
  var rec = nameToNode[o.name];        // 名字只用来把 OBJ 网格对上 Manifest 节点
  o.userData.nodeUid  = rec.nodeUid;   // 之后一切按 nodeUid
  o.userData.semanticId = rec.semanticId;
  o.userData.role = rec.role;
  if (rec.role === 'cut_shell' || rec.role === 'cut_edge') cutShell.push(o);
  if (String(rec.role || '').indexOf('internal_') === 0)   internalMeshes.push(o);
```

`internal_*` 是 Manifest 的 **role 分类**（`internal_fluid` / `internal_weir` / `internal_baffle` / `internal_distributor` / `internal_port` / `internal_mist` / `internal_vortex_breaker`，共 19 件），不是对象名匹配。

### 3.2 `setStructureMode(mode)` 是唯一入口

统一控制：

| 受控项 | 做法 |
|---|---|
| 壳体 / 半剖壳 / 封边 / 封头 | 按 `show` / `hide` / `ghost` 逐 nodeUid 设置 `visible` |
| 内部油水气层 / 挡板 / 堰板 / 除雾器 | 同上；内部气层额外保留既有 0.42 半透明 |
| 材质 | 显示件 `transparent=false, opacity=1, depthWrite=true, side=FrontSide, renderOrder=0`；ghost 件 `transparent=true, opacity=0.16, depthWrite=false, side=DoubleSide, renderOrder=2` |
| 切口边条 | `renderOrder=1`，半剖时不被内部件遮挡错 |
| 内部标签 | 仅 half / ghost 显示 |
| Flow tube 与粒子 | 仅 half / ghost 显示；粒子仍受 `runningSep || pausedSep` 约束 |
| deviceState | `structure: structureMode`（不再是 `structMode ? 'half' : 'external'`） |
| 交互记录 | `stage.setInteraction('inspect_separator_structure', mode, '示意')` |
| UI | 三个按钮 `data-structure` 的 `aria-pressed` + 提示文案随模式变化 |

模式判定收敛到一个函数，避免两处判定漂移：

```js
function internalsVisible() { return structureMode === 'half' || structureMode === 'ghost'; }
```

### 3.3 UI

原来的单按钮"打开内部结构"（一个布尔开关）改为三按钮组：`外观 / 半剖 / 透视`，`aria-pressed` 互斥。

### 3.4 退出与重进

```js
function exit() { … if (assetLoaded) setStructureMode('external', false); … }
function enter() { … if (assetLoaded) setStructureMode('external', false); … }
```

退出时复位并恢复 overview 模型；重进从 external 起步。

---

## 4. `full` 模式：不提供，但按契约保留空声明

方案要求"full 仅当资产确实有完整全剖表示时提供，否则不要虚构"。

实测：资产只有**完整壳**与**单侧（z≥0）半剖壳**，不存在完整全剖表示。

但 `schemas/asset-manifest.schema.json:362` **强制要求** `structureModes` 含 `full` 键，其说明为：

> full 若资产不支持，可将三个数组留空并在 limitations 说明。

因此正确处理是"**保留空 full + 在 limitations 说明**"，而不是删键：

```json
"full": { "show": [], "hide": [], "ghost": [] }
```

并在生成器 `tools/gen_pilot_separator_manifest.mjs` 的 `limitations` 追加说明（已重新生成 Manifest，limitations 5 → 6 条）：

> structureModes.full 的 show/hide/ghost 三个数组为空：本资产只有完整壳…不存在完整全剖表示，因此不提供 full 模式。Phase 4 只实现 external/half/ghost 三态。

前端对这一模式的显式行为（不会静默变成"全部可见"）：

```js
if (mode === 'full') {
  console.warn('[L2] 本资产没有完整全剖表示，不支持 full 模式（见 manifest limitations）');
  return structureMode;   // 保持当前模式不变
}
```

---

## 5. 验收实测（真实浏览器，登录后进 L2）

`window.__l2.structureProbe()` 是随代码提交的调试断言：对每个 nodeUid 比对"Manifest 期望可见性"与"实际可见性"，并检查材质（不透明件不得 transparent / 不得关 depthWrite；ghost 件必须半透明且不写深度）。

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | external：完整壳不透明、内部隐藏 | ✅ | 0 违规；`separator_shell v=true op=1 tr=false dw=true`，`cut_shell / internal_* v=false` |
| 2 | half：看到壳体切面与内部结构，不允许 ghost 代替 | ✅ | 0 违规；`separator_shell v=false`、`cut_shell v=true op=1`、封边 `v=true op=1`、内部件 `v=true` |
| 3 | ghost：完整壳透明、内部可见 | ✅ | 0 违规；`shell/head_left/head_right op=0.16 tr=true dw=false`，内部件 `op=1` |
| 4 | 连续切换 20 次无残留 | ✅ | **60 次切换，0 失败**（每次都跑完整断言） |
| 5 | 退出再进入回到默认 | ✅ | 退出前设为 half → 退出后 `structureMode=external` → 重进 `external` |
| 6 | 点击气/油/水出口上下文一致 | ✅ | `selectedObjectId=three_phase_separator`、`deviceName=三相分离器`、`interaction.action=choose_outlet`、`value=oil`；出口按钮单选（pressedCount=1） |
| 7 | 调试断言检查 structureMode 与关键节点可见性 | ✅ | `__l2.structureProbe()`；另加 CI 契约测试 10/10 |
| 8 | 三张真实网页截图 | ✅ | `phase04-l2-external.png` / `phase04-l2-half.png` / `phase04-l2-ghost.png` |

### 5.1 三态关键节点实测

```
external : separator_shell v=true op=1     | cut_shell v=false | internal_water v=false | internal_gas v=false
half     : separator_shell v=false         | cut_shell v=true op=1 | cut_edge_top v=true op=1 | internal_oil v=true op=1 | internal_gas v=true op=0.42
ghost    : separator_shell v=true op=0.16  | cut_shell v=false | internal_oil v=true op=1 | internal_gas v=true op=0.42
```

### 5.2 `full` 拒绝验证

```
before='ghost' → setStructureMode('full') → after='ghost'（rejected=true）
```

---

## 6. 自动化：新增契约回归测试

`tests/l2-structure.test.mjs`（10 项，进入 `npm test`，CI 可跑，无需浏览器）：

1. `structureModes` 四个键齐全，`full` 三数组为空且 limitations 有说明；
2. 三态引用的 nodeUid 都存在，且同一模式内 show / hide 不重叠；
3. external 显示完整壳、隐藏半剖壳与内部件；
4. half 隐藏完整壳、显示真半剖壳 + 两个封边 + 切口边条 + 5 类内部件；
   `half.ghost` 恰为左右封头（设计为半透明，不是"用 ghost 冒充半剖"）；
5. ghost 把完整壳列入半透明、隐藏半剖壳、显示内部件；
6. **资产层面证明半剖是真的**：解析 OBJ，断言 `cut_shell.f < shell.f`、`cut_shell.min.z >= -0.05`（不越过切面）、完整壳跨越切面、两封边面数 > 0 且贴合切面；
7. `l2.js` 使用 `STRUCTURE_MODES` / `setStructureMode`，且**不再出现** `structMode` 与 `applyStructure`；
8. 显隐由 `separatorManifest.structureModes` 驱动，不再用 `indexOf('separator_cut_')` / `indexOf('separator_internal')===0` 之类的名称前缀；
9. 三个结构按钮与 `structure: structureMode` 写入；
10. exit / enter 均复位 external。

第 6 项是关键回归护栏：若有人把半剖壳换成完整壳或删掉它，测试直接失败。

---

## 7. 命令

```bash
node tools/gen_pilot_separator_manifest.mjs     # 重新生成 Manifest（limitations 已更新）
node --test tests/l2-structure.test.mjs         # 10/10
npm test                                        # 97/97（原 87 + 新 10）
npm run dev                                     # 127.0.0.1:5173
```

---

## 8. 未做 / 已知限制

| 项 | 说明 |
|---|---|
| `full` 模式 | 不实现。资产无完整全剖几何；如需，必须重建资产（本阶段禁止重建 L3/L4/L5 资产，separator 属 L2 但无全剖需求）。 |
| half 下封头半透明 | 这是 Manifest 的既有设计（`half.ghost` = 左右封头），让视线穿过两端看到内部；如评审认为应改为隐藏，改 Manifest 即可，前端无需动。 |
| ghost 下切口封边仍不透明 | Manifest `ghost.hide` 只含 `cut_shell`，未含封边。视觉上会有两条薄片。属 Manifest 设计问题，建议 Phase 5 一并决定，本阶段不擅自改。 |
| separator GLB 的 `extras.petro` | 既有 `limitations` 记录 `extrasStatus=pending_rebuild`，与本次改动无关，未处理。 |
| 粒子/Flow tube 工艺依据 | 沿用既有 "示意" 标注；未接 Phase 3 连接数据（分离器内部三相路径不属已建连接）。 |
| 性能 | 未测（本机仅集显），不在本阶段范围。 |

---

## 9. 禁止项自查

| 禁止 | 是否触犯 |
|---|---|
| 改写分离器真实工艺关系 | 否。未新增/删除任何物流关系，出口与内部件语义未变。 |
| 删除内部件以减少遮挡而不留依据 | 否。内部件一件未删（19 件按 role 归类），仅按 Manifest 显隐。 |
| 把透明壳命名成 half | 否。half 走真半剖壳 + 封边（不透明）；透明只出现在 ghost。 |
| 同时进行 L3/L4/L5 资产重建 | 否。仅改 l2.js、separator Manifest（重新生成）、生成器 limitations、测试。tower 资产未动。 |
