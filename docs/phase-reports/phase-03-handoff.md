# Phase 03 交接报告 · 世界骨架

日期：2026-11-22
阶段：03_SCENE_SKELETON
状态建议：**REVISE**
用户签收：**待用户签收**
起始 Commit：`605d97a3f9affb477bf54cf551e8dea5ac97d463`
结束 Commit（真实 SHA）：`a7028a73131c2ac039d20784a7d38e17a29eacec`（本报告内容提交；最终记录提交见 tag `phase-03-rev1`）
分支：`main`
工作区 `git status --short`：空（提交后复核）

## 1. 前置检查

已读：

- `docs/agent-prompts/00_MASTER.md`
- `docs/agent-prompts/PHASE_HANDOFF_TEMPLATE.md`
- 本阶段 Prompt（用户 2026-11-22 下发）
- `docs/phase-reports/phase-02-handoff.md`
- `docs/audit-baseline.md`、`docs/asset-inventory.md`
- `docs/experience-design.md`、`docs/scene-map.md`、`docs/interaction-spec.md`

缺失项：无文件缺失。

门禁说明：

- 阶段 02 签收页仍为“待用户签收”；Agent 未代签。
- 本次用户下发阶段 03 Prompt，按用户指令进入阶段 03；**不把该动作写成阶段 02 已签收**。
- 阶段 02 的 Hero 规格/阶段门禁继续有效；阶段 03 只搭骨架，Hero 视觉验收 `BLOCKED`。

## 2. 任务逐项

| 任务 | 状态 | 证据 |
|---|---|---|
| A 连续产业链概念沙盘 | **通过（骨架）** | 五 stage 保留；六视觉区；真实地面开口 `x −33..−15/z 1..15`；台地 y 0.6/1.6/2.6/0.9；S 形对角管线；`overview-1440.png` |
| B 场景图层/代码组织 | **部分通过** | 新增 `world/registry.js`、`world/state.js`；`sceneRoot.userData.layers` 提供 environment/infrastructure/equipment/processLines/flowEffects/labels 归属；`immersion.js` 未全量拆模块（按“局部抽取、不形式重构”） |
| C 设备/知识语义注册表 | **通过** | 6 zone / 13 device / 5 route / 3 endpoint；`window.PETRO_REGISTRY`；objectId/zoneId/stageId/knowledgeIds/asset/anchor/capability/chapter |
| D 基础镜头/导航 | **通过（基础）** | 总览、`focusZone`、`enterDetail/exitDetail`、`focusOverview`；用户 pointer drag 清相机过渡；`__stage.frame` |
| E 资产质量策略 | **通过（策略）** | 复用/精修/必须新建/暂缺分级；`docs/asset-gaps.md`；程序化占位不冒充高模 |
| F Blender/Hero 工作流 | **部分通过** | `docs/asset-pipeline.md`、`tools/blender/export_glb.py`、`assets-source/`/`web/assets/models/` 目录；**Blender 可执行文件本次未定位，未执行导出**；无 Hero `.blend/.glb` |
| G 逻辑设备/LOD/状态 | **部分通过** | `state.js` 单一状态源；13/13 overview 绑定；`enterDetail/exitDetail` 实测 true；`detailRepresentation=null`，近景高模/状态继承待 04–06 |
| H 场景工程设施核验 | **通过（核验+局部修复）** | RAF/delta/document.hidden/context lost/资源 dispose 有代码证据；Raycaster 仅 pointerup；`ai.js` 面板 insertBefore 回归已修复 |
| I 视觉构图 | **通过（占位）** | 1440×900、1920×1080 全景；六区截图；标签遮挡由现有逻辑处理；`tokens.css` 未改 |

### 必须交付物

| 交付 | 状态 | 路径 |
|---|---|---|
| 可运行统一沙盘 | **通过** | `web/sandbox.html`（静态服务实测 200/无脚本错误） |
| 场景对象/锚点注册表 | **通过** | `web/world/registry.js` |
| 更新 scene-map | **通过** | `docs/scene-map.md` §10 |
| scene-architecture | **通过** | `docs/scene-architecture.md` |
| asset-gaps | **通过** | `docs/asset-gaps.md` |
| asset-pipeline | **通过** | `docs/asset-pipeline.md`、`tools/blender/export_glb.py` |
| 设备注册表/状态接口 | **通过** | `PETRO_REGISTRY`、`PETRO_DEVICE_STATE` |
| device-state-contract | **通过** | `docs/device-state-contract.md` |
| 全景/各区域真实浏览器截图 | **通过** | `docs/phase-reports/evidence/phase-03/*.png` |
| 总览→近景→操作→返回连续录屏 | **通过（相机级）** | `detail-continuity-1440.mp4`；进入/剖切/退出；不是高模 detail 验收 |

## 3. 修改文件

### 修改

- `web/immersion.js`：S 形坐标/台地/地面开口/对角管线/相机/注册表绑定/图层索引/detail API/帧信息。
- `web/sandbox.html`：加载 registry/state；版本号；概念空间声明；AI 版本。
- `web/ai.js`：修复 `.side` 插入回归；AI/延伸阅读归入 `.side__body`，不再撑破侧栏。
- `CHANGELOG.md`：阶段 03 条目。
- `docs/scene-map.md`：实现校准 §10。

### 新增

- `web/world/registry.js`
- `web/world/state.js`
- `docs/scene-architecture.md`
- `docs/asset-gaps.md`
- `docs/asset-pipeline.md`
- `docs/device-state-contract.md`
- `tools/blender/export_glb.py`
- `assets-source/README.md`、`assets-source/blender/.gitkeep`
- `web/assets/models/.gitkeep`
- `docs/phase-reports/evidence/phase-03/*`（9 PNG + 1 MP4 + README）
- 本报告

### 删除

- 无。

## 4. 执行命令与结果

```bash
# 语法
node --check web/immersion.js          # exit 0
node --check web/world/registry.js     # exit 0
node --check web/world/state.js        # exit 0
node --check web/ai.js                 # exit 0

# 静态页面
GET /index.html 200
GET /sandbox.html 200
GET /explore.html 200
GET /chapter.html?id=drill 200
GET /tower.html 200
GET /ask.html 200
GET /write.html 200
GET /kb.html 200

# 浏览器（Chrome 157，headless/CDP）
window.__auditErrors -> []
window.__stage.zones.length -> 6
window.__stage.devices.length -> 13
window.__stage.stats() -> 139 calls / 52,892 triangles
13/13 devices have overview representation
enterDetail('three_phase_separator') -> true; exitDetail() -> true
#stage=0..4 -> drill/gather/store/refine/use; zone=oilfield/gathering/storage/refining/city
# 截图：1440x900 七张 + 1920x1080 一张；录屏：CDP screencast 120 帧 -> MP4

# 资产/Blender
where blender -> 未找到可执行文件（未执行 .blend/.glb 导出）
```

## 5. 证据

| 证据 | 结果 | 路径 |
|---|---|---|
| 总览 1440 | 六区、台地、管线、城市前景可读 | `overview-1440.png` |
| 总览 1920 | 大屏构图 | `overview-1920.png` |
| 地下 1440 | 地面开口、层理、井筒/井口/抽油机 | `subsurface-1440.png` |
| 油田/集输/储运/炼化/城市 | 各区近景 | `oilfield-1440.png` 等 |
| 总览→近景→剖切→返回 | 相机连续，现有塔剖切可见 | `detail-continuity-1440.mp4` |
| 控制台 | 无 boot/audit errors | `window.__auditErrors=[]` |
| 五关入口 | 5 个 hooks 存在；`#enter-level` 存在 | 未逐关完整重跑 |

## 6. P0 / P1 / P2

### P0（未关闭则不得 PASS）

- **P0-01 Hero Asset 视觉门禁未通过**：地下地质/井筒、分离器内部、塔全剖仍为程序化/现有中低模；本阶段按 Prompt 明确标 `BLOCKED`，不得以占位图作为阶段 PASS。阶段 04/05/06 分别承担达标。
- **P0-02 阶段 02 用户签收仍缺**：签收页/phase-02 handoff 仍为待签收；本次阶段 03 Prompt 是用户执行指令，但未写入“已签收”，Agent 不代签。阶段 04 前需用户明确确认。

### P1

- P1-01 `detailRepresentation` 全部为 null；总览/近景状态继承只有相机级验证，没有高模/剖切状态继承。
- P1-02 五关只验证 hooks/入口存在，未逐关“进入→操作→退出”重跑；需阶段 04/09 回归。
- P1-03 Blender 可执行文件未定位，`.blend`/`.glb` 导出流程未实跑；资产管线目前是文档+脚本+目录。
- P1-04 AI 面板已能挂载，但 AI 请求/无 Key 降级/面板开关未在本阶段测试。
- P1-05 阶段 03 录屏是相机级连续性，不是“操作后状态保留/恢复”的完整业务验收。

### P2

- 地形/台地为程序化方块，视觉粗糙；这是占位策略，不在阶段 03 美化。
- 区域标签在部分斜视角与设备重叠；阶段 07 统一处理。
- `geology-close.png` 为早期调试图，保留作过程证据；最终以 `subsurface-1440.png` 为准。
- 页面仍无 API；`/api/ask`/`/api/gen` 不在本阶段范围。

## 7. 资产与许可

| 资产 | 状态 | 说明 |
|---|---|---|
| 地下地质/井筒 | 暂缺 | 程序化开口+分层；阶段 04 |
| 三相分离器 | 需精修 | 现有 OBJ 无内部结构；阶段 05 |
| 常减压塔 | 需精修 | 现有塔半剖可用，全剖差异弱；阶段 06 |
| 抽油机/井口/储罐/加热炉 | 需精修/可复用 | 现有 OBJ；无 `.blend`/UV/授权记录 |
| 环境/地形/道路 | 程序化占位 | 允许；不是 Hero |
| `.blend/.glb` | 无 | Blender 未定位；未执行导出 |
| 来源/许可 | 未补齐 | 项目自产脚本不等于书面授权；阶段 04–06/09 补 |

## 8. 设计—研发追踪

- zoneId：`subsurface/oilfield/gathering/storage/refining/city`
- stageId：`drill/gather/store/refine/use`（#stage=0..4 保留）
- objectId：13 个，注册表 `web/world/registry.js`
- knowledgeId：沿用 `kb_formation/kb_drill/kb_gather/kb_store/kb_refine/kb_use`
- actionId：既有五关动作不变；新增 `enterDetail/exitDetail/focusZone/focusOverview` 仅骨架 API
- 影响深链/fallback：`#stage=N` 保持；新增 `?view=` 仅证据/聚焦；2D fallback 保留
- 未改 `/api/ask` 契约；`__sceneContext` 只增 `registrySceneId/zoneId/deviceName`

## 9. Agent recommendation

- 建议：**REVISE**
- 理由：世界骨架/注册表/状态接口/证据已可运行，但 Hero Asset Gate 明确 `BLOCKED`，且 detail 表示/五关逐关回归/Blender 导出未完成；按 Prompt 不能把占位当阶段 PASS。
- 未关闭项：P0-01、P0-02、P1-01–05。

## 10. User acceptance

- 状态：**待用户签收**
- 用户原话：无（本次只有阶段 03 执行指令，不是签收语句）
- 日期：无

## 11. 停止声明

- 本阶段是否停止：**是**
- 下一阶段是否允许开始：**否**
- 等待事项：用户审阅阶段 03 交付并明确是否放行；Hero 资产门禁按阶段 04–06 处理；阶段 02 签收页仍需用户本人确认。
