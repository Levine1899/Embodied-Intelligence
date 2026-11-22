# 基线审计（Phase 0）

日期：2026-11-21 · 分支：`feature/immersive-hall` · 基线提交：`d69930e`
Three.js：`web/assets/three.browser.js` 中 `REVISION = '180'`（本地文件，无构建）
运行方式：`cd web && python -m http.server 8000`；可选代理 `node server/proxy.mjs`

## 1. 页面与入口（审计时）

| 页面 | 状态 |
|---|---|
| `index.html` 首页 | 100vh 视频海报 + 三维/六章/塔三入口 |
| `sandbox.html` 三维沙盘 | 五组独立低模底座 + 五关卡 + 右侧问答 |
| `explore.html` / `chapter.html` | 六章目录与知识页，回链三维 |
| `tower.html` 塔剖面 | OBJ 加载、三档剖切、五热点 |
| `ask.html` / `write.html` / `kb.html` | 问答（新版暖墨）/ 写作（旧版视觉）/ 知识库 |

## 2. 发现的问题与处理

| # | 问题（审计实证） | 处理 |
|---|---|---|
| 1 | `l1–l4.js` 的 loop 固定 `update(0.016)` | 已改为 `performance.now()` 真实 delta，上限 0.05s |
| 2 | `l1.js` 文案暗示“压力越大油就基本采完” | 已改为“压力差示意”，补“不代表真实井底压力/注入量/采收率” |
| 3 | `l3.js` 把“油气空间%”直接映射为“蒸发很猛/很少”，出现“压没” | 已删除排放量推断，改为“油气空间（示意）”+密封/附件/维护影响说明 |
| 4 | `l4.js` 把侧线产品叫“汽油/柴油”，四种产品 | 已改为五种馏分（塔顶油气/石脑油/煤油/柴油/常压渣油）+“馏分≠成品油” |
| 5 | `l5.js` 塑料“必然来自石油” | 已改“常见石油路线产品”，补天然气/煤基/生物基说明 |
| 6 | `tower.js` `webglOK()` 只测 WebGL1，r180 需 WebGL2 | 已改 WebGL2 检测 + renderer try/catch + context lost/restored |
| 7 | 塔加载后未显式初始化外观状态 | 已在 `state.loaded = true` 后调用 `setLevel(0)` |
| 8 | 沙盘五块 6.3×5.5 漂浮底座，无连续空间 | 已重构为一体化地形 + 五个嵌地分区 + 工艺脊线 + 地下剖面台阶 |
| 9 | 三维无导览、无模式、无设备级上下文 | 已加三种模式、7 步导览、`window.__sceneContext`、设备 objectId |
| 10 | 关卡 loop 无页面隐藏/退出暂停（entry.js 全局 RAF） | 本轮部分处理（关卡 loop 由 running 控制）；entry.js 全局 RAF 仍待收口，见遗留 |
| 11 | `write.html` 仍是旧版冷蓝视觉 | **未处理**（唯一未统一页面） |
| 12 | package.json 3.2.0 与 CHANGELOG 3.3.2 不一致 | 已统一为 3.4.0 |

## 3. 保护项清单（未删除）

- 五个三维环节与五个动手关卡（l1–l5 全部保留，只改文案/时间步长/配色）
- `tower.html` / `tower.js` 独立塔页与三档剖切
- 六章知识、来源链接、章节回链
- AI 问答 / 写作 / 知识库入口
- Three.js 本地加载、无 API 时静态可用
- 2D / SVG / 静态图降级（沙盘 fallback、塔页 fallback）

## 4. 可执行检查

```bash
node --check web/immersion.js web/tower.js web/ai.js web/levels/*.js
python -m py_compile tools/make_tower.py tools/render_flow_loop.py
cd web && python -m http.server 8000
```
