# Phase 02 · 交互规格与设备状态机

日期：2026-11-22
适用：阶段 03–07 的实现基线；本阶段只定义，不改代码。

## 1. 三种 UI 密度

| 状态 | 触发 | 画布占比 | 常驻 UI | 标签 | 可用操作 | 退出 |
|---|---|---|---|---|---|---|
| **沉浸态** `immersive` | 进入导览/追踪自动镜头 | ≥ 90% 宽 | 顶部一条章节名、底部 6 个进度点、左上退出 | 只显示当前焦点设备 1 个 | 暂停、上一步/下一步、跳过、拖动接管 | 退出按钮/走完 |
| **探索态** `explore` | 自由探索默认 | ≥ 85% 宽（右侧无栏或 46px rail） | 工具条 5 项 + 批次条 + 区域标签 ≤3 | 悬停/选中才出，最多 3 | 旋转/缩放/平移、选设备、看结构、追踪路线、问 AI | 切模式/离开 |
| **讲解态** `explain` | 选中设备/任务线索 | ≥ 60% 宽 | 右侧 360px 面板或底部 40% 抽屉 | 当前设备 + 关联 1–2 个 | 读原理、剖切、运行/暂停、AI、进入任务、读本章 | 关闭面板/返回 |

规则：

- 默认进入沉浸态 3 秒后自动降为探索态（若用户没有操作），避免“只能看不能动”。
- 任何模式不铺满数据卡；同屏最多 3 个区域标签、1 个设备面板。
- AI 面板是讲解态的一部分，不新开全屏页；`ask.html` 仍保留独立入口。
- 声音/自动旋转/半剖收进“更多”，不占一级工具条。
- 小屏（<1024）本期不承诺；降级为分区列表 + 塔页，但不得白屏。

## 2. 设备状态矩阵

状态定义：

- `default`：未交互，设备可动但不抢焦点。
- `hover`：指针/键盘焦点在设备上，出现接触环与名称，不改变相机。
- `selected`：单击/设备列表选中，设备卡打开，`selectedObjectId` 写入。
- `focus`：双击/“聚焦”/任务进入，相机到设备锚点；仍可旋转。
- `cutaway`：剖切/透明/移开外壳；只对分离器、常压塔、减压塔、储罐开放。
- `running`：过程演示/流体/机械动画运行。
- `paused`：动画暂停，状态保留。
- `error`：错误操作/不可用（如把气送进油罐、API 不可用）。
- `help`：提示层/分级提示，不改变设备状态。
- `ai`：AI 讲解请求，携带上下文；不改变设备几何状态。

| 设备（objectId） | default | hover | selected | focus | cutaway | running | paused | error/help | ai |
|---|---|---|---|---|---|---|---|---|---|
| `pumpjack` | 梁/曲柄运动 | 接触环 + “抽油机” | 设备卡 | 相机到井场 | 不适用 | 可“启动/暂停” | 保持角度 | 压力过低提示 | 带 stage/object |
| `wellhead` | 静态阀组 | 接触环 | 设备卡 | 相机到井口 | 不适用 | 阀组微动（教学） | 保持 | “先接单再开阀”提示 | 带 object |
| `three_phase_separator` | 静态壳体 | 接触环 | 设备卡 | 相机到侧 45° | **必须支持**：半剖/全剖 | 气/油/水流动 | 暂停流动 | 送错罐变红退回 | 带剖切状态 |
| `floating_roof_tank` | 浮盘静止 | 接触环 | 设备卡 | 相机到罐顶 | 可透明/剖开 | 浮盘随液位 | 保持液位 | 液位边界提示 | 带液位 |
| `fixed_roof_tank` | 静态 | 接触环 | 设备卡 | 相机到罐侧 | 可透明 | 气相空间变化 | 保持 | “固定顶油气空间更大” | 带对比 |
| `atmospheric_tower` | 外观 | 接触环 | 设备卡 | 相机到塔中段 | **必须支持**：半剖/全剖 | 汽液粒子/侧线 | 暂停粒子 | “全剖才见内部” | 带剖切/馏分 |
| `vacuum_tower` | 外观 | 接触环 | 设备卡 | 相机到塔中段 | 半剖/全剖 | 减压流程 | 暂停 | 边界提示 | 带 object |
| `heater` | 静态 | 接触环 | 设备卡 | 相机到炉体 | 不适用 | 热流/火焰示意 | 暂停 | 温度过高提示 | 带 object |
| `fuel_dispenser` | 静态 | 接触环 | 设备卡 | 相机到加油机 | 不适用 | 数字轮/油枪 | 保持 | 路线未完成提示 | 带产品路线 |
| `plastic_bottle` | 静态 | 接触环 | 设备卡 | 相机到产品台 | 不适用 | 材料高亮 | 保持 | 原料路线错误提示 | 带原料分支 |
| `fiber_spool` | 同上 | 同上 | 同上 | 同上 | 不适用 | 纤维卷旋转 | 保持 | 同上 | 同上 |
| `lubricant_can` | 同上 | 同上 | 同上 | 同上 | 不适用 | 高亮 | 保持 | 同上 | 同上 |
| `asphalt_slab` | 同上 | 同上 | 同上 | 同上 | 不适用 | 路面纹理/高亮 | 保持 | 同上 | 同上 |

**阶段 05/06 的硬要求**：分离器必须真正有剖切内部；塔全剖必须有塔板/降液管/侧线/汽液粒子，不能只切外壳。否则矩阵对应项标“未实现”。

## 3. 状态机

```mermaid
stateDiagram-v2
  [*] --> default
  default --> hover: pointerenter / keyboard focus
  hover --> default: pointerleave / blur
  hover --> selected: click / Enter
  selected --> focus: double click / "聚焦" / task enter
  focus --> selected: Esc
  selected --> cutaway: "剖开" (only cuttable)
  cutaway --> selected: "合上"
  selected --> running: "运行"
  running --> paused: "暂停"
  paused --> running: "继续"
  selected --> help: "提示"
  help --> selected: close
  selected --> ai: "问 AI"
  ai --> selected: close
  running --> error: invalid operation
  error --> selected: retry/reset
  selected --> default: click empty / Esc
```

约束：

- `cutaway` 与 `running` 可同时存在（剖开 + 流动）；`paused` 只暂停动画，不退出剖切。
- `error` 不破坏已得进度；提示后回到 `selected` 或 `help`，不强制重开整关。
- 同时只允许一个 `selected` 设备；切换时先关闭旧面板。
- 相机 `focus` 可被用户拖动打断，打断后仍保持 `selected`。

## 4. 事件与上下文

```text
events:
  object:hover/out, object:select, object:focus
  device:cut {objectId, mode: half|full|off}
  device:run/pause {objectId}
  task:start/step/check/hint/reset/complete
  batch:advance {from,to,stamp}
  ai:ask {question, ctx}
  mode:change {mode}

window.__sceneContext = {
  sceneId: 'oil_industry_journey',
  stageId: 'drill'|'gather'|'store'|'refine'|'use',
  zoneId: 'subsurface'|'oilfield'|'gathering'|'storage'|'refining'|'city',
  objectId: string|null,
  knowledgeIds: string[],
  interaction: {action, value, unit}|null,
  experienceMode: 'tour'|'free'|'task',
  batch: {id,node,stamps,choices},
  task: {step,state,hintLevel}
}
```

AI 请求必须带 `ctx`：当前 `stageId`、`objectId`、`knowledgeIds`、`interaction`、`batch.node`；没有 API 时只用本地知识包，不伪造模型回答。

## 5. 键盘/无障碍/降级

- Tab 顺序：跳过导航 → 场景工具 → 设备列表/标签 → 设备面板 → AI。
- `Enter` 选中，`Esc` 返回，`[` `]` 切换区域，`?` 打开提示。
- 所有 Raycaster 交互有设备列表等价入口；不能只靠 3D 拾取。
- 颜色不单独承载信息：气/油/水同时有文字/线型/位置。
- 无 WebGL：显示 fallback + 分区列表 + 知识链接；任务可读但不可 3D 操作，明确标注。
- `prefers-reduced-motion`：镜头瞬移、粒子降级、导览不自动。

## 6. 阶段映射

| 能力 | 阶段 | 验收 |
|---|---|---|
| 场景/区域/对象注册表/批次 session | 03 | 六区可进入，ID 与深链不变 |
| 地下穿越、井筒/井口体验 | 04 | 分镜 1 可完整操作 |
| 分离器剖切/出口分支、储罐 | 05 | 分镜 2 + 储罐状态 |
| 塔半剖/全剖/馏分路线、城市交付 | 06 | 分镜 3/4，全剖差异像素/结构验收 |
| 三模式、音频、AI 面板 | 07 | 模式共享 ID，无 API 可用 |
| 设备级 AI + 创作闭环 | 08 | 上下文/生成回写 |
| 回归/性能/用户测试 | 09 | 截图/录屏/指标 |

## 7. 与现有实现的差异

- 现有只有 `selected` 与简单的 `cut`；没有 `hover/focus/running/paused/error/help/ai` 完整状态。
- 现有设备卡“问 AI”依赖不存在的 `#leadai-q`；阶段 07 前必须先修复 AI 面板挂载，否则矩阵 `ai` 列全部不可用。
- 现有塔页三档剖切可复用；全剖需结构级差异。
- 现有 `__sceneContext` 已有主要字段；新增 `zoneId`、`batch`、`task`，保持旧字段兼容。
