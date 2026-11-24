# Phase 08 证据

- `phase08-verify.json`：58 项断言，真实 Chrome CDP、1440×900、本地 `:8796`。
- `phase08-00-merged-ui.png`：三张模式卡合并后的单入口页面（无模式行）。
- `phase08-00a-l1-full.png`：进入地下开采的地层剖面 + 孔隙叠加效果；孔隙球位于最底层基底内，滑块 0% 时底部颗粒满量。
- `phase08-00b-l1-extraction.png`：地下开采清理后，移除标注/底栏并运行抽取动画的截图。
- `phase08-00c-l1-slider-mid.png`：滑块 60% 时井筒上升流与底部颗粒减少。
- `phase08-00d-l1-halfpipe.png`：井筒半剖后，管腔内液体柱与上升颗粒可见。
- `phase08-l3-cut-default.png`：储运默认半剖（2% 液位，液面较低）。
- `phase08-l3-cut-70.png`：液位 70% 时，两侧罐内液面清晰可见。
- `phase08-l3-cut-45-final.png`：修复前景平台遮挡后，45% 液位也能看到罐内液面。
- `phase08-l3-cut-70-final.png`：修复后的 70% 液位。
- `phase08-l3-cut-public.png`：线上 V35 默认半剖，液位 70% 的最终效果。
- `phase08-l3-default.png`：储运默认面板，设备选择与液位调节分开，无通用引导/教学免责声明。
- `phase08-l3-clean.png`：展开“演示与结构”并启动泵送后的面板。
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
