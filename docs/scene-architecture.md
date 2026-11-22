# Phase 03 · 场景骨架与代码架构

日期：2026-11-22
阶段：03_SCENE_SKELETON
性质：**产业链概念沙盘**，非真实地理厂区；所有设备是教学示意，不是工程仿真/数字孪生。

## 1. 运行与入口

- 生产目录：`web/`；零构建，原生 HTML/CSS/JS；Three.js r180 本地加载。
- 入口：`sandbox.html`；`#stage=0..4` 深链保持；`?view=overview|subsurface|oilfield|gathering|storage|refining|city` 为阶段 03 新增的**证据/聚焦视图**，不替代 `#stage`。
- 章节回链：`chapter.html?id=...`；塔页：`tower.html`；2D fallback 保留。
- 无 API 时：三维、五关、知识、设备卡可运行；`/api/ask`/`/api/gen` 不可用时不影响静态场景。

## 2. 模块划分

| 模块 | 文件 | 职责 |
|---|---|---|
| 场景注册表 | `web/world/registry.js` | `sceneId/zoneId/stageId/objectId/knowledgeIds`、设备显示名、资产路径、锚点、能力、章节入口、路径 |
| 逻辑设备状态 | `web/world/state.js` | 单一状态源：selection/structure/animation/level；overview/detail 表示绑定；订阅与快照 |
| 世界骨架 | `web/immersion.js` | 地形开口、台地、区域 group、设备几何/OBJ、管线/粒子、相机、标签、五关接口、上下文 |
| 五关 | `web/levels/*.js` | 既有 l1–l5；仍按 `__stage.nodes/levelHook` 接入，不另起状态系统 |
| AI/知识 | `web/ai.js`、`kb-sources.js` | 兼容旧 `__sceneContext`；阶段 03 只修复面板挂载回归，不扩展 AI 决策 |

`immersion.js` 内部按职责保留代码段（不为了形式全部拆文件）：

- **environment**：地形基底、真实地面开口、地下分层体块、远景低模；
- **infrastructure**：台地、挡墙、井场平台、工艺脊线支架、地面物流带；
- **equipment**：五个 stage group 与 13 个 `objectId` 设备；
- **processLines**：`pipeGroup` / `path_*`；
- **flowEffects**：`particles`、井筒/分离/塔内部粒子；
- **hotspots**：Raycaster 命中入口（模型 + 设备卡 + 标签等价入口）；
- **anchors**：注册表 `anchor` 与 `cam_*`；
- **labels**：DOM `.object-label` 与地面 canvas 标签。

阶段 03 没有重排全部代码；新增模块只覆盖注册表与状态，入口/深链/五关保持不变。

## 3. 空间骨架

### 3.1 连续产业链概念空间

- 五个既有 stage 保留：`drill / gather / store / refine / use`；
- 六个视觉 zone：`subsurface/oilfield` 共用 `drill`，不新增 `#stage=5`；
- 真实地面开口：`x −33..−15 / z 1..15`，地下层理、井筒、井口/抽油机在开口与井场平台内；
- 台地高差：gathering 0.6、storage 1.6、refining 2.6、city 0.9；区域间用对角管线、支架和地面物流带连接；
- 区域关系标注为“产业链空间示意 / 非真实地理比例”。

### 3.2 约束

- 不是五个独立展台；也不是把五区排成单一直线；
- 不制造“地下在厂区正下方”的真实地理承诺；只是概念剖面；
- 五关仍按 `modelGroups[index].position` 取锚点；阶段 03 已随新坐标重算。

## 4. 对象注册表

`window.PETRO_REGISTRY`：

```text
sceneId: petro-chain-v3
zones[6]: zoneId, stageId, stageIndex, center, size, elevation, anchors, camera, path
devices[13]: objectId, displayName, zoneId, stageId, stageIndex,
             knowledgeIds, chapterId, levelIndex,
             modelPath, modelNode, overviewRepresentation,
             detailRepresentation, anchor, capabilities, assetStatus
routes[5]: pathId, from, to, mode
endpoints[3]: gas_recovery_header, flare_stack, produced_water_treatment
```

规则：

1. 同一个设备在总览、关卡、AI、设备卡使用同一 `objectId`；显示名只在注册表维护。
2. `detailRepresentation` 阶段 03 为 `null` 或待建 ID，阶段 04–06 必须填真实资产；不允许另起 `objectId`。
3. 新增 ID 必须先登记注册表，再写场景；不得在代码里临时拼名字。
4. 旧 `__sceneContext.sceneId='oil_industry_journey'` 保留为稳定别名；新增 `registrySceneId='petro-chain-v3'`、`zoneId`、`deviceName`。

## 5. 逻辑设备状态

`window.PETRO_DEVICE_STATE`：

- 每个设备：`selection(default/hover/selected)`、`structure(external/half/full/transparent)`、`animation(idle/running/paused)`、`level`、`visible`；
- `bind(objectId, 'overview'|'detail', object3d)` 绑定表示；状态只在本 store 改；
- `select` 清旧设备、设新设备；`set` 广播；`snapshot/reset` 供调试/会话；
- `enterDetail/exitDetail`（`__stage`）保存/恢复相机、stage、章节/任务面板、`__sceneContext` 与进入前选择；清空选择不重置设备结构/动画，演示“总览→近景→返回”连续关系；
- 当前只有 `overview` 表示；`detail` 待阶段 04–06 接入，阶段 03 不假装已有高细节模型。

详见 `docs/device-state-contract.md`。

## 6. 相机与导航

- 初始总览：`target(2,1.8,−1) / radius 58 / azimuth .52 / elevation .40`；
- `__stage.focusZone(zoneId)`：区域聚焦，基于注册表中心与可见尺寸；
- `__stage.enterDetail(objectId)`：设备近景，基于对象包围盒；
- `__stage.exitDetail()`：恢复进入前 orbit/选择；
- `__stage.focusOverview()`：回总览；
- 用户 pointer drag / wheel 立即清 `cameraTransition`，镜头可被接管；`prefers-reduced-motion` 下瞬移；
- 关卡内相机仍由关卡脚本管理（`activeScene/activeCamera`），总览 orbit 不覆盖。

## 7. 帧调度、可见性与资源

阶段 01 审计项的代码核验：

| 项 | 当前实现 | 结论 |
|---|---|---|
| RAF | 单一 `requestAnimationFrame(render)`，`document.hidden` 跳过渲染 | 已核验，保留 |
| deltaTime | `delta = min(50, timestamp-lastFrame)`；`__stage.frame` 暴露 `delta/elapsed/playing/hidden` | 已核验并暴露统一读取 |
| 页面隐藏/退出 | `document.hidden` 跳过；WebGL context lost/restored 有 fallback；关卡 `back()` 清 activeScene | 已核验 |
| Raycaster | 只在 `pointerup` 且未拖动时命中 `modelGroups`；无逐帧 raycast | 已核验，不存在高频 raycast |
| 资源释放 | `mergeStaticMeshes` dispose 被合并几何；Hero 替换 dispose 旧几何/材质；context lost 保留 fallback | 已核验；阶段 04–06 新增资产必须沿用 dispose/所有权约定 |
| 纹理 | 当前主要为 canvas 标签/材质，无大纹理；Hero 无贴图 | 阶段 04–06 按 asset-pipeline 登记 |

> 未把“存在 RAF”当成性能通过；真实 FPS/内存仍需阶段 03/09 实测。

## 8. 兼容与未完成

- 保留：五个区域入口、五个关卡入口、`#stage=N`、章节回链、塔页、2D fallback、无 API 三维运行。
- 五关逐关回归已执行（l1–l5 进入/操作/退出），结果与证据见 phase-03 handoff；深链/塔页/fallback 另列。
- `ai.js` 的 `insertBefore` 回归已修复为 `src.parentNode.insertBefore`，面板可挂载；AI 请求/无 Key 降级未在本阶段测试。
- 未实现完整导览故事（阶段 07）、Hero 内部结构（04–06）、全套真实资产（04–06/09）。
- 程序化地形/基础几何体是**明确占位**，不是高精度工业模型。

## 9. 验收对应

| 验收 | 当前证据 |
|---|---|
| 不是五个独立展台 | 连续地形 + 台地 + 连接管线，见 overview 截图 |
| 有纵深，不是单一直线 | S 形坐标 + 高程 + 对角管线，见 scene-map §10 |
| 地下/地上可读 | 地面开口 + 分层体块 + 井筒/井口，见 subsurface 截图 |
| 概念非真实地理 | 页面文案“产业链空间示意”，文档声明 |
| 关键设备可识别 | 13 个 objectId + 注册表 + 相机聚焦 |
| 五关/深链/塔页 | 深链 `#stage=3` 实测；hooks 5 个；塔页未改 |
| 镜头可中断 | pointer drag 清 cameraTransition |
| 静态无 API | 静态服务实测，无 API 依赖 |
