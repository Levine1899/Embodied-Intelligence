# Phase 02 交接报告 · 体验设计

日期：2026-11-22
阶段：02_EXPERIENCE_DESIGN
状态建议：**REVISE**（设计已交付，等待用户签收；未签收前不得进入阶段 03）
用户签收：**待用户签收**

> 启动前置检查：`docs/phase-reports/phase-01-handoff.md` 与四份阶段 01 输入均存在并已重读。工作区仍没有 `00_MASTER.md`、`PHASE_HANDOFF_TEMPLATE.md` 实体文件；本阶段按用户此前提供的总控规则与阶段 01 报告格式执行，未伪造文件。该治理缺口保留为风险，不冒充“已读取实体文件”。

## 1. 任务逐项状态

| 任务 | 状态 | 证据/文件 |
|---|---|---|
| 1. 三种创意方向与比较 | **通过** | `experience-design.md` §1–2：A 垂直潜入 / B 立体展馆 / C 批次通行证，8 维比较，选 C，说明舍弃 |
| 2. 首要/次要用户与首次体验 | **通过** | `experience-design.md` §3–4：首要初高中学生；次要普通成年公众、教师/讲解员；10 秒—结束旅程 |
| 3. 三种模式共享模型 | **通过** | `experience-design.md` §5：同一 scene/objectId/knowledgeId/session；模式只改镜头/UI/动作 |
| 4. 场景地图与空间构图 | **通过** | `scene-map.md`：六视觉区、五 stage 兼容、S 形走廊 + 高差、Mermaid 流程、非真实地理声明 |
| 5. 完整任务探索系统 | **通过** | `task-design.md`：主任务 + T0–T7、五子任务、分支、三级提示、失败/重置/复盘 |
| 6. 四个标志性体验脚本 | **通过** | `experience-design.md` §6：地下穿越/管线追踪/塔展开/能源到生活，含用户动作、镜头、变化、知识、退出 |
| 7. 镜头与声音脚本 | **通过** | `camera-storyboard.md`：7 章锚点/运动/时长/缓动/停留/接管/结束；声音默认关闭 |
| 8. UI 密度与交互矩阵 | **通过** | `interaction-spec.md`：三种密度、13 设备状态矩阵、状态机、键盘/降级、阶段映射 |
| 9. Hero Asset 参考板与签收标准 | **通过** | `hero-asset-briefs.md`：三类资产正/侧/45°/剖切、部件/比例/材质/语义节点/导出/授权/责任阶段 |
| 交付物 6：实施风险清单 | **通过** | `experience-design.md` §7 边界 + 本报告 §6 |
| 用户设计签收 | **未执行** | `experience-design-signoff.md`：待用户逐项确认并回复“体验设计通过，放行进入阶段 03” |

## 2. 修改文件

设计文档（仅文档，未改业务代码）：

- `docs/experience-design.md`（重写）
- `docs/scene-map.md`（重写）
- `docs/camera-storyboard.md`（新增）
- `docs/interaction-spec.md`（新增）
- `docs/visual-art-direction.md`（新增）
- `docs/task-design.md`（新增）
- `docs/hero-asset-briefs.md`（新增）
- `docs/experience-design-signoff.md`（新增）
- `docs/phase-reports/phase-02-handoff.md`（本文件）

未修改 `web/`、`server/`、`tools/`；未删除/移动资产；未开始阶段 03。

## 3. 起止 Commit

- 起始：`437c8e2`（阶段 01 交接完成，工作区干净）
- 设计文档提交：`<DESIGN_COMMIT>`（docs-only）
- 结束：本报告修订提交（docs-only，见 `git log -1`）

## 4. 执行命令

```bash
# 前置检查
Test-Path docs/phase-reports/phase-01-handoff.md
Test-Path docs/audit-baseline.md docs/asset-inventory.md docs/interaction-inventory.md docs/test-baseline.md
Get-ChildItem -Recurse -Filter 00_MASTER.md
Get-ChildItem -Recurse -Filter PHASE_HANDOFF_TEMPLATE.md
git status --short
# 只写 docs；未运行构建/未改代码
```

## 5. 设计证据

本阶段是设计阶段，不适用“浏览器截图证明 3D 已实现”。用以下可复核内容作为设计证据：

| 设计项 | 可复核位置 |
|---|---|
| 三方向比较/选择 | `experience-design.md` §1–2 |
| 用户与首次体验 | `experience-design.md` §3–4 |
| 模式共享 | `experience-design.md` §5 |
| 四种体验脚本 | `experience-design.md` §6 |
| 空间图 | `scene-map.md` §2–3（Mermaid + ASCII） |
| 任务系统 | `task-design.md` §2–4 |
| 镜头/声音 | `camera-storyboard.md` §2–4 |
| UI/状态机 | `interaction-spec.md` §1–3 |
| 资产参考板 | `hero-asset-briefs.md` §2–5 |

**未执行**：3D 实现、浏览器截图、录屏、真实用户测试；因此不能把本阶段设计当成已实现视觉/交互。

## 6. P0 / P1 / 风险

### 本阶段 P0（未解决则不得进入阶段 03）

1. **用户未签收**：`experience-design-signoff.md` 尚未得到“体验设计通过，放行进入阶段 03”。这是阶段 02 的硬门禁。
2. **资产 Gate 的现实缺口**：阶段 01 已确认五台 Hero/塔无 `.blend`、无部件语义、无授权；本阶段只给参考板与标准，**没有制作资产**。阶段 04–06 必须补齐，否则对应体验不得 PASS。
3. **主方向 C 是否被接受**：批次牌/任务分支是产品级取舍，未获用户确认前不能当成已定稿。

### P1

- `00_MASTER.md` / `PHASE_HANDOFF_TEMPLATE.md` 实体缺失，治理材料只能按对话规则执行；下阶段前应补文件。
- 六区重排会改变 `REGIONS` 与关卡锚点；阶段 03 必须同步迁移，否则五关锚点偏移。
- 任务分支的文案（火炬/回收、固定顶/浮顶、燃料/材料）需内容/合规复审，避免绝对化。
- 资产参考板为自绘示意，不是模型；不得作为视觉验收。

### P2

- 声音仍只有合成氛围，无 AI 语音/真实录音；设计已明确非强制。
- 移动端本期不适配；设计不承诺手机布局。
- 阶段 03 起需要新增 `zoneId`/`batch`/`task` 到 `__sceneContext`，要保证旧字段兼容。

## 7. 关键设计决定（供用户确认）

1. 主方向：C《批次 YJ-001：一张能源通行证》。
2. 六视觉区、五 stage 兼容；S 形 + 高差，不做五框横排。
3. 首要用户：初高中学生；次要：普通成年公众、教师/讲解员。
4. 不加积分/排名；用批次章、路线、复盘。
5. 分支：气回收/火炬、浮顶/固定顶、燃料/材料；均不编造收率/排放。
6. 塔全剖必须显示塔板/降液管/侧线/汽液粒子，半剖只显示半壳+塔板。
7. Hero Asset：地下必须新建；分离器/塔/储罐/井口/加热炉需精修并补 `.blend`/语义/授权。

## 8. Agent recommendation

**REVISE。**

设计交付物齐全，但阶段 02 的签收门禁未完成；按总控“用户未签收只能 REVISE/BLOCKED”，不建议 PASS，也不进入阶段 03。

建议：用户逐项审阅 `experience-design-signoff.md`，确认或提出修改；确认后回复“体验设计通过，放行进入阶段 03”。若要求修改，阶段 02 保持 REVISE，更新对应设计文件与本报告，不跳到实现。

## 9. User acceptance

**待用户签收。**

Agent 不代替用户勾选。用户未明确签收前，本阶段保持 REVISE，不开始阶段 03。

## 10. 停止声明

**本阶段已停止，等待用户签收与下一阶段 Prompt。**
