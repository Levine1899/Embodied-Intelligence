# Phase 01 · 代码与体验基线审计

日期：2026-11-22
分支：`main`
审计起始提交：`be08acf`（工作区干净）
审计方式：当前工作区源码 + 本机静态服务 + Chrome 157 实跑；历史文档只作为线索，结论以代码和实跑为准。

> 前置文件状态：工作区没有 `00_MASTER.md`、`PHASE_HANDOFF_TEMPLATE.md`，也没有 `docs/phase-reports/` 历史报告。阶段 01 无上一阶段交接，不因此判定阻塞；本报告按本轮总控消息中的字段要求组织。这个缺失会在交接报告里保留为风险，不用历史记忆补齐。

## 1. 仓库与版本

| 项 | 实测 |
|---|---|
| 仓库 | `D:\Work\Embodied Intelligence\scienceagent`，126 个文件（不含 `.git`） |
| 分支 / 提交 | `main` / `be08acf`，`git status --short` 为空 |
| 远端 | `origin` gitee `LYU_PRO/scienceagent`；`github` `Levine1899/Embodied-Intelligence` |
| 站点版本 | `package.json` / README / CHANGELOG 均为 **3.4.0** |
| 前端 | 原生 HTML/CSS/JS，零构建；`web/` 是生产目录 |
| Three.js | 本地 `web/assets/three.browser.js`，`REVISION = '180'`（r180） |
| 本地依赖 | 无 npm dependencies；`package.json` 只有 dev/api/start scripts |
| 后端 | 唯一 Node 代理 `server/proxy.mjs`；另有 `server/dev.mjs` 静态+反代开发服务 |
| 外部请求 | 页面不引 CDN；字体、模型、图片全部本地；`/api/ask`、`/api/gen` 同源；资料链接仅在用户点击后打开 |

### 运行方式（实测）

```bash
# 纯静态（三维/知识/关卡可跑）
cd web && python -m http.server 8789
# 可选：问答/写作代理（无 Key 时 503）
node server/proxy.mjs            # 127.0.0.1:8790
# 开发：静态 + /api 反代
npm run dev                      # 127.0.0.1:5173
```

### 版本/文档不一致

1. `PACKAGE-README.md` 不存在；README 只有一份。
2. `server/proxy.mjs` 文件头注释仍写“只做一件事：POST /api/gen”，实际已支持 `/api/ask`（L171、L196），注释过期。
3. `docs/audit-baseline.md`（旧）写的是 `feature/immersive-hall` / `d69930e` / 五块漂浮底座；已被当前连续地形和 `main` 取代，属于历史材料。
4. `docs/asset-inventory.md`（旧）写“声音接口未实现”，但当前已有合成环境音 `web/assets/site/ambient.js` 与声音按钮；旧清单不可直接当现状。
5. `docs/hero-assets.md` 明确写“未生成 .blend（脚本即源）”；这与总控的 Hero Asset 交付清单存在差距，见资产报告。

## 2. 页面与业务结构

| 页面 | 入口/深链 | 无 API 时 | 实测 |
|---|---|---|---|
| `index.html` 首页 | 一级导航/品牌 | 可用 | 200，Chrome 无脚本错误 |
| `sandbox.html` 沙盘 | 首页、探索、塔页回链 | 三维、五关、设备列表可用；右栏 AI 面板当前因脚本异常不挂载 | 200；118 calls / 47,634 面；见 P0 |
| `explore.html` 探索大厅 | 一级导航 | 可用 | 200，无脚本错误 |
| `chapter.html?id=<id>` 章节 | 探索大厅；`chapter.html?id=formation` 等 | 可用；`#stage=N` 回三维 | 200；六章 |
| `tower.html` 塔剖面 | 首页、探索、沙盘 | 可用；独立 OBJ | 200；5 热点、3 档剖切 |
| `ask.html` 问答 | 一级导航；章节 `?q=` | 库内命中可用；库外依赖 `/api/ask` | 200；KB 命中实测通过 |
| `write.html` 写作 | 一级导航 | 生成依赖 `/api/gen`；无代理时报原始 JSON 解析错误 | 200；无 API 降级不合格，见 P1 |
| `kb.html` 知识库 | 页脚/问答 | 可用 | 200，无脚本错误 |
| `_spike-separator.html` | 无入口 | 技术验证页，非产品页面 | 不计入正式页面 |

- 一级导航：首页 / 探索 / 问答 / 写作。
- 沙盘深链：`sandbox.html#stage=0..4`；实测 `#stage=3` 定位到炼化，`__sceneContext.stageId='refine'`。
- 章节回三维：`chapter.html` 的 `STAGE_OF`：`drill→0, gather→1, store→2, refine→3, use→4`；`formation` 无对应三维环节。
- 五关与五环节：l1 地下开采、l2 地面处理、l3 储运、l4 炼化、l5 产品去向；与六章是“五环节 + 形成章”的关系，不是一一对应六关。
- 知识库：`kb-sources.js` 为本地来源数据；问答页与写作页共享 `__KB_EXTRA` 事实底稿。

## 3. 三维结构（当前代码）

### 初始化

- `web/immersion.js`：
  - `PerspectiveCamera(40, 1, 0.1, 220)`；
  - `WebGLRenderer({antialias:true, alpha:false})`，DPR 上限 1.5，ACES tone mapping；
  - 没有 `OrbitControls`，相机交互是自定义 pointer 拖拽 + 滚轮 + 自写 `updateCamera`；
  - `ResizeObserver` 驱动 resize；
  - `requestAnimationFrame(render)`；`document.hidden` 时跳过渲染；
  - `webglcontextlost` 阻止默认行为并显示 `#fallback`；`webglcontextrestored` 恢复；渲染帧数兜底隐藏提示（`contextLostAt`）。
- 无 WebGL2 显式探测的沙盘：r180 Renderer 构造失败由初始化 `try/catch`/fallback 捕获；塔页 `tower.js` 有显式 `WebGL2RenderingContext` 检测。

### 空间与区域

`REGIONS`（x/z/w/d）：

| 区域 | x | z | 宽 | 深 |
|---|---|---|---|---|
| 地下开采 | -26 | 0 | 13 | 12 |
| 地面处理 | -11 | 0 | 11 | 12 |
| 储运 | 4 | 0 | 12 | 12 |
| 炼化 | 19 | 0 | 14 | 14 |
| 产品去向 | 33 | 0 | 12 | 12 |

- 五个 `modelGroups` 嵌在一块连续地形上，区域间有 CatmullRom 管线与流动粒子；`mergeStaticMeshes` 按材质/外观合批，Hero 容器 `skipMerge`。
- 主场景对象 ID（13 个）：抽油机、井口、三相分离器、固定顶罐、外浮顶罐、常压塔、减压塔、加热炉、加油机、塑料瓶、合成纤维、润滑油、沥青。
- 炼化装置用 `tower.obj` 替换程序化双塔；`atmTowerGroup/vacTowerGroup` 在装置加载后隐藏，避免旧楼梯残留。
- 地下剖面是程序化地层台阶 + 井筒/井口/抽油机，不是独立 Hero 资产；没有井下井筒内部漫游。

### 关卡与总览

- `window.__levelHooks` 五个入口；`entry.js` 创建左侧关卡入口/复位按钮，`__lvlGroup` 控制关卡组显隐。
- 关卡进入后使用独立相机/场景对象，退出 `__lN.exit()` + `stage.back()`，清空 `levelId` / `interaction` 并派发 `scene-context`。
- 总览与关卡共享 `baseScene`，但关卡内部对象多为关卡自建；共享的是场景、相机状态、对象/知识上下文，不是全部网格。
- 五关实测全部“进入→操作→退出”通过，见测试报告。

### 相机、标签与模式

- `CAM_PRESETS` 每区一个预设；`selectStage(index, focus, objectId, anchor)`；
- 标签是 DOM `.object-label`，每帧投影到屏幕；设备卡当前 CSS 定位在右下（布局 B），JS 仍做投影可见性判断；
- 三种模式：`free` / `task` / `tour`；导览 7 步（约 90 秒），输入可暂停/接管；
- `setAutoOrbit`、`setInteraction`、`stats()`、`levelHook()`、`pump` 暴露。

### 资源生命周期

- `mergeStaticMeshes` 会 dispose 被合并的原 Geometry（L457）；材质共享。
- `loadHeroAsset` 替换容器时 dispose 旧几何/材质（L1399/L1478 一带）；关卡退出有各自清理逻辑。
- 塔页是单页 OBJ，未做页面卸载 dispose；不属于长驻多场景。
- 没有纹理贴图绑定到 Hero 网格（MTL 只有基础色/高光），`stats.textures` 主要来自运行时/渲染器统计，不能当成有 UV 贴图。

## 4. API 与数据边界

- 端点：`POST /api/ask`，`POST /api/gen`；Key 只在 `process.env.DEEPSEEK_API_KEY` 或 `server/.env`，实测无 `.env`，客户端无 Key/Bearer。
- 无 Key：两端实测 HTTP 503；未知路径 404。
- `/api/ask` 请求：`question`、`ctx[]`、`tier`、`mode`；响应 `{text, ms, tier, mode}`；超出范围/不宜回答用 `【超出范围】`/`【不宜回答】` 前缀。
- `/api/gen` 请求：`ledger[]`、`genre`、`facts[]`；响应 `{text, ms}`；体裁 `copy/post/script`。
- 前端 `ai.js` 从 `window.__sceneContext` 追加“当前环节/设备/知识点/本轮操作”到 `ctx`；这是当前唯一的设备级 AI 上下文通路。
- **当前断点**：`ai.js` 在沙盘把 `.leadai` 插入 `.side` 时，`.source` 已是 `.side__body` 的后代，`insertBefore` 抛 `NotFoundError`，脚本中断；沙盘右栏 AI 面板、`#leadai-q`、生成材料按钮均不挂载。`device-ask` 找不到 `#leadai-q` 时静默无动作。

## 5. 现状风险清单

### P0（阶段 01 不能建议 PASS 的事实）

1. **沙盘 AI 面板回归**：`ai.js:104` 的 `side.insertBefore(box, src)` 抛 `NotFoundError`；`window.__auditErrors` 实测记录堆栈；`.leadai` 不存在；设备卡“问 AI”静默失效。这是当前 HEAD 可复现的运行时错误。
2. **Hero Asset 门槛未达**：五台 Hero（分离器/抽油机/井口/浮顶罐/加热炉）和常减压塔都没有 `.blend` 源文件；五台 Hero OBJ 按材质合并后只剩 `separator__Steel` 这类桶名，没有可交互的部件语义节点；无 UV/贴图、无授权记录；分离器没有内部剖切。Blender 已安装，因此这是返修项而不是环境阻塞。
3. **塔页“全剖”和“半剖”视觉差异不足**：半剖/全剖截图平均像素差 0.29/255，差异主要是少量粒子与一行说明；全剖没有更完整的内部结构展开，不能支撑“外观/半剖/全剖真正不同”的验收底线。

### P1

- `write.html` 无 API 时把非 JSON 响应直接显示为“出错了：Unexpected token '<'”，没有预置稿/可读降级（README 说“无法生成属预期”，但当前不是可理解的降级）。
- 塔页没有 `window.__sceneContext` / 设备级 AI 上下文；热点只在本页解释，无法把塔内操作带回沙盘 AI。
- `ask.html` 在代理不可用时显示“暂时没有找到这个问题的相关内容”，没有区分“库内无答案”和“模型服务不可用”，对用户不诚实。
- 沙盘“半剖”按钮只控制炼化装置外壳，分离器/储罐没有结构剖切；设备交互层级不均衡。
- 产品去向只有选择/讲解，没有可追踪的下游路线状态变化；“能源到生活”仍是静态陈列。

### P2

- 无 `PACKAGE-README.md`；旧审计/资产文档与现状冲突。
- 未使用资产占用约 10 MB：`tower.glb`、`spike/separator.*`、塔渲染图、五张 hero preview；未清理也未标注备用策略。
- 测试脚本 `level-e2e.cjs`/`fps-probe.cjs` 依赖外部 Chrome 9333 端口，不是自包含测试；仓库无 Playwright 依赖。
- 没有真实用户测试、没有跨浏览器/无 WebGL 环境的自动化基线；移动端本期明确不适配，未测。

## 6. 结论

当前代码是一个**可运行、内容完整度较高的三维科普演示**，核心资产和五关是真实存在的；但当前 HEAD 有一个会打断沙盘 AI 的运行时回归、Hero Asset 交付不满足总控门槛、塔全剖视觉差异不足。阶段 01 的事实基线已建立，阶段建议见交接报告。
