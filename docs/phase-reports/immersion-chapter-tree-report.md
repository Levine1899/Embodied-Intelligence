# 沉浸式讲解 · 左侧章节树导航 阶段报告

日期：2026-11-25
基线：`main` @ `5519ef74add0219c4d7eb0a62e5756abead6abcb`
工作区：基线前已有 57 项未提交改动（登录/认证、3D 优化等，未被本次修改覆盖）；本次新增 6 个文件、修改 1 个文件（见 §3）。

## 1. 入口与真实任务 ID

- 页面入口：`web/sandbox.html`（全站导航「沉浸式讲解」指向此页）。
- 三维/关卡逻辑：`web/immersion.js` + `web/levels/l1…l5.js`；五关按钮 `#stages button[data-stage]`；当前任务状态 `#stages [aria-current="step"]`、`window.__sceneContext.stageId/stageIndex`；深链 `#stage=N` 已存在。
- 页面既有五关按钮文案（未改动）：地下开采 / 地面处理 / 储运 / 炼化 / 产品去向。
- 目录显示文案按本次规范：地下开采 / 集输处理 / 储运调配 / 炼化加工 / 终端产品；业务 ID 与场景文案保持原样，通过映射连接。

| 目录节点 | 稳定任务 ID | stageId | stageIndex | 现有按钮文案 |
| --- | --- | --- | --- | --- |
| 地下开采 | underground-extraction | drill | 0 | 地下开采 |
| 集输处理 | gathering-processing | gather | 1 | 地面处理 |
| 储运调配 | storage-transport | store | 2 | 储运 |
| 炼化加工 | refining | refine | 3 | 炼化 |
| 终端产品 | end-products | use | 4 | 产品去向 |

**差异说明**：目录文案来自本次升级方案；页面按钮/场景未改名，避免破坏业务 ID 与既有讲解。映射以 `stageId + stageIndex` 双通道解析（索引优先）。

## 2. 实现方式

### 2.1 数据层

`web/immersion-chapters.js` 暴露 `window.IMMERSION_CHAPTER_TREE`：

```js
[{ id: 'crude-oil-journey', title: '原油，怎样走出地下？',
   children: [{ id, title, description, stageId, stageIndex }, ...] }]
```

- 一个一级章节 + 五个二级任务；未来新增章节只改此文件。
- `taskByStageId / taskByStageIndex / resolveTask` 为纯函数；索引优先，未知映射返回 `null`。

### 2.2 组件层

`web/assets/site/immersion-chapter-tree.js` 提供 `createImmersionChapterTree(options)`：

- 渲染：一级章节按钮（chevron/油滴图标/标题）、二级时间线（节点、01–05、标题、辅助说明）。
- 两种独立折叠：
  - 章节组：`aria-expanded` + `data-expanded`，默认展开，可多章节同时展开；
  - 整栏：`body.ct-collapsed` + `[data-collapsed]`，桌面缩为 56px 窄条（图标 + 竖排“章节导航”），再次点击恢复。
- 状态：`localStorage.kepu.chapterTree.v1` 仅保存 `collapsed` 与 `expanded`（UI 偏好，无账号信息）。
- 响应式：≥1200px 为场景左侧 sticky 独立列（宽 `clamp(300px, 25vw, 380px)`，内容自适应高度、上限 `min(780px, 100vh-200px)`，超出内部滚动）；<1200px 为浮动“目录”按钮 + 全高抽屉。
- 可访问性：原生 button、`aria-expanded/controls`、当前项 `aria-current="step"`、抽屉 Tab 循环 / Escape / 焦点回到触发按钮、`prefers-reduced-motion` 关闭过渡。
- 销毁：`destroy()` 断开 MutationObserver、移除 media 监听与全部事件（AbortController）、移除 trigger/backdrop、清理 body 类与 DOM。

### 2.3 页面适配（不复制导航逻辑）

`sandbox.html` 末尾：

- 读当前状态：`#stages [aria-current]`（优先）→ `__sceneContext.stageIndex`；`stageId` 取 `__sceneContext.stageId`。
- 点击任务：找到既有 `#stages button[data-stage="N"]` 并 `.click()`，完全复用 `goStage`（镜头、任务、讲解、问答、文案逻辑不变）。
- 双向同步：MutationObserver 监听 `#stages` 的 `aria-current`；页面其它入口（五关按钮、`#next`、深链）切换后目录自动更新；刷新/深链进入时从应用状态恢复。
- 未知映射：无选中，`console.debug` 仅记录 `stageId/stageIndex`，不错误高亮 01。

## 3. 文件清单

新增：

- `web/immersion-chapters.js`：章节树数据 + 映射纯函数。
- `web/assets/site/immersion-chapter-tree.js`：侧栏组件。
- `web/assets/site/chapter-tree.css`：视觉、时间线、收纳窄条、抽屉、reduced-motion。
- `tests/chapter-tree.test.mjs`：数据/顺序/映射/扩展性测试。
- `docs/immersion-chapter-tree.md`：扩展与接入说明。
- `docs/phase-reports/immersion-chapter-tree-report.md`：本报告。
- `docs/phase-reports/evidence/immersion-chapter-tree/*.png`：视口截图。

修改：

- `web/sandbox.html`：样式/脚本引入、`.layout` 增加树列、adapter 初始化。

未改动：登录/认证、问答、写作、TTS、任务完成条件、讲解文案、三维模型与关卡参数、`immersion.js`、`world/registry.js`。

## 4. 三维事件隔离

- 面板根节点对 `pointerdown/pointermove/pointerup/pointercancel/click/wheel/touchstart/touchmove/touchend` 统一 `stopPropagation`；`#viewport` 上的 OrbitControls 监听收不到面板事件。
- 面板不在 `#viewport` 内（导航是独立列/抽屉），收起后画布无遮挡、无透明层。
- 面板内不调用 camera / stage / renderer；任务选择只点击现有按钮。
- 实测：向面板派发 pointerdown/wheel，`#viewport` 监听计数 0；任务点击后相机由既有 `goStage` 处理（未新增参数）。

## 5. 截图证据

目录：`docs/phase-reports/evidence/immersion-chapter-tree/`

| 视口 | 文件 | 结果 |
| --- | --- | --- |
| 1920×1080 | `desktop-1920x1080.png` | 三列 380/1072/340；五任务完整；无横向滚动 |
| 1440×900 | `laptop-1440x900.png` | 360/645/320；面板 583 高，任务完整 |
| 1280×800 | `small-1280x800.png`、`small-1280x800-collapsed.png` | 320/533/320；收起 56px 后场景 797 |
| 1024×768 | `tablet-1024x768.png`、`tablet-1024x768-drawer.png` | 抽屉 360px，遮罩/关闭/焦点正常；无横向滚动 |
| 390×844 | `phone-390x844.png`、`phone-390x844-drawer.png` | 浮动入口 + 全高抽屉；无横向滚动 |

## 6. 测试与验收

### 自动化

| 命令 | 结果 |
| --- | --- |
| `node --test tests/chapter-tree.test.mjs` | PASS，6/6（标题、顺序、辅助说明、唯一 ID、五关映射、未知映射、可扩展） |
| `npm test` | PASS，87/87（原 81 + 新 6；认证/页面/会话等无回归） |

### 浏览器（ego-browser，本地 dev 5399）

| 验收项 | 结果 |
| --- | --- |
| 一级标题/五个任务/辅助说明精确渲染 | PASS |
| 五个任务分别切到 stage 0–4（`drill/gather/store/refine/use`） | PASS（逐项点击读取 `sceneContext` 与按钮态） |
| 既有五关按钮切换 → 目录同步 | PASS |
| 章节组独立折叠/展开 | PASS |
| 整栏收起/展开，保留当前任务与章节展开状态 | PASS |
| 收起后画布宽度变化（847→1162 @1685） | PASS |
| 刷新保留收起状态、从应用恢复当前任务 | PASS |
| 深链 `#stage=3` → 高亮炼化加工 | PASS |
| 键盘 Enter 选择任务 | PASS（终端产品 → stage 4） |
| 未知 stage 不误选 | PASS |
| 抽屉：遮罩关闭、面板点击不关闭、Escape、焦点返回 | PASS |
| 面板 pointer/wheel 不进入 `#viewport` | PASS（0 次） |
| `destroy()` 清理 observer/监听/DOM/body 类 | PASS |
| 各视口无横向溢出 | PASS（1280/1440/1920 为 `scrollWidth == innerWidth`） |

### 回归

| 项 | 结果 |
| --- | --- |
| 三维场景加载、五关切场景 | PASS（canvas 存在，五关切换正常） |
| 问答页 | PASS（本地加载，9 个交互控件） |
| 科普文案页 | PASS（本地加载，20 个交互控件） |
| 登录保护 | PASS（未登录 `sandbox.html` → 302 `/login.html?next=%2Fsandbox.html`） |
| 登录/认证/TTS/任务完成条件 | 未改动；认证测试 87/87 全过 |

## 7. 未完成项与风险

- **未部署**：本次仅本地实现与验证；未发布到 120.26.198.46:8020（未收到部署指令）。发布为纯静态变更，可按既有 vNN 目录 + nginx root 流程进行。
- **原型逐像素对比 NOT RUN**：本次未收到/未找到可直接比对的“高保真原型图片”文件；视觉按文字规范（深岩黑面板、青蓝细边、琥珀金当前项、纵向时间线）实现，但未做像素级比对。
- **1280 场景宽度**：加入侧栏后场景 533px，收起后 797px；这是“侧栏占列而非覆盖”的有意取舍，避免遮住三维视口。
- **既有控制台告警**：1920/1440 下出现 `ResizeObserver loop completed with undelivered notifications`；已在**未含本功能的线上页面**复现，属既有告警，不是本功能引入。
- **本地存储**：仅保存目录 UI 偏好；若浏览器禁用 localStorage，折叠状态不持久化，功能仍可用。
- 移动端抽屉会覆盖顶部品牌区（全高抽屉的预期行为）。
