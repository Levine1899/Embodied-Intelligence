# 沙盘场景实现说明（scene-sandbox）

文件：`web/immersion.js`（沙盘）、`web/levels/*.js`（五关）、`web/sandbox.html`（壳与 UI）

## 1. 初始化顺序

`initThree()` → 场景/雾/相机/渲染器/灯光 → `buildModels()`（连续地形 + 五区 + 管线）→ `resize()` → `buildModels` 之后绑定 pointer/wheel → `updateTask()` → 导览与模式代码 → 关卡脚本按 `__lvlEntry` 注入。

渲染循环只有一处 `requestAnimationFrame(render)`，使用真实 `delta`（上限 50ms），`document.hidden` 时跳过渲染；关卡自己的 loop 由 `running` 控制，退出关卡后停止。

## 2. 对象与释放

- 材质以 `material()` 创建，`mesh()` 内 `surface.clone()`，避免共享材质被单对象改色污染。
- 关卡进入时 `setOverviewVisible(false)` 隐藏总览设备，退出恢复；关卡 Group 在首次进入时创建并复用（`if (!G) build()`），未做逐关销毁，属已知内存常量。
- 塔页：OBJ 加载成功后才 `setLevel(0)`；失败走 `showFallback`。

## 3. 镜头与输入

- 总览：`updateCamera()` 用 orbit（azimuth/elevation/radius/target）计算相机；`moveCamera()` 700ms smoothstep。
- 用户输入：`pointerdown/move/up`、`wheel` 直接改 orbit 并清空 `cameraTransition`；导览模式下先暂停导览，再接管。
- 关卡：进入后 `stage.use(scene, camera)`，关卡自己控制相机（l1–l5 的 fly 函数），总览 `updateCamera` 在 `activeScene` 时让位。
- reduced-motion：`moveCamera` 直接赋值，不做缓动；导览不自动播放。

## 4. 上下文对象

```js
window.__sceneContext = {
  sceneId: 'oil_industry_journey',
  stageId: 'drill|gather|store|refine|use|overview',
  levelId: null,
  selectedObjectId: 'three_phase_separator',
  knowledgeIds: ['kb_drill'],
  experienceMode: 'tour|free|task',
  interaction: { action: 'change_liquid_level', value: 82, unit: '示意百分比' }
}
```

- `selectStage(index, focus, objectId)` 更新并 `dispatchEvent('scene-context')`；AI 面板同步标题。
- 设备点击：射线命中后向上找 `userData.objectId`，再找 `userData.stage`，把 objectId 传入。
- 关卡内部通过 `window.__stage.setInteraction(action,value,unit)` 回写：l1 压力差、l2 出口、l3 液位、l4 馏分、l5 产品；进入关卡时 `levelId` 置为 `l1–l5`。
- 设备卡片：`showDeviceCard(objectId,index,anchor)` 按三维锚点投影定位（`updateDeviceCard()` 每帧更新），越界夹取；进入关卡自动隐藏；关闭清空 `selectedObjectId`。
- 操作历史：`history` 保留 12 条，`__sceneContext.history` 带最近 8 条。

## 5. AI 兼容

`web/ai.js` 的 `/api/ask` 请求体保持 `{question, ctx, tier, mode}`；`ctx` 数组在原有环节名后追加“产业链环节 / 当前设备 / 知识点 / 本轮操作 / 体验模式”的文本行，旧代理无需改动。`/api/gen` 未改契约。

## 6. 模式与导览

- 页面只有一个可见入口 `#tour-cta`（“开始导览”）；三模式卡已从可见 UI 移除，默认是自由探索。
- `.modebar` 三个旧按钮保留为 `hidden` 程序化兼容钩子：`data-mode="tour|free|task"`，不再占用页面空间；任务从右侧“任务”栏进入。
- `window.__tour` 暴露 `start/stop/next/pause/state`，便于测试。
- 导览卡片 `.tour-card` 显示步骤、标题、讲解、暂停/下一步/退出；任意 `pointerdown|wheel|touchstart` 暂停。
- 导览走 `selectStage()`，因此右侧讲解、章节链接、场景上下文同步更新。
- 地下开采（l1）清理：不再显示长教学信息框、状态/压力滑条、底部工具条，以及“沿井筒上行/暂停流动”按钮；保留地层/井筒 chip 与观察控制。
- l1 抽取动画：储层两侧汇入流 + 井筒上升粒子 + 射孔脉动环；左栏恢复原压力滑块，不显示文字说明/操作引导；滑块 ≥50% 写入 `trace_up_wellbore`（抽取动画）。

## 7. 已知限制

- 设备卡片已接到上下文与 AI；画布坐标点击未做自动化测试。
- interaction 只保留最近一次操作，没有历史队列。
- 声音未实现。
