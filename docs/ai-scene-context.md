# AI 场景上下文与动作白名单（阶段 08）

日期：2026-11-23  
范围：`web/scene-context.js`、`web/ai-actions.js`、`web/ai.js`、`web/write.html`  
原则：AI 只接收**真实发生的场景操作**；设备数值是教学示意，不是生产数据。

## 1. 单一上下文来源

`web/scene-context.js` 是沙盘的短期上下文来源。它：

- 只在当前页面内存中保存；
- 不写 `localStorage`，不上传；
- 通过 `window.__sceneContext` 和 `scene-context` 事件保持与旧代码兼容；
- 只有用户主动点击“带入写作页”时，才把快照写入**当前标签页**的 `sessionStorage`，10 分钟后失效、读取后立即消费。

### 上下文形状

```js
{
  sceneId: "oil_industry_journey",
  registrySceneId: "petro-chain-v3",
  sessionId: "当前标签页会话 ID",
  stageId: "gather",
  stageIndex: 1,
  levelId: "l2",
  zoneId: "gathering",
  selectedObjectId: "three_phase_separator",
  deviceName: "三相分离器",
  knowledgeIds: ["kb_gather"],
  experienceMode: "free",
  interaction: {
    action: "start_separation",
    value: "started",
    unit: "示意",
    result: null,
    at: "2026-11-23T..."
  },
  history: [/* 最近 12 条真实操作 */],
  ledger: [/* 写作/AI 可引用的过程记录，最多 60 条 */],
  revision: 7
}
```

`revision` 每次真实变更加一，AI 动作用它拒绝过期建议。

## 2. 生命周期

| 触发 | 行为 |
|---|---|
| 进入旋转/沙盘 | 创建新的 `sessionId`，不读取上一个会话的上下文 |
| 选中设备 | `selectedObjectId`、`deviceName`、`zoneId`、`stageId`、`knowledgeIds` 同步 |
| 进入/切换关卡 | `setLevel()` 同步 `stageId`/`levelId`/`zoneId`，选中该关卡的主设备 |
| 真实操作 | `recordInteraction()` 更新 `interaction`，追加 `history` 和 `ledger` |
| 退出关卡 | `exitLevel()` 清除 `levelId`、旧选中对象和当前 interaction |
| 直接打开问答页 | 不自动继承沙盘上下文；用户必须从沙盘主动带入 |
| 点击“带入写作页” | 显式 handoff：设备、环节、已核验 facts、最近操作 |
| 写作页读取 | 只认 `from=scene` 且存在未过期 handoff；读取后消费 |
| 关闭/刷新沙盘 | 内存上下文自然丢弃；不跨标签页、不跨用户 |

## 3. ID 对照

### 场景 / 环节 / 关卡

| stageId | 关卡 | zoneId | 本地知识 |
|---|---|---|---|
| `drill` | `l1` | `subsurface` / `oilfield` | `kb_formation`, `kb_drill` |
| `gather` | `l2` | `gathering` | `kb_gather` |
| `store` | `l3` | `storage` | `kb_store` |
| `refine` | `l4` | `refining` | `kb_refine` |
| `use` | `l5` | `city` | `kb_use` |

### 主要 objectId

`underground_geology`、`reservoir`、`wellbore`、`wellhead`、`pumpjack`、`three_phase_separator`、`fixed_roof_tank`、`floating_roof_tank`、`transfer_pump`、`atmospheric_tower`、`vacuum_tower`、`heater`、`fuel_dispenser`、`plastic_bottle`、`fiber_spool`、`lubricant_can`、`asphalt_slab`。

完整权威表：`web/world/registry.js`。阶段 08 没有新增或重命名 ID。

## 4. AI 上下文样例

用户进入三相分离关卡、选中三相分离器、启动分离后提问：

```json
{
  "question": "为什么要先分离再外输？",
  "ctx": [
    "场景：石油产业链数字沙盘",
    "环节：地面处理",
    "关卡：l2",
    "当前设备：三相分离器（objectId=three_phase_separator）",
    "区域：gathering",
    "关联知识点：kb_gather（本地人工审核）",
    "已核验要点：井口产出物通常包含油、气、水，需要先进行分离处理。；三相分离器按相态和密度差异分离，不是过滤。",
    "刚才的操作：start_separation=started（示意，结果：未记录）",
    "最近操作：start_separation=started",
    "体验模式：free；设备数值均为教学示意，不是真实生产数据。"
  ],
  "tier": "mid",
  "mode": "open"
}
```

沙盘侧栏（`web/ai.js`）保留 `/api/ask` 的 `question/ctx/tier/mode` 兼容字段；当前独立问答页和写作页仍沿用已接入的 Dify：

- `ask.html` → `POST /api/dify-chat`
- `write.html` → `POST /api/dify-write`

## 5. 写作 handoff 样例

用户在三相分离关卡点击“带入写作页”，`sessionStorage` 中产生：

```json
{
  "sceneId": "oil_industry_journey",
  "stageId": "gather",
  "levelId": "l2",
  "objectId": "three_phase_separator",
  "objectName": "三相分离器",
  "knowledgeIds": ["kb_gather"],
  "facts": [
    "井口产出物通常包含油、气、水，需要先进行分离处理。",
    "三相分离器按相态和密度差异分离，不是过滤。"
  ],
  "topic": "三相分离器：它在这一环节做什么",
  "createdAt": "2026-11-23T..."
}
```

写作页只在这些事实底稿非空时预填；页面显示“已带入当前场景”，并提供“清除”。没有 handoff 时不读取任何旧内容。

Dify 写作请求仍使用原有字段：

```json
{
  "topic": "三相分离器：它在这一环节做什么",
  "genre": "展品讲解词",
  "facts": "井口产出物通常包含油、气、水，需要先进行分离处理。\n三相分离器按相态和密度差异分离，不是过滤。",
  "audience": "普通公众",
  "style": "严谨",
  "draft": "",
  "comment": ""
}
```

## 6. AI 动作白名单

模型动作只能通过 `window.AIActions.execute()` 执行，且必须由用户点击确认。白名单：

| actionId | 允许场景/关卡 | 参数 | 实际调用 |
|---|---|---|---|
| `select_object` | 当前环节 | `objectId` 必须是当前环节 registry 设备 | `__stage.setContextObject` |
| `clear_selection` | 任意沙盘环节 | 无 | `SceneContext.clearSelection` |
| `start_separation` | `gather` / `l2` | 无 | `__l2.startSeparation` |
| `pause_separation` | `gather` / `l2` | 无 | `__l2.pauseSeparation` |
| `start_pump` | `store` / `l3` | 无 | `__l3.startPump` |
| `set_liquid_level` | `store` / `l3` | `percent` 0–100（示意） | `__l3.setLevel` |
| `select_fraction` | `refine` / `l4` | 固定馏分 key | `__l4.selectFraction` |
| `select_product` | `use` / `l5` | `index` 0–8 | `__l5.select` |

模型返回可选块：

```text
```action
{"actionId":"start_separation","args":{}}
```
```

前端解析后只显示“执行建议动作”按钮，不自动执行。

## 7. 失败与回滚

`AIActions.execute()` 在执行前校验：

1. 动作在白名单内；
2. 当前 `sceneId`、`stageId`、`levelId` 匹配；
3. 对象存在且属于当前环节；
4. 参数范围合法；
5. 调用方传入的 `expectedRevision` 仍是最新。

失败码：

- `NOT_ALLOWED`
- `OBJECT_NOT_FOUND`
- `SCENE_MISMATCH`
- `STALE_CONTEXT`
- `SCENE_CHANGED_DURING_ACTION`
- `BAD_ARGS`
- `UNAVAILABLE`
- `ACTION_FAILED`

失败时：

- 不修改 `SceneContext`；
- 不修改 Three.js 对象；
- 保留用户当前设备与场景；
- 返回中文提示“该场景动作当前不可用”；
- 用户可以继续手动操作。

## 8. 无代理降级

| 能力 | 无代理时 |
|---|---|
| 三维沙盘 | 正常 |
| 本地知识卡片 | 正常；标注本地人工审核 |
| 设备讲解 | 使用静态知识 |
| AI 侧栏 | 库内命中仍回答；库外明确提示模型服务未连接 |
| 写作页 | 显示可编辑的“预置模板 · 未连接模型”，不冒充模型输出 |
| API Key | 永远不进入前端 |

## 9. 兼容性

- `/api/ask`：`question`、`ctx`、`tier`、`mode` 未改。
- `/api/gen`：`ledger`、`genre`、`facts` 未改。
- Dify：`/api/dify-chat` 与 `/api/dify-write` 的现有字段未改；场景信息通过已核验 `facts`/问题本身进入。
- 原有 `chapter.html`、`tower.html`、`#stage=0..4` 深链保留。
