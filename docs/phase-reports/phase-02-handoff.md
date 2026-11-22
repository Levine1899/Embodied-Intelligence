# Phase 02 交接报告 · 体验设计（第二轮返修）

日期：2026-11-22
阶段：02_EXPERIENCE_DESIGN（返修轮 2）
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
| 视觉参考/UI 层级/Token/性能 | **通过（设计）** | `visual-art-direction.md` §4–7；4 张 3D 灰盒见 §4.1 |
| 科学知识—视觉映射 | **通过（设计）** | `knowledge-visual-mapping.md`；审校阶段 09 |
| Hero 规格/格式/优先级/门禁 | **通过（设计）** | `hero-asset-briefs.md` §2–11 |
| 体验验证方案 | **通过（仅方案）** | `experience-design-signoff.md` §5；N=5 正式，未执行 |
| 公共展项会话复位 | **通过（设计）** | `interaction-spec.md` §7.1–7.3 |
| 总控文件可追溯 | **通过（落库版）** | `docs/agent-prompts/` + SHA-256 |
| 3D 灰盒参考 | **通过（设计证据）** | 4 张 PNG + `blockout.html`，§4.1 |
| 用户设计签收 | **未执行** | `experience-design-signoff.md` |

## 3. 本轮审查问题对应修订

| 编号 | 状态 | 修订位置 |
|---|---|---|
| P1-01 阶段 01 摘要状态冲突 | **已解决** | `phase-01-handoff.md` 顶部拆分 Agent/用户状态；§13 保留原话 |
| P1-02 T7 章计数错误 | **已解决** | `task-design.md` §4.1：知识章 5、流程标记 2；T7 前置改为五枚知识章 |
| P1-03 T5/T6 重复选择 | **已解决（方案 A）** | T5 唯一 `choices.priority`；T6 只沿用，不重复设置；`tower.setPriority` 更新 |
| P1-04 fraction→application→cityObject | **已解决** | `task-design.md` §5：中间路线、允许/禁止配对、`city_product_table` |
| P1-05 样本数/阈值不兼容 | **已解决** | `experience-design-signoff.md` §5：正式 N=5；N=3 只试测 |
| P1-06 下一位用户复位 | **已解决（设计）** | `interaction-spec.md` §7.2：显式“结束本次参观”+确认；刷新恢复；不自动超时 |
| P1-07 Hero Gate 阶段归属 | **已澄清** | `00_MASTER.md` §5；本报告 §6：阶段 02 设计规格、阶段 03 可占位、04/05/06 各自硬门禁 |
| P1-08 总控/模板缺失 | **已落库** | `docs/agent-prompts/00_MASTER.md`、`PHASE_HANDOFF_TEMPLATE.md`、`README.md`；含哈希/来源限制 |
| P1-09 视觉参考仅 ASCII | **已补** | `visual-art-direction.md` §4.1；4 张真实浏览器灰盒 PNG + `blockout.html` |
| P2 自主任务样例 | **已补样例** | `task-design.md` §4.2（OBS-01/JUDGE-01/HIDE-01），阶段 07 细化 |

## 4. 修改文件与 Commit

修改：

- `docs/experience-design.md`
- `docs/task-design.md`
- `docs/interaction-spec.md`
- `docs/visual-art-direction.md`
- `docs/experience-design-signoff.md`
- `docs/phase-reports/phase-01-handoff.md`
- `docs/phase-reports/phase-02-handoff.md`（本文件）

新增：

- `docs/knowledge-visual-mapping.md`
- `docs/agent-prompts/00_MASTER.md`
- `docs/agent-prompts/PHASE_HANDOFF_TEMPLATE.md`
- `docs/agent-prompts/README.md`
- `docs/phase-reports/evidence/phase-02/blockout.html`
- `docs/phase-reports/evidence/phase-02/blockout-overview.png`
- `docs/phase-reports/evidence/phase-02/blockout-subsurface.png`
- `docs/phase-reports/evidence/phase-02/blockout-separator.png`
- `docs/phase-reports/evidence/phase-02/blockout-tower.png`

未修改 `web/`、`server/`、`tools/`；`git diff --stat -- web server tools` 为空。

- 阶段 02 初版：`28d1bad`
- 第一轮返修（大改 11 文件）：`172f283`；交接记录一行提交：`c9a02ea`
- 第二轮返修（本文件所在提交）：`73f6bfb`
- 分支：`main`；tag（本轮结束）：`phase-02-rev2`
- 工作区：最终提交后 `git status --short` 为空（0 行）

## 5. 验证与测试边界

| 项 | 结果 |
|---|---|
| 代码语法/构建 | **未执行**（本阶段未改业务代码） |
| 产品网页/WebGL/FPS/E2E | **未执行**（阶段 03–09） |
| 3D 灰盒渲染 | **已执行**：Chrome headless + Three.js 基础几何体，1440×900，四视图；仅参考，不是产品实现 |
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

本轮已修正上一轮列出的 P1-01–09 与 P1-03 等细节，并补齐总控文件、灰盒参考、会话复位和映射表。但阶段 02 用户签收（P0）仍未完成，按总控不得建议 PASS，也不得进入阶段 03。

## 8. User acceptance

**待用户签收。**

请审阅 `experience-design-signoff.md` 的待确认项与签收项；明确回复：

> **体验设计通过，放行进入阶段 03**

未签收前，阶段 02 保持 REVISE，不开始阶段 03。

## 9. 停止声明

**本阶段已停止，等待用户签收与下一阶段 Prompt。**
