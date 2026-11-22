# Phase 03 交接报告 · 世界骨架（rev2 返修）

日期：2026-11-22
阶段：03_SCENE_SKELETON（返修轮 2）
状态建议：**PASS（阶段 03 技术范围）**
用户签收：**阶段 03 待用户签收**；阶段 02 已由用户签收 **ACCEPTED**
起始 Commit：`b5989e99dac6c96e08fdbae59fbc5c450e223355`（rev1 最终记录；原始阶段 03 起点 `605d97a`）
结束 Commit（真实 SHA）：`<PHASE03_REV2_SHA>`（本报告内容提交；最终 tag `phase-03-rev2`）
分支：`main`

## 1. 本轮审查处理

审查报告（用户 2026-11-22）判定 `REVISE`，P1-01–P1-06 已逐项处理；Hero 资产按 `00_MASTER.md` §5 归还阶段 04–06，**不再作为阶段 03 的 P0**。

| 项 | 处理 | 结果 |
|---|---|---|
| P1-01 Store | `bind` 注册后立即 `apply`；`select` 切换到新设备时重置旧设备 structure/animation，清空选择时保留状态；overview/detail 可见性分离；`setOverviewVisible` 重新应用全部表示 | **已修复** |
| P1-02 区域镜头 | `focusZone` 读取 `CAMERAS.position/lookAt` 转 orbit；六区预设逐区校准；1440/1920 复核 | **已修复** |
| P1-03 近景返回 | 保存/恢复 stage、章节链接、任务面板、`__sceneContext`、进入前选择、orbit；清空选择不重置设备结构/动画；文档统一 | **已修复** |
| P1-04 图层元数据 | 地面 Mesh 设 `layerType=environment` + `skipMerge`；合并桶保留 `layerTypes`；`__stage.layers` 可查；断言 environment=4 | **已修复** |
| P1-05 科学文案 | 修改 LEVEL_BRIEF、完成弹窗、AI、chapters、kb-sources、l5/entry 等重复文案；全仓搜索旧表述 | **已修复** |
| P1-06 五关回归 | l1–l5 真实浏览器“进入→核心操作→退出”；深链、章节、塔页、fallback | **已执行** |
| P0-01 阶段 02 签收 | 用户明确回复「签收阶段02。」，阶段 02 记录 `ACCEPTED`；不代填未说过的逐字签收语 | **已关闭** |
| P0-02 Hero 分类 | Hero 未达 ≠ 阶段 03 P0；阶段 04/05/06 分别负责，阶段 09 全局验收 | **已纠正** |

## 2. 修改文件

### 代码

- `web/world/state.js`：bind 即时 apply、select 重置旧设备、overview/detail 可见性、setOverviewVisible 重应用。
- `web/immersion.js`：selectStage 同步逻辑选择；detail 上下文保存/恢复；focusZone 使用注册表相机；图层元数据与计数；科学文案。
- `web/world/registry.js`：六区相机预设校准。
- `web/sandbox.html`：脚本缓存版本、概念空间标注。
- `web/ai.js`、`web/chapters.js`、`web/kb-sources.js`、`web/levels/l5.js`、`web/levels/entry.js`、`web/chapter.html`：科学文案/缓存版本。
- `CHANGELOG.md`：阶段 03 rev2 条目。

### 文档/证据

- `docs/scene-architecture.md`、`docs/scene-map.md`、`docs/device-state-contract.md`、`docs/asset-gaps.md`
- `docs/phase-reports/phase-02-handoff.md`、`docs/experience-design-signoff.md`（阶段 02 签收记录）
- `docs/phase-reports/evidence/phase-03/`：八张 1440/1920 截图、连续录屏、`state-contract.json`、`level-e2e.json`、`fallback.json`、README
- 本报告

## 3. 执行命令与结果

```text
node --check web/immersion.js / web/world/state.js / web/world/registry.js / web/ai.js -> exit 0
GET /index.html, /sandbox.html, /chapter.html?id=drill, /tower.html 等 -> 200
浏览器 Chrome 157（headless/CDP，1440×900）：
  stats -> 142 calls / 52,892 triangles / 327 geometries / 8 textures
  zones=6, devices=13, __auditErrors=[]
  layers={environment:4, infrastructure:10, equipment:5, processLines:1, flowEffects:4, labels:6}
  #stage=0..4 -> drill/gather/store/refine/use；zone 对应 oilfield/gathering/storage/refining/city
  chapter.html?id=store -> 标题“储运调配”，回链 sandbox.html#stage=2
  tower.html -> window.__tower.loaded=true
  canvas 派发 webglcontextlost -> sandbox/tower 均显示 2D fallback 文案
五关 E2E：
  l1 adjust_pressure, l2 choose_outlet, l3 change_liquid_level,
  l4 choose_fraction, l5 select_product；均 interaction 写入，退出后 levelId=null
状态断言（state-contract.json）：
  bind 后 detail 立即得到 half/running；切换后旧设备 external/idle；
  overviewVisible=false 时 overview 隐藏、detail 仍可见；
  返回后 stage=store/zone=storage/selected=floating_roof_tank/structure=full/animation=paused
```

## 4. 证据

| 证据 | 结果 | 路径 |
|---|---|---|
| 总览 1440/1920 | 六区/五 stage、S 形、高差、管线、概念空间声明 | `overview-1440.png`、`overview-1920.png` |
| 六区镜头 | 区域设备成为主视觉；地下见开口/层理/井筒 | `subsurface/oilfield/gathering/storage/refining/city-1440.png` |
| 连续录屏 | 总览→设备近景→现有塔剖切→返回 | `detail-continuity-1440.mp4` |
| 状态契约 | bind/select/可见性/图层/返回上下文 | `state-contract.json` |
| 五关回归 | l1–l5 进入/操作/退出 | `level-e2e.json` |
| 2D fallback | 上下文丢失后 sandbox/tower 均降级 | `fallback.json` |
| 深链/章节/塔页 | #stage 0–4、章节回链、塔页加载 | 本节命令记录 |

**未提供**：高模 detail 的真实状态继承录屏、FPS/内存长跑、跨浏览器、真实用户测试、移动端。不得把这些写成已通过。

## 5. P0 / P1 / P2

### P0

- **无阶段 03 技术 P0 剩余。**
- 阶段 02 用户签收：**已关闭**（用户原话 `签收阶段02。`，2026-11-22；记录在 `phase-02-handoff.md` §8 与 `experience-design-signoff.md`）。
- Hero Asset Gate：**未来阶段视觉门禁 BLOCKED**（04 地下、05 分离器、06 塔；09 全局证据），不是阶段 03 P0。

### P1（本轮已关闭）

- P1-01 Store：bind/select/overviewVisible 三项断言通过。
- P1-02 区域镜头：`focusZone` 消费注册表相机，六区 1440 复核。
- P1-03 返回上下文：stage/章节/任务面板/context/选择恢复；无选择时恢复空。
- P1-04 图层：地面不参与合并并保留 layerType，environment=4。
- P1-05 科学文案：旧“压到接近零/蒸发最少/四种产品/都来自石油/压没”已清理；仅保留“不是零损耗”等限定句。
- P1-06 五关回归：l1–l5 E2E 通过；深链/章节/塔页/fallback 通过。

### P2（后续）

- P2-01 视觉仍偏低模展台；阶段 04–06/07 做地形过渡、台地边缘、远景轮廓、光照层次，不推翻坐标。
- P2-02 性能仅单场景快照（142 calls/52,892 tris），阶段 09 做 FPS/内存长跑与切换泄漏检查。
- P2-03 Blender 可执行文件未定位；`.blend→.glb` 导出未实跑；阶段 04 前必须验证。
- P2-04 AI 面板已挂载，但 `/api/ask`/`/api/gen` 的 Key 缺失/代理不可用未测试；阶段 08 验收。
- P2-05 真实用户测试、跨浏览器、移动端不在阶段 03 范围。

## 6. 验收矩阵（更新）

| 验收项 | 判断 | 说明 |
|---|---|---|
| 连续产业链概念沙盘 | **通过（骨架）** | 六区/五 stage/开口/高差/管线；低模视觉列 P2 |
| 场景图层组织 | **通过** | layerType 保留；environment=4；合并桶记录 layerTypes |
| 设备/知识注册表 | **通过** | 6 zone/13 device/5 route/3 endpoint |
| 设备状态 Store | **通过** | bind/select/可见性断言 |
| 区域镜头 | **通过** | 注册表 CAMERAS；六区截图 |
| 设备近景/返回 | **通过（相机/上下文）** | stage/章节/context/选择恢复；高模 detail 待 04–06 |
| 五关/深链/塔页兼容 | **通过** | l1–l5 E2E、#stage 0–4、chapter、tower |
| 科学表达 | **通过** | 旧表述已清理；保留限定句 |
| 静态无 API | **通过** | 静态服务可用；API 能力不在本阶段 |
| 资产缺口/工作流 | **通过（策略）** | 责任区分；Blender 未实跑列 P2 |
| 浏览器证据 | **通过（范围）** | 1440/1920 截图、状态/五关/fallback 证据；录屏为相机级 |
| Hero Asset Gate | **未来阶段 BLOCKED** | 阶段 04/05/06 各自验收 |
| 前置阶段 02 签收 | **ACCEPTED** | 用户 2026-11-22 原话记录 |

## 7. 追溯

- zoneId：`subsurface/oilfield/gathering/storage/refining/city`
- stageId：`drill/gather/store/refine/use`（#stage=0..4 保留）
- objectId：13 个；知识 ID `kb_formation/kb_drill/kb_gather/kb_store/kb_refine/kb_use`
- 新增 API：`enterDetail/exitDetail/focusZone/focusOverview`；不改变既有五关 actionId
- 深链/fallback/章节/塔页保留；`__sceneContext` 只增字段，不改旧字段
- `/api/ask` 契约未改

## 8. Agent recommendation

**PASS（阶段 03 技术范围）。**

理由：审查报告的 P1-01–P1-06 均有代码修改与浏览器证据；五关、深链、章节、塔页、fallback 实测；阶段 02 已用户签收；Hero 按 MASTER 归 04–06，不再作为阶段 03 P0。

保留限制：Hero 视觉门禁 `BLOCKED` 属于未来阶段；detail 高模/状态继承未实现；性能/Blender/API/真实用户测试未完成，已列 P2，不冒充通过。

## 9. User acceptance

- 阶段 02：**ACCEPTED**；用户原话 `签收阶段02。`；日期 2026-11-22。
- 阶段 03：**待用户签收**。请审阅本报告及 `docs/phase-reports/evidence/phase-03/`；Agent 不代签。
- 阶段 04 未开始；取得阶段 03 用户签收后再进入。

## 10. 停止声明

**阶段 03 rev2 已停止，等待用户签收；不执行阶段 04。**
