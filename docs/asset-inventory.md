# 资产清单

统计口径：`web/` 下实际被页面引用的文件；许可证只记录仓库内可确认的事实。

## 1. 三维模型与场景资产

| 资产 | 路径 | 体积 | 来源 / 许可 | 用途 |
|---|---|---|---|---|
| 常减压塔 OBJ | `web/assets/tower/tower.obj` | 1041 KB | 本仓库 `tools/make_tower.py` 程序化导出 | 塔页实际加载 |
| 塔材质 | `web/assets/tower/tower.mtl` | 小 | 同脚本导出 | OBJ 材质 |
| 塔 GLB | `web/assets/tower/tower.glb` | 1214 KB | 同脚本导出 | 备用（页面未加载） |
| 塔元数据 | `web/assets/tower/tower.meta.json` | 小 | 同脚本 | 尺寸/构件说明 |
| 塔渲染图 | `web/assets/tower/render-overview.png` / `render-cutaway.png` | 2.29 / 2.33 MB | Blender 渲染 | 文档与备用展示 |
| 首页动图 | `web/assets/tower/hero-loop.mp4` | 1295 KB | `tools/render_flow_loop.py` + Blender | 首页视频海报 |
| 动图封面 | `web/assets/tower/hero-poster.jpg` | 81 KB | 同脚本 | 视频 poster |

沙盘本体（场景、设备、地层、管廊、产品）全部由 `web/immersion.js` 程序化生成，不是 GLB 资产：
`BoxGeometry / CylinderGeometry / LatheGeometry / TubeGeometry / TorusGeometry / InstancedMesh`，共享材质按用途分为钢、浅钢、深钢、赭黄、灰青、混凝土、岩层七类。

## 2. 图片与字体

| 资产 | 体积 | 来源 / 许可 |
|---|---|---|
| `web/assets/science-logo.png` | 1324 KB | 项目方提供（橙色花瓣标） |
| `web/assets/core-rock.jpg` | 198 KB | 中国石油报报道配图，页面注明出处 |
| `web/assets/reservoir-lab.jpg` | 174 KB | 中国石油报报道配图，页面注明出处 |
| `web/assets/fonts/SmileySans-Oblique.ttf` | 2568 KB | 得意黑 Smiley Sans，SIL OFL 1.1（见同目录 `FONT-NOTICE.md`） |

## 3. 第三方代码

| 资产 | 体积 | 许可 |
|---|---|---|
| `web/assets/three.browser.js` | 1960 KB | Three.js r180，MIT（上游许可） |

无外网 CDN、无来源不明的模型或贴图。本轮未新增第三方资产。

## 4. 声音

本轮**未新增音频文件**。声音接口未实现，作为遗留项；不伪造“已完成的音效”。

## 5. 删除/回滚记录

- `web/refactor.css`：全站引用为 0，已删除。
- `web/home.html`：旧首页草稿，已归档到设计目录。
- `tower.obj/glb` 本地未解释的法线改动：已回滚到已提交版本。


## 6. Hero 资产 v1（2026-11-22 新增）

`web/assets/hero/<id>/`：separator（8,236 面 / 452 KB）、pumpjack（1,208 / 66 KB）、wellhead（3,948 / 201 KB）、floating_roof_tank（5,448 / 310 KB）、heater（1,364 / 65 KB）。均为 `tools/make_hero_assets.py` 程序化生成，OBJ/MTL + meta/stats + Cycles 预览；来源与许可见脚本头注释，未使用外部模型/贴图。
