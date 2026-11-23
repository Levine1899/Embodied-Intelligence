# Phase 07 · 任务探索状态机

日期：2026-11-23  
任务：`M-YJ-001 · 追踪批次 YJ-001`  
实现：`web/mission.js`；入口为 `web/sandbox.html` 的「任务关卡」。  
定位：前端教学状态机，不是工程仿真；任务结果由用户在真实三维关卡里的操作和场景状态决定，不是选择题、积分或自动播放。

## 1. 任务叙事

- 用户角色：能源探索见习员。
- 教学批次：`YJ-001`，是一枚**教学追踪标记**，不是一滴真实原油，也不进入设备内部。
- 任务目标：从储层出发，经过井口、三相分离、储运、炼化，最后选择一个产品应用，形成能源探索档案。
- 五关保留：l1 地下、l2 分离、l3 储运、l4 炼化、l5 产品；任务只在其上增加目标、线索、状态与复盘，不另起场景。

## 2. 状态定义

```text
idle
  └─ start（任务关卡 / 接受任务）
active(step=0..4)
  ├─ 完成本段 ──► active(step+1)（等待用户进入下一段）
  ├─ 错误操作 ──► active + error/lastError（可恢复，不结束）
  ├─ pause ─────► paused（保留关卡/进度）
  ├─ resume ────► active（或重新进入本段）
  ├─ exit ──────► paused + 退出关卡 + mode=free（可回来）
  ├─ reset ─────► idle（清空本任务状态）
  └─ 最后一段 ──► complete（打开总结/档案）
```

持久化：`localStorage['kepu.mission.v1']`；只保存本机任务/操作摘要，不上传。

## 3. 步骤与真实操作

| stepId | 关卡 | 目标 | 可发现线索 | 用户实际操作 | 成功判定 | 知识 |
|---|---|---|---|---|---|---|
| M1 | l1 | 把油带到井口 | 储层图例、井筒 | ① 点击储层；② 点「沿井筒上行」 | `inspect_reservoir` + `trace_up_wellbore` | kb_formation |
| M2 | l2 | 把混合物分开 | 三个出口、颜色/位置 | 剖开、启动分离；气/油/水出口分别选正确去向 | `__l2.solved` 三项全 true 且已启动分离 | kb_gather |
| M3 | l3 | 选择怎么存、怎么送 | 浮盘贴液面、油气空间 | 将液位调到 ≥70%，启动泵送 | `change_liquid_level≥70` + `start_pump` | kb_store |
| M4 | l4 | 打开蒸馏塔 | 塔板、侧线、馏分 | 切到全剖；选择柴油馏分 | `inspect_tower_structure=full` + `select_fraction=diesel` | kb_refine |
| M5 | l5 | 选择一个终端去向 | 产品台、路线提示 | 至少选择一个石油路线产品 | `select_product` 至少一次 | kb_use |

这不是“点开始任务就自动通关”：M2 必须亲手完成三路去向；M3 必须改变液位并启动泵；M4 必须全剖并选对馏分。

## 4. 交互矩阵

| 任务 | 输入 | 前置 | 状态变化 | 可观察结果 | 错误/恢复 |
|---|---|---|---|---|---|
| M1 观察储层 | 点击储层/按钮 | 进入 l1 | flags.reservoir=true | 储层高亮、图例出现 | 无惩罚 |
| M1 沿井筒上行 | 点「沿井筒上行」 | 已观察储层（引导） | flags.up=true | 镜头到井口、管线出现 | 可重复观察 |
| M2 剖开/启动 | 按钮 | 进入 l2 | structure=half, animation=running | 内部/三相路径出现 | 可暂停/重播 |
| M2 三路去向 | 选出口→选去向 | 分离运行 | solved.gas/oil/water=true | 路径/落位；错误回流 | 错误红色拦截，可改选 |
| M2 完成 | 三路正确 | M2 | step 完成 | 知识章 + 本段反馈 | 不扣分 |
| M3 液位 | 拖 slider | 进入 l3 | flags.level | 浮盘/油气空间变化 | 低于阈值提示 |
| M3 泵送 | 点启动 | 液位≥70% | flags.pump=true | 泵送粒子/管线 | 可暂停/重播 |
| M4 全剖 | 点「全剖」 | 进入 l4 | flags.full=true | 塔板/侧线可见 | 可恢复外观 |
| M4 馏分 | 点柴油 | 全剖 | flags.fraction=diesel | 侧线路径 | 选错只提示，不失败 |
| M5 产品 | 点产品台/物品 | 进入 l5 | flags.product | 产品高亮/计数 | 可再选 |
| 提示 | 点「提示」 | active | hintLevel/hintsUsed | 本段提示文本 | 自动 25s 提示，最多 3 级 |
| 暂停 | 点「暂停」 | active | status=paused | 面板暂停说明 | 点继续恢复 |
| 退出 | 点「退出」 | active/paused | paused + free | 返回总览、进度保留 | 可再次任务恢复 |
| 重置 | 「重置」+确认 | 任意 | idle | 清空任务状态 | 不影响五关本地通关记录 |

## 5. 失败与分级提示

- **失败不是游戏结束**：M2 的错误去向通过 `assign_outlet_target` 的 `result='error'` 捕获；面板显示原因，允许改选。
- **提示分级**：`hintLevel` 1–3，对应“先看设备/滑块”“给原理方向”“指出正确对象”；不自动执行操作。
- 自动提示：任务 active 且 25s 无完成时提升一级；`hintsUsed` 在复盘中显示，不扣分。
- **注意**：提示文本优先显示在当前错误提示之上；错误仍保存在 `state.errors` 供复盘。

## 6. 任务完成、失败、恢复与复盘

- 每段成功：`steps[i].done=true`，追加 knowledge，`step+1`；不自动进入下一关，用户点「进入本环节」。
- 最终成功：`status=complete`、`finishedAt`，显示五段总结 + 提示次数 + 知识回顾；按钮：再走一次 / 自由探索 / 查看档案。
- 失败/错误：`status` 仍为 active（除非用户退出），`errors[]` 保留最近 8 条；可继续操作。
- 暂停：`status=paused`，关卡/设备状态保留；继续按钮可恢复。
- 退出：`status=paused`，退出关卡并切到自由探索；任务卡隐藏，进度/P 提示保留；再次点任务可恢复。
- 重置：清空任务状态，退出关卡，不影响五关已通关记录；需确认。
- 页面刷新：从 localStorage 恢复步骤/标记/知识/错误/提示；关卡需要用户重新进入（相机/动画不伪恢复）。

## 7. 与总览/自由探索的一致性

- 同一 `objectId`、同一 `PETRO_DEVICE_STATE`、同一 `__sceneContext`。
- 任务卡只读取实际 `scene-context` 中的 `interaction.actionId/result`，不伪造操作成功。
- 自由探索仍可直接进入任一关卡；任务暂停后不阻塞自由探索。
- 五关原有本地通关标记不与任务状态混用；任务重置不删除五关进度。

## 8. 可验证 API

```js
__mission.start() / exit() / reset()
__mission.pause() / resume() / hint() / enter()
__mission.state      // status/step/steps/flags/knowledge/hintsUsed/errors
__mission.definitions
__mission.summary
```

## 9. 验收边界

- 成功：真实完成五段操作（至少 M2 三路去向不可由选择题替代）。
- 失败：至少一次错误去向错误提示与可恢复路径。
- 提示：至少一次手动提示可见。
- 暂停/退出/继续/重置：分别可观察。
- 任务完整记录只在本机；不承诺工程仿真、真实收率或真实物流。
- 语音、AI 生成、移动端不在本阶段范围。
