# Phase 01 · 测试基线

日期：2026-11-22
环境：Windows + Chrome 157.0.8103.79 + Node 22.20.0 + Python 3.12.7
服务：`python -m http.server 8789 --bind 127.0.0.1 --directory web`
原则：未执行写“未执行”，不以 HTTP 200/语法通过代替视觉/交互通过。

## 1. 静态检查

| 检查 | 命令 | 结果 |
|---|---|---|
| 全部浏览器 JS 语法 | `node --check`（16 个 `.js`） | **16/16 通过，0 失败** |
| Node 服务端语法 | `node --check server/dev.mjs server/proxy.mjs` | 通过 |
| Python 资产生成脚本 | `python -m py_compile tools/make_hero_assets.py tools/spike_separator.py` | 通过 |

## 2. 静态服务与 HTTP

| 请求 | 状态 |
|---|---|
| 9 个正式页面（index/sandbox/explore/chapter?formation/chapter?drill/tower/ask/write/kb） | 全部 **200** |
| `assets/three.browser.js`、`obj-lite.js`、hero OBJ/MTL、tower OBJ/MTL/meta、`hero-loop.mp4`、`reservoir-lab.jpg`、`tokens.css` | 全部 **200**，MIME 正确（OBJ/MTL 为 `application/octet-stream`，fetch text 可解析） |
| 不存在的 `no-such-page.html` | **404** |

## 3. 浏览器页面健康

用 Chrome + CDP 注入 `error` / `unhandledrejection` 收集器，再访问页面。

| 页面 | 标题 | JS 错误 |
|---|---|---|
| `index.html` | 油见未来 · 石油科普智能体 | 0 |
| `sandbox.html` | 三维流程沙盘 · 油见未来 | **1（P0，见下）** |
| `explore.html` | 探索大厅 · 油见未来 | 0 |
| `chapter.html?id=formation` | 石油形成与勘探 | 0 |
| `chapter.html?id=drill` | 地下开采 | 0 |
| `tower.html` | 常减压蒸馏塔 · 剖面详解 | 0 |
| `ask.html` | 科普问答 · 油见未来 | 0 |
| `write.html` | 文案生成 · 油见未来 | 0 |
| `kb.html` | 石油知识库 · 油见未来 | 0 |

### P0 错误原文

```
Uncaught NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.
    at http://127.0.0.1:8789/ai.js?v=kb8:104:17
    at http://127.0.0.1:8789/ai.js?v=kb8:440:3
```

沙盘实测：`document.querySelector('.leadai') === null`；`#leadai-q` 不存在；设备卡“问 AI”静默无动作。
原因：布局 B 把 `.source` 放进了 `.side__body`，`ai.js` 仍对 `.side` 执行 `side.insertBefore(box, src)`。
证据：`docs/phase-reports/evidence/phase-01/sandbox-overview.png`、`sandbox-stage3-device.png`。

## 4. 五关 E2E（真实浏览器）

工具：`node tools/level-e2e.cjs`（外部 Chrome 9333，headed；逐关进入、操作、退出）。
结果：**5/5 通过**。

```json
[
 {"level":1,"entered":{"level":true,"levelId":"l1","interaction":{"action":"adjust_pressure","value":50,"unit":"示意百分比"}},"exited":{"level":false,"levelId":null}},
 {"level":2,"entered":{"level":true,"levelId":"l2","interaction":{"action":"choose_outlet","value":"oil","unit":"示意"}},"exited":{"level":false,"levelId":null}},
 {"level":3,"entered":{"level":true,"levelId":"l3","interaction":{"action":"change_liquid_level","value":50,"unit":"示意百分比"}},"exited":{"level":false,"levelId":null}},
 {"level":4,"entered":{"level":true,"levelId":"l4","interaction":{"action":"choose_fraction","value":"topgas","unit":"示意"}},"exited":{"level":false,"levelId":null}},
 {"level":5,"entered":{"level":true,"levelId":"l5","interaction":{"action":"select_product","value":"汽油","unit":"1 件"}},"exited":{"level":false,"levelId":null}}
]
```

## 5. 场景交互抽查

| 检查 | 实测 |
|---|---|
| 五环节按钮 | 5 个；`selectStage(3)` 后 `stageId='refine'` |
| 深链 `#stage=3` | hash 保留，`stageId='refine'`，当前环节“炼化 / 分离与转化” |
| 设备列表 | 13 项；点第一项得到 `selectedObjectId='pumpjack'`，设备卡“抽油机” |
| `__sceneContext` | `sceneId=oil_industry_journey`、`stageId`、`levelId`、`selectedObjectId`、`knowledgeIds`、`experienceMode`、`interaction` |
| 布局 B | 1440×900：画布 1303×495，右侧 rail 46px；任务模式 340px；五环节导航底边 846px |
| 模式 | task 展开侧栏、free 收起、tour 隐藏侧栏，退出导览恢复 |

## 6. 塔页剖切

- 5 个热点、3 档按钮；点击“半剖/全剖”后 `aria-pressed` 分别正确。
- 三张网页截图（1440×900）：
  - `tower-appearance.png`
  - `tower-half.png`
  - `tower-full.png`
- 像素比较（PIL）：
  - 外观 vs 半剖：mean diff **21.21/255**，bbox 覆盖设备区域 → 明显不同；
  - 半剖 vs 全剖：mean diff **0.29/255** → **视觉差异不足**，仅少量粒子和一行说明变化。

## 7. 性能

`node tools/fps-probe.cjs`（headed Chrome，DPR2，AMD Radeon 集显）：

```json
{"fps":89.4,"frames":358,"p50":11.1,"p95":11.2,"longFrames":0,"maxGap":22.2,
 "stats":{"calls":153,"triangles":55082,"geometries":396,"textures":30}}
```

总览基线（局部状态）另测：118 calls / 47,634 面；炼化单区 83 calls / 35,476 面。不同操作状态会变化，不能只引用一个数字。

## 8. WebGL 上下文丢失

在沙盘对 canvas 调用 `WEBGL_lose_context.loseContext()`：

- `#fallback.hidden=false`；
- 文案：“三维上下文丢失，正在尝试恢复；下方流程节点与讲解仍可使用。”；
- 证据：`docs/phase-reports/evidence/phase-01/sandbox-context-lost.png`。
- 恢复路径：代码有 `webglcontextrestored` + 1.2s 帧数兜底，但本轮未在同一页面完成恢复后的持续观察（避免扩展失效），标记部分未执行。

## 9. 无 API 行为

| 操作 | 实测 | 判定 |
|---|---|---|
| 直接打开 9 个页面 | 全部可显示；三维/知识/关卡不依赖 API | 通过 |
| `ask.html` 库内问题“浮顶罐为什么能减少损耗” | 返回库内答案（无模型调用） | 通过 |
| `ask.html` 库外问题 | 静态服务下显示“暂时没有找到…”，未崩溃 | 部分通过（提示不区分服务不可用） |
| `write.html` 点生成 | 显示“出错了：Unexpected token '<'...” | **失败**（无可读降级） |
| `/api/ask` 无 Key | HTTP 503 | 符合契约 |
| `/api/gen` 无 Key | HTTP 503 | 符合契约 |
| 未知 API 路径 | HTTP 404 | 通过 |

## 10. 未执行

| 项 | 原因 |
|---|---|
| 真实用户理解测试 | 需要用户安排；仅存在方案，未执行 |
| 无 WebGL / WebGL1 环境 | 未准备受限浏览器；代码有 fallback，但未实测 |
| 移动端回归 | 本期明确不适配，未测 |
| 跨浏览器（Firefox/Safari/Edge） | 本轮只在 Chrome 157 实跑 |
| 真实 DeepSeek 代理响应 | 没有 Key，不伪造模型结果；仅验证 503 契约 |
| 长时间运行/内存泄漏 | 未做 soak test |
| 音效主观验收 | 环境音默认关闭，未做听感测试 |

## 11. 基线结论

- 语法、HTTP、五关 E2E、页面健康、塔剖切按钮、深链、FPS 有真实证据；
- **不能通过**：沙盘 AI 运行时 P0、塔全剖视觉差异不足、Hero Asset Gate 未达、写作无 API 降级失败；
- 所有截图在 `docs/phase-reports/evidence/phase-01/`，未使用设计稿/静帧冒充网页实跑。
