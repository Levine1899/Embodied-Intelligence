# Phase 06 证据 · 炼化装置与常减压塔

日期：2026-11-23  
运行：`http://127.0.0.1:8796/sandbox.html#stage=3`，l4 近景  
视口：1440×900（CDP 真实浏览器）

## 截图

| 文件 | 内容 |
|---|---|
| `phase06-01-refining-external.png` | 装置群外观：常压塔、减压塔、加热炉、管廊、产品箱 |
| `phase06-02-refining-half.png` | 半剖：完整壳隐藏，半壳和塔板/泡罩可见 |
| `phase06-03-refining-full.png` | 全剖 + 常压进料 + 汽液粒子 + 柴油馏分路径 |
| `phase06-04-refining-restored.png` | 恢复外观、路径/馏分清空 |
| `phase06-05-back-overview.png` | 返回炼化总览 |
| `phase06-06-residue-bottom.png` | 常压渣油塔底至减压塔路径 |
| `phase06-e2e.json` | 五关 E2E 结果 |
| `tower-full-cut.png` | 独立 tower.html 全剖（半壳 0.18） |
| `tower-state-flow.png` | tower.html 状态接入与汽液控制 |
| `asset-overview.png` | Blender 资产检查渲染（非网页截图） |
| `asset-cutaway.png` | Blender 资产半剖检查渲染（非网页截图） |

## 录屏

- `refining-continuity.mp4`：1440×900，55.90s，1,445,358 B。
- 顺序：总览 → 进入 l4 → 外观 → 半剖 → 全剖 → 常压进料 → 汽液接触 → 塔板 → 塔顶/柴油馏分 → 暂停/重播 → 恢复外观 → 返回总览。

## 断言

`phase06-verify.json` 记录：

- Hero 加载 `true`；`groups.full=4`、`half=4`、`trays=2`；
- 外观/半剖/全剖 `level=0/1/2`；
- 5 个馏分均选中并有 note；
- 暂停 `paused=true`，按钮“继续汽液”；
- 恢复外观 `level=0, flow=false, fraction=null`；
- 退出 `level=false`；审计错误为空。

## 资产

- `tower-asset-manifest.json`：`.blend`、OBJ、MTL、GLB、meta、检查渲染的 SHA-256/大小、151 Mesh / 14,328 verts / 27,054 tris、objectId、语义节点、锚点、限制。
- Hero `distillation_unit_hero`；可编辑源 `assets-source/blender/tower_hero.blend`。
- 教学示意，不提供工程压力/温度/处理量/精确塔板数；对外再分发需权利人书面确认。

## 未执行

- FPS/内存长跑、跨浏览器、移动端、N=5 用户测试。
- 工程级 CFD/流场/工艺仿真。


## Review 返修结论（2026-11-23）

- **P0-ASSET-01 已关闭（最低视觉门禁）**：`asset-overview.png` 和 `phase06-01` 现在可见换热器组、泵组、管廊、平台/梯子/基础；资产 151 Mesh / 27,054 tris。仍是教学示意，不是工程级高精度模型（P1）。
- 交互正向路径、边界测试和 3D 热点均有证据；本目录可作为技术/交互 PASS 的证据，但不代表工程资产。
