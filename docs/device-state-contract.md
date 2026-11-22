# Phase 03 · 逻辑设备与总览/近景状态契约

日期：2026-11-22
适用：阶段 03 骨架、阶段 04–06 的 Hero/近景实现、阶段 07 任务持久化。
原则：**一个逻辑设备一个 objectId、一个状态源；总览与近景可以换 Mesh，不能换身份。**

## 1. 身份与表示

```text
objectId (stable)
  ├─ overviewRepresentation : Three.js Group/Mesh（总览低模）
  ├─ detailRepresentation   : Three.js Group/GLB（近景高模，阶段 04–06）
  ├─ anchors                : 语义锚点 ID（非相机坐标散落）
  ├─ knowledgeIds           : 知识卡 ID
  ├─ interactions           : 可用 actionId / 能力
  └─ chapterId / levelIndex  : 章节/关卡入口
```

阶段 03 现状：

- 13 个设备都有 `overviewRepresentation`，通过 `PETRO_DEVICE_STATE.bind(id,'overview',mesh)` 绑定；
- `detailRepresentation` 为 `null`/待建 ID（阶段 04–06 填写）；**不假装已有近景高模**；
- 注册表：`web/world/registry.js`；状态源：`web/world/state.js`。

## 2. 状态字段（单一来源）

```js
{
  objectId,
  selection: 'default' | 'hover' | 'selected',
  structure: 'external' | 'half' | 'full' | 'transparent',
  animation: 'idle' | 'running' | 'paused',
  level: 0..1,              // 液位/开度等教学示意，不冒充工程参数
  visible: true|false,
  representations: ['overview','detail']
}
```

规则：

1. 只有 `PETRO_DEVICE_STATE.set()` 改状态；总览/近景不得各自维护一套 `selected/structure/animation`。
2. 切设备：旧设备 `selection=default, structure=external, animation=idle`；新设备 `selected`。
3. 切近景：保留用户已完成操作与选择；只改变相机/可见表示，不清状态。
4. 返回总览：恢复同一 `objectId` 的选中/结构/运行状态；镜头恢复进入前上下文；不得无说明重置。
5. 不支持的 `structure` 能力：按钮禁用/说明，不得用“按钮存在”冒充结构可用。
6. 页面刷新：相机/结构/动画回默认，但 batch/task/exploration 按 `interaction-spec.md` 恢复；阶段 07 验证。

## 3. 总览 ↔ 近景流程

阶段 03 提供 API（用于骨架验证，不是完整导览）：

```js
__stage.enterDetail('three_phase_separator')
__stage.exitDetail()
__stage.focusZone('gathering')
__stage.focusOverview()
__stage.deviceState.snapshot()
```

- `enterDetail(objectId)`：
  1. 从注册表取 `stageIndex`；
  2. 找到该 `objectId` 的 overview 表示；
  3. 保存当前 orbit；
  4. 以对象包围盒中心/尺寸计算近景；
  5. `PETRO_DEVICE_STATE.select(objectId)`、`cameraMode='focus'`。
- `exitDetail()`：恢复保存 orbit、清选择、`cameraMode='free'`。
- 阶段 04–06 接入 `detailRepresentation` 后，进入/退出必须调用同一 `bind(id,'detail',root)` 和保留/恢复规则；不得在关卡脚本里另建 `detailState`。
- 用户输入接管：pointer drag/wheel 清相机过渡；近景仍可旋转/缩放。

## 4. 验收（阶段 03 当前）

| 项 | 状态 | 证据 |
|---|---|---|
| 13 个 objectId 稳定 | 已实现 | `registry.js`；`__stage.devices.length=13` |
| overview 绑定 | 已实现 | 13/13 有 `overview` 表示（`snapshot()` 实测） |
| detail 表示 | 未实现（阶段 04–06） | `detailRepresentation=null`；不冒充 |
| 状态单一来源 | 已实现骨架 | `state.js`；`set/select/snapshot` |
| 总览→近景→返回 | 已实现相机级验证 | `enterDetail('three_phase_separator')` / `exitDetail()` 实测 true |
| 连续录屏 | **未执行** | 本机未完成录屏；阶段 04–06/09 必须补；handoff 记为未执行 |
| 近景状态继承 | 未验证（无 detail 表示） | 阶段 04–06 接入后必须回归 |

## 5. 阶段 04–06 强制契约

- 每个 Hero 的 `.glb`/OBJ 根节点必须有 `userData.objectId`，且与注册表一致；
- 导入后调用 `PETRO_DEVICE_STATE.bind(objectId,'detail',root)`；
- 近景操作（剖切/液位/运行/选择）通过 `set()` 写同一状态；
- 返回总览前，把需要保留的状态同步到 overview 表示（或让 overview 读取状态），不得让两个 Mesh 各存一份；
- 同屏最多一个 `selected`；进入近景不改变 `batch.node`/task 进度，除非任务动作明确推进；
- 阶段 06 的塔全剖、阶段 05 的分离器内部、阶段 04 的井筒内部，均必须提供“总览选设备→近景操作→返回总览”连续录屏。
