# Phase 08 交接报告 · AI 场景上下文与创作闭环

## 头部

- 日期：2026-11-23
- 阶段：08_AI_CONTEXT
- 状态建议：**PASS（阶段 08 技术/交互范围；用户签收待完成）**
- 用户签收：**待用户签收**
- 起始 Commit：`6047a59`（阶段 07 文档完成后的 main）
- 结束 Commit（真实 SHA）：`4f3cec1fee38791e894471c66123cf0ae20e0159`
- 分支：`main`
- 工作区 `git status --short`：提交后为空；本报告为后置文档提交
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
| 真实浏览器验证 | **通过** | `phase08-verify.cjs` 29/0 |
| 截图证据 | **通过** | 4 张 1440×900（context/AI/no-proxy/write handoff） |

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

- **建议：PASS（阶段 08 技术/交互范围）**
- 理由：
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
