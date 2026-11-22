# Phase 02 交接报告 · 体验设计（第四轮返修 / phase-02-rev4）

日期：2026-11-22
阶段：02_EXPERIENCE_DESIGN（返修轮 4；本轮 tag phase-02-rev4）
状态建议：**REVISE**（等待用户签收；不得进入阶段 03）
用户签收：**待用户签收**

## 1. 启动前置检查

已重读：`00_MASTER.md`（项目落库版）、本阶段审查报告、阶段 01 交接、四份审计输入、全部阶段 02 设计文档。

阶段 01 状态已在 `phase-01-handoff.md` 顶部拆分为“Agent 审计建议 REVISE / 用户验收 ACCEPTED”，并保留 §13 用户原话与日期；不再把历史判断改写为 PASS。

总控/模板：已新增 `docs/agent-prompts/00_MASTER.md`、`PHASE_HANDOFF_TEMPLATE.md` 与 `README.md`（含 SHA-256）；来源/限制在 README 说明，不冒充逐字官方版。

## 2. 任务逐项状态

| 任务 | 状态 | 证据 |
|---|---|---|
| 三方向比较与主方向 | **通过** | `experience-design.md` §1–2 |
| 用户身份/叙事/三个 Hero Moments | **通过** | `experience-design.md` §3–8 |
| 三层场景地图与构图 | **通过** | `scene-map.md` §2–5 |
| 主线+自主探索+观察/判断/隐藏发现 | **通过（样例）** | `task-design.md` §2、§4.2；完整规格阶段 07 |
| T0–T7 口径与映射 | **通过** | `task-design.md` §1、§4、§4.1（知识章/流程章分离） |
| 五种馏分/终端应用/城市对象映射 | **通过** | `task-design.md` §5；`knowledge-visual-mapping.md` |
| 四个体验脚本 + 六帧分镜 | **通过** | `experience-design.md` §9；`camera-storyboard.md` §4 |
| 镜头字段/接管/降级/声音 | **通过** | `camera-storyboard.md` §2、§5–7 |
| 六维正交状态/组合/复位/能力矩阵 | **通过** | `interaction-spec.md` §2–4 |
| actionId 契约 | **通过** | `interaction-spec.md` §5 |
| `__sceneContext`/`/api/ask` 兼容 | **通过（设计）** | `interaction-spec.md` §6 |
| 视觉参考/UI 层级/Token/性能 | **通过（设计）** | `visual-art-direction.md` §4–7；5 张 3D 灰盒见 §4.1 |
| 科学知识—视觉映射 | **通过（设计）** | `knowledge-visual-mapping.md`；审校阶段 09 |
| Hero 规格/格式/优先级/门禁 | **通过（设计）** | `hero-asset-briefs.md` §2–11 |
| 体验验证方案 | **通过（仅方案）** | `experience-design-signoff.md` §5；N=5 正式，未执行 |
| 公共展项会话复位 | **通过（设计）** | `interaction-spec.md` §7.1–7.3 |
| 总控文件可追溯 | **通过（落库版）** | `docs/agent-prompts/` + SHA-256 |
| 3D 灰盒参考 | **通过（设计证据）** | 5 张 PNG + `blockout.html`，§4.1 |
| 用户设计签收 | **未执行** | `experience-design-signoff.md` |

## 3. 本轮审查问题对应修订（按正文证据）

### 3.1 第四轮 P1/P2

| 编号 | 状态 | 修订位置/证据 |
|---|---|---|
| P1-01 T1→wellhead 断点 | **已解决** | `task-design.md` T1 成功转 `wellhead`；T2 前置要求 `wellhead`；跳过落 `wellhead` 但 `steps.T1=skipped`、不发章；HM-1 KF5 同步 |
| P1-02 canonical 状态/Skipped | **已解决** | `task-design.md` §7：完整 JSON schema；`task.status` 只整单；`task.steps[Tn].status` 才有 skipped；生命周期/上下文规则 |
| P1-03 wellhead 坐标冲突 | **已解决** | `scene-map.md`：唯一 `wellhead(-22,0,10)`；地下用 `wellbore_top_anchor(-22,0,10)`；objectId/anchorId 区分；相机 lookAt 更新 |
| P1-04 T6 中间加工反馈 | **已解决** | `task-design.md` §5/§6：解析 `resolvedProcessId/routeId`，路线节点依次点亮；`knowledge-visual-mapping.md` §6.1；`experience-design.md` T6 |
| P1-05 handoff 轮次/SHA | **已修订** | 标题/头部为第四轮 rev4；§4 记录内容提交完整 SHA、最终 tag/HEAD 关系；最终工作区 clean |
| P2-01 灰盒数量 | **已解决** | 统一为 5 张（entry/overview/subsurface/separator/tower） |
| P2-02 T3/T4 储罐语义 | **已解决** | T3 油相到储运进料总管；T4 选具体罐并入罐 |
| P2-03 priority 视觉 | **已解决** | `task-design.md` §5.1：fuel/material 高亮/弱化表；5 张必做卡不屏蔽 |

### 3.2 前几轮问题状态（保留追踪）



| 编号 | 状态 | 修订位置/证据 |
|---|---|---|
| P0-01 阶段 01 当前状态 | **已解决** | `phase-01-handoff.md` 顶部拆分 Agent/用户状态；§11 标为历史快照；§13 保留原话/日期；不再把历史“待签收”当当前状态 |
| P1-02 T7 章数/发放 | **已解决** | `task-design.md` §4.1：五章发放表；l1 需 T1+T2 都完成；跳过失章；T7 前置五章；缺章禁止交付 |
| P1-03 T5/T6 重复重点 | **已解决** | T5 唯一 `task.choices.priority`；T6 只沿用；`city.setPriority` 改为只读 `city.applyPriority` |
| P1-04 应用/城市对象映射 | **已解决** | `task-design.md` §5：8 应用、6 城市宿主、5 张必做卡、topgas 不进城、航空煤油共用加油机、纤维/润滑油/石蜡可选 |
| P1-05 测试样本/阈值 | **已解决** | `experience-design-signoff.md` §5：正式 N=5；N=3 仅试测；阈值按 5 人 |
| P1-06 展厅复位 | **已解决（设计）** | `interaction-spec.md` §7：显式“结束本次参观”+确认；刷新恢复；不自动超时 |
| P1-07 性能基线混用 | **已解决** | `visual-art-direction.md` §7：FPS probe 153/55,082/89.4 与总览 118/47,634、炼化 83/35,476 分开 |
| P1-08 镜头运动枚举 | **已解决** | `camera-storyboard.md` §1–3：只允许 dolly/crane/orbit/follow + direction；rise/descend 为别名 |
| P1-09 结束 Commit 记录 | **部分解决/待最终提交** | §4 记录 `aa57e0e` 及 tag；本轮新增修订提交后以 tag `phase-02-rev3` 的实际 peeled SHA 为准（最终消息给精确值） |
| P1-10 交接过度乐观 | **已修正** | 本表按正文逐项核验；P1-09 明确标“待最终提交”，未再写全部已解决 |
| P1-11 总控/模板落库 | **已解决（整理版）** | `docs/agent-prompts/00_MASTER.md`、`PHASE_HANDOFF_TEMPLATE.md`、`README.md`；含 SHA-256；非逐字官方版 |
| P1-12 六区 XZ 坐标 | **已解决** | `scene-map.md` §1.1–1.2：六区 centerX/Z、宽深、高程、对象锚点、路径、相机锚点 |
| Hero Asset Gate | **已澄清** | 阶段 02 只验收设计规格；阶段 03 可用标注占位；04/05/06 各自硬门禁；09 总验收；依据 `docs/agent-prompts/00_MASTER.md` §5 |
| P2-01 视觉参考 | **已补** | `visual-art-direction.md` §4.1：5 张浏览器渲染灰盒 |
| P2-02 README/CHANGELOG | **未处理（非阻断）** | 产品版本仍 3.4.0；设计基线不入产品版本，避免误标 |
| P2-03 科学来源 | **待阶段 08/09** | `knowledge-visual-mapping.md` 明列审校要求，未伪造引用 |

## 4. 修改文件与 Commit

修改：

- `docs/experience-design.md`
- `docs/scene-map.md`
- `docs/task-design.md`
- `docs/camera-storyboard.md`
- `docs/interaction-spec.md`
- `docs/visual-art-direction.md`
- `docs/hero-asset-briefs.md`
- `docs/experience-design-signoff.md`
- `CHANGELOG.md`（设计基线条目，不改产品版本）
- `docs/phase-reports/phase-01-handoff.md`
- `docs/phase-reports/phase-02-handoff.md`（本文件）

新增：

- `docs/knowledge-visual-mapping.md`
- `docs/agent-prompts/00_MASTER.md`
- `docs/agent-prompts/PHASE_HANDOFF_TEMPLATE.md`
- `docs/agent-prompts/README.md`
- `docs/phase-reports/evidence/phase-02/blockout.html`
- `docs/phase-reports/evidence/phase-02/blockout-entry.png`
- `docs/phase-reports/evidence/phase-02/blockout-overview.png`
- `docs/phase-reports/evidence/phase-02/blockout-subsurface.png`
- `docs/phase-reports/evidence/phase-02/blockout-separator.png`
- `docs/phase-reports/evidence/phase-02/blockout-tower.png`

未修改 `web/`、`server/`、`tools/`；`git diff --stat -- web server tools` 为空。

- 阶段 02 初版：`28d1bad`
- 第一轮返修（大改 11 文件）：`172f283`；交接记录一行提交：`c9a02ea`
- 第二轮返修内容：`73f6bfb`；记录提交：`aa57e0e`；tag `phase-02-rev2` → `aa57e0e`
- 第三轮返修内容：`fe2e896c360cc80c43afdea30e613341117d5e47`；记录提交：`e066322c7f67109737714ba1ea92432387b326cc`；tag `phase-02-rev3` → `e066322c7f67109737714ba1ea92432387b326cc`
- 第四轮返修（本轮）内容提交：`6dca10b7b7c528bca4e5ee03d979c61d3cb95634`（完整 40 位；提交后填写）
- 本轮开始时：`git rev-parse HEAD` = `e066322c7f67109737714ba1ea92432387b326cc`；`git status --short` = 空；分支 `main`
- 第四轮最终记录提交/最终 branch HEAD：由 tag `phase-02-rev4` 指向；完整 SHA 以 `git rev-parse refs/tags/phase-02-rev4^{}` 校验，最终交付消息同时列出
- 最终工作区：`git status --short` 为空（0 行）
- 验收对应文档状态以 tag `phase-02-rev4` 为准；不以聊天或旧 tag 代替

## 5. 验证与测试边界

| 项 | 结果 |
|---|---|
| 代码语法/构建 | **未执行**（本阶段未改业务代码） |
| 产品网页/WebGL/FPS/E2E | **未执行**（阶段 03–09） |
| 3D 灰盒渲染 | **已执行**：Chrome headless + Three.js 基础几何体，1440×900，五视图；仅参考，不是产品实现 |
| 设计文档交叉核对 | 已核对 T0–T7、五关、fractionId、applicationId、cityObjectId、状态字段、Hero ID |
| 真实用户测试 | **未执行**（阶段 09；N=5 方案已定义） |
| 资产制作 | **未执行**（阶段 04–06） |

注意：灰盒渲染是设计证据，不得描述为“三维场景已实现”或“Hero Asset 已交付”。

## 6. P0 / P1 / 风险

### P0（唯一未关闭）

1. **用户未签收阶段 02**：必须用户本人确认；Agent 不代签。签收前保持 REVISE，不开始阶段 03。

### 资产门禁（按阶段，不是阶段 02 的 P0）

- 阶段 02：**设计规格**完成；不等于模型已制作。
- 阶段 03：允许使用**明确标注的占位资产**搭建世界骨架；占位不得通过视觉终验。
- 阶段 04/05/06：地下 Hero、分离器内部、塔全剖各自未达 → 对应阶段视觉验收 BLOCKED。
- 阶段 09：`.blend`、来源/许可、网页证据缺一不可。
- 依据：`docs/agent-prompts/00_MASTER.md` §5；若用户提供正式逐字 MASTER 有不同规定，以正式版为准并更新本报告。

### P1

- 六区重排会影响 `REGIONS` 与五关锚点，阶段 03 必须同步迁移。
- 上下文别名只增不删；阶段 03 若改字段将破坏 ai.js。
- 灰盒/参考板不是最终资产，不能作为视觉验收。
- `00_MASTER.md` 为项目落库整理版，不是逐字官方版；正式版到位后必须替换并更新哈希。
- 任务样例（OBS/JUDGE/HIDE）只到设计样例，阶段 07 需补完整规格；不得提前标“已实现”。

### P2

- 声音仍只有合成氛围，无 AI 语音；默认关闭。
- 移动端不承诺；触屏展厅设备需另立范围，核心操作不得只依赖 hover。
- 阶段 09 需真实用户测试/跨浏览器/无 WebGL 基线。
- 应用路线需石油/化工专业审校；当前只到设计审校。

## 7. Agent recommendation

**REVISE。**

本轮已修正 P1-01–08、P1-10–12，并补齐总控文件、灰盒参考、会话复位、五组必做映射和六区 XZ 坐标。P1-09 的最终提交 SHA 以 tag `phase-02-rev3` 的 peeled SHA 为准（最终交付消息给出）。但阶段 02 用户签收（P0）仍未完成，按总控不得建议 PASS，也不得进入阶段 03。

## 8. User acceptance

**待用户签收。**

请审阅 `experience-design-signoff.md` 的待确认项与签收项；明确回复：

> **体验设计通过，放行进入阶段 03**

未签收前，阶段 02 保持 REVISE，不开始阶段 03。

## 9. 停止声明

**本阶段已停止，等待用户签收与下一阶段 Prompt。**
