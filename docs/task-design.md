# Phase 02 · 任务探索系统（返修版）

日期：2026-11-22
主任务：**《批次 YJ-001：把一批教学示意原油送到城市》**
用户角色：能源探索员 / 石油工业探索见习员（不做积分、等级、排行榜）

> 本版修正审查报告 P1-01（批次语义/节点）、P1-02（数量口径）、P1-03（馏分表）、P1-05（分流目的地）、P1-06（教学参数边界）与核心主题三（探索型任务）。

## 1. 冻结口径

| 项 | 定义 |
|---|---|
| 主任务 | 1 个：批次 YJ-001 交付 |
| 既有关卡/任务段 | **5 个**：l1–l5，全部保留，不另起一套 |
| 具体操作步骤 | **6 个**：T1–T6；T1/T2 共用 l1 |
| 前置/复盘 | T0 接单前置；T7 交付复盘；不计入 6 个操作步骤 |
| 知识章 | **5 枚**（l1–l5）；T0/T7 只记状态，不单独计章 |
| Hero Moments | 3 个：HM-1 地下 / HM-2 分离 / HM-3 塔 |
| 任务类型 | 主线 + 自主探索 + 观察 + 判断 + 隐藏发现；不是纯线性闯关 |
| 状态字段 | `batch.node`、`task.step`、`task.status`、`interaction`、`history` **五个分离字段** |

## 2. 任务结构

| 类型 | 目的 | 示例 | 限制 |
|---|---|---|---|
| 主线 | 保证产业链基础完整 | T0–T7 | 保持科学主线连贯，不暗示唯一真实物流 |
| 自主探索 | 按兴趣选择设备/区域 | 自由打开分离器/储罐/塔内部 | 不强制顺序，不因未做主线而惩罚 |
| 观察 | 发现设备细节 | 找出分离器三个出口；找出塔的侧线 | 必须有可见线索和场景对象 |
| 判断 | 验证原理理解 | 判断馏分所属塔段/可能去向 | 不脱离三维场景做纯答题 |
| 隐藏发现 | 鼓励重复探索 | 发现分离器内部堰板/塔的降液管 | 不制造错误工艺/虚构功能 |

主线可完成；用户也可离开主线自由探索并返回；自主/隐藏任务不改变专业事实。

## 3. T0–T7 任务规格

> 每个任务含：目标 → 前置 → 线索 → 动作 → 状态变化 → 可观察结果 → 成功/失败 → 知识解释 → 重试/跳过 → 复位。批次牌只沿管线外侧教学轨迹移动，不进入设备内部。

### T0 接单：批次牌

- 目标：确认批次 YJ-001，建立探索档案。
- 前置：无。
- 线索：井口旁的黄铜批次牌；底部“待接收”；设备列表“批次 YJ-001”。
- 动作：点批次牌 / Enter；`batch.accept`。
- 状态变化：`task.status='active'`、`task.step='T0'`、`stamps=['accept']`；**`batch.node` 保持 `reservoir`**（牌只是标记，不是物料位置）。
- 可观察结果：牌被提起、盖“接收”章；路线从井口向地面延伸一段；档案打开。
- 成功/失败：成功为点击确认；点空白提示“先找到那枚牌”，不扣分。
- 知识解释：这批原油来自地下储层，接下来先看它怎么到井底/井口。
- 重试/跳过：可直接自由探索；档案保留。
- 复位：无需；可重新点。
- 知识 ID：`kb_formation`（档案引导）。

### T1 地下：让油动起来（对应 l1）

- 目标：理解压差驱动的油向井底运移；知道教学控制值不是真实压力。
- 前置：T0 完成。
- 线索：岩芯孔隙油点、井筒、滑块“压差驱动示意（非真实压力值）”。
- 动作：拖控制值 0–100；`subsurface.setDrive`；可切地层/放大储层（`subsurface.revealLayer`、`subsurface.zoomReservoir`）。
- 状态变化：油向井底粒子加速；批次牌沿井筒外侧上升；`batch.node='wellbore'`（达到 30% 流动后）；`interaction={actionId:'subsurface.setDrive', value, unit:'演示控制值'}`。
- 可观察结果：油点流动、速度变化、牌到井筒、提示“油开始向井底方向运移”。
- 成功：控制值 ≥90（教学完成阈值）且至少看到一次流动变化；T1 完成。
- 失败/边界：<30 提示“孔隙里的油还没动”；不报错；≥90 时提示“这是示意，不代表真实井底压力/采收率”。
- 知识解释：压差是驱动力之一；真实采收率受储层/开发条件影响。
- 重试/跳过：可重来本段；可跳过到 T2（档案记“跳过”）。
- 复位：控制值回 0，粒子回初始；保留章。
- 知识 ID：`kb_formation`、`kb_drill`。

### T2 井口：接入地面（共用 l1）

- 目标：把教学批次从井筒接到井口，再送入集输。
- 前置：T1 完成或跳过。
- 线索：井口采油树、阀组、管线方向；设备卡“打开阀组”。
- 动作：点阀组 → 点“接入集输”；`wellhead.openValve`。
- 状态变化：`batch.node='wellhead'` → `'separator'`；阀组微动；批次牌沿管线外侧到分离器。
- 可观察结果：阀组动作、管线出现流动、牌到分离器、章“已举升”。
- 成功：`batch.node='separator'`；T2 完成。
- 失败：未接单开阀提示“先接收批次再开阀”；不扣进度。
- 知识解释：井筒连接储层与地面；井口控制流体进入集输。
- 重试/跳过：可关阀重来；可跳过。
- 复位：阀组关闭，回井口；保留章。
- 知识 ID：`kb_drill`。

### T3 分离：三路去向（对应 l2，含分支）

- 目标：剖开分离器，认清气/油/水三出口；为气选择回收/火炬；油去储运、水去水处理。
- 前置：T2 完成或跳过。
- 线索：三出口、颜色/文字标签、设备卡“剖开”；水处理终点在集输区东侧。
- 动作：`separator.cut`（半剖/全剖）→ `separator.run` → `separator.setGasRoute('recovery'|'flare')` → `separator.assignPhase`（油→罐、水→水处理）。
- 状态变化：内部挡板/堰板/三出口显现；气/油/水三条路径分开；`batch.node='oil_to_storage'`（仅油相主线）；气/水有独立路径节点，不推批次牌。
- 可观察结果：回收→燃料气管线；火炬→受控火焰；水→可见水处理池/罐；油→储罐；错误出口回流并给原因。
- 成功：气明确去向 + 油入罐 + 水入水处理；三路都完成。
- 失败：气进油罐“气不能进常压油罐”，回流；油进水罐同理；可改选。
- 知识解释：按相态/密度分离，不是过滤；火炬是安全泄放，回收优先；不估算排放。
- 重试/跳过：可重来本段；可跳过。
- 复位：合上分离器，清空本段分流；保留章；`choices.gasRoute` 可保留显示。
- 知识 ID：`kb_gather`。
- 目的地 ID：`gas_recovery_header`（非交互终点，集输区北侧）、`flare_stack`（非交互远景，炼化区，阶段 06）、`produced_water_treatment`（非交互终点，集输区东侧）、`oil_to_storage`（路径，终点为所选罐）。

### T4 储运：选罐型（对应 l3，含分支）

- 目标：为批次选择储罐，理解浮顶/固定顶的油气空间差异。
- 前置：T3 完成或跳过。
- 线索：两个罐、浮盘、液位滑块、防火堤。
- 动作：`tank.selectType('floating'|'fixed')` → `tank.setLevel(0–100)` → `tank.confirm`。
- 状态变化：`batch.node='tank'`；所选罐高亮；批次牌到罐区外侧（不进罐内）；`choices.tankType` 记录。
- 可观察结果：浮盘随液位；固定顶油气空间变化；罐选择与解释不同。
- 成功：选罐 + 至少一次液位变化 + 确认；两种罐型都可成功，但解释不同。
- 失败：不选罐确认提示“先选一个罐”；液位极端只提示边界。
- 知识解释：浮顶减少油气空间，但损耗受密封/附件/维护影响；固定顶需要呼吸阀/油气处理，不是不能用。
- 重试/跳过：可重选；可跳过。
- 复位：液位回 2%，罐选择清空；保留章。
- 知识 ID：`kb_store`。

### T5 炼化：分馏与路线（对应 l4，含分支）

- 目标：把批次送入常压塔，识别五种馏分，查看全剖，选择燃料/材料重点。
- 前置：T4 完成或跳过。
- 线索：加热炉、常压塔、侧线、塔板、五种馏分卡。
- 动作：`refinery.feed` → `tower.cut('half'|'full')` → `tower.run` → `tower.placeFraction(fractionId, position)` → `tower.setPriority('fuel'|'material')`。
- 状态变化：`batch.node='refinery_feed'` → `'fraction_split'`；半剖/全剖；侧线高亮；`choices.cutPriority` 记录。
- 可观察结果：全剖见塔板/降液管/侧线/汽液粒子；馏分放置正确/错误反馈；不同重点下游管线不同。
- 成功：五种馏分全对 + 全剖至少查看一次 + 选一个重点；T5 完成。
- 失败：馏分放错弹回 + “更轻的在上”；不扣分。
- 知识解释：按沸点范围切馏分；馏分≠成品油；后续裂化/重整/加氢/调和；不编造收率。
- 重试/跳过：可重放馏分；可跳过。
- 复位：清空馏分，回进塔前；保留罐型/气路线。
- 知识 ID：`kb_refine`。

### T6 城市：交付与应用（对应 l5，含分支）

- 目标：把五个馏分/产品匹配到城市应用，完成交付。
- 前置：T5 完成或跳过。
- 线索：城市街区、加油站、材料台、产品卡。
- 动作：`city.assignProduct(fractionId, applicationId)` → `city.setPriority('fuel'|'material')` → `batch.deliver`。
- 状态变化：`batch.node='city'` → `'delivered'`；正确配对盖章；错误退回；城市权重变化；`choices.productSet` 记录。
- 可观察结果：正确配对/错误原因；城市灯光/材料权重；批次牌到交付箱；最后一章。
- 成功：5 个配对正确 + 一次重点选择 + 交付；T6 完成。
- 失败：塑料配“只能来自石油”错误；提示可能来自天然气/煤基/生物基；不扣分。
- 知识解释：燃料/材料/路面来自不同路线；同一批原油可不同重点；模型为典型示意，非唯一工艺路线。
- 重试/跳过：可重配；可跳过。
- 复位：清空配对，保留炼化选择。
- 知识 ID：`kb_use`。

### T7 交付复盘

- 目标：回顾路线、选择、知识；形成“能源探索档案”。
- 前置：五段章齐全（T0 接单 + T1–T6 五段；跳过段不计章但记录跳过）。
- 动作：`archive.review` → 点“完成交付”/“再走一次”/“自由探索”/“看塔”/“问 AI”。
- 状态变化：`task.status='complete'`；`batch.node='delivered'`；`task.step='T7'`。
- 可观察结果：路线图、5 枚知识章、3 个选择、用时、发现清单；不是积分。
- 成功：档案生成；允许导出/生成材料（可选，依赖 API 时标注预置稿）。
- 失败：缺章时提示“还差哪一段”，不强制顺序。
- 知识解释：回顾每段一句边界；明确示意。
- 复位：可“重走”清批次/选择，保留知识浏览。
- 知识 ID：全部 5 个 + `kb_formation` 引导。

## 4. T0–T7 映射表

| 步骤 | levelId | zoneId | stageId | 主要 objectId | knowledgeId | 操作 actionId |
|---|---|---|---|---|---|---|
| T0 | — | oilfield | drill | batch token（非设备） | kb_formation | `batch.accept` |
| T1 | l1 | subsurface | drill | wellbore、pumpjack | kb_formation/kb_drill | `subsurface.setDrive` |
| T2 | l1 | oilfield | drill | wellhead | kb_drill | `wellhead.openValve` |
| T3 | l2 | gathering | gather | three_phase_separator | kb_gather | `separator.cut/run/setGasRoute/assignPhase` |
| T4 | l3 | storage | store | fixed_roof_tank/floating_roof_tank | kb_store | `tank.selectType/setLevel/confirm` |
| T5 | l4 | refining | refine | atmospheric_tower/vacuum_tower/heater | kb_refine | `tower.cut/run/placeFraction/setPriority` |
| T6 | l5 | city | use | fuel_dispenser/plastic_bottle/fiber_spool/lubricant_can/asphalt_slab | kb_use | `city.assignProduct/setPriority/batch.deliver` |
| T7 | — | city | use | archive（非设备） | 全部 | `archive.review` |

## 5. 五种馏分与终端应用

### 常压塔五种馏分（与现有 l4 对齐，不新增未核验对象）

| fractionId | 显示名 | 塔段/出口 | 教学解释 | 后续路线（示意） |
|---|---|---|---|---|
| `topgas` | 塔顶油气 | 塔顶气相 | 最轻，塔顶 | 燃料气/轻烃回收或安全泄放 |
| `naphtha` | 石脑油馏分 | 上部侧线 | 较轻 | 重整/乙烯裂解/化工原料 |
| `kerosene` | 煤油馏分 | 中部侧线 | 中等 | 航空煤油/煤油调和 |
| `diesel` | 柴油馏分 | 下部侧线 | 较重 | 柴油加氢/调和 |
| `residue` | 常压渣油 | 塔底 | 最重 | 减压蒸馏/重质利用/沥青原料 |

- 五种是**馏分**，不是成品油；不显示收率/比例。
- 减压塔若展示，另标“减压馏分/减压渣油”，不复用上述 ID；当前 l4 未把减压产物作为拖拽对象，阶段 06 若增加必须先核验资产/代码。
- 常压渣油可进减压塔，但不得说“常压塔直接产出所有成品”。

### 终端应用（典型示意，非唯一路线）

| applicationId | 对象 | 可能上游 | 备注 |
|---|---|---|---|
| `app_gasoline` | 汽油 | 石脑油/重整/催化汽油调和 | 不显示辛烷值/收率 |
| `app_diesel` | 柴油 | 柴油馏分加氢/调和 | 不显示收率 |
| `app_jet` | 航空煤油 | 煤油馏分精制/调和 | 不显示收率 |
| `app_asphalt` | 沥青 | 减压渣油等重质组分 | 道路/建筑 |
| `app_plastic` | 塑料制品 | 石脑油→乙烯/丙烯→聚合物；也可能天然气/煤基/生物基 | 不得说“一定来自石油” |
| `app_fiber` | 合成纤维 | 石化单体→聚合物→纤维；其他原料也可能 | 具体品种决定路线 |
| `app_lubricant` | 润滑油 | 适合馏分精制/调配/添加剂 | 不是单一馏分直接可用 |
| `app_wax` | 石蜡 | 适合馏分脱蜡/精制 | 非唯一路线 |

>T6 拖拽对象是“馏分/产品”的教学卡，不等于常压塔直接产出成品；文案始终提示“馏分≠成品油”。

## 6. 动作契约

统一模板：

```text
actionId | objectId | 前置条件 | 输入方式 | 状态变化 | 视觉反馈 | 知识解释 | 错误处理 | 复位
```

| actionId | 前置 | 输入 | 状态变化 | 视觉反馈 | 错误/复位 |
|---|---|---|---|---|---|
| `batch.accept` | 无 | 点牌/Enter | task.active，stamp | 牌提起/盖章 | 点空白提示 |
| `subsurface.setDrive` | T0 | 滑块 | interaction，batch.node | 油点加速/牌上移 | <30 提示；恢复 0 |
| `wellhead.openValve` | T1/T0 | 点阀组 | batch.node=wellhead/separator | 阀动/管线流 | 未接单提示 |
| `separator.cut` | T2 | 按钮 | 结构维度 half/full | 内部显现 | 合上复位 |
| `separator.setGasRoute` | 剖开 | 选择 | choices.gasRoute | 气网/火炬 | 可改选 |
| `separator.assignPhase` | 运行 | 点出口+终点 | 三路状态 | 路径/回流 | 错误回流 |
| `tank.selectType` | T3 | 点罐 | choices.tankType | 罐高亮 | 未选提示 |
| `tank.setLevel` | 选罐 | 滑块 | 液位 | 浮盘/空间 | 边界提示 |
| `tower.cut` | T4 | 按钮 | 结构维度 | 半/全剖 | 合壳复位 |
| `tower.placeFraction` | 全剖 | 拖拽 | 放置状态 | 吸附/弹回 | 错误弹回 |
| `tower.setPriority` | 全正确 | 选择 | choices.cutPriority | 侧线/下游 | 可改选 |
| `city.assignProduct` | T5 | 拖拽 | 配对状态 | 盖章/弹回 | 错误原因 |
| `batch.deliver` | 五章 | 按钮 | batch.node=delivered | 最后一章/路线 | 缺章提示 |

## 7. 状态分离与会话

| 字段 | 含义 | 示例 | 生命周期 |
|---|---|---|---|
| `batch.node` | 教学批次标记当前追踪节点 | `reservoir`/`wellbore`/`wellhead`/`separator`/`oil_to_storage`/`tank`/`refinery_feed`/`fraction_split`/`city`/`delivered` | 新批次重置 |
| `task.step` | 当前操作步骤 | `T0`..`T7` | 单次探索 |
| `task.status` | 任务总体状态 | `idle/active/help/error/complete` | 单次探索 |
| `interaction` | 最近一次用户操作及结果 | `{actionId, objectId, value, result}` | 每次动作更新 |
| `history` | 最近操作/知识记录 | 最近 8–12 条 | 会话 |
| `exploration` | 已访问区域/设备/知识 | 数组 | 会话 |

- 新批次/展厅下一位用户：清空 batch/task/interaction/history；保留匿名偏好（音量/减少动态）另存。
- 退出再进：sessionStorage 恢复 batch/task/exploration；不保存 API Key、个人数据。
- 跳过段：`task.status` 记录 skipped，不伪造完成章；复盘明确标注。

## 8. 分级提示

| 级别 | 触发 | 内容 | 泄题？ |
|---|---|---|---|
| L1 | 15s 无操作/错 1 次 | “先看看当前设备/滑块” | 否 |
| L2 | 错 2 次/30s | “气比油轻；浮盘贴液面；沸点低的在上” | 否 |
| L3 | 错 3 次/45s | 高亮正确对象 3s | 不自动执行 |

提示次数记 `task.hintLevel`，复盘显示“用过 N 次提示”，不扣分。

## 9. 失败/重试/复位与复盘

- 失败是可解释边界，不是游戏结束；错误不扣分、不清章。
- 每段“重来本段”；整单“重置批次”（清批次/选择/进度，保留知识浏览）。
- 复盘：路线、5 知识章、3 选择、跳过/提示次数、发现清单；无积分/排名。
- 缺章可补；不强制顺序；可自由探索后回来继续。

## 10. 验收

- T0–T7 可完成；5 关全部映射且不另起系统；
- 至少 3 个 Hero Moments 有非纯答题任务；
- 批次/任务/交互/历史分离，无共用字段；
- 五种馏分与终端应用表被任务、知识卡、AI 上下文一致引用；
- 分流目的地都有可见终点（交互或非交互）；
- 控制值命名不冒充真实压力；
- 无 API 仍可完成任务，AI 明确不可用；
- 所有数值只作为教学控制/示意，不编造工程数据。
