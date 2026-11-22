# Phase 02 · 交互规格与设备状态模型（返修版）

日期：2026-11-22
适用：阶段 03–07 实现基线；本阶段只定义，不改代码。
本版修正审查核心主题五、P1-04（上下文兼容）、P1-07（Token 单一来源由视觉文档承接）、P2 会话复位/设备差异。

## 1. 三种 UI 密度

| 状态 | 触发 | 画布占比 | 常驻 UI | 标签 | 可用操作 | 退出 |
|---|---|---|---|---|---|---|
| 沉浸态 | 导览/任务自动镜头 | ≥90% 宽 | 章节名、6 进度点、左上退出 | 仅当前焦点 1 个 | 暂停、前后步、跳过、接管 | 退出/走完 |
| 探索态 | 自由探索默认 | ≥85% 宽（右侧无栏/46px rail） | 工具条 5 项 + 批次条 | 悬停/选中才出，≤3 | 旋转/缩放/平移、选设备、看结构、追踪、AI | 切模式 |
| 讲解态 | 选中设备/任务线索 | ≥60% 宽 | 右侧 360px 或底部 40% 抽屉 | 当前设备 + 关联 1–2 | 读原理、剖切、运行/暂停、AI、任务、读章 | 关闭面板 |

- 默认进入沉浸态 3 秒后若用户无操作，降为探索态。
- 同屏 ≤3 区域标签、1 设备面板；AI 面板属于讲解态，不新开全屏。
- 声音/自动旋转/半剖收进“更多”，不占一级工具条。
- 小屏 <1024 本期不承诺；降级为分区列表 + 塔页，不白屏。

## 2. 六维正交状态模型

设备/场景状态**不再使用单一互斥枚举**；六个维度可组合：

| 维度 | 值 | 职责 |
|---|---|---|
| `selection` | `default` / `hover` / `selected` | 高亮、选中、设备卡 |
| `camera` | `free` / `focus` / `transition` | 自由观察、设备聚焦、镜头过渡 |
| `structure` | `external` / `half` / `full` / `transparent` | 外观、半剖、全剖、透明 |
| `animation` | `idle` / `running` / `paused` | 过程动画 |
| `task` | `idle` / `active` / `help` / `error` / `complete` | 任务状态（全局，不是设备几何） |
| `ai` | `idle` / `loading` / `success` / `error` | AI 请求生命周期 |

示例组合：

- “已半剖且正在运行”：`structure=half, animation=running`；
- “全剖但暂停”：`structure=full, animation=paused`；
- “选中设备、镜头聚焦、AI 请求中”：`selection=selected, camera=focus, ai=loading`。

## 3. 组合、互斥与复位

| 规则 | 说明 |
|---|---|
| 可并存 | selection + camera focus + structure + animation + task + ai 可同时存在 |
| 互斥 | 同一时刻只有一个 `selected` 设备；`camera` 只能一个值；`structure` 只能一个值 |
| 切设备 | 旧设备 `selection=default`、`structure=external`、`animation=idle`；新设备 `selected`；相机 focus 到新设备 |
| 退出近景 | `camera=free`；结构/动画恢复 `external/idle`（除非用户点“保留剖切”）；`selection` 可保留为 selected |
| 暂停动画 | `animation=paused`，保留 `structure`；继续恢复 running |
| 切剖切 | `structure` 变化同步热点/标签/流线；半剖/全剖只对支持设备可用；不支持时按钮禁用并说明 |
| 任务完成 | `task=complete`；不清 `batch`/`exploration`；新批次才清 |
| 任务重试 | `task=active`，清本段选择，保留知识章 |
| AI 失败 | `ai=error`，不影响设备/任务；给出重试/本地知识入口 |
| 页面退出 | 保存 batch/task/exploration；相机/structure/animation 回到默认 |

## 4. 设备能力矩阵

`●` 支持，`◐` 部分/需资产，`—` 本期不做，`?` 待核实（不得在实现中假装支持）。

| 设备 | 结构查看 | 过程动画 | 用户操作 | 路径追踪 | 备注 |
|---|---|---|---|---|---|
| `pumpjack` | — | ● 梁/曲柄运动 | ◐ 启动/暂停 | ◐ 井口→集输 | 不承诺冲程参数 |
| `wellhead` | ◐ 阀组剖面 | ◐ 阀组微动 | ● 开阀/接入 | ● 井口→分离 | 不承诺真实压力 |
| `three_phase_separator` | ● 外观/半剖/全剖 | ● 三相流动 | ● 剖开/启动/出口选择 | ● 气/油/水三路 | 内部资产阶段 05 |
| `fixed_roof_tank` | ◐ 透明/剖面（具体方式待资产） | ● 油气空间变化 | ● 液位示意 | ● 进出罐 | 与浮顶罐分开定义 |
| `floating_roof_tank` | ◐ 结构展示 | ● 浮盘随液位 | ● 液位示意 | ● 进出罐 | 不混同固定顶 |
| `atmospheric_tower` | ● 外观/半剖/全剖 | ● 汽液/侧线 | ● 结构切换/馏分放置 | ● 馏分/后续路线 | 全剖需重做 |
| `vacuum_tower` | ● 外观/半剖/全剖 | ● 减压流程 | ◐ 结构切换 | ● 减压馏分/渣油 | 阶段 06 核验 |
| `heater` | ◐ 炉体剖面 | ● 热流/火焰示意 | ◐ 启动/暂停 | ◐ 进料/出炉 | 不显示真实温度 |
| `fuel_dispenser` | — | ● 数字轮/油枪 | ◐ 选择油品 | ● 产品→应用 | 不显示真实价格/流量 |
| `plastic_bottle` | — | ◐ 材料高亮 | ● 原料路线选择 | ● 上游路线 | 可能非石油基 |
| `fiber_spool` | — | ◐ 纤维卷旋转 | ● 原料路线选择 | ● 上游路线 | 具体品种决定 |
| `lubricant_can` | — | ◐ 高亮 | ● 路线选择 | ● 上游路线 | 不承诺收率 |
| `asphalt_slab` | — | ◐ 路面高亮 | ● 路线选择 | ● 上游路线 | 重质组分示意 |

**硬要求**：分离器无内部结构 → 结构列不得标 ●；塔全剖差异不足 → 阶段 06 返修，不得以按钮存在代替。

## 5. 动作契约

统一：

```text
actionId | objectId | 前置条件 | 输入方式 | 状态变化 | 视觉反馈 | 知识解释 | 错误处理 | 复位
```

| actionId | 目标 | 前置 | 输入 | 状态变化 | 视觉 | 错误/复位 |
|---|---|---|---|---|---|---|
| `subsurface.setDrive` | wellbore | T0 完成 | 滑块 | interaction，batch.node | 油点/牌移动 | <30 提示；回 0 |
| `subsurface.revealLayer` | geo_* | 无 | 选择层 | 可见性 | 层理显隐 | 可复位 |
| `wellhead.openValve` | wellhead | T0/T1 | 点阀组 | batch.node | 阀动/流动 | 未接单提示 |
| `separator.cut` | separator | T2 | 按钮 | structure | 内部显现 | 合上复位 |
| `separator.run` | separator | 剖开 | 按钮 | animation | 三相流动 | 暂停保留结构 |
| `separator.setGasRoute` | separator | 运行 | 选择 | choices.gasRoute | 气网/火炬 | 可改选 |
| `separator.assignPhase` | separator | 运行 | 点出口+终点 | 路径状态 | 路径/回流 | 错误回流 |
| `tank.selectType` | tanks | T3 | 点罐 | choices.tankType | 高亮 | 未选提示 |
| `tank.setLevel` | tanks | 选罐 | 滑块 | 液位 | 浮盘/空间 | 边界提示 |
| `tower.cut` | tower | T4 | 按钮 | structure | 半/全剖 | 合壳复位 |
| `tower.run` | tower | 全剖 | 按钮 | animation | 汽液粒子 | 暂停保留 |
| `tower.placeFraction` | tower | 全剖 | 拖拽 | 放置 | 吸附/弹回 | 错误弹回 |
| `tower.setPriority` | tower | 全放对 | 选择 | choices.cutPriority | 侧线/下游 | 可改选 |
| `city.assignProduct` | city | T5 | 拖拽 | 配对 | 盖章/弹回 | 错误原因 |
| `batch.deliver` | city | 五章 | 按钮 | batch.node=delivered | 最后一章 | 缺章提示 |

## 6. `__sceneContext` 向后兼容

**只增不删**；阶段 03 不得重命名现有字段或改 `/api/ask` 的 `ctx[]` 契约。

| 现有/旧字段 | 新字段/规则 | 兼容策略 |
|---|---|---|
| `scene` | `sceneId` | 保留 `scene` 别名，值同 `sceneId`；阶段 08 前不删 |
| `stage` | `stageId` | 保留 `stage` 别名；`stage` 若为索引，按 `0→drill,1→gather,2→store,3→refine,4→use` 映射 |
| `object` | `selectedObjectId` | 保留 `object` 别名，值同 `selectedObjectId` |
| `knowledge` | `knowledgeIds[]` | 保留 `knowledge` 别名（取首个）；新代码只读 `knowledgeIds` |
| `mode` | `experienceMode` | 保留 `mode` 别名，值同 `experienceMode` |
| `interaction` | `{actionId,value,unit,result}` | 保留 `action/value/unit` 旧键，新增 `actionId/result`；AI 读取旧键仍可用 |
| `history` | 保留 | 最近 8–12 条；不删除，只追加 |
| — | `zoneId` | 新增；`subsurface/oilfield` 映射 `drill` |
| — | `batch` | 新增；无旧消费者 |
| — | `task` | 新增；无旧消费者 |

- `ctx[]`：`ai.js` 只追加“当前环节/设备/知识点/操作”行；不把 `batch/task` 结构化对象直接塞进 `ctx`，需转成文本行。
- 旧 `stage` 索引/新 `stageId` 必须一致；`zoneId` 不替代 `stageId`。
- 历史只保留会话内；不写 LocalStorage 敏感数据。

## 7. 会话与复位

### 7.1 普通刷新/继续

- `sessionStorage` 键：`oil-journey-v1`；保存 batch/task/exploration/interaction/history。
- 普通刷新、同一标签页返回：**恢复**当前 session；相机/structure/animation 回默认，但不提示“开始新会话”。
- “再走一次”：只重置 `batch/task/interaction/history/exploration` 中的任务相关字段，保留音量/减少动态偏好；需用户确认。

### 7.2 展厅下一位用户（显式）

- 入口：档案页/页脚固定按钮 **“结束本次参观”**（或“开始新一轮”）；不得只靠隐式超时。
- 点击 → 确认对话框“将清除本机当前批次的进度与选择，是否继续？” → 确认后：
  - 清除 `oil-journey-v1` 的 batch/task/interaction/history/exploration；
  - 保留独立键 `oil-journey-prefs`（音量、减少动态、字幕偏好）；
  - 回到首屏/T0，不继承上一位用户的选择/AI 上下文。
- 取消：不改变当前 session。
- 闲置超时：**本期不自动复位**；由工作人员/用户点“结束本次参观”。若未来启用自动复位，必须单独设计并在阶段 09 验证连续参观。
- 普通刷新绝不触发 7.2；只有显式按钮+确认才清。
- 阶段 03 提供入口与状态；阶段 07/09 验证“刷新恢复 / 显式复位 / 下一位用户不继承”三种行为。

### 7.3 不保存

- 不保存 API Key、个人信息、自由文本输入原文（只保存最近操作摘要）。
- AI 请求的历史上下文不跨 session 继承；新会话首问不带上一位用户的问题。

## 8. 键盘、无障碍、降级

- Tab：跳过导航 → 工具 → 设备列表/标签 → 面板 → AI。
- Enter 选中，Esc 返回，`[`/`]` 切换区域，`?` 帮助。
- 所有 Raycaster 交互有设备列表等价入口。
- 颜色不单独承载信息：气/油/水同时有文字/线型/位置。
- 无 WebGL：fallback + 分区列表 + 知识链接；任务可读不可 3D 操作，明确标注。
- `prefers-reduced-motion`：镜头瞬移、粒子降级、导览不自动。
- 移动端：本期不承诺；不把桌面布局硬塞进手机。

## 9. 设计—研发追踪

| 设计对象 | 关联 |
|---|---|
| 区域 | `zoneId`、`stageId`、`cam_*` |
| 设备 | `objectId`、资产文件、能力矩阵、actionId |
| 关卡/任务 | `levelId`、`task.step`、`taskId` |
| 知识 | `knowledgeId`、`knowledge-visual-mapping.md`、审校状态 |
| 镜头 | `shotId`、from/to/lookAt |
| 动作 | `actionId`、输入、状态、反馈、复位 |
| 资产 | 资产 ID、格式、来源、许可、阶段 |
| API | `/api/ask` ctx、`/api/gen` ledger，不改契约 |

阶段 03 实现时，任何新增 ID 必须登记到本表/对象注册表；同一对象不得在不同文档使用不同名称。

## 10. 验收

- 能表达“半剖+运行”“全剖+暂停”等组合；
- 设备能力矩阵覆盖全部核心设备，未支持项明确标 —/◐；
- 主要动作有 actionId、前置、反馈、复位；
- 旧字段与 `/api/ask` 契约兼容，不破坏 ai.js；
- 会话复位/展厅下一位用户规则明确；
- 不以按钮存在/卡片弹出/自动动画作为交互完成证明。
