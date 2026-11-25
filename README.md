# 油见未来 · 科普智能体（V3）

面向中国石油 / 临沂大学人工智能与具身智能实验室的科普演示站：**一条原油从地下到用户的三维流程 + 六章知识补充 + 随身问答 + 可信文案生成**。

前端零构建：原生 HTML / CSS / JS，Three.js 走本地文件；后端只有一个 Node 代理，把请求转给 DeepSeek，Key 只留在服务器。

**当前版本 3.4.0**（2026-11-21）· 详见 [CHANGELOG.md](CHANGELOG.md)

---

## 1. 页面

| 页面 | 文件 | 说明 |
|---|---|---|
| 首页 | `web/index.html` | 100vh 视频海报；三个入口：三维演示 / 六章知识 / 塔剖面 |
| 三维沙盘 | `web/sandbox.html` | 五环节流程：地下开采 → 地面处理 → 储运 → 炼化 → 产品去向；每环节可「读本章知识」 |
| 探索大厅 | `web/explore.html` | 六章目录 + 两个三维入口 |
| 章节页 | `web/chapter.html?id=<id>` | 2D 图示 + 关键知识 + 来源 + 「回到三维演示」 |
| 塔剖面 | `web/tower.html` | 常减压塔三档剖切（外观 / 半剖 / 全剖）、五个热点 |
| 问答 | `web/ask.html` | 空态 + 对话态；依赖 `/api/ask` 代理 |
| 写作 | `web/write.html` | 三种体裁；依赖 `/api/gen` 代理（视觉待统一） |
| 科普视频 | `web/videos.html`、`web/video.html` | 按分类分页浏览视频，点击进入独立播放页 |
| 知识库 | `web/kb.html` | 15 条公开科普来源的检索视图 |

一级导航包含首页、智能问答、沉浸式讲解、科普文案和科普视频。

### 三维两层的分工

- **沙盘**看流程：设备是低模，讲物料怎么走、每个环节在干什么。
- **塔页**看设备：单塔垂直剖面，讲塔板汽液接触、侧线与减压原理。
- 沙盘每个环节都能进塔页；塔页可回到「流程沙盘 · 炼化环节」。

### 问答策略

1. 库内命中 → 直接给预写答案，附引用与原文链接。
2. 库外但属于石油/能源 → 调模型组织，标注「模型补充 · 未逐条核验」。
3. 超范围或涉内部数据 → 不采用模型，明确拒答并给相近条目。

三档表达：童话 / 通俗 / 工程；童话档在服务端有硬守卫（超 120 字或出现术语时自动重写）。

---

## 2. 本地运行

静态部分（设计、三维、章节）不需要后端：

```bash
cd web
python -m http.server 8000
# http://127.0.0.1:8000/
```

> 不要直接双击 `index.html`：`file://` 下塔页 `fetch('tower.obj')` 会被拦，三维塔空白。

问答 / 写作要真实模型：

```bash
DEEPSEEK_API_KEY=sk-... node server/proxy.mjs   # 默认 127.0.0.1:8790
```

再把 `/api/ask`、`/api/gen` 反代到该端口。无代理时问答显示空态、写作无法生成，属预期。

接口约定见 [docs/API.md](docs/API.md)，塔场景参数见 [docs/scene-distillation-tower.md](docs/scene-distillation-tower.md)。

### 科普视频资源

分类和视频条目存放在 `web/video-catalog.json`。每条视频的 `id` 对应 Dify 文档 ID，科普视频页和智能问答共用 `web/assets/videos/<id>.mp4`，封面位于 `web/assets/videos/posters/<id>.webp`。

部署时单独同步项目里的 `web/assets/videos/` 到生产站点的 `assets/videos/`。静态服务器需要为 MP4 提供 `video/mp4` 和 HTTP Range 支持，播放器才可以拖动进度。

---

## 3. 仓库结构

```
web/                    运行站点（生产目录，nginx root 指向这里）
  assets/site/tokens.css  设计变量：暖墨 #0b0f11 / 赭黄 #d8a24a / 灰青 #8fb6ad
  assets/fonts/           得意黑（SIL OFL 1.1）
  assets/tower/           塔模型（tower.obj 为塔页实际加载）、首页动图
  immersion.js            沙盘逻辑（相机、关卡、#stage 深链）
  levels/                 五环节细节场景
  tower.js                塔页逻辑（OBJ 加载、剖切、热点）
  chapters.js             六章数据
server/                 Node 代理（DeepSeek）
tools/                  Blender 程序化塔模型 / 首页流动动图
docs/                   接口与场景说明
```

设计系统：`web/assets/site/tokens.css` 是颜色、字号、间距的唯一来源；页面内不再写死色值（塔页/沙盘的既有色值已逐步收口）。

---

## 4. 内容与边界

- 六章要点为人工撰写；第 2–6 章各挂 3 条公开来源，共 15 条，链接可点开核验。
- 三维为**原理级示意**，非真实装置比例；塔板数、侧线位置为教学简化。
- 演示问题都落在知识库内；不要用站外问题考验演示稳定性。
- 知识库目标 40–50 条已核验来源，当前 15 条，标注「建设中」。

---

## 5. 验证口径

- `check_design`（1280×800 / 390×844）：首页、探索、章节、沙盘、塔页、问答均为 0 问题。
- 三维：沙盘 canvas WebGL 正常、五关卡脚本加载；塔页 `window.__tower.loaded === true`。
- 深链：`sandbox.html#stage=N` 生效；章节页「回到三维」、塔页「回到流程沙盘」双向可回。
