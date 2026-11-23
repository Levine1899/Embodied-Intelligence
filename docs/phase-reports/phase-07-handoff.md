# Phase 07 交接报告 · 系统整合（导览 / 任务 / 音频 / 档案）

## 头部

- 日期：2026-11-23
- 阶段：07_IMMERSIVE_JOURNEY
- 状态建议：**PASS（复核修复后；技术/交互范围；用户签收待完成）**
- 用户签收：**待用户签收**
- 起始 Commit：`f059728236711e410927dffd84f9004bf7efad22`（阶段 06 后、阶段 07 开始前）
- 结束 Commit（真实 SHA）：`6047a59`（当前 main；含 feature/261121-cuiyue-dev 的问答来源新标签修复）
- 分支：`main`
- 线上：`http://120.26.198.46:8020/v19/`（根入口跳转 V19；备份 `index.html.bak-20261123-194428`）
- 包：`dist/scienceagent-web-6047a59.tgz`，SHA-256 `e51194216ddae7439b8ec258e8a8e38468d394f8507b42fa4212d34d0558951a`
- 工作区 `git status --short`：阶段 07 提交后为空；本报告为后置文档提交

## 1. 前置检查

- 已读：`docs/agent-prompts/00_MASTER.md`
- 已读：本阶段用户 Prompt（当前用户消息本身）
- 已读：`docs/agent-prompts/PHASE_HANDOFF_TEMPLATE.md`
- 已读：`docs/phase-reports/phase-06-handoff.md`、`docs/phase-reports/phase-06-review-response.md`
- 已读：`docs/phase-reports/phase-03-handoff.md`、`phase-04-handoff.md`、`phase-05-handoff.md`
- 已读前置设计/交付物：`docs/experience-design.md`、`docs/interaction-spec.md`、`docs/device-state-contract.md`、`docs/scene-map.md`、`docs/camera-storyboard.md`、`docs/task-design.md`、`docs/refining-experience.md`、`docs/scene-distillation-tower.md`
- 已读代码/资产：`web/immersion.js`、`web/world/registry.js`、`web/levels/entry.js`、`l1.js`–`l5.js`、`web/sandbox.html`、`web/assets/site/ambient.js`、阶段 04–06 证据索引
- 阶段 03/04/05 用户签收：已有记录；阶段 06 原 handoff 的 `User acceptance` 仍为“待用户签收”，本阶段未改写该历史字段，也未代签。
- 用户本轮明确声明：`阶段 03—06 已通过。` 作为阶段 07 放行依据（当前用户消息原文）。
- 缺失项：没有独立的 `07_IMMERSIVE_JOURNEY.md` 文件；当前用户消息本身即本阶段 Prompt（与阶段 05/06 的处理一致）。没有前置交付文件缺失。
- 是否因此阻塞：否。

## 2. 任务逐项

| 任务 | 状态 | 证据 |
|---|---|---|
| A. 可中断/暂停/跳过的导览状态机 | **通过（修复后）** | 状态机/10 站/显式推进；l2–l4 暂停→继续已恢复动画 |
| 每步定义 stepId/stage/object/camera/scene/animation/讲解/completion/next/exit | **通过** | `docs/tour-state-machine.md` §2–§3；`__tour.steps` |
| B. 一条完整探索旅程（全景→地下→井筒→井口→分离→储运→炼化→馏分→产品→返回） | **通过** | 10 站；`full-tour-continuity.mp4` 70.45s |
| C. 任务探索真实状态机（非包装入口） | **通过** | `web/mission.js`；M1–M5 由实际 `scene-context` 判定 |
| 任务背景/角色/最终目标 | **通过** | `phase07-09-mission-brief.png`；mission brief |
| 每段线索/可发现对象/操作/前置 | **通过** | `docs/mission-state-machine.md` §3–§4 |
| 成功判定/失败反馈/可恢复 | **通过（修复后）** | M2 错误/改对；M3 当前液位判定 + 75→0→泵负例；M5 新增选择判定 |
| 分级提示 | **通过** | 手动提示 + 25s 自动提示；`phase07-12` |
| 暂停/退出/继续/重置 | **通过（修复后）** | l2/l3/l4 暂停→继续恢复动画；退出/重置/任务暂停均通过 |
| 结束总结与知识回顾 | **通过** | `phase07-13/14/15`；`showDone()` + JourneyStore |
| 沉浸导览一键开始/镜头同步/短讲解/可展开知识点 | **通过（知识点展开以文字+档案呈现）** | 导览卡；档案知识列表 |
| 用户随时暂停/跳过/退出/接管镜头 | **通过（修复后）** | 继续恢复动画；暂停时临时显示关卡操作面板可接管 |
| 结束时总结设备/知识 | **通过** | 第 10 站打开档案；`phase07-08` |
| 自由探索：不自动推进/设备交互/列表与热点同步/不依赖 hover | **通过（沿用阶段 03–06）** | 原设备列表/选中/热点；`free-plus-mission.mp4` 末尾自由拖拽 |
| 任务探索保留五关并与总览设备语义关联 | **通过** | M1–M5 使用 l1–l5 与同一 registry/Store |
| D. 动态演示同步（≥4 章节真实状态变化） | **通过（修复后）** | 井口站改调 `selectWellhead()` 并断言；5 章节均有真实变化 |
| E. 镜头有起止缓动/不快速旋转；用户接管优先 | **通过（沿用关卡 fly；无自动抢回）** | 导览进入/退出等待；pointerdown 暂停 |
| `prefers-reduced-motion` | **通过（代码路径）** | 5 个关卡 fly 在媒体查询下即时定位；未做全量人工遍历，列 P1 |
| F. 默认静音/全局静音/音量 | **通过** | `#audio-toggle`、`#audio-volume`；默认 off；`phase07-verify` |
| 环境音与场景对应 | **通过（合成氛围音）** | `ambient.js` setStage；非现场录音 |
| 语音讲解播放/暂停/停止 | **通过（浏览器语音）** | `Voice` speechSynthesis：朗读/暂停/停止；无预录音频 |
| 无音频资产不阻塞 | **通过** | 开关显示可用/不可用；导览/任务照常 |
| G. 本机探索记录（scene/stage/object/knowledge/mission） | **通过** | `web/journey-store.js`；localStorage；档案面板 |
| 未经授权不上传 | **通过** | 仅 localStorage；无上传调用 |
| 交付 `docs/tour-state-machine.md` | **通过** | 新增 |
| 交付 `docs/mission-state-machine.md` | **通过** | 新增 |
| 任务交互矩阵/状态图 | **通过** | `mission-state-machine.md` §2/§4 |
| 两段真实操作录屏 | **通过** | `full-tour-continuity.mp4`、`free-plus-mission.mp4` |
| 导览不是幻灯片 | **通过** | 进入真实关卡，设备状态变化 |
| 至少 4 章节有真实场景状态变化 | **通过（5）** | 见上 |
| 用户可中断并自由操作 | **通过（修复后）** | 暂停时显示关卡操作面板；退出后自由探索 |
| 中断后不留下错误相机/动画 | **通过（exit 调用关卡 exit + back 兜底）** | tour exit 断言 level=false/mode=free |
| 任务保留原五关 | **通过** | M1–M5 全部进入 l1–l5 |
| 声音不强制播放 | **通过** | 默认静音；用户点击才创建 AudioContext |
| 结束后能回顾探索内容 | **通过** | 导览档案/任务总结/档案 |
| 任务结果不是伪装工程仿真 | **通过（边界文案）** | 教学示意；不编造参数 |
| AI `/api/ask` | **未执行/不适用** | 本阶段未改 AI；未调用 API |

## 3. 修改文件

- 修改：
  - `web/sandbox.html`（CSS、任务/档案/音频/导览 UI 挂载、脚本版本）
  - `web/immersion.js`（`__stage.setMode/getMode`；保留 V16 的最近设备 stage 兜底）
  - `web/levels/l1.js`（`setPressure`）
  - `web/levels/l3.js`（`setLevel/startPump/pausePump`）
  - `web/levels/l4.js`（`selectFraction/startFlow`）
  - `web/levels/l5.js`（`select/picked`，修正重复选择被 toggle 取消）
  - `web/assets/site/ambient.js`（音量/静音/setVolume）
  - `CHANGELOG.md`
- 新增：
  - `web/voice.js`（可选浏览器语音）
  - `web/journey-store.js`
  - `web/journey.js`
  - `web/mission.js`
  - `docs/tour-state-machine.md`
  - `docs/mission-state-machine.md`
  - `tools/phase07-verify.cjs`
  - `tools/phase07-record.cjs`
  - `docs/phase-reports/evidence/phase-07/*`（15 张截图、2 段录屏、verify JSON、README、record JSON）
- 删除：无业务文件；清理临时验证脚本。
- 未修改：阶段 04–06 的 Hero 资产/Blender 源、`/api/*`、塔页业务、章节/问答/文案页。

## 4. 执行命令与结果

```bash
# 语法
node --check web/journey-store.js
node --check web/journey.js
node --check web/mission.js
node --check web/levels/l1.js
node --check web/levels/l3.js
node --check web/levels/l4.js
node --check web/levels/l5.js
node --check web/assets/site/ambient.js
# 全部 exit 0

# 真实浏览器验证（Chrome 157 CDP，1440×900，本地 :8796）
CDP_PORT=4344 BASE_URL=http://127.0.0.1:8796 node tools/phase07-verify.cjs
# -> 76 passed / 0 failed

# 真实浏览器录屏
node tools/phase07-record.cjs tour
# -> 1409 frames / 70.45s / 5,276,135 B
node tools/phase07-record.cjs mission
# -> 1496 frames / 74.80s / 5,742,155 B

# HTTP 静态回归
# index/ask/write/explore/sandbox/tower/kb + journey-store/mission/journey => 200
```

## 5. 证据

| 证据 | 结果 | 路径/说明 |
|---|---|---|
| 76 项断言 | **通过** | `docs/phase-reports/evidence/phase-07/phase07-verify.json` |
| 导览完整录屏 | **通过** | `.../full-tour-continuity.mp4`（70.45s，1440×900） |
| 自由探索+任务录屏 | **通过** | `.../free-plus-mission.mp4`（74.80s，1440×900） |
| 导览全景 | 通过 | `phase07-02-tour-overview.png` |
| 地下真实状态 | 通过 | `phase07-03-tour-underground.png` |
| 三相分离半剖/运行 | 通过 | `phase07-04-tour-separator.png` |
| 储运液位/泵送 | 通过 | `phase07-05-tour-storage.png` |
| 炼化全剖/汽液 | 通过 | `phase07-06-tour-refining.png` |
| 产品选中 | 通过 | `phase07-07-tour-products.png` |
| 导览结束档案 | 通过 | `phase07-08-tour-archive.png` |
| 任务 brief | 通过 | `phase07-09-mission-brief.png` |
| 任务进行中 | 通过 | `phase07-10-mission-active.png` |
| 错误去向 | 通过 | `phase07-11-mission-error.png` |
| 分级提示 | 通过 | `phase07-12-mission-hint.png` |
| 任务完成总结 | 通过 | `phase07-13-mission-done.png` |
| 任务后档案 | 通过 | `phase07-14-mission-archive.png` |
| 任意时点档案 | 通过 | `phase07-15-journey-archive.png` |
| 截图/命令说明 | 通过 | `.../README.md` |

## 6. P0 / P1 / P2

### Security advisory（仓库，2026-11-23）

- 合并上游 `28fdec6` 时发现 `server/.env` 曾提交，含 `DIFY_API_KEY` / `DIFY_WRITE_API_KEY` 两项；本阶段已在 `1336288` 停止跟踪并加入 `.gitignore`，但**旧提交/远端历史仍含密钥**，本轮无法代替用户轮换。请立即在 Dify 控制台轮换两把 key，并视需要清理历史。
- 这是仓库安全 P0，不是阶段 07 UI 功能 P0；未轮换前不应把仓库视为完全清理。

### P0（阶段 07 UI/技术；未关闭则不得 PASS）

- **阶段 07 UI/技术无未关闭 P0。** 复核提出的 P0-R1/P0-R2 已修复，并由 `phase07-verify.cjs` 的 76 项断言覆盖：
  - **P0-R1 已修复**：M3 改为保存/判定当前液位；新增“75→0→泵不完成、再回 75 后完成”的负例；75/0 通过。
  - **P0-R2 已修复**：`resumeScene()` 恢复 l2 分离、l3 泵、l4 汽液；导览第 5/6/7 站暂停→继续断言全部通过；暂停时临时显示关卡操作面板，支持接管。
- P0-GOV-01（阶段 06 用户签收字段仍写“待用户签收”）：用户本轮明确声明“阶段 03—06 已通过”，作为阶段 07 放行依据；未改写历史报告、未代签。阶段 07 自身的用户签收仍待完成。
- 最短真实路径已在真实浏览器执行；任务不是选择题/积分/自动播放。

### P1

- **P1-R1 已修复**：`__l1.selectWellhead()` 暴露并用于井口站，断言 `selected==='wellhead'`。
- **P1-R2 已修复**：M5 用 `pickedCount` 增长判定新选择；取消选中不完成，断言通过。
- **P1-R3 已改善但非全量 pointer**：M1/M2 出口、M3 泵、M4 剖切/馏分使用 pointer/DOM 操作；M5 产品选择仍通过 l5 API 完成，录屏不是 N=5 用户测试。
- **P1-R4 已改善**：新增 `web/voice.js` 浏览器 `speechSynthesis` 可选朗读/暂停/停止；设备提示音为 WebAudio 合成短音；没有预录音频/独立声效库。
- **P1-R5 已改善**：5 个关卡 `fly` 在 `prefers-reduced-motion: reduce` 下即时定位；未做全量人工遍历，列 P1。
- **P1-R6 已修复**：暂停导览时显示关卡操作面板，可接管。
- **P1-R7 录屏是 CDP 自动化真实浏览器操作，不是 N=5 用户测试**；部分任务操作仍走 API。
- **P1-R8 浏览器覆盖**：1440×900 + 本地 1264×805；未做 1366/1920 长跑与跨浏览器。
- **P1-R9 任务面板位于右栏**，页面高度增加；移动端未承诺。
- 阶段 06 历史 handoff 的签收字段仍为“待用户签收”；本阶段的用户签收仍未完成。

### P2

- 性能/FPS/内存长跑、音频资产录制/授权、跨浏览器、用户测试。
- 导览可进一步增加“上一站”和知识点就地展开（当前档案承担知识点回顾）。
- 设备的精细化声效、字幕/语音同步。
- 64 位/高 DPI、键盘焦点陷阱、任务卡在超长页面上的固定策略。

## 7. 资产与许可

- 阶段 07 未新增 Hero 资产；复用阶段 04–06 的地下/分离器/塔资产。
- 合成环境音为 WebAudio 现场生成（`ambient.js`），不是录音、不是现场声级；无第三方音频许可问题。
- 未新增第三方字体/贴图；中文系统字体沿用现有页面。
- 当前阶段验收不依赖新 Hero Asset；阶段 04–06 的资产 P1/授权限制仍然有效。

## 8. 设计—研发追踪

- zoneId / stageId：`subsurface/drill`、`gathering/gather`、`storage/store`、`refining/refine`、`city/use`
- objectId：`reservoir`、`wellbore`、`wellhead`、`three_phase_separator`、`floating_roof_tank`、`transfer_pump`、`atmospheric_tower`、`vacuum_tower`、`heater`、`fuel_dispenser`、`plastic_bottle` 等
- levelId / taskId：`l1`–`l5`；`M-YJ-001`（M1–M5）
- knowledgeId：`kb_formation`、`kb_drill`、`kb_gather`、`kb_store`、`kb_refine`、`kb_use`
- shotId：`shot_overview`、`shot_descend`、`shot_lift`、`shot_separate`、`shot_store`、`shot_refine`、`shot_city`、`shot_return`
- actionId：导览阅读 `journey.*`（内部状态机）；任务读取真实 `inspect_reservoir`、`trace_up_wellbore`、`start_separation`、`assign_outlet_target`、`change_liquid_level`、`start_pump`、`inspect_tower_structure`、`select_fraction`、`select_product`
- API/深链/fallback：未改 `/api/*`；`#stage=0..4`、章节页、塔页保留；无 WebGL fallback 沿用既有。
- 影响：新增 `journey-store.js`/`mission.js`/`journey.js` 仅在 sandbox 加载；其他页面未引入任务模式。

## 9. Agent recommendation

- **建议：PASS（复核修复后；技术/交互范围；用户签收待完成）**
- 理由：
  - 10 站导览由显式继续推进，不是定时幻灯片；5 个章节有真实设备/工艺状态变化；
  - M-YJ-001 任务跨五关，M2 完成油/气/水三路去向，M3 当前液位判定，M4 全剖并选柴油，未用选择题替代；
  - 失败/提示/暂停/退出/重置/总结/档案分别实测；
  - **76 项真实浏览器断言 0 失败**；两段真实浏览器录屏 1440×900；暂停/继续、M3 负例、M5 取消选中均有断言；
  - 声音默认关闭，不阻塞；探索记录仅本机；语音为可选浏览器朗读。
- 未关闭项：P1-R3/R5/R7/R8/R9（pointer 全量、reduced-motion 全遍历、N=5 用户测试、跨浏览器/移动端）；P2 性能/声效细化。
- **本报告不能替代用户签收。**

## 10. User acceptance

- 状态：**待用户签收**
- 用户原话：未填写；不得代签。
- 日期：未填写。
- 前置放行原话（阶段 03–06，非阶段 07 签收）：`阶段 03—06 已通过。`

## 11. 停止声明

- 本阶段是否停止：**是**。
- 下一阶段是否允许开始：**否**；等待用户明确签收阶段 07 后才执行 `08_AI_CONTEXT.md`。
- 等待事项：用户签收；P0 修复后重新评估；P1 语音/reduced-motion/用户测试等后续项；不得自行进入阶段 08。

## 12. Review addendum（2026-11-23，已复审）

上一版复核提出 2 个 P0 和 9 个 P1；本轮已修复并重新验证：

1. M3 从历史最高液位改为当前液位；`75→0→泵` 负例、回到 75 完成，两项断言通过。
2. 导览 l2/l3/l4 暂停→继续恢复分离/泵/汽液；三站断言通过。
3. 井口站改为 `selectWellhead()`，并断言 selected。
4. M5 以 `pickedCount` 增长判定新选择；取消选中不完成。
5. 可选浏览器语音 `Voice` 朗读/暂停/停止通过；设备提示音为合成短音。
6. 暂停时关卡操作面板可见；关卡 `fly` 尊重 reduced-motion。
7. 最终：**76 passed / 0 failed**，15 张截图、两段录屏（70.45s / 74.80s）。
8. 复审结论：**PASS（技术/交互范围）**；P1 剩余项见 §6；用户签收仍未完成，未进入阶段 08。
