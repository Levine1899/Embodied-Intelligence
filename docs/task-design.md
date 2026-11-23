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
| 前置/复盘 | T0 接单前置；T7 交付与复盘；不计入 6 个操作步骤 |
| 知识章 | **5 枚**（l1–l5）；T0/T7 只记状态，不单独计章 |
| Hero Moments | 3 个：HM-1 地下 / HM-2 分离 / HM-3 塔 |
| 任务类型 | 主线 + 自主探索 + 观察 + 判断 + 隐藏发现；不是纯线性闯关 |
| 状态字段 | 以 §7 canonical schema 为准：`batch`、`task`（含 `steps/knowledgeStamps/processStamps/choices/hintLevel/discoveries`）、`interaction`、`history`、`exploration`；不共用一个字段 |

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
- 状态变化：`task.status='active'`、`task.step='T0'`、`task.processStamps=['accept']`；**`batch.node` 保持 `reservoir`**（牌只是标记，不是物料位置）。`accept` 是流程标记，不计入五枚知识章。
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
- 状态变化：油向井底粒子加速；批次牌沿井筒外侧上升；`batch.node='wellbore'`（达到 30% 流动后）；T1 成功时 `batch.node='wellhead'`（牌到井口）；`interaction={actionId:'subsurface.setDrive', value, unit:'演示控制值'}`。
- 可观察结果：油点流动、速度变化、牌到井筒、提示“油开始向井底方向运移”。
- 成功：控制值 ≥90（教学完成阈值）且至少看到一次流动变化；T1 完成，`batch.node='wellhead'`。
- 失败/边界：<30 提示“孔隙里的油还没动”；不报错；≥90 时提示“这是示意，不代表真实井底压力/采收率”。
- 知识解释：压差是驱动力之一；真实采收率受储层/开发条件影响。
- 重试/跳过：可重来本段；可跳过到 T2：`task.steps.T1.status='skipped'`，`batch.node='wellhead'`（直接落到井口），**不发 l1 知识章**，档案记“跳过”。
- 复位：控制值回 0，粒子回初始；保留章。
- 知识 ID：`kb_formation`、`kb_drill`。

### T2 井口：接入地面（共用 l1）

- 目标：把教学批次从井筒接到井口，再送入集输。
- 前置：T1 完成或跳过，且 `batch.node='wellhead'`。
- 线索：井口采油树、阀组、管线方向；设备卡“打开阀组”。
- 动作：点阀组 → 点“接入集输”；`wellhead.openValve`。
- 状态变化：从 `batch.node='wellhead'` 开始 → 成功转 `'separator'`；阀组微动；批次牌沿管线外侧到分离器。
- 可观察结果：阀组动作、管线出现流动、牌到分离器、章“已举升”。
- 成功：`batch.node='separator'`；T2 完成。
- 失败：未接单开阀提示“先接收批次再开阀”；不扣进度。
- 知识解释：井筒连接储层与地面；井口控制流体进入集输。
- 重试/跳过：可关阀重来；可跳过。
- 复位：阀组关闭，回井口；保留章。
- 知识 ID：`kb_drill`。

### T3 分离：三路去向（对应 l2，含分支）

- 目标：剖开分离器，认清气/油/水三出口；为气选择回收/火炬；油相送到储运进料总管、水去水处理。
- 前置：T2 完成或跳过。
- 线索：三出口、颜色/文字标签、设备卡“剖开”；水处理终点在集输区东侧。
- 动作：`separator.cut`（半剖/全剖）→ `separator.run` → `separator.setGasRoute('recovery'|'flare')` → `separator.assignPhase`（油→罐、水→水处理）。
- 状态变化：内部挡板/堰板/三出口显现；气/油/水三条路径分开；`batch.node='oil_to_storage'`（仅油相主线）；气/水有独立路径节点，不推批次牌。
- 可观察结果：回收→燃料气管线；火炬→受控火焰；水→可见水处理池/罐；油→储运进料总管/罐区入口（尚未选定具体罐）；错误出口回流并给原因。
- 成功：气明确去向 + 油相到达储运进料总管 + 水入水处理；三路都完成。具体罐型由 T4 选择。
- 失败：气进油罐“气不能进常压油罐”，回流；油进水罐同理；可改选。
- 知识解释：按相态/密度分离，不是过滤；火炬是安全泄放，回收优先；不估算排放。
- 重试/跳过：可重来本段；可跳过。
- 复位：合上分离器，清空本段分流；保留章；`task.choices.gasRoute` 可保留显示。
- 知识 ID：`kb_gather`。
- 目的地 ID：`gas_recovery_header`（非交互终点，集输区北侧）、`flare_stack`（非交互远景，炼化区，阶段 06）、`produced_water_treatment`（非交互终点，集输区东侧）、`oil_to_storage`（路径，终点为储运进料总管，不是具体罐）。

### T4 储运：选罐型（对应 l3，含分支）

- 目标：为批次选择具体储罐，完成入罐，理解浮顶/固定顶的油气空间差异。
- 前置：T3 完成或跳过。
- 线索：两个罐、浮盘、液位滑块、防火堤。
- 动作：`tank.selectType('floating'|'fixed')` → `tank.setLevel(0–100)` → `tank.confirm`。
- 状态变化：`batch.node='tank'`；所选罐高亮；批次牌到罐区外侧（不进罐内）；`task.choices.tankType` 记录。
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
- 动作：`refinery.feed` → `tower.cut('half'|'full')` → `tower.run` → `tower.placeFraction(fractionId, position)` → `tower.setPriority('fuel'|'material')`；保存**唯一** `task.choices.priority`，贯穿 T6。
- 状态变化：`batch.node='refinery_feed'` → `'fraction_split'`；半剖/全剖；侧线高亮；`task.choices.priority` 记录（单一选择，T6 不再重复选择）。
- 可观察结果：全剖见塔板/降液管/侧线/汽液粒子；馏分放置正确/错误反馈；不同重点下游管线不同。
- 成功：五种馏分全对 + 全剖至少查看一次 + 选一个重点；T5 完成。T6 只沿用该选择。
- 失败：馏分放错弹回 + “更轻的在上”；不扣分。
- 知识解释：按沸点范围切馏分；馏分≠成品油；后续裂化/重整/加氢/调和；不编造收率。
- 重试/跳过：可重放馏分；可跳过。
- 复位：清空馏分，回进塔前；保留罐型/气路线。
- 知识 ID：`kb_refine`。

### T6 城市：交付与应用（对应 l5，延续 T5 重点）

- 目标：把**五张必做应用卡**（汽油/柴油/航空煤油/塑料/沥青）匹配到城市对象，展示 T5 选择的燃料/材料重点，完成 T6 知识任务（**不执行交付**）。纤维/润滑油/石蜡为可选探索卡，不计入 5 组必做。
- 前置：T5 完成或跳过。
- 线索：城市街区、加油站、材料台、产品卡。
- 动作：`city.assignProduct(fractionId, applicationId)`（仅 5 张必做卡计数），**不调用 `batch.deliver`**；城市按 `task.choices.priority` 显示权重，**不重复设置 priority**；如需改选，回 T5 改同一字段（需确认，不在 T6 新建选择）。
- 状态变化：`batch.node='city'`（不改为 delivered）；正确配对盖章；第 5 组完成时 `task.steps.T6.status='completed'` 并发放 `stamp_l5`；错误退回；城市权重由 `task.choices.priority` 决定；不写 `productSet`。
- 可观察结果：5 组必做配对盖章；第 5 组后出现“五枚知识章已齐，可前往交付”提示；可选卡可继续查看但不计入 5/5；城市灯光/材料权重；批次牌停在城市，不提前进交付箱。
- 成功：**5 组必做配对正确**（汽油/柴油/航空煤油/塑料/沥青）；T6 完成并发放 `stamp_l5`；**不执行交付**（重点已在 T5 选择）。
- 失败：塑料配“只能来自石油”错误；提示可能来自天然气/煤基/生物基；不扣分；缺必做卡时不发 `stamp_l5`，T7 交付按钮保持禁用。
- 知识解释：燃料/材料/路面来自不同路线；T5 的重点决定城市显示权重；模型为典型示意，非唯一工艺路线。
- 重试/跳过：可重配；可跳过。
- 复位：清空配对，保留 `task.choices.priority`；可选卡发现记录保留。
- 知识 ID：`kb_use`。

### T7 交付与复盘

- 目标：在五枚知识章齐全后执行交付，再回顾路线/选择/知识，形成“能源探索档案”。
- 前置：**l1–l5 五枚知识章齐全**（T1/T2 共同完成 l1；T3/T4/T5/T6 分别完成 l2/l3/l4/l5），且 `task.steps.T6.status='completed'`；T0 接收标记、T7 交付标记是流程标记，不计知识章。跳过段不计知识章但记录跳过。
- **本步骤先交付、后复盘**：`batch.deliver` 成功后才进入 `archive.review`；不得把交付和发章互相作为前置。
- 动作：`batch.deliver`（五章齐全才启用）→ 播放短交付反馈 → `archive.review` → 点“再走一次”/“自由探索”/“看塔”/“问 AI”。
- 状态变化：`task.step='T7'`（进入交付时）；`batch.deliver` 成功 → `task.status='complete'`、`batch.node='delivered'`、`task.processStamps` 追加 `deliver`（不计知识章）；`archive.status='open'`（只读复盘，不修改 task）。
- 可观察结果：路线图、5 枚知识章、2 个流程标记（接单/交付）、3 个选择（气/罐/炼化重点）、用时、发现清单；不是积分。
- 成功：交付成功 + 档案生成；允许导出/生成材料（可选，依赖 API 时标注预置稿）。
- 失败：缺章时 `batch.deliver` 按钮禁用并提示“还差第 N 章”，不强制顺序；用户返回补做。
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
| T5 | l4 | refining | refine | atmospheric_tower/vacuum_tower/heater | kb_refine | `tower.cut/run/placeFraction/setPriority`（唯一 priority） |
| T6 | l5 | city | use | fuel_dispenser/plastic_bottle/fiber_spool/lubricant_can/asphalt_slab/city_product_table | kb_use | `city.assignProduct`（沿用 priority；不发交付） |
| T7 | — | city | use | archive（非设备） | 全部 | `batch.deliver/archive.review` |


### 4.1 印章类型与映射（消除计数歧义）

| task.step | levelId | knowledgeStampId | stampType | 说明 |
|---|---|---|---|---|
| T0 | — | — | `process:accept` | 接单流程标记，不计知识章 |
| T1 | l1（共做） | — | — | T1/T2 共同完成 l1，T2 结束时发 `stamp_l1` |
| T2 | l1 | `stamp_l1` | `knowledge` | l1 知识章（井口/举升） |
| T3 | l2 | `stamp_l2` | `knowledge` | 分离知识章 |
| T4 | l3 | `stamp_l3` | `knowledge` | 储运知识章 |
| T5 | l4 | `stamp_l4` | `knowledge` | 炼化知识章 |
| T6 | l5 | `stamp_l5` | `knowledge` | 产品应用知识章 |
| T7 | — | — | `process:deliver` | 交付流程标记，不计知识章 |

**总账**：知识章 5 枚（stamp_l1–l5）；流程标记 2 枚（accept/deliver）。界面若显示印章总数，必须分开写“知识章 5/5 · 流程 2/2”，不得混称“五枚章/七枚章”。

**章节发放规则（唯一）**：

| knowledgeChapter | 关卡 | 覆盖步骤 | 发放条件 |
|---|---|---|---|
| 第1章 `stamp_l1` | l1 | T1、T2 | **T1 和 T2 都完成**才发；只完成一个不发；T2 完成时发放 |
| 第2章 `stamp_l2` | l2 | T3 | T3 完成（气/油/水三路都有去向） |
| 第3章 `stamp_l3` | l3 | T4 | T4 完成（选罐+液位变化+确认） |
| 第4章 `stamp_l4` | l4 | T5 | T5 完成（五馏分全对+全剖查看+重点选择） |
| 第5章 `stamp_l5` | l5 | T6 | T6 完成（5 组必做配对正确；**不含交付**） |

- 允许跳过以继续探索，但跳过/未完成的知识章**不发章**。
- `batch.deliver` 前置为 **5 枚知识章齐全且 T6 completed**；缺章时按钮禁用，提示“还差第 N 章”，用户可返回补做。`stamp_l5` 只依赖 T6 的五组配对，不依赖 `batch.deliver`。
- 不允许带缺章强行交付；T7 交付成功后才出现复盘。
- T0 `accept`、T7 `deliver` 是流程标记，不是知识章。

### 4.2 自主/观察/判断/隐藏发现样例（阶段 07 细化）

| taskId | 类型 | 触发 | 动作/反馈 | 成功 | 复位 |
|---|---|---|---|---|---|
| `OBS-01` 三个出口 | 观察 | 进入分离器 | 依次点气/油/水出口，标签与路径高亮 | 三个都点到 | 退出面板重置 |
| `JUDGE-01` 馏分塔位 | 判断 | T5 前自由探索 | 把石脑油/柴油拖到对应塔段，错误弹回 | 两个都正确 | 清空放置 |
| `HIDE-01` 降液管 | 隐藏发现 | 全剖塔 | 找到降液管并点击，解锁一条知识卡 | 点击成功 | 保留已解锁 |

这些是设计样例；阶段 07 必须补完整 taskId/前置/提示/知识 ID，未实现前不得在交接报告中写“已规格化”。

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

### 终端应用与城市对象映射（典型示意，非唯一路线）

| fractionId | intermediateProcessId | applicationId | cityObjectId | 本期必做 | 用户可见反馈 | 允许直接配对？ |
|---|---|---|---|---|---|---|
| `topgas` | `proc_fuel_gas` | —（燃料气，不进入城市产品卡） | — | 否 | 燃料气管网/火炬路径 | 否（不作为汽油/柴油） |
| `naphtha` | `proc_naphtha_reform` / `proc_olefin` | `app_gasoline` | `fuel_dispenser`（同一加油机的汽油卡） | 是 | 重整/调和后进入汽油卡 | 需经过路线；不能直接当汽油 |
| `naphtha` | `proc_olefin` | `app_plastic` | `plastic_bottle` | 是 | 乙烯/丙烯→聚合物→塑料卡 | 需经过路线；也可非石油基 |
| `kerosene` | `proc_jet_hydro` | `app_jet` | `fuel_dispenser`（同一加油机的航空煤油卡；以机场/加注提示表现，不新增独立模型） | 是 | 精制/调和后航空煤油卡 | 需经过路线 |
| `diesel` | `proc_diesel_hydro` | `app_diesel` | `fuel_dispenser`（同一加油机的柴油卡） | 是 | 加氢/调和后柴油卡 | 需经过路线 |
| `residue` | `proc_vacuum` / `proc_asphalt` | `app_asphalt` | `asphalt_slab` | 是 | 减压渣油→沥青卡 | 需经过路线；不能直接当汽油 |
| `residue` | `proc_lube_baseoil` | `app_lubricant` | `lubricant_can` | 否（可选） | 精制/调配→润滑油卡 | 需经过路线；不承诺收率 |
| `residue` | `proc_wax_dewax` | `app_wax` | `city_product_table` | 否（可选） | 脱蜡/精制→石蜡展示卡 | 需经过路线 |
| `naphtha` | `proc_fiber` | `app_fiber` | `fiber_spool` | 否（可选） | 芳烃/烯烃→聚合物→纤维卡 | 需经过路线；其他原料也可能 |

**允许/禁止规则**：

- 允许一对多：石脑油可走汽油或塑料路线；渣油可走沥青/润滑油/石蜡路线（均为典型示意）。
- 禁止直接配对：塔顶油气→汽油/柴油/航空煤油；常压渣油→汽油；任何馏分→“成品油”且无后续加工。
- 塑料不得标“只能来自石油”；合成纤维不得标“只能来自石油”。
- 五个设备对象 + 一个非交互展示台承载八个应用：`fuel_dispenser` 承载汽油/柴油/航空煤油三张卡；`plastic_bottle` 塑料；`fiber_spool` 纤维；`lubricant_can` 润滑油；`asphalt_slab` 沥青；`city_product_table` 承载石蜡展示卡（非交互展台）。
- **T6 计数**：只计 5 张“本期必做”卡（汽油/柴油/航空煤油/塑料/沥青）；纤维/润滑油/石蜡为可选探索，不计入 5/5。航空煤油共用加油机，但以独立卡+机场/加注提示区分，不新增独立模型。
- **topgas** 不进入城市配对，只走燃料气/火炬路径。

**动作层的中间路线反馈（`city.assignProduct`）**：

1. 用户放下卡时，按 `fractionId + applicationId` 查 §5 表，得到唯一/允许的 `intermediateProcessId` 与 `routeId`；没有合法路线则弹回。
2. 正确时先播放路线节点：`fraction` → `process`（如重整/加氢/调和/脱蜡）→ `application` → `cityObject`；管线/卡片依次点亮 1.2–1.8s，再盖章。
3. 结果写入 `interaction.result = {resolvedProcessId, routeId, applicationId, cityObjectId}`；知识说明同时出现“馏分≠成品油/需后续加工”。
4. 多路线（如石脑油→汽油或塑料）由 `applicationId` 决定路线；允许一对多，不把一条路线说成唯一真实工艺。
5. 塑料/纤维提示“也可能来自天然气、煤基或生物基”；topgas 无城市路线。


### 5.1 `task.choices.priority` 的城市视觉效果

| priority | 重点高亮 | 弱化但仍可完成 | 禁止 |
|---|---|---|---|
| `fuel` | `fuel_dispenser` 的汽油/柴油/航空煤油卡与加注路线、燃料相关管线 | 塑料/沥青/纤维/润滑油/石蜡卡仍可查看和完成 | 不屏蔽任何必做卡 |
| `material` | 塑料瓶、沥青、纤维、润滑油、石蜡展示卡与材料路线 | 加油机三张燃料卡仍可完成 | 不把燃料卡判错 |

- 5 张必做卡（汽油/柴油/航空煤油/塑料/沥青）在两种 priority 下都必须可完成；priority 只改变高亮/镜头权重/讲解顺序。
- 选择在 T5 做出；T6 只读取，不重复选择。


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
| `separator.setGasRoute` | 剖开 | 选择 | task.choices.gasRoute | 气网/火炬 | 可改选 |
| `separator.assignPhase` | 运行 | 点出口+终点 | 三路状态 | 路径/回流 | 错误回流 |
| `tank.selectType` | T3 | 点罐 | task.choices.tankType | 罐高亮 | 未选提示 |
| `tank.setLevel` | 选罐 | 滑块 | 液位 | 浮盘/空间 | 边界提示 |
| `tower.cut` | T4 | 按钮 | 结构维度 | 半/全剖 | 合壳复位 |
| `tower.placeFraction` | 全剖 | 拖拽 | 放置状态 | 吸附/弹回 | 错误弹回 |
| `tower.setPriority` | 全正确 | 选择 | `task.choices.priority`（唯一） | 侧线/下游 | T6 沿用；改选回 T5 |
| `city.assignProduct` | T5 | 拖拽 | 解析 `resolvedProcessId/routeId`；配对状态 | 路线节点依次点亮（馏分→加工→应用）+盖章/弹回 | 非法/禁止路线弹回并解释；不伪装唯一工艺 |
| `city.applyPriority` | T5 已选 | 只读展示 | 无新选择 | 城市权重 | 不重复选择 |
| `batch.deliver` | 五枚知识章+T6 completed | 按钮（T7） | delivered + process:deliver + task.complete | 交付反馈/路线 | 缺章禁用；成功后进入复盘 |
| `archive.review` | task.status=complete | 打开/关闭 | archive.status open/closed | 只读复盘 | 不改 task.steps/batch.node |

## 7. 状态分离与会话（canonical schema）

**唯一状态结构**（UI/上下文/存档实现均以此为准；旧简称 `choices.*` 视为 `task.choices.*`）：

```json
{
  "mode": "task",
  "batch": {
    "id": "YJ-001",
    "node": "reservoir"
  },
  "task": {
    "status": "active",
    "step": "T1",
    "steps": {
      "T0": {"status": "completed"},
      "T1": {"status": "active"},
      "T2": {"status": "idle"},
      "T3": {"status": "idle"},
      "T4": {"status": "idle"},
      "T5": {"status": "idle"},
      "T6": {"status": "idle"},
      "T7": {"status": "idle"}
    },
    "knowledgeStamps": [],
    "processStamps": ["accept"],
    "choices": {"gasRoute": null, "tankType": null, "priority": null},
    "hintLevel": 0,
    "discoveries": []
  },
  "archive": {"status": "idle"},
  "interaction": {"actionId": "subsurface.setDrive", "value": 50, "unit": "演示控制值", "result": "flow"},
  "history": [],
  "exploration": {"visitedZones": [], "inspectedObjects": [], "knowledgeSeen": []}
}
```

### 7.1 字段与枚举

| 路径 | 含义/枚举 | 生命周期 |
|---|---|---|
| `batch.id` | 批次号，如 `YJ-001` | 新批次重置 |
| `batch.node` | `reservoir/wellbore/wellhead/separator/oil_to_storage/tank/refinery_feed/fraction_split/city/delivered` | 新批次重置；只由任务步骤推进 |
| `task.status` | **整单**：`idle/active/help/error/complete`；**不含 skipped** | 单次探索 |
| `task.step` | 当前步骤 `T0`..`T7` | 单次探索 |
| `task.steps[Tn].status` | `idle/active/completed/skipped/needs_replay/error`；跳过只在此层 | 单次探索；段重试清本段；补做时下游标记 `needs_replay` |
| `task.knowledgeStamps` | `stamp_l1`..`stamp_l5`（最多 5；必须满足 §7.2 不变量） | 完成对应关卡；整单重置/回退清空 |
| `task.processStamps` | `accept`/`deliver`（流程标记，不计知识章） | 接单/交付；整单重置清空 |
| `task.choices` | `gasRoute:'recovery'|'flare'`、`tankType:'floating'|'fixed'`、`priority:'fuel'|'material'` | 对应步骤选择；整单重置清空 |
| `task.hintLevel` | 0–3 | 本段重试可保留/清零（默认清零） |
| `task.discoveries` | 观察/隐藏发现 ID 数组 | 会话；整单重置清空 |
| `archive.status` | `idle/open/closed`；只读复盘视图，不改变 `task.status` | 交付后 open；退出复盘 closed |
| `interaction` | 最近一次操作 `{actionId,objectId,value,unit,result}` | 每次动作覆盖 |
| `history` | 最近 8–12 条操作/知识摘要 | 会话；整单重置清空 |
| `exploration` | `visitedZones/inspectedObjects/knowledgeSeen` | 会话；整单重置清空 |

### 7.2 发章不变量、跳过与补做回退

**发章不变量**（必须由状态校验强制）：

- `stamp_l1 ∈ task.knowledgeStamps` **当且仅当** `T1.status='completed' AND T2.status='completed'`。
- `stamp_l2` 当且仅当 `T3.status='completed'`；`stamp_l3` 当且仅当 `T4.status='completed'`；`stamp_l4` 当且仅当 `T5.status='completed'`；`stamp_l5` 当且仅当 `T6.status='completed'`。
- 示例 JSON 是 T1 执行中、T2 未开始，因此 `knowledgeStamps=[]`；不得把已完成 l1 的章提前放入。
- `batch.deliver` 只读取五章与 T6 completed；发章逻辑不得读取 `processStamps.deliver`。

**补做/回退规则（唯一）**：

1. 入口：T7 缺章提示“补做第 N 章”或任务面板“补做跳过步骤”；目标步骤 S = 最早缺失/跳过的步骤。
2. 进入补做前保存 snapshot；`task.status='active'`、`task.step=S`、`steps[S]='active'`。
3. 所有 `Tn (n>S)`：`completed` → `needs_replay`；`skipped` 保持 skipped；`idle` 保持 idle。`needs_replay` 不是完成，不能计入五章。
4. 移除 S 及之后关卡的知识章（T1/T2 共享 l1：补做 T1 或 T2 都移除 `stamp_l1` 及后续章）；已得的更早章保留。
5. `batch.node` 回到 S 的入口：T1→`reservoir`；T2→`wellhead`；T3→`separator`；T4→`oil_to_storage`；T5→`refinery_feed`；T6→`city`。
6. `task.choices` 作为“草稿”保留，但不视为已生效；补做对应步骤时需重新确认。`interaction/history/exploration` 保留，便于复盘。
7. 补做成功：发回对应知识章；下游 `needs_replay` 仍需逐段补做或跳过；T7 交付仅在五章齐全且无 `needs_replay` 时可用。
8. 取消补做：恢复 snapshot，回到补做前状态；不得留下半回退状态。
9. 不允许只改 `steps` 而不回退 `batch.node`；也不允许保留下游 `completed` 却显示缺章。

### 7.3 跳过与重试

- **跳过**：只写 `task.steps.Tn.status='skipped'`；不发知识章；不推进 `batch.node` 到该段完成点（T1 例外：跳过后为了进入 T2，`batch.node='wellhead'`，但仍不发章）。
- **段重试**：清该段 `steps.Tn.status`、本段 `interaction`、本段提示；保留已得知识章与其他段选择。
- **整单重置**：清 `batch`、`task`、`archive`、`interaction`、`history`、`exploration`；保留匿名偏好（音量/减少动态，单独键）。
- **T7 交付**：`task.status='complete'` 需 5 枚知识章齐全且无 `needs_replay`；缺章时 `batch.deliver` 禁用并提示缺哪章；允许返回补做。
- **新访客**：只有显式“结束本次参观”+确认才执行整单重置；普通刷新恢复 session。
- **交付后复盘**：`batch.deliver` 成功即 `task.status='complete'`；`archive.review` 只把 `archive.status` 置 `open`，不修改 `task.status`/`task.steps`/`batch.node`；退出复盘置 `closed`。



### 7.4 进入上下文/AI 的字段

- `__sceneContext` 保留旧字段别名，并新增 `batch`/`task` 的结构化字段（见 `interaction-spec.md` §6）。
- `/api/ask` 的 `ctx[]` **不直接塞 JSON**；只追加文本行：当前环节、设备、知识点、batch.node、task.step、最近选择。不得把完整历史/探索数组发给 API。
- `task.status`/`steps` 不进入 AI 回答正文，只用于 UI 与调试；AI 只接收“当前步骤/是否跳过”的文本摘要。

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
