# 五关功能回归（2026-11-22）

测试方式：本地 static server + ego headless Chromium，逐关刷新页面，调用真实入口 `window.__stage.levelHook(i)()`，再操作面板控件、读 `window.__sceneContext`。

| 关卡 | 进入 | 面板 | levelId | 控件交互 → interaction | 退出 |
|---|---|---|---|---|---|
l1 地下开采 | ✅ | ✅ | l1 | 压力滑杆 → `adjust_pressure 50 示意百分比` | 未测 |
l2 地面处理 | ✅ | ✅ | l2 | 需在 3D 里点出口，未自动化 | **未通过**（headless rAF 节流，飞行动画未走完；真浏览器待验） |
l3 储运 | ✅ | ✅ | l3 | 液位滑杆 → `change_liquid_level 50 示意百分比` | 未测 |
l4 炼化 | ✅ | ✅ | l4 | 馏分 chip → `choose_fraction topgas 示意` | 未测 |
l5 产品去向 | ✅ | ✅ | l5 | 需点 3D 产品，未自动化 | ✅ 返回总览；**退出后 levelId 残留 l5 → 已修** |

## 发现并修复

- `__stage.back()` 退出时只清 `activeScene`，没有清 `__sceneContext.levelId/interaction`，导致退出后 AI/上下文仍以为在关卡里。
- 修复：`back()` 里把 `levelId`、`interaction` 置空并广播 `scene-context`；l5 退出后复测为 `levelId:null, interaction:null`。
- 直接调用 `window.__lN.enter()` 不会经过 `levelHook`，因此 `levelId` 不写；这是测试写法问题，不是产品路径问题。

## 未覆盖

- l2 出口点选、l5 产品点选（都是 3D 拾取，需要画布坐标点击或暴露内部方法）；
- l1/l3/l4 的退出（只有 l5 有直接可点的返回按钮，其余靠完成流程）；
- 真浏览器下的退出动画（headless 帧率过低，飞行动画需要多帧）。
