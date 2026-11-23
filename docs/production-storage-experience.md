# 阶段 05 · 地面处理与储运体验

日期：2026-11-23  
范围：`three_phase_separator`、`fixed_roof_tank`、`floating_roof_tank`、`transfer_pump`；`l2`、`l3`。  
原则：同一产业链数字沙盘、同一 objectId、同一 `PETRO_DEVICE_STATE`。所有数值/颜色/粒子均教学示意，不是工程仿真。

## 1. 体验目标

用户从总览进入**集输处理区**，在三相分离器上完成“打开内部 → 启动/暂停/单步/重播 → 选择出口 → 看去向”；然后进入**储运区**，对比固定顶/外浮顶、调节液位、切换剖面、启动泵送并沿管线追踪到下一环节。两次近景都绑定总览中同一逻辑设备，退出后回到同一 stage/zone。

## 2. 场景与语义

| 项 | 值 |
|---|---|
| sceneId | `petro-chain-v3` |
| stage / zone | `gather` / `gathering`；`store` / `storage` |
| objectId | `three_phase_separator`、`fixed_roof_tank`、`floating_roof_tank`、`transfer_pump` |
| levelId | `l2`（地面处理）、`l3`（储运） |
| knowledgeId | `kb_gather`、`kb_store` |
| anchors | `separator`、`fixed_tank`、`floating_tank`、`transfer_pump` |
| 总览表示 | `separator_overview`、`fixed_tank_overview`、`floating_tank_overview`、`transfer_pump_overview` |
| 近景表示 | `separator_detail`（Hero）、`fixed_tank_detail`、`floating_tank_detail`、`transfer_pump_detail` |

## 3. 三相分离器

### 3.1 结构

- Hero Asset：`assets-source/blender/separator_hero.blend`；网页 OBJ/MTL：`web/assets/separator/separator.obj`；GLB 备份。
- 语义节点：`separator_shell/head_*`、`separator_inlet`、`separator_gas_outlet`、`separator_oil_outlet`、`separator_water_outlet`、`separator_internal_oil/water/gas`、`separator_internal_weir/baffle/inlet_distributor/mist_extractor`。
- 打开内部：`.blend` 提供半壳 `separator_cut_shell` 和内部圆柱切片液层；网页用半透明外壳+内部件保证可读，恢复外壳回到外部观察。
- 分离演示：粒子沿输入→气相上浮、油相水平、水相下沉到出口的三条教学路径移动；可暂停、单步、重播。
- 出口选择：`gas/oil/water` 三出口与目标去向；选错给出解释并退回，不伪造工程控制。

### 3.2 科学边界

- 重力分离/相态差异是原理级解释，不是 CFD、停留时间或分离效率计算。
- 油/水/气颜色只是教学编码。
- 破乳、除砂、脱水、气体处理是不同处理单元；本页面不把它们塞进同一个容器。
- 不编造压力、温度、流量、效率、收率。

### 3.3 交互矩阵

| 字段 | 分离器结构 | 分离过程 | 出口选择 |
|---|---|---|---|
| `objectId` | `three_phase_separator` | 同左 | 同左 |
| 初始状态 | 外部壳体、内部隐藏、动画 idle | 同上 | 未选择出口 |
| 用户动作 | 点击“打开内部结构” | 启动/暂停/单步/重播 | 点击气/油/水出口，再点去向 |
| 前置条件 | Hero 已加载；不可与 pore 模式并用 | 同左；可先自动打开内部 | 进入设备近景；有出口 |
| 状态变化 | `structure: external→half`；内部 Mesh visible | `animation: idle/running/paused`；粒子进度 | `interaction=choose_outlet`；出口环高亮 |
| 可观察反馈 | 壳体透明、油/水/气层可见 | 三相粒子沿不同曲线移动 | 选中环放大、去向标签和说明变化 |
| 知识解释 | 油水气按密度/相态分层；堰板控制液位 | 重力分离不是过滤；气相上浮 | 气→气回收/处理；油→油储罐；水→采出水处理 |
| 错误/边界反馈 | 资源未加载时提示备用剖面，不冒充 Hero | 未加载不可启动 | 选错去向：红色粒子 + “不该进…”解释 |
| 重置/恢复 | “恢复外壳”/重进保留 Store 结构 | “暂停/重播” | 退出再进保留已完成出口 |
| 可访问替代 | `l2-structure` 键盘按钮；HTML 出口按钮不是唯一入口 | 播放/单步/重播按钮 | 出口标签 + 键盘按钮 |
| AI 上下文 | stage=gather, objectId=three_phase_separator, knowledge=kb_gather | 同左 | interaction=choose_outlet |
| 验收证据 | `phase05-02-separator-internal.png` | `phase05-02`；录屏 | `phase05-03-outlet-choice.png`；`phase05-verify.json` |

## 4. 储运区

### 4.1 结构

- 固定顶罐：锥顶 + 呼吸阀；液位下降时油气空间可见增大。
- 外浮顶罐：浮盘随液面下降/上升；边缘密封与导向杆可见。
- 转输泵组：泵体、电机、出口阀、管架/管线；启动后粒子沿管线追向右侧炼化方向。
- “罐体剖面”把罐壁变半透明，露出液面/浮盘；不是把罐壁删除。

### 4.2 科学边界

- 外浮顶减少油气空间和挥发损耗，但**不等于零排放**；密封、附件、操作条件和维护仍影响损耗。
- 液位只表达液位与气相空间的示意，不换算排放速率/排放量。
- 固定顶罐不是“不能用”；本页只做对比，不做合规结论。

### 4.3 交互矩阵

| 字段 | 储罐液位/剖面 | 固定顶 vs 外浮顶 | 泵送路径 |
|---|---|---|---|
| `objectId` | `fixed_roof_tank` / `floating_roof_tank` | 同左 | `transfer_pump` |
| 初始状态 | 液位 2%、外部罐壁 | 双罐并排 | 泵停止 |
| 用户动作 | 拖液位；点“罐体剖面” | 点“固定顶罐/外浮顶罐” | 启动/暂停/重播泵送 |
| 前置条件 | 进入 l3；两罐已构建 | 同左 | 同左 |
| 状态变化 | Store `level` 0–1；罐壁 opacity | 选中对象/说明切换 | `animation=running/paused`；粒子速度 |
| 可观察反馈 | 液面升降、浮盘跟随、气相空间百分比 | 固定顶油气空间大；浮顶贴液面 | 粒子沿管线向右移动，方向清楚 |
| 知识解释 | 液位改变气相空间，不等于排放量 | 浮顶减少油气空间但非零排放 | 泵把液相送往下一环节，不是“凭空消失” |
| 错误/边界反馈 | 极端 0/100 仍标“示意”；不生成排放数值 | 固定顶不贬低为错误设备 | 泵停止时粒子停住，不伪装运行 |
| 重置/恢复 | “恢复罐壁”；重进保留 level | 重进保留选择 | 重播从同一路径起点 |
| 可访问替代 | range 滑块 + 按钮 | 三个对象按钮 | 启动/暂停/重播按钮 |
| AI 上下文 | stage=store, objectId=储罐, knowledge=kb_store | 同左 | objectId=transfer_pump |
| 验收证据 | `phase05-06-storage-cut.png` | `phase05-05-storage-external.png`、`phase05-07-floating-tank.png` | `phase05-06`；录屏 |

## 5. 验收门禁对照

| 门禁 | 状态 | 证据 |
|---|---|---|
| 总览/近景同一 objectId/状态源 | 通过 | `phase05-verify.json` 的 context + `PETRO_DEVICE_STATE` representations |
| 分离过程启动/暂停/重播 | 通过 | `phase05-02`；`phase05-verify.json internal` |
| 出口选择与原因 | 通过 | `phase05-03a` 错误、`phase05-03` 正确；`choose_outlet`/`assign_outlet_target` |
| 储罐液位改变可见气相空间 | 通过 | `phase05-06`；`fixed_roof_tank.level=0.55` |
| 管线追踪连续、方向清楚 | 通过（本地示意） | `phase05-06`；泵送粒子向右 |
| 外浮顶无零排放误导 | 通过 | 顶部提示 + `l3` 文案：“减少油气空间，不等于零排放” |
| 无真实仿真数据伪造 | 通过 | 页面文案 + 无工程数值 |
| 分离器 Hero `.blend`/运行格式/语义/许可 | 最小通过 | `separator_hero.blend`、OBJ/MTL/GLB、manifest、5 检查视图 |
| 分离器/储罐各 2–3 个真实状态变化 | 通过 | 本文矩阵；截图/录屏 |
| 连续录屏 | 通过 | `production-storage-continuity.mp4`，66.15s，1440×900 |

## 6. 未覆盖 / 已知限制

- 储罐是程序化几何，不是独立 Hero `.blend`；罐体细节与浮顶结构仍属教学级。
- 泵送路径是**本地区段示意**，没有把每米管线接入全球场景的真实管廊；世界级 `path_store_refine` 只提供方向。
- 未执行 FPS/内存长跑、跨浏览器、移动端、真实用户测试；不得声称通过。
- 未执行 AI `/api/ask` 闭环。
- 外部再分发许可仍需权利人确认；见 manifest。
