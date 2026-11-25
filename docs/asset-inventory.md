# Phase 01 · 三维与媒体资产清单

> ⚠ **本文是 2026-11-22 的历史快照，数字已过期。**
> 2026-11-25 重新实测（以 `5519ef74` 为基线）：`web/assets/` 为 **117 个文件 / 40.55 MB**（本文记 49 个 / 19.16 MB）；
> `tower.obj` 为 **3,747.5 KB / 25,831 面 / 253 个命名对象**（本文记 1040.7 KB / 20,670 面 / 54 个）；
> 且 `assets-source/blender/tower_hero.blend` 现在**存在**。
> 最新权威数据见 [`docs/3d-model-optimization/reports/phase-00-baseline.md`](3d-model-optimization/reports/phase-00-baseline.md) §3.2。
> 本文保留为阶段快照，下表塔相关行已就地更正并标注"实测 11-25"。

统计时间：2026-11-22（塔相关数字于 2026-11-25 更正）
范围：`web/assets/` 全部 49 个文件，共 19.16 MB；另记录 `tools/` 中的资产生成脚本。
判断口径：文件名/大小 + OBJ 对象名与面数 + 实际页面加载引用 + 浏览器实跑截图；**不以三角面数单独判断质量**。

## 1. 运行时三维资产

| 资产 | 路径 | 大小 | 格式 | 实际加载 | 用途 | 质量/状态 |
|---|---|---|---|---|---|---|
| 常减压塔 | `web/assets/tower/tower.obj` | **3,747.5 KB**（实测 11-25） | OBJ | 是：`tower.html`、沙盘炼化区 | 常压塔/减压塔/加热炉/塔板/侧线/半剖壳 | **25,831 面，253 个命名对象**（实测 11-25）；外观/半剖可用；全剖内部差异弱；`.blend` 见 `assets-source/blender/tower_hero.blend` |
| 塔材质 | `web/assets/tower/tower.mtl` | **1.8 KB**（实测 11-25） | MTL | 是 | 8 个基础材质 | 纯色，无贴图/UV |
| 塔元数据 | `web/assets/tower/tower.meta.json` | **1.5 KB**（实测 11-25） | JSON | 是 | 锚点、对象组、热点匹配 | 可用；语义锚点存在；`anchor_tower_products` 已于 11-25 更正为 `[8.4, 1.0, -5.9]` |
| 塔 GLB | `web/assets/tower/tower.glb` | **3,753.4 KB**（实测 11-25） | GLB | 否 | 备用 | 未接入；仓库无 GLTFLoader，不能直接作为运行时备选；258 节点 **0 个 extras** |
| 三相分离器 | `web/assets/hero/separator/separator.obj` | 452.4 KB | OBJ | 是：沙盘地面处理 | Hero 分离器 | 8,236 面，5 个按材质合并对象，无部件语义节点；无内部剖切 |
| 抽油机 | `web/assets/hero/pumpjack/pumpjack.obj` | 65.5 KB | OBJ | 是：沙盘地下开采 | Hero 抽油机，static/beam/crank 三组动画 | 1,208 面；语义分组最好；细节偏中景 |
| 井口 | `web/assets/hero/wellhead/wellhead.obj` | 201.3 KB | OBJ | 是：沙盘地下开采 | Hero 井口 | 3,948 面，4 个材质桶；无部件语义 |
| 外浮顶罐 | `web/assets/hero/floating_roof_tank/floating_roof_tank.obj` | 397.1 KB | OBJ | 是：沙盘储运 | Hero 储罐 | 6,976 面，4 个材质桶；无部件语义；浮盘在程序化关卡里另建 |
| 加热炉 | `web/assets/hero/heater/heater.obj` | 73.1 KB | OBJ | 是：沙盘炼化 | Hero 加热炉 | 1,492 面，4 个材质桶；中景可用，近景结构简单 |
| Hero 元数据 | `web/assets/hero/index.json` 及各自 `.meta.json` | <5 KB | JSON | 否（运行时主要读 OBJ/MTL） | 尺度、锚点、预算、单位 | 记录齐全，但对象语义没有进运行时 |
| 分离器技术验证 | `web/assets/spike/separator.obj/.glb/.blend/.mtl/.stats.json` | 约 3.0 MB | OBJ/GLB/Blend | 否（`_spike-separator.html` 为技术页） | GLB spike | 有 `.blend`，但不是当前沙盘用的 8,236 面资产 |
| Hero 预览图 | `web/assets/hero/*/preview.png` | 5 × 约 0.3 MB | PNG | 否 | 文档/验收 | 不能代替网页截图 |
| 塔渲染图 | `web/assets/tower/render-overview.png`、`render-cutaway.png` | 2.29 / 2.33 MB | PNG | 否 | 文档/备用 | 非网页加载 |
| 首页视频 | `web/assets/tower/hero-loop.mp4` | 1295.5 KB | MP4 | 是：`index.html` | 首页动态海报 | 有 poster；不是三维实跑 |
| 首页 poster | `web/assets/tower/hero-poster.jpg` | 80.8 KB | JPG | 是 | 视频封面 | 可用 |

### Hero Asset 逐项判断

| 资产 | 轮廓/结构 | 材质/贴图 | 语义节点 | 可剖切/内部 | `.blend` 源 | 判断 |
|---|---|---|---|---|---|---|
| 三相分离器 | 卧式壳体、封头、鞍座、气/油/水接管、仪表可辨 | 5 个基础材质，无 UV/贴图 | 合并为 5 个材质桶，无 inlet/outlet/water 节点 | 无内部剖切 | 无 | **需精修** |
| 抽油机 | 驴头/游梁/曲柄/电机可辨，三组可动 | 4 材质，无贴图 | `pumpjack_static/beam/crank` 三组，动画语义好 | 不适用 | 无 | **需精修（可复用动画分组）** |
| 井口 | 采油树/阀组/翼阀可辨 | 4 材质，无贴图 | 材质桶，无部件节点 | 不适用 | 无 | **需精修** |
| 外浮顶罐 | 罐壁/浮盘/边缘密封/导向杆可辨 | 4 材质，无贴图 | 材质桶；浮盘交互在 l3 程序化对象里 | 不适用 | 无 | **需精修** |
| 加热炉 | 炉体/烟囱/燃烧器可辨，细节少 | 4 材质，无贴图 | 材质桶 | 不适用 | 无 | **需精修** |
| 常减压塔 | 双塔/塔板/侧线/平台/半剖壳可辨 | 8 材质，无贴图 | **253 个命名对象**（实测 11-25；本文原记 54）；最好；但无稳定 objectId 注册表 | 半剖有塔板；全剖只多粒子，内部差异弱 | 无 | **需精修（全剖需重做）** |
| 地下地质/井筒 | 当前是程序化地层台阶 + 井筒/井口，没有独立 Hero | 程序化材质 | 无独立资产节点 | 无井下内部空间 | 无 | **必须新建（阶段 04）** |

### 资产分级

- **可直接复用**：抽油机（中景/动画）、塔外观与半剖、首页视频/poster。
- **需精修**：分离器、井口、外浮顶罐、加热炉、常减压塔（尤其全剖内部）。
- **必须新建**：地下地质/储层/井筒/井口一体化 Hero 资产；分离器可剖切内部；炼化装置成套内部结构。
- **暂缺**：五台 Hero 与塔的 `.blend`、UV/贴图、稳定语义节点、许可证/授权记录。

**Hero Asset Gate 结论：未通过。** 现有资产能支撑“可运行演示”，不能支撑总控要求的“专业资产 + 可编辑源 + 语义节点 + 可剖切内部 + 授权记录”。

## 2. 图片与字体

| 资产 | 大小 | 来源/许可事实 | 用途 | 风险 |
|---|---|---|---|---|
| `web/assets/reservoir-lab.jpg` | 174.0 KB | 页面链接指向中国石油报公开报道，配图来源可追溯 | 沙盘侧栏、问答页场景图 | 未在仓库内附再分发许可文件 |
| `web/assets/core-rock.jpg` | 197.6 KB | 同上报道配图，页面作为背景 | 问答页岩心卡片 | 未附授权文件 |
| `web/assets/science-logo.png` | 1324.4 KB | 项目方提供的品牌标识 | 问答页 | 无书面授权记录 |
| `web/assets/fonts/SmileySans-Oblique.ttf` | 2568.1 KB | 得意黑 v2.0.1，SIL OFL 1.1；`FONT-NOTICE.md` 有来源 | 全站标题 | 许可明确 |
| `web/assets/site/tokens.css` | 1.3 KB | 项目自有 | 设计变量 | 无 |

## 3. 第三方代码与音频

| 资产 | 大小 | 许可/来源 | 说明 |
|---|---|---|---|
| `web/assets/three.browser.js` | 1959.9 KB | Three.js r180，上游 MIT；本地文件无额外声明 | 本地加载，无 CDN |
| `web/assets/obj-lite.js` | 5.0 KB | 项目自写 | OBJ/MTL 轻量解析 |
| `web/assets/site/ambient.js` | 3.0 KB | 项目自写 | WebAudio 合成环境音，无音频文件；默认关闭 |
| `web/assets/spike/glb-mini.js` | 6.3 KB | 技术验证 | 非生产 |

音频资产：**没有** `.mp3/.wav/.ogg` 文件；声音是 WebAudio 合成，不能称为“现场录音”。

## 4. Blender 与资产生成脚本

| 文件 | 用途 | 是否生成当前资产 | `.blend` |
|---|---|---|---|
| `tools/make_hero_assets.py` | 生成五台 Hero OBJ/MTL/meta/stats/预览 | 是 | **否**（文档说明“脚本即源”） |
| `tools/make_tower.py` | 生成 tower.obj/MTL/meta/半剖壳 | 是 | **否** |
| `tools/spike_separator.py` | 技术 spike 分离器 | 生成 `assets/spike/*` | 是：`spike/separator.blend` |
| `tools/render_flow_loop.py` | 渲染首页视频/塔图 | 是 | 不适用 |

## 5. 未使用/备用资产

- `web/assets/tower/tower.glb`（**3.75 MB**，实测 11-25；本文原记 1.2 MB）：未加载；当前 three 包没有 GLTFLoader。
- `web/assets/spike/*`（约 3 MB）：仅 `_spike-separator.html` 技术页，非正式入口。
- `web/assets/tower/render-overview.png`、`render-cutaway.png`（4.6 MB）：文档/备用。
- `web/assets/hero/*/preview.png`（5 × 0.3 MB）：文档预览，非网页。
- 总计约 9–10 MB 未参与生产加载；未删除，未标注清理策略。

## 6. 结论

- 资产体量可控（19.16 MB，无外网依赖），Hero 设备有基本辨识度；
- 但五台 Hero 与塔均缺少 `.blend`、UV/贴图、稳定部件语义和授权记录；分离器无内部剖切；全剖差异不足；
- **不得把这些资产宣称为已通过 Hero Asset Gate**。阶段 04/05/06 必须按 Gate 清单补齐或重建。
