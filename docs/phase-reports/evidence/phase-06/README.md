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
| `asset-overview.png` | Blender 资产检查渲染（非网页截图） |
| `asset-cutaway.png` | Blender 资产半剖检查渲染（非网页截图） |

## 录屏

- `refining-continuity.mp4`：1440×900，41.3s，2,058,469 B。
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

- `tower-asset-manifest.json`：`.blend`、OBJ、MTL、GLB、meta 的 SHA-256/大小、objectId、语义节点、锚点、限制。
- Hero `distillation_unit_hero`；可编辑源 `assets-source/blender/tower_hero.blend`。
- 教学示意，不提供工程压力/温度/处理量/精确塔板数；对外再分发需权利人书面确认。

## 未执行

- FPS/内存长跑、跨浏览器、移动端、N=5 用户测试。
- 工程级 CFD/流场/工艺仿真。
