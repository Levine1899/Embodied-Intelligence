# 沉浸式讲解 · 章节树导航

左侧章节树是「沉浸式讲解」（`web/sandbox.html`）上的一层目录导航：只负责展示章节结构和发出“用户要切换任务”的意图，不持有 Three.js 对象，也不复制五关的镜头/模型逻辑。

## 文件

| 文件 | 职责 |
| --- | --- |
| `web/immersion-chapters.js` | 章节树数据（唯一配置源）+ 纯映射函数 `taskByStageId / taskByStageIndex / resolveTask` |
| `web/assets/site/immersion-chapter-tree.js` | `createImmersionChapterTree(options)` 组件：渲染、折叠、抽屉、同步、销毁 |
| `web/assets/site/chapter-tree.css` | 桌面列 / 收起窄条 / 窄屏抽屉 / 时间线 / reduced-motion |
| `web/sandbox.html` | 挂载点、样式与脚本引入、把点击接到现有 `[data-stage]` 按钮 |
| `tests/chapter-tree.test.mjs` | 数据完整性、顺序、五关映射、未知映射 |

## 数据形状

```js
[
  {
    id: 'crude-oil-journey',          // 稳定 ID，不用中文标题做状态主键
    title: '原油，怎样走出地下？',
    children: [
      {
        id: 'underground-extraction', // 稳定任务 ID
        title: '地下开采',             // 显示文案
        description: '原油为什么不自己跑上来？',
        stageId: 'drill',             // 业务 stageId（world/registry.js）
        stageIndex: 0                 // 现有五关按钮 data-stage
      }
      // ...
    ]
  }
]
```

当前五关映射（真实业务 ID 来自 `web/world/registry.js`，页面五关按钮文案未改）：

| 树节点 | stageId | stageIndex | 页面既有按钮文案 |
| --- | --- | --- | --- |
| 地下开采 | drill | 0 | 地下开采 |
| 集输处理 | gather | 1 | 地面处理 |
| 储运调配 | store | 2 | 储运 |
| 炼化加工 | refine | 3 | 炼化 |
| 终端产品 | use | 4 | 产品去向 |

## 新增章节 / 任务

1. 在 `web/immersion-chapters.js` 的 `CHAPTERS` 里追加一个一级章节，或在已有章节的 `children` 里追加任务。
2. 新任务必须填写：
   - 稳定的 `id`（小写字母/数字/连字符）；
   - `title` 与 `description`（纯文本，组件用 `textContent` 渲染）；
   - `stageId` 与 `stageIndex`：必须对应 `world/registry.js` 中真实存在的阶段。若新增阶段，先在 registry / 五关导航中落地，再接目录。
3. 不需要改组件渲染代码；章节默认展开，可多个章节同时展开。

约束：`stageId` 是业务主键，显示文案可以改，不要把中文标题用作状态键；不要为目录新增假按钮、假完成状态或进度。

## 组件接口

```js
const tree = createImmersionChapterTree({
  root,                       // 挂载元素（必填）
  chapters,                   // 章节数组（必填）
  getCurrentStageIndex,       // () => number | null
  getCurrentStageId,          // () => string | null
  onSelectTask(task) {},      // 只发意图：页面 adapter 调现有导航
  storageKey: 'kepu.chapterTree.v1'
});

tree.setCurrentStage(stageId, stageIndex);
tree.refresh();
tree.setCollapsed(true);
tree.setChapterExpanded('crude-oil-journey', false);
tree.openDrawer(); tree.closeDrawer();
tree.getState();   // { collapsed, drawerOpen, currentTaskId, expanded }
tree.destroy();    // 移除 observer/监听、触发按钮、遮罩，清空 DOM
```

组件不会接触 camera / scene / renderer / 模型，也不修改关卡参数。

## 页面接入（现有导航）

`web/sandbox.html` 末尾的 adapter：

- 当前状态：优先读 `#stages button[aria-current="step"]` 的 `data-stage`，回退 `window.__sceneContext.stageIndex`；`stageId` 取 `window.__sceneContext.stageId`。
- 点击任务：找到 `#stages button[data-stage="N"]` 并 `.click()`，完整复用既有 `goStage`（镜头、任务、讲解、问答、文案能力不变）。
- 双向同步：组件 `MutationObserver` 监听 `#stages` 的 `aria-current`，页面其它入口（五关按钮、`#next`、深链 `#stage=N`）切换后目录自动更新。
- 刷新恢复：进入页面时从应用当前 stage 解析；未知映射保持无选中并 `console.debug` 非敏感信息。

## 状态与交互

- 两套独立状态：一级章节展开（可多个）与整栏收起（`data-collapsed` / `body.ct-collapsed`），互不覆盖。
- 整栏收起后为 56px 窄条（图标 + 竖排“章节导航”），桌面布局列从 300–380px 变为 56px，三维画布获得完整宽度；再次点击恢复。
- 收起状态存在 `localStorage.kepu.chapterTree.v1`（仅 UI 偏好，不含账号信息）；刷新后保留。
- 桌面 ≥1200px 为场景左侧独立列；<1200px 为浮动“目录”入口 + 全高抽屉（遮罩点击关闭、Escape 关闭、焦点回到触发按钮、打开时锁滚动）。

## 三维交互隔离

- 面板内部对 `pointerdown/pointermove/pointerup/pointercancel/click/wheel/touch*` 统一 `stopPropagation`，不会到达 `#viewport` 上的 OrbitControls 监听。
- 收起后画布区域完全露出，没有透明遮罩残留。
- 切换任务只点击既有按钮；不触发画布空白点击或任务完成条件。

## 无障碍

- 章节切换按钮 `aria-expanded` + `aria-controls`；整栏收起按钮 `aria-expanded` 与可读名称“收起/展开章节导航”；窄屏关闭按钮有“关闭章节导航”。
- 任务按钮原生 `<button>`，当前项 `aria-current="step"`；键盘 Tab/Enter 可用。
- 抽屉内 Tab 循环、Escape 关闭、焦点管理；`prefers-reduced-motion` 下关闭过渡。

## 验证

```bash
node --test tests/chapter-tree.test.mjs
npm test
```

浏览器证据与视口记录见 `docs/phase-reports/immersion-chapter-tree-report.md`。
