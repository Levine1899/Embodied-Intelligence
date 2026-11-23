# Phase 08 证据

- `phase08-verify.json`：36 项断言，真实 Chrome CDP、1440×900、本地 `:8796`。
- `phase08-01-context-separator.png`：进入三相分离关卡后的上下文。
- `phase08-02-ai-context.png`：设备卡“问 AI”打开侧栏后的上下文。
- `phase08-02b-action-suggestion.png`：动作建议（模型动作块 → 用户点击执行）。
- `phase08-02c-ai-panel-open.png`：AI 面板入口的人工截图。
- `phase08-03-no-proxy-local.png`：无代理时本地知识仍可回答。
- `phase08-04-write-handoff.png`：从沙盘“带入写作页”，主题与已核验事实预填；Dify 请求 facts 追加场景记录边界。
- `dify-api-proof.json`：生产 Dify `/api/dify-chat`、`/api/dify-write` 与兼容 `/api/ask`、`/api/gen` 的 200 响应摘要（不含 Key）。
- `action-mode-proof.json`：生产 `/api/ask` `action:true` 真实返回的动作块摘要（不含 Key）。

运行命令：

```bash
node --check web/scene-context.js
node --check web/ai-actions.js
node --check web/ai.js
node --check web/immersion.js
CDP_PORT=4344 BASE_URL=http://127.0.0.1:8796 node tools/phase08-verify.cjs
```
