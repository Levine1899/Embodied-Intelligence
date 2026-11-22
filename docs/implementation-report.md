# 实施报告（2026-11-21）

分支：`feature/immersive-hall` · 版本：3.4.0 · 基线：`d69930e`

## 1. 本轮实际完成

### P0 · 科学与状态修复

- `l1.js`：滑块改为「压力差示意（教学控制量）」，补“不代表真实井底压力/注入量/采收率”；删除“油基本出完了——这就是采”等误导性反馈。
- `l3.js`：删除“油气空间%→蒸发很猛/很少”的无依据映射与“压没了”表述；改为“油气空间（示意）”+“实际损耗受密封、附件、维护影响”；标签改暖色。
- `l4.js`：四种“产品”改为**五种馏分**：塔顶油气 / 石脑油馏分 / 煤油馏分 / 柴油馏分 / 常压渣油；补“馏分≠成品油，还需裂化、重整、加氢、调和”。
- `l5.js`：标题改“哪些是常见石油路线产品？”，补塑料可能来自天然气/煤基/生物基。
- `tower.js`：`webglOK()` 改为 WebGL2 检测；renderer try/catch；`webglcontextlost/restored`；OBJ 加载后显式 `setLevel(0)`。

### P1 · 连续产业链数字沙盘（`immersion.js` 重写场景构建）

- 五块 6.3×5.5 漂浮底座 → **一块 78×34 连续地形** + 五个嵌地分区台 + 地面区域标签。
- 地下开采：下沉式**地质剖面台阶**（6 层岩性、储层油点 InstancedMesh、井筒、井口采油树、抽油机），明确标注“地质剖面 · 教学示意”。
- 地面处理：三相分离器（筒体 + 椭圆封头 + 鞍座 + 接管/法兰 + 阀轮 + 仪表）、泵撬。
- 储运：固定顶罐（锥顶 + 呼吸阀 + 盘梯）与外浮顶罐（开放顶 + 浮盘 + 密封圈 + 导向杆）对照，防火堤。
- 炼化：常压塔 11.5m / 减压塔 7.6m（平台、护栏、梯子、侧线接管）、加热炉 + 烟囱、管廊。
- 产品：加油机（含软管）、LatheGeometry 塑料瓶、纤维卷、润滑油桶、沥青路面样块。
- 环境：工艺脊线（物流带 + 管架 + 管线）、远景低模轮廓、雾；设备共享 7 类材质（钢/浅钢/深钢/赭黄/灰青/混凝土/岩层）。
- 相机：全景 radius 44 / elevation 0.50；五区预设按新坐标重排；地下预设看向剖面台阶。

### P2 · 导览、模式、上下文与 AI

- 三种模式工具栏：沉浸导览 / 自由探索 / 任务关卡（`aria-pressed`）。
- 7 步导览（约 90 秒）：卡片、步骤号、暂停/继续、下一步、退出；拖动/滚轮/触摸立即暂停；`prefers-reduced-motion` 不自动播放。
- `window.__sceneContext`：sceneId/stageId/selectedObjectId/knowledgeIds/experienceMode/interaction；`selectStage` 与设备点击同步。
- 设备级 objectId：`three_phase_separator`、`fixed_roof_tank`、`floating_roof_tank`、`atmospheric_tower`、`vacuum_tower`、`heater`、`pumpjack`、`wellhead`、`fuel_dispenser`、`plastic_bottle`、`fiber_spool`、`lubricant_can`、`asphalt_slab`（点击命中后写入上下文）。
- 设备卡片：点击设备后显示名称、用途、所属环节、「问 AI」（自动填入问题并聚焦输入框）、「读本章知识」；**卡片按设备三维锚点投影定位**，随相机旋转/缩放跟随，越界时夹在视口内，进入关卡自动隐藏；可关闭并清除 `selectedObjectId`。
- 关卡交互回写：`__stage.setInteraction()` 已接入 l1 压力差、l2 出口选择、l3 液位、l4 馏分选择/放置、l5 产品勾选；进入关卡时 `levelId` 置为 `l1–l5`。
- 操作历史：保留最近 12 条（action/value/unit/环节/关卡/时间），上下文带最近 8 条；AI `ctx` 追加最近 4 条；导出探索记录时写入操作轨迹。
- 全景构图：相机改为更俯视（elevation 0.54 / radius 54 / target 4），五个区域与产品区全部入画。
- `ai.js`：`/api/ask` 的 `ctx` 数组追加“产业链环节/当前设备/知识点/体验模式”，请求体字段保持 `{question, ctx, tier, mode}` 兼容。

### P3 · 性能与稳定性

- `l1–l4.js`：固定 `update(0.016)` → 真实 deltaTime（上限 0.05s）。
- 塔页：WebGL2 检测、上下文丢失恢复提示、加载后外观初始化。
- 沙盘：只保留一条 RAF；`document.hidden` 跳过渲染；`resize` 用 ResizeObserver。

## 2. 测试执行情况（真实）

| 项 | 结果 | 证据 |
|---|---|---|
`node --check`（immersion/tower/ai/levels/entry） | 通过 | 本机执行，无输出 |
`python -m py_compile tools/*.py` | 通过 | 本机执行 |
静态服务 8779 页面 200 | 通过 | ego 访问 index/sandbox/tower/ask/explore/chapter |
沙盘 WebGL 初始化 | 通过 | canvas 存在、`__stage.nodes` 5、labels 5、fallback 隐藏 |
导览 | 通过 | 点击后 index 0→1，标题“第一站 · 地下”，上下文 stageId=drill |
用户打断 | 通过 | 派发 pointerdown 后 `playing=false` |
`#stage=3` 深链 | 通过 | 高亮“炼化”、上下文 stageId=refine |
塔页剖切 | 通过 | level 0→1→2，cutEnabled true，frames 递增 |
塔页初始外观 | 通过 | 加载后 `__tower.level === 0` |
截图 | 已生成 7 张 | `docs/screenshots/01-overview…07-tower-full.png` |
`check_design`（沙盘/塔页 1280×800 + 390×844） | 通过 | 沙盘 0、塔页 0 问题 |
真实 FPS / 加载时间 | **未执行** | 未接性能面板，不虚构数字 |
用户测试（3 个任务） | **未执行** | 无可代表用户，不写“通过” |
录屏 | **未执行** | 本环境无录屏工具 |
声音 | **未实现** | 设计与接口未落地 |

## 3. 已知限制与遗留

1. 设备卡片的画布坐标点击仍未做自动化测试（`showDevice()` 与锚定投影已验证，射线路径靠代码审查）。
2. `levels/entry.js` 的全局粒子 RAF 未彻底收口（关卡 loop 已有 running 控制，但 entry.js 的输入/粒子仍需单独审）。
3. 关卡 interaction 只回写最近一次操作，未做操作历史队列。
4. `write.html` 仍是旧版冷蓝视觉（本轮未动）。
5. 声音、录屏、真实用户测试、FPS 测量未执行。
6. 塔热点仍依赖 OBJ 节点名正则；重新导出模型需同步。
7. 沙盘设备是中模程序化几何，不是电影级高模；需要专业美术资产才能继续提升（见资产清单）。

## 4. 如何运行

```bash
cd web && python -m http.server 8000
# 打开 http://127.0.0.1:8000/sandbox.html
```

AI 问答/写作需要可选代理：

```bash
DEEPSEEK_API_KEY=sk-... node server/proxy.mjs
# 再把 /api/ask、/api/gen 反代到 127.0.0.1:8790
```

无代理时三维、导览、关卡、章节、知识库均可运行。


## 附录 · GLB 管线 spike（2026-11-21）

先用一台三相分离器验证 Blender → 浏览器链路，结论见 [asset-spike-separator.md](asset-spike-separator.md)：

- 资产：10,412 三角面 / 27 mesh / 5 材质 / GLB 500 KB / OBJ 698 KB；
- 运行时：fetch 70 ms、解析 1.2 ms、首帧前 72 ms、draw calls 29（headless，FPS 未测）；
- **GLB 运行时暂不通过**：现有 `three.browser.js` 未导出 GLTFLoader，spike 的最小解析器不支持贴图/骨骼/动画/压缩；
- 推荐近期走 **Blender → OBJ + MTL**（塔页已用 OBJ），GLB 留待官方 loader 本地化后再切；
- 生产资产需按材质合并，目标 ≤ 8 draw calls/台。


## 附录 · Hero 资产 v1（2026-11-22）

Blender 批量生成五台设备，详见 [hero-assets.md](hero-assets.md)：

| 资产 | 三角面 | 合并对象 | OBJ | 状态 |
|---|---|---|---|---|
separator | 8,236 | 5 | 452 KB | 接受 v1 |
pumpjack | 1,208 | 4 | 66 KB | 需美术复审 |
wellhead | 3,948 | 4 | 201 KB | 接受 v1 |
floating_roof_tank | 5,448 | 4 | 310 KB | 接受 v1 |
heater | 1,364 | 4 | 65 KB | 需重做结构 |

- 全部在面数预算内；按材质合并，理论 draw call ≤ 5/台；
- 未接入沙盘：缺共享 OBJ 解析器、材质映射、锚点注册与 LOD；
- 预览为 Cycles CPU 渲染，不是应用内截图。


## 附录 · Hero 资产接入（2026-11-22）

- 新增 `web/assets/obj-lite.js` 共享 OBJ 解析器（静态网格，无贴图/骨骼）；
- 分离器已替换为 Blender 资产：OBJ 8 ms / MTL 5 ms，5 个材质 mesh，点击弹「三相分离器」设备卡片；
- 其余四台未接入：管线锚点、材质映射与 LOD 仍待处理；
- 已知：管线与法兰未对齐，一根青色管线在画面上遮挡筒体。


## 附录 · 五台 Hero 资产全部接入（2026-11-22）

- 五台资产全部通过 `obj-lite.js` 接入，失败回退程序化模型；
- 20 个材质 mesh，点击均能弹出对应设备卡片（名称逐一验证）；
- 缩放：分离器 0.88 / 抽油机 0.55 / 井口 0.50 / 外浮顶罐 0.46 / 加热炉 0.80；
- 遗留：管线未对齐、构图未按新资产调整、无 LOD。


## 附录 · 性能基线（2026-11-22）

`__stage.stats()` 实测（headless Chromium）：

| 视角 | draw calls | 三角面 |
|---|---|---|
总览 | **104**（全部合批后） | 50,406 |
地面处理 | 约 60 | 约 10,900 |
炼化 | 约 120 | 约 27,000 |

- Hero 资产本身只贡献 21 个 mesh；draw call 主要来自程序化杆件/塔环；
- 真实 headed Chrome（CDP，AMD 集显 / DPR 2）实测 **90 fps**（p95 11.3 ms，0 长帧），headless 数字不可用于推断；
- 若上移动端，348 calls 偏高，需合并杆件或做实例化。
