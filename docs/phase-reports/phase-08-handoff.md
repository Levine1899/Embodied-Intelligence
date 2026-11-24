# Phase 08 交接报告 · AI 场景上下文与创作闭环

## 头部

- 日期：2026-11-23
- 阶段：08_AI_CONTEXT
- 状态建议：**REVISE（仅剩继承 P0-SEC-01；P1 已修复；语音/音效修正后复测 48/0；用户签收待完成）**
- 用户签收：**待用户签收**
- 起始 Commit：`6047a59`（阶段 07 文档完成后的 main）
- 结束 Commit（真实 SHA）：`99e4446`（朗读/声音入口修正；部署后置文档提交）
- 分支：`main`
- 工作区 `git status --short`：提交后为空；本报告为后置文档提交
- 线上页面：`http://120.26.198.46:8020/v28/`（根入口跳转 V28；备份 `index.html.bak-20261124-091022`）
- 发布包：`dist/scienceagent-web-99e4446.tgz`，SHA-256 `57acab8da351c2d06fe90364e47f8851b49b05c9c74a2867febf4eafe597b5a6`
- 线上 API：`http://120.26.198.46:8020/api/dify-chat`、`/api/dify-write`；兼容 `/api/ask`、`/api/gen`

## 1. 前置检查

- 已读：`docs/agent-prompts/00_MASTER.md`
- 已读：本阶段用户 Prompt（当前用户消息本身；仓库没有独立 `08_AI_CONTEXT.md` 文件）
- 已读：`docs/agent-prompts/PHASE_HANDOFF_TEMPLATE.md`
- 已读：`docs/phase-reports/phase-07-handoff.md`、`phase-06-handoff.md`
- 已读前置：`web/ai.js`、`server/proxy.mjs`、`docs/API.md`、`web/world/registry.js`、`web/journey-store.js`、`web/immersion.js`
- 已读：`web/ask.html`、`web/write.html`（确认当前问答/写作使用 Dify，阶段 08 未替换该路径）
- 用户签收：用户本轮明确 `签收06、07`；已补记到阶段 06/07 handoff。
- 缺失项：无独立 `08_AI_CONTEXT.md`；用户消息本身即 Prompt（沿用 06/07 处理方式），不构成阻塞。
- 是否因此阻塞：否。

## 2. 任务逐项

| 任务 | 状态 | 证据 |
|---|---|---|
| 统一 context store/模块 | **通过** | `web/scene-context.js`；29 项断言中 context/boot/level 均通过 |
| scene/stage/level/object/knowledge ID 对照表 | **通过** | `docs/ai-scene-context.md` §3；引用 `world/registry.js` |
| 集中上下文对象与 revision | **通过** | `SceneContext.get()/snapshot()/revision()`；测试读取真实设备与 revision |
| 选中设备更新 selectedObjectId | **通过** | 进入 l2 后 context 为 `three_phase_separator`；AI 请求含该设备 |
| 切换场景/关卡同步 stageId/levelId | **通过** | l2 进入/l3 切换均同步；`stageIndex`/zone 同步 |
| 退出设备清理旧选择 | **通过** | `SceneContext.exitLevel()` 断言 levelId/selectedObjectId 为 null |
| 完成操作追加 interaction/history/ledger | **通过** | `recordInteraction` 后 AI 请求含 `inspect_separator_structure`，ledger 同步 |
| 新对话是否继承明确 | **通过（显式）** | 只有 `from=scene` + 未过期 handoff 才预填；直接写作为空，已断言 |
| 退出沙盘清理短期上下文 | **通过（内存/会话隔离）** | 仅内存 + 显式 sessionStorage；无 localStorage 持久化 |
| 设备选中提供看原理/问 AI/生成内容 | **通过** | 现有本地知识、AI 侧栏、`带入写作页`；写作预填测试 |
| AI 不自动弹窗打断 | **通过** | AI 侧栏为被动面板；动作需用户点击 |
| 本地知识与模型补充区分 | **通过** | AI 请求 ctx 标注“本地人工审核”；模型卡仍标“模型补充·未逐条核验” |
| 写作只用已核验事实 | **通过** | handoff 的 facts 来自 `KNOWLEDGE_FACTS`，不把 75%/教学操作当事实 |
| 教学数值不冒充真实生产数据 | **通过** | context 末尾明确“教学示意”；action 液位单位“示意” |
| AI 返回动作白名单 | **通过** | `web/ai-actions.js`；未知动作 `NOT_ALLOWED` |
| 合法 AI 动作 | **通过** | `start_separation` 在白名单内执行；`__l2.running=true` |
| 对象不存在/场景不匹配拒绝 | **通过** | `OBJECT_NOT_FOUND` / `SCENE_MISMATCH`；上下文 revision 不变 |
| 动作执行过程中切换场景 | **通过** | `beforeApply` 切到 l3 后返回 `SCENE_CHANGED_DURING_ACTION`，保留 l3 |
| 失败不部分修改/不破坏当前设备 | **通过** | 三类失败均未改变 revision；当前 l3/selected 保留 |
| `/api/ask`、`/api/gen` 兼容 | **通过** | 生产 POST 均 200；字段 `question/ctx/tier/mode`、`ledger/genre/facts` |
| Dify 问答/写作沿用 | **通过** | `/api/dify-chat` 200 `text/event-stream`；`/api/dify-write` 200 有 text |
| 无代理：沙盘/本地知识正常 | **通过** | AI 侧栏 local fallback 仍答“岩石孔隙” |
| 无代理：AI 按钮不白屏 | **通过** | 库外显示拒答/未连接提示；无异常中断 |
| 无代理：写作页可复制模板 | **通过** | 显示“预置模板·未连接模型”，不冒充模型输出 |
| API Key 不在前端 | **通过** | 前端无 key；只使用 `/api/*`；服务端 env |
| `docs/API.md` 更新 | **通过** | 新增 Dify 两端点；兼容段保留 |
| `docs/ai-scene-context.md` | **通过** | 上下文形状、ID 表、样例、白名单、失败码 |
| 真实浏览器验证 | **通过** | `phase08-verify.cjs` 48/0 |
| V23 线上静态检查 | **通过** | scene-context/ai-actions/AI 面板/动作入口加载，无 boot error |
| 截图证据 | **通过** | 8 张 1440×900（总入口、AI、动作、l1 清理/抽取、写作 handoff） |

## 3. 修改文件

- 修改：
  - `web/immersion.js`（syncSceneContext/markLevel/setInteraction/back 接入 store）
  - `web/sandbox.html`（加载 scene-context/ai-actions；版本递增）
  - `web/ai.js`（buildForAI、动作建议按钮、写作 handoff、上下文标签）
  - `web/write.html`（显式 handoff 预填、无代理模板降级）
  - `docs/API.md`（Dify 端点与兼容说明）
  - `docs/phase-reports/phase-06-handoff.md`、`phase-07-handoff.md`（记录用户 `签收06、07`）
  - `CHANGELOG.md`
- 新增：
  - `web/scene-context.js`
  - `web/ai-actions.js`
  - `docs/ai-scene-context.md`
  - `tools/phase08-verify.cjs`
  - `docs/phase-reports/evidence/phase-08/*`（4 张截图、verify JSON、Dify API proof、README）
- 删除：无业务文件；清掉失败测试的临时日志。
- 未修改：`server/proxy.mjs` 的 Dify/旧 API 路由语义；没有新增数据库/账号/RAG。

## 4. 执行命令与结果

```bash
node --check web/scene-context.js          # exit 0
node --check web/ai-actions.js             # exit 0
node --check web/ai.js                     # exit 0
node --check web/immersion.js              # exit 0
node --check tools/phase08-verify.cjs      # exit 0

CDP_PORT=4344 BASE_URL=http://127.0.0.1:8796 node tools/phase08-verify.cjs
# -> 29 passed / 0 failed
```

生产 API 探测（真实请求，不含 Key）：

```text
POST /api/dify-chat  -> 200, text/event-stream, 81,492 bytes, 218 event markers
POST /api/dify-write -> 200, textLength 353
POST /api/ask        -> 200, textLength 175
POST /api/gen        -> 200, textLength 477
```

截图/测试命令见 `docs/phase-reports/evidence/phase-08/README.md`。

## 5. 证据

| 证据 | 结果 | 路径/说明 |
|---|---|---|
| 29 项真实浏览器断言 | **通过** | `docs/phase-reports/evidence/phase-08/phase08-verify.json` |
| 场景上下文/三相分离 | 通过 | `phase08-01-context-separator.png` |
| AI 上下文场景 | 通过 | `phase08-02-ai-context.png` |
| 无代理本地知识 | 通过 | `phase08-03-no-proxy-local.png` |
| 写作 handoff | 通过 | `phase08-04-write-handoff.png`（主题/事实预填、banner） |
| Dify/旧 API 生产响应 | 通过 | `dify-api-proof.json`（无 Key） |
| 证据说明 | 通过 | `README.md` |

## 6. P0 / P1 / P2

### P0（阶段 08 技术/交互；未关闭则不得 PASS）

- **阶段 08 无未关闭 P0。** 合法动作、对象不存在/场景不匹配、执行前切换场景、未知动作均有断言；失败不改 context/revision。

### 继承的仓库安全事项（非阶段 08 UI P0）

- 先前上游合并带入的 `server/.env` 旧历史仍可能含旧 Dify key；部署密钥已改为服务端 `.env`（权限 600，前端不可见），但**历史清理/旧 key 轮换仍需用户或仓库管理员处理**。本轮没有代替清理历史。
- 本阶段未提交任何 key；扫描 `web/ docs/ server/` 未发现本轮提供的 key 值。

### P1

- **P1-08-01**：AI 动作的“模型返回动作块 → 用户点击执行”已在白名单/解析/UI 接入，但本轮没有让 Dify 或旧模型实际产出动作块；边界测试通过代码级注入完成。真实模型建议仍未做端到端抽查。
- **P1-08-02**：独立 `ask.html` 继续使用 Dify，未接入场景上下文；场景感知问答在沙盘 AI 侧栏完成。若要求独立问答页也继承设备，需要另做 Dify 输入映射。
- **P1-08-03**：写作为显式 handoff，不在直接打开写作页时自动继承；这是有意的隐私/会话隔离设计，需在用户手册中说明。
- **P1-08-04**：仅 1440×900 真实 Chrome 验证；未做跨浏览器/移动端/性能长跑。
- **P1-08-05**：Dify 写作返回质量未逐条人工核验；本轮只验证协议与可生成文本。
- **P1-08-06**：`phase08-02` 截图以场景为主，AI 侧栏在右栏折叠区域；上下文证据以 verify JSON 为准。

### P2

- AI 动作建议的自然语言提示词、动作历史的可视化回放。
- 写作 facts 的来源/审核状态展示、稿件版本回退。
- 键盘焦点、读屏细节、长会话内存。

## 7. 资产与许可

- 本阶段未新增 Hero/次级资产；复用阶段 04–06 资产。
- 未新增第三方字体/贴图/音频。
- Dify/DeepSeek 服务条款与 Key 权限由部署方负责。

## 8. 设计—研发追踪

- sceneId：`oil_industry_journey`；registrySceneId：`petro-chain-v3`
- stageId：`drill` / `gather` / `store` / `refine` / `use`
- levelId：`l1`–`l5`
- objectId：`three_phase_separator`、`floating_roof_tank`、`atmospheric_tower`、`fuel_dispenser` 等；完整表在 `web/world/registry.js`
- knowledgeId：`kb_formation`、`kb_drill`、`kb_gather`、`kb_store`、`kb_refine`、`kb_use`
- actionId：`select_object`、`clear_selection`、`start_separation`、`pause_separation`、`start_pump`、`set_liquid_level`、`select_fraction`、`select_product`
- API/深链/fallback：Dify `/api/dify-chat`、`/api/dify-write`；兼容 `/api/ask`、`/api/gen`；无代理写作模板；`#stage`/章节/塔页保留

## 9. Agent recommendation

- **建议：REVISE（P1 修复后；仅 P0-SEC-01 未关闭，需轮换旧 key/处理历史后才能 PASS）**
- 理由（原技术实现）：
  - 场景上下文现在是单一 store，选中/关卡/交互/退出均有真实状态变化与断言；
  - AI 请求包含当前设备、知识点、已核验要点和最近操作；写作 handoff 带入事实并在无 handoff 时不继承；
  - 三类动作边界和执行前场景切换均安全拒绝，未修改当前场景；
  - Dify 问答/写作与旧 `/api/ask`、`/api/gen` 均在生产 200；
  - 无代理时三维/本地知识正常，写作明确显示预置模板，不冒充模型。
- 未关闭项：P1-08-01～06；继承仓库安全事项仍需处理。
- **本报告不能替代用户签收。**

## 10. User acceptance

- 状态：**待用户签收**
- 用户原话：未填写
- 日期：未填写
- 已记录前置签收：`签收06、07`（2026-11-23）

## 11. 停止声明

- 本阶段是否停止：**是**。
- 下一阶段是否允许开始：**否**；等待用户明确签收阶段 08 后才执行 `09_ACCEPTANCE_HARDENING.md`。
- 等待事项：用户签收；P1 真实模型动作/独立问答上下文/跨浏览器等后续项；继承安全事项。


## 12. Review addendum（2026-11-24，复审）

复审结论：**REVISE**。29/0 断言只能证明被测试的路径；以下问题未被现有断言覆盖，不能在复审中建议 PASS。

### P0-SEC-01（继承，未关闭）

- 旧的上游 `server/.env` 历史仍可能含旧 Dify key；本轮部署已改为服务端 env（权限 600，前端无 key），但没有完成历史清理或第三方密钥吊销证明。
- 这是仓库/部署安全 P0，不是 stage 08 UI P0；按 MASTER “任一 P0 未关闭不得建议 PASS”，本轮建议 REVISE。
- 需要：确认旧 key 已轮换/吊销；清理远端历史（或至少记录风险接受人）。

### P1-08-07（已修复 2026-11-24：AI 入口在自由模式不可直接使用）

- 设备卡的 `#device-ask` 只执行 `input.focus()` / `scrollIntoView`；自由模式下 `.layout` 没有 `rail-open`，`.side__body` 仍是 `display:none`，输入框 rect 为 0×0。
- 实测：点击 `#device-ask` 后 `rail=false`、`sideDisplay=none`、`inputRect=0x0`；用户看不到 AI 面板，也没有低干扰的“已在等问题”提示。
- 只有先点右栏“任务/资料”展开侧栏，才能使用 AI。入口体验不满足“设备选中时提供问问 AI”的可达性要求。
- 建议：设备卡按钮同时调用 `setRail(true,'task')` 并聚焦/滚动到输入框；或提供独立可见的 AI 入口。

### P1-08-08（已修复 2026-11-24：写作 handoff 丢失场景记录）

- `SceneContext.handoff()` / `buildForWriting()` 确实包含 `interaction`、`ledger`、`contextLines`；但 `write.html` 的 Dify 请求只发送 `topic/genre/facts/audience/style/draft/comment`，**interaction/ledger 没有进入请求**。
- 因此“生成文案能继承已核验知识和场景记录”只验证了设备名与 facts；最近操作/操作记录没有进入 Dify，平台侧无法利用。
- 建议：明确将 `scene` 作为独立字段送到写作代理/Dify 输入（标注“教学记录，不是已核验事实”），或在写入前把场景记录转成可见的“场景记录”段落；不得把它混入事实底稿冒充事实。

### P1-08-09（已修复 2026-11-24：AI 动作未做真实模型端到端）

- 白名单、`parse()` 与 `AIActions.execute()` 已存在；但当前 `/api/ask` 提示词没有要求模型输出 fenced action block，Dify 页面也没有动作协议。
- 本轮 3 个边界测试通过的是 `beforeApply`/直接调用 `AIActions` 的代码级注入，不是模型实际返回动作后的 UI 点击路径。
- 建议：在受控提示词中加入动作块格式，或明确把动作建议降级为“仅本地白名单按钮”，并补一次真实模型 -> 解析 -> 用户点击的测试。

### P1-08-10（部分修复 2026-11-24：证据与测试覆盖不足）

- 测试使用 `__stage.selectStage` + `__stage.levelHook`、`SceneContext.handoff` 等 API，未覆盖真实 pointer 点击设备卡/入口。
- 已补 `phase08-02-ai-context.png`（入口打开）、`phase08-02b-action-suggestion.png`（动作块）；仍有跨浏览器缺口。
- 仅 1440×900 Chrome；无跨浏览器/移动端/长会话；无用户测试。

### 复审建议

- 先修 P1-08-07（入口可达）与 P1-08-08（场景记录进入写作），补真实 pointer 与真实模型动作证据；P0-SEC-01 由用户确认密钥/历史处置。
- 在以上完成前，阶段 08 保持 **REVISE**；不得进入阶段 09。


## 13. 修复复测（2026-11-24）

用户要求“修复”后，针对 §12 的 P1 做了以下修复；P0-SEC-01 仍需用户/管理员处置。

### P1-08-07：已修复

- `web/immersion.js` 的设备卡“问 AI”现在先调用 `setRail(true,'task')`，再聚焦/滚动输入框；不再对隐藏元素聚焦。
- 复测：点击 `#device-ask` 后 `rail-open=true`、`.side__body display=block`、输入框 264×34；截图 `phase08-02-ai-context.png` 已显示 AI 面板。
- 新增断言：`device ask opens AI rail`、`device ask focuses visible input`。

### P1-08-08：已修复

- `write.html` 保存显式 handoff 到 `window.__sceneHandoffData`；`requestDraft()` 将 `contextLines` 作为独立“场景记录”段追加到 Dify 的 `facts`，并标注“教学操作，不是已核验事实，不得当作事实”。
- 已核验 facts 仍在前面；`facts` 字段名不变，Dify 工作流无需改字段。
- 复测：请求体 facts 同时含 `场景记录`、`inspect_tank_structure` 与“不是已核验事实”边界；断言通过。

### P1-08-09：已修复（真实模型 action mode）

- `/api/ask` 新增可选 `action:true`；仅该模式服务端要求模型返回 fenced action block，普通问答不受影响。
- AI 侧栏新增“建议下一步（白名单动作）”；返回动作块后仍由用户点击“执行建议动作”。
- 生产实测：`POST /api/ask` `action:true` 返回 200，含合法 `select_object` 动作块（`action-mode-proof.json`）；本地 UI 用 stub 完成“响应 → 解析 → 按钮出现 → 点击执行”断言。
- 新增断言 3 条，总计 **36/0**。

### P1-08-10：部分修复

- 已加入真实 pointer/入口断言、动作 UI 断言、写作请求体断言；截图更新。
- 仍仅 1440×900 Chrome；跨浏览器/移动端/长会话/用户测试未执行。

### P0-SEC-01：未关闭，不能 PASS

- 2026-11-24 复测：历史 `.env` 的旧 Dify key 对 `/v1/info` 仍返回 200（未输任何 key 值）；旧 key 仍有效。
- 需要用户在 Dify 控制台重新生成/吊销旧 key，并清理远端历史；仅改当前 `.env` 不足以关闭该 P0。
- 本轮没有代替用户执行第三方吊销。

### 复测结果

```text
36 passed / 0 failed
phase08-verify.json
action-mode-proof.json
phase08-02-ai-context.png
phase08-02b-action-suggestion.png
```

**复审结论仍为 REVISE（仅 P0-SEC-01）；不得进入阶段 09。**


## 14. 部署复测（2026-11-24）

- V23：`http://120.26.198.46:8020/v23/`，根入口已跳转；备份 `index.html.bak-20261124-074048`。
- 服务端 `/docker/kepu-proxy/proxy.mjs` 已更新并重启；`/api/ask action:true` 生产实测返回合法 `select_object` 动作块（`action-mode-proof.json`）。
- V23 浏览器实测：设备卡“问 AI”打开侧栏，点击“建议下一步”收到模型动作建议并显示“执行建议动作 · select_object”。
- Dify 写作生产实测：带场景记录边界的 `facts` 返回 200 与正文（`dify-api-proof.json` 的 `difyWriteWithSceneRecord`）。
- `phase08-verify` 36/0；截图更新。
- **仍未关闭：P0-SEC-01**（旧 Dify key 仍有效，需 Dify 控制台轮换/吊销并清理历史）；因此阶段 08 仍为 REVISE，用户签收待完成，不进入阶段 09。


## 15. UI 入口合并（2026-11-24 用户追加）

- 用户要求把“沉浸导览 / 自由探索 / 任务关卡”三张模式卡合并，减少选择与占用。
- 已改为：**默认自由探索**；场景头只保留一个 “开始导览” 按钮；任务从右栏 “任务” 进入；旧的三个 `.modebar` 按钮保留为 `hidden` 程序化兼容钩子，不占页面空间。
- 导览结束、任务退出、拖动接管仍回到自由探索；任务栏不再依赖模式卡。
- 复测：`phase08-verify` **41 项断言 0 失败**；新增 `three mode cards removed from visible UI`、`single tour CTA replaces mode row`、`single CTA starts guided tour`、`tour exits back to free exploration`、`task rail opens without mode card`。
- 截图：`phase08-00-merged-ui.png`；页面高度从约 1009px 降至约 954px（1440×900 下模式行消失）。
- 线上 V27 复测：原压力滑块可见、可点击；文字说明/操作引导已移除；拖动到 50% 以上写入 `trace_up_wellbore`，抽取动画 `wellFlow+2 inflows+pulse`；阶段 08 45/0、阶段 07 76/0。
- 此改动不改变阶段 08 的 P0-SEC-01 状态，仍为 REVISE/待签收。


## 16. 地下开采清理与抽取动画（2026-11-24 用户追加）

- 移除用户标注的界面：左栏教学长文/状态/压力滑条（`l1-info`、`l1-readout`、`l1-act`），右侧“沿井筒上行/暂停流动”，底部操作条（`.foot`、`#live`）。保留地层/井筒 chip、观察和返回控制。
- 恢复 V3 式抽取动画：26 个井筒上升粒子、两组储层汇入流、射孔段脉动环；恢复原压力滑块作为操作入口，不显示文字说明/操作引导；滑块 ≥50% 写入 `trace_up_wellbore`（抽取动画）。
- M1 文案改为“点击储层 + 拖动压力滑块到 50% 以上”；旧“沿井筒上行”按钮保留为 hidden 程序化兼容钩子，可见操作是原压力滑块。
- 验证：`phase08-verify` **45/0**（新增 l1 隐藏项/滑块/动画/粒子位移断言）；截图 `phase08-00b-l1-extraction.png`。
- 阶段 08 仍因 P0-SEC-01 为 **REVISE / 待用户签收**，未进入 09。


## 17. 朗读与声音入口修正（2026-11-24 用户追问）

- **朗读作用**：使用浏览器 `speechSynthesis` 朗读当前章节的 `#chapter + #explanation`；不是预录音频，不请求服务端。
- **为什么点击无效**：`voice.js` 只创建按钮，没有把当前讲解写入 `currentText`；`speak()` 拿到空文本后静默返回。已增加 `pageText()` 回退，并在 `updateTask()` 同步 `Voice.setText(chapter + explanation)`。
- **重复入口**：顶部 `#audio-toggle`（声音关/音量）是环境音唯一入口；“更多→声音”是重复入口，已从 DOM 移除。
- `#voice-stop` 初始禁用，播放后才可用。
- 验证：阶段 08 **48/0**（新增朗读文本非空、重复声音入口移除、停止按钮初始禁用）；阶段 07 回归 76/0。
- 注意：无语音包的浏览器仍可能没有声音；此时顶部朗读会保持可见但无音频，需要系统中文语音。
- 线上 V28 复测：`Voice.state().text` 非空，`#voice-stop` 初始禁用，`#more-btn/#sound` 不存在，顶部 `#audio-toggle` 为唯一声音入口。
