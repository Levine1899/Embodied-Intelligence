# 炼化体验 · 常减压装置

日期：2026-11-23  
范围：`l4`、`atmospheric_tower`、`vacuum_tower`、`heater`、`tower.obj` 装置群。  
说明：教学示意，不是真实炼厂总平面、CFD、操作参数或工程塔设计。

## 1. 空间与设备群

`l4` 在 `refining` 区复用 `web/assets/tower/tower.obj`，同一装置群包含：

- 常压塔、减压塔；
- 加热炉及烟囱；
- 塔板/泡罩/降液板；
- 平台/栏杆、梯子、人孔/法兰/接管；
- 侧线管线、塔顶冷凝器、塔底连接、产品箱、泵组；
- 3 台卧式管壳式换热器与鞍座/接管；
- 3 台泵组、电机、底座与阀门手轮；
- 三跨管廊/管架与多层工艺管线；
- 地坪上的设备基础、保温带与直梯横档。

视觉中心是常压塔；常压塔和减压塔并置，并带换热器组、泵组、管廊、平台和基础，形成装置群，不是孤立塔柱。资产当前 151 个 Mesh / 27,054 三角面。

## 2. 同一逻辑设备

| 项 | 值 |
|---|---|
| stage / zone | `refine` / `refining` |
| 主 objectId | `atmospheric_tower` |
| 相关 objectId | `vacuum_tower`、`heater` |
| 近景表示 | `web/levels/l4.js` 加载的 `tower.obj` 装置群 |
| 总览表示 | `atm_tower_overview` / `vac_tower_overview` / `heater_overview` |
| state source | `PETRO_DEVICE_STATE`：`structure`、`animation`、`selection` |
| 关键 anchors | `anchor_tower_feed`、`anchor_tower_trays`、`anchor_tower_vacuum`、`anchor_tower_products` |
| 知识 | `kb_refine` |

进入近景选择 `atmospheric_tower`；退出恢复总览上下文，但不清掉已观察的模型状态。

## 3. 三档剖切

| 状态 | 可见结构 | 不可见/弱化 |
|---|---|---|
| 外观 | 完整常压/减压壳体、封头、平台、梯子、外部管线 | 半壳、塔板隐藏 |
| 半剖 | 半壳/半封头、塔板/泡罩/降液板 | 完整壳隐藏 |
| 全剖 | 半壳弱化、塔板可见、汽液教学粒子、进料/侧线路径 | 完整壳隐藏 |

切换按钮、`aria-pressed`、`PETRO_DEVICE_STATE`、相机距离和提示同步；模型加载完成后显式调用 `setLevel(0)`。

## 4. 统一设备互动矩阵

### 4.1 塔体三档剖切

| 字段 | 内容 |
|---|---|
| `objectId` | `atmospheric_tower`（同时同步 `vacuum_tower` structure） |
| 初始状态 | 外观；完整壳体、封头；内部隐藏 |
| 用户动作 | 点“外观 / 半剖 / 全剖” |
| 前置条件 | 装置 Hero 已加载；无互斥 |
| 状态变化 | `structure=external/half/full`；完整壳 4 件、半壳 4 件、塔板 2 组显隐 |
| 可观察反馈 | 半剖露出塔板；全剖进一步弱化半壳并露出汽液粒子 |
| 知识解释 | 塔板让上升油气与下降回流液反复接触；按沸点范围分出馏分 |
| 错误/边界反馈 | 仅 0/1/2 三态；加载失败时提示 fallback，不伪装加载成功 |
| 重置/恢复 | “恢复外观”回 0；“外观”按钮直接恢复 |
| 可访问替代 | 三个真实 HTML 按钮，带 `aria-pressed` |
| AI 上下文 | `sceneId/stageId=refine/zoneId=refining/objectId=atmospheric_tower/interaction.actionId=inspect_tower_structure` |
| 验收证据 | `phase06-01/02/03`、`phase06-verify.json`、录屏 00:00–00:20 |

### 4.2 进料位置

| 字段 | 内容 |
|---|---|
| `objectId` | `atmospheric_tower`；减压进料关联 `vacuum_tower` |
| 初始状态 | 两条进料路径都隐藏 |
| 用户动作 | 点“常压进料”或“减压进料” |
| 前置条件 | Hero 已加载 |
| 状态变化 | 对应路径 Group visible；另一条隐藏；`interaction=choose_feed_position` |
| 可观察反馈 | 加热炉→常压塔中部，或常压塔底→减压塔入口的橙色路径 |
| 知识解释 | 原油先加热/部分汽化，再进塔；减压塔降低沸点，避免高温裂解 |
| 错误/边界反馈 | 不是真实炉管/操作参数；路径为教学示意 |
| 重置/恢复 | “恢复外观”隐藏两条路径 |
| 可访问替代 | 两个 HTML 按钮 |
| AI 上下文 | `actionId=choose_feed_position`，value=常压塔中部/减压塔入口 |
| 验收证据 | `phase06-03` 进料路径；`phase06-verify.json` |

### 4.3 汽液接触

| 字段 | 内容 |
|---|---|
| `objectId` | `atmospheric_tower` |
| 初始状态 | 汽液教学粒子隐藏，animation=idle |
| 用户动作 | 启动/暂停/继续汽液；重播 |
| 前置条件 | 至少半剖；全剖时最清楚 |
| 状态变化 | animation=running/paused/idle；粒子位置推进/冻结 |
| 可观察反馈 | 青色汽相上升、琥珀液相下降；暂停时冻结；重播回起点 |
| 知识解释 | 汽液在塔板上逆流接触，轻组分上升、重组分下降；不是 CFD |
| 错误/边界反馈 | 不显示温度/压力/流量/塔板效率 |
| 重置/恢复 | “恢复外观”关闭并清空路径/粒子状态 |
| 可访问替代 | HTML 按钮 |
| AI 上下文 | `start_vapor_liquid/pause_vapor_liquid/resume_vapor_liquid/replay_refining_flow` |
| 验收证据 | `phase06-03`；`phase06-verify.json.paused`；录屏 |

### 4.4 塔板结构

| 字段 | 内容 |
|---|---|
| `objectId` | `atmospheric_tower` |
| 初始状态 | 塔板隐藏，仅外观壳体 |
| 用户动作 | 半剖/全剖；点“塔板结构” |
| 前置条件 | 半剖或全剖 |
| 状态变化 | 塔板/泡罩/降液板可见；塔板高亮环显示 |
| 可观察反馈 | 16 层常压塔板、9 层减压塔板（教学简化） |
| 知识解释 | 塔板提供汽液接触面积；降液板让液体逐层下降 |
| 错误/边界反馈 | 不宣称精确塔板数/尺寸/工艺参数 |
| 重置/恢复 | 恢复外观隐藏塔板 |
| 可访问替代 | HTML 按钮 + 状态说明 |
| AI 上下文 | `inspect_tower_trays` |
| 验收证据 | `phase06-02`、`phase06-03` |

### 4.5 五馏分与后续路线

| 字段 | 内容 |
|---|---|
| `objectId` | `atmospheric_tower` + `anchor_tower_products` |
| 初始状态 | 未选择馏分；侧线路径隐藏 |
| 用户动作 | 点塔顶油气、石脑油、煤油、柴油、常压渣油 |
| 前置条件 | 任一剖切状态 |
| 状态变化 | 对应侧线路径显示；其他路径隐藏；note 显示去向 |
| 可观察反馈 | 塔顶/上/中/下/塔底五条教学路径；对应颜色和去向 |
| 知识解释 | 常压蒸馏按沸点范围分离；五者都是**馏分**，不是最终成品油 |
| 错误/边界反馈 | 路线标“典型示意”，不暗示唯一工艺；不编造收率 |
| 重置/恢复 | 恢复外观清空；重选馏分替换路径 |
| 可访问替代 | 五个真实 HTML 按钮 |
| AI 上下文 | `select_fraction` |
| 验收证据 | `phase06-03` 柴油；录屏中切换油气/柴油；`phase06-verify.json.full` |

## 5. 科学表达

- 常压蒸馏按沸点范围初步分离：塔顶油气、石脑油馏分、煤油馏分、柴油馏分、常压渣油。
- 馏分不是汽油/柴油/航煤等最终产品；后续可能裂化、重整、加氢、精制、调和。
- 常压渣油可进减压蒸馏；减压降低沸点，避免高温裂解。
- 本页不提供真实压力、温度、处理量、塔板效率或收率。
- 塑料/合成纤维原料不必然来自石油；产品路线为典型示意。

## 6. 运行入口

- **canonical detail**：`sandbox.html#stage=3` → `web/levels/l4.js`，加载 `tower.obj`，绑定 `atmospheric_tower` 与 `PETRO_DEVICE_STATE`。
- **overview**：`immersion.js` 使用 `tower.obj` 的低细节/LOD 表示；为性能过滤部分辅助 Mesh，不代表详情页缺失。
- **兼容页**：`tower.html` 保留旧入口、热点和 2D fallback；加载 `world/state.js` 后在页面内读写 `PETRO_DEVICE_STATE`（atmospheric_tower/vacuum_tower 的 structure），并提供全剖、启动/暂停/重播汽液控制；页面间不做持久化，不冒充与 l4 共享相机状态。canonical 详情仍是 l4。

## 7. 已知限制

- `.blend` 是可编辑导入源；生成器仍是 `tools/make_tower.py`，不是完整参数化 `.blend` 历史。
- 装置群资产是教学模型，不是工程总平面；管线/平台/设备比例简化。
- 5 个球形 3D 语义热点 + HTML 按钮；不是所有 Mesh 都可点，深层部件仍靠按钮/标签。
- 未执行 FPS/内存、跨浏览器、N=5 用户测试。
