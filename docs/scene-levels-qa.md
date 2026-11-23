# 五关功能回归（2026-11-22）

## 结论（headed Chrome + CDP，全通过）

用真实浏览器（非 headless）跑完整「进入 → 操作 → 退出」：

| 关卡 | 进入 | 操作 → interaction | 退出 | 退出后上下文 |
|---|---|---|---|---|
l1 地下开采 | ✅ | 压力滑杆 → `adjust_pressure 50 示意百分比` | ✅ | level=false, levelId=null |
l2 地面处理 | ✅ | 出口 oil → `choose_outlet oil 示意` | ✅ | level=false, levelId=null |
l3 储运 | ✅ | 液位滑杆 → `change_liquid_level 50 示意百分比` | ✅ | level=false, levelId=null |
l4 炼化 | ✅ | 馏分 chip → `choose_fraction topgas 示意` | ✅ | level=false, levelId=null |
l5 产品去向 | ✅ | 产品 汽油 → `select_product 汽油 1 件` | ✅ | level=false, levelId=null |

复现：`tools/level-e2e.cjs`，配合以 `--remote-debugging-port=9333` 启动的 Chrome。

## 测试口径

- 入口用产品真实路径 `__stage.levelHook(i)()`，不是直接 `__lN.enter()`（后者不写 `levelId`，只适合单关调试）；
- 为了自动化 3D 拾取，给关卡导出了两个测试钩子：`__l2.pickOutlet(key)`、`__l5.toggle(index)`；它们不是页面 UI，也不替代真实点击；
- 退出统一调用各关 `__lN.exit()`，等飞行动画结束后读 `__stage.isLevel()` 与 `__sceneContext`。

## 踩过的坑（不是产品 bug）

- 第一轮 headed 测试五关全部卡在“退出未完成”：新开的 Chrome 窗口被终端遮挡，Chrome 对 occluded window 节流 rAF，1.5 s 飞行补间需要多帧、迟迟不结束；
- 加 `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows` 并 `Page.bringToFront` 后全部通过；
- headless 下同样因为帧率过低，退出动画会“看起来没反应”，不能据此判失败。

## 已修 bug

`__stage.back()` 退出时未清 `__sceneContext.levelId/interaction`，导致退出后 AI 仍以为在关卡里；已在 `back()` 中清空并广播 `scene-context`，headed 复测五关退出后均为 `levelId:null`。

## 仍未覆盖

- 真实鼠标/触摸在画布上的 3D 拾取（自动化用的是测试钩子）；
- 关卡内的完成判定（例如 l5 全选正确的“通关”提示）；
- 移动端与低端机。
