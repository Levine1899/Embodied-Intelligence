# Phase 07 · 沉浸导览状态机

日期：2026-11-23  
实现：`web/journey.js`，入口为 `web/sandbox.html` 的「沉浸导览」；步骤运行在同一个 Three.js 场景、同一注册表和同一设备状态源上。  
定位：科普示意，不是某一真实油田的地理线路，也不是一桶原油的固定加工路线。

## 1. 状态机定义

```text
idle
  └─ start(用户点「沉浸导览」)
active(index=0..9, playing=true|false, busy=true|false, status=active)
  ├─ next ───────────────► active(index+1)（最后一步结束）
  ├─ pause ──────────────► active(playing=false)，镜头/关卡保留
  ├─ pointerdown/wheel ──► pause（手动接管优先）
  ├─ resume ─────────────► active(playing=true)，不自动抢回镜头
  ├─ exit ───────────────► stopped（退出关卡 → 自由探索）
  └─ last step ──────────► completed（档案打开）
stopped / completed
  └─ start 可重新开始
```

实现字段：

```js
tour = {
  active, index, playing, busy, status, token, completed
}
```

- `busy=true` 时禁止再次推进；`token` 防止旧的异步转场覆盖新步骤。
- 不使用固定定时器自动推进；每一步由用户点「开始 / 继续 / 结束导览」推进。
- 转场由当前关卡的 `enter/exit`、`fly`、`setLevel`、`selectFraction` 等真实 API 驱动。
- 用户拖动/滚轮/触摸会暂停；暂停时 `pauseScene()` 暂停 l2 分离、l3 泵、l4 汽液，继续时 `resumeScene()` 恢复；暂停期间关卡操作面板临时显示，允许接管。

## 2. 步骤字段

| 字段 | 含义 |
|---|---|
| `stepId` | 稳定步骤 ID，见下表 |
| `stage` | 0–4 厂区环节；null 表示全景/回顾 |
| `objectId` | 当前讲解主设备（3D 注册表 objectId） |
| `objectIds[]` | 该站涉及的设备集合 |
| `sceneState` | 镜头到达后的场景状态 |
| `animation` | 实际触发的设备/工艺动画 |
| `narration` | 短讲解（文字始终显示；可选浏览器语音朗读） |
| `knowledge[]` | 本步知识点 ID |
| `shotId` | 镜头脚本 ID |
| `moveType` / `direction` | `dolly/crane/orbit/follow` + `in/out/up/down` |
| `completion` | 本步完成条件 |
| `next` | 下一 stepId |
| `exit` | 退出行为 |
| `enter()` | 进入时的真实场景动作 |

## 3. 主线十站

| # | stepId | stage | 主设备 | 场景状态变化 | 镜头 | 完成条件 |
|---|---|---|---|---|---|---|
| 01 | `tour_overview` | — | — | 总览全景，路线低亮 | `shot_overview` dolly/in | 用户点「开始」 |
| 02 | `tour_underground` | 0 | `reservoir` | 进入 l1；储层高亮；图例出现 | `shot_descend` crane/down | 用户点「继续」 |
| 03 | `tour_reservoir` | 0 | `wellbore` | 井筒部件高亮；沿井筒上行 | `shot_lift` crane/up | 用户点「继续」 |
| 04 | `tour_wellhead` | 0 | `wellhead` | 井口/采油树成为焦点 | `shot_lift` follow/up | 用户点「继续」 |
| 05 | `tour_separator` | 1 | `three_phase_separator` | 进入 l2；半剖打开；三相流线启动 | `shot_separate` dolly/in | 用户点「继续」 |
| 06 | `tour_storage` | 2 | `floating_roof_tank` | 进入 l3；浮顶液位 72%；泵送启动 | `shot_store` crane/up | 用户点「继续」 |
| 07 | `tour_refining` | 3 | `atmospheric_tower` | 进入 l4；全剖；汽液接触 | `shot_refine` crane/up | 用户点「继续」 |
| 08 | `tour_fractions` | 3 | `atmospheric_tower` | 柴油馏分路径高亮 | `shot_refine` dolly/in | 用户点「继续」 |
| 09 | `tour_products` | 4 | `plastic_bottle` | 进入 l5；至少一个石油路线产品选中 | `shot_city` dolly/in | 用户点「继续」 |
| 10 | `tour_summary` | — | — | 退出关卡；全景；打开探索档案 | `shot_return` crane/out | 导览结束 |

## 4. 动态同步

| 站 | 真实动作 |
|---|---|
| 地下 | `__l1.selectReservoir()`，显示储层/油气水图例 |
| 井筒 | `__l1.selectPart('casing')`、`__l1.traceUp()`，镜头随井筒上行 |
| 井口 | `__l1.selectWellhead()` |
| 分离 | 进入 l2，`__l2.applyStructure(true,false)` + `__l2.startSeparation()` |
| 储运 | 进入 l3，`selectTank('floating_roof_tank')` + `setLevel(72)` + `startPump()` |
| 炼化 | 进入 l4，`setLevel(2,false)` + `startFlow()` |
| 馏分 | `__l4.selectFraction('diesel')` |
| 产品 | 进入 l5，`__l5.select(0)`（不是 toggle，避免已选状态被取消） |

非当前讲解对象不统一闪烁；每个站只突出当前设备/路径。

## 5. 镜头与用户接管

- 关卡内部相机由各关卡 `fly()` 实现起止缓动；总览使用 `selectStage` / `focusOverview`。
- 转场前先退出上一关，等待 2000ms；进入下一关后等待 1400ms 再允许下一步。
- `prefers-reduced-motion` 下不自动播放（本实现本身就是显式推进）；关卡内的飞行动画沿用各自降级策略。
- 用户 `pointerdown` / `wheel` / `touchstart` 立即 `pause`，按钮变为「继续」，不会自动抢回。
- 退出会调用当前关卡 `exit()`，再 `stage.back()` 兜底，确保不留下错误的相机/动画状态。
- 导览 CSS 会隐藏关卡操作面板，只保留场景和导览卡；退出后移除 `journey-tour`，原关卡 UI 由关闭/退出流程清理。

## 6. 声音

- 默认静音；声音开关在场景工具条，音量 0–100。
- 可选浏览器语音：`朗读 / 暂停 / 停止朗读`，使用 `speechSynthesis`，没有音频文件也能工作；不支持时按钮隐藏/不阻塞。
- `assets/site/ambient.js` 现场合成低频环境音，明确为“氛围示意，非现场录音”，不模拟真实声级。
- 无音频资产/无 WebAudio 时仅显示不可用，不阻塞导览。
- 每站切换 `Ambient.setStage(stage)` 并合成设备提示音，但只有用户开启声音后才可听。
- 语音讲解为浏览器可选朗读，不保存录音；文字讲解始终可见。

## 7. 档案与记录

- 结束/退出时写入 `JourneyStore`（localStorage）：导览 ID、完成站数、设备集合、知识点集合、状态。
- 第 10 站打开「本轮导览结束 · 探索档案」；用户也可随时点工具条「档案」查看。
- 只在本机保存；不上传个人行为记录；清空需用户确认。

## 8. 可验证 API

```js
__tour.start() / __tour.stop() / __tour.next()
__tour.pause() / __tour.resume()
__tour.openArchive()
__tour.steps      // 步骤定义（stepId/stage/objectId/completion/shotId）
__tour.state      // active/index/stepId/playing/busy/status/total
```

## 9. 边界

- 3D 是教学概念沙盘，不表示真实油田坐标、真实管道或真实物流。
- 不编造压力、温度、流量、收率、排放量。
- 导览可以被打断/退出；退出后的设备状态由关卡保留或清理，不伪装成“与任务完全独立”。
- 语音、自动字幕、移动端不在本阶段验收范围。
