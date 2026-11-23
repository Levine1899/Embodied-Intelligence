# 接口契约

当前有四个端点，都在 `server/proxy.mjs`：Dify 问答/写作（现用）与兼容的 `/api/ask`、`/api/gen`。**API Key 不出服务器**。

> 2026-11-23 起，独立问答页使用 `/api/dify-chat`，写作页使用 `/api/dify-write`；原有的 `/api/ask`、`/api/gen` 继续保留，供沙盘侧栏与旧客户端使用。

## POST /api/ask

问答。询问同一批检索结果，按档位/模式组织语言。

### 请求

```json
{
  "question": "页岩油为什么要打水平井",
  "ctx": ["地下开采"],
  "tier": "mid",
  "mode": "open"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| question | string | 是 | 用户问题，服务端截断到 300 字 |
| ctx | string[] | 否 | 可引用资料（库内答案命中条目、当前环节名等） |
| tier | `kid` \| `mid` \| `pro` | 否 | 表达档位：少儿童话 / 中学原理 / 硬核工程；默认 `mid` |
| mode | `rag` \| `open` | 否 | `rag`（默认）只依据 ctx；`open` 允许用通用知识答石油相关题，并自行判断越界 |

### 响应

```json
{ "text": "……", "ms": 1487, "tier": "mid", "mode": "open" }
```

### 约定（前端据此分流，不要丢）

- `mode:"open"` 且问题与石油无关时，`text` 只包含 `【超出范围】` 开头的一行。
- 涉内部数据 / 预测 / 隐私时，`text` 只包含 `【不宜回答】` 开头的一行。
- 其他情况返回 120–260 字的正文。
- 前端：收到这两个标记 → 转「答不了」卡片；收到正文 → 标「模型补充 · 未逐条核验」。
- **童话档守卫**：`tier:"kid"` 时服务端检查输出，超过 120 字或出现「压裂 / 井筒 / 井段 / 储层 / 馏分 / 渗透率 / 孔隙度 / 烃源岩」→ 自动重写一次（100 字以内、生活化比喻）。因此 `kid` 请求可能比其它档多一次上游调用。

### 错误

```json
{ "error": "no key" }        // 503，服务端没配 Key
{ "error": "……" }             // 502，上游失败
```

## POST /api/gen

文案生成。把「过程记录」写成指定体裁的文字。

### 请求

```json
{
  "ledger": [{ "type": "段", "text": "原油怎样从地下走到加油站" }],
  "genre": "copy",
  "facts": ["原油是多种碳氢化合物的混合物", "常压蒸馏按沸点把原油切成不同馏分"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| ledger | `{type,text}[]` | 是 | 过程记录，`type` ∈ `问` / `答` / `看` / `段` |
| genre | `copy` \| `post` \| `script` | 是 | 展馆讲解词 / 科普推文 / 短视频脚本 |
| facts | string[] | 否 | 事实底稿；给了就作为**唯一数字来源** |

### 响应

```json
{ "text": "……", "ms": 2551 }
```

### 服务端行为

1. 系统提示词里规定：禁止出现"讲解员 / 观众 / 屏幕 / 参观"等现场复述词；出现就自动重写一次。
2. 给 `facts` 时，追加「事实底稿」规则：机理、数值、年代只能用底稿说法。
3. `script` 体裁要求每行四个字段用竖线分隔：`画面｜解说｜字幕｜秒数`。

## 缓存与部署注意

- `web/index.html` 里脚本带版本号（如 `ai.js?v=kb7`）；**改了 ai.js / immersion.js 必须递增**，否则浏览器会用旧文件。
- 生产用 nginx 托管 `web/`，`/api/` 反代到服务端代理；见 README §5。


## POST /api/dify-chat（当前问答页）

请求：

```json
{
  "question": "石油为什么是黑色的？",
  "conversation_id": "",
  "user": "一个 UUID 或稳定用户标识"
}
```

- `question`：1–300 字。
- `conversation_id`：可空；有值时必须为 UUID，保持 Dify 多轮。
- `user`：1–80 位字母、数字或短横线。
- 响应为 `text/event-stream`，透传 Dify 的 `workflow_started` / `message` / `message_end` 等事件；前端不要把它当 JSON。
- 错误：400 参数无效，503 未配置 Key，502 上游失败。

## POST /api/dify-write（当前写作页）

请求：

```json
{
  "topic": "三相分离器：它在这一环节做什么",
  "genre": "展品讲解词",
  "facts": "一行一条已核验事实",
  "audience": "普通公众",
  "style": "严谨",
  "draft": "",
  "comment": ""
}
```

- 字段均为字符串；`topic`、`facts`、`draft` 至少一个非空。
- 响应：`{ "text": "……" }`。
- 场景 handoff 通过预填 `topic` / `facts` 进入 Dify，不改变 Dify 请求字段；场景记录以“不是已核验事实”边界追加在 `facts` 末尾。

## 场景上下文兼容

- `/api/ask` 继续接收 `question`、`ctx`（string[]）、`tier`、`mode`；阶段 08 把设备、关卡、已核验要点和最近操作放进 `ctx`，不新增必填字段；可选 `action:true` 只启用动作建议模式。
- `/api/gen` 继续接收 `ledger`、`genre`、`facts`；阶段 08 将场景记录放入 `ledger`、已核验知识放入 `facts`。
- Dify 两个端点字段保持现状；`Ask`/`Write` 页面不直接接触 API Key。
- 无代理时前端降级，不伪造模型输出。
