# Phase 05 evidence

日期：2026-11-23  
来源：Chrome 157 headless CDP / local `http://127.0.0.1:8796`；Web 截图 1440×900。  
不是设计稿；截图和录屏来自实际页面。

## 截图

| 文件 | 内容 |
|---|---|
| `phase05-01-separator-external.png` | l2 分离器外部 / Hero 加载 / 出口 |
| `phase05-02-separator-internal.png` | 内部油/水/气/堰板；分离粒子路径 |
| `phase05-03a-wrong-target.png` | 油相点错气回收：红色粒子/错误说明 |
| `phase05-03-outlet-choice.png` | 油相出口→油储罐，真实 pointer；`choose_outlet`/`assign_outlet_target` 上下文 |
| `phase05-04-back-overview.png` | 返回集输总览 |
| `phase05-05-storage-external.png` | 储运区外部，双罐/泵组/管线 |
| `phase05-06-storage-cut.png` | 液位 55%、罐体剖面、泵送 |
| `phase05-07-floating-tank.png` | 外浮顶罐选中 |
| `phase05-08-storage-overview.png` | 返回储运/总览 |

## 实时录屏

`production-storage-continuity.mp4`：1440×900，66.15 s，3,985,070 B，CDP screencast；顺序为集输总览 → 分离器外部/内部 → 启动/暂停/单步/重播 → 出口选择 → 返回 → 储运 → 液位/剖面/泵送 → 外浮顶 → 返回。
不是剪辑静帧；同一页面、真实 pointer/按钮操作。

## 断言

`phase05-verify.json`：`devices=17`；l2 初始 `structure=external`，打开后 `half/running`；错误去向 `assign_outlet_target`；l3 `stage=store`、`zone=storage`、`level=0.55`、`pumpRunning=true`；`__auditErrors=[]`。

## Hero 资产检查

- `asset-front.png`、`asset-side.png`、`asset-45.png`：外部。
- `asset-internal.png`、`asset-internal-side.png`：隐藏壳体的内部结构。
- `separator-asset-manifest.json`：文件、对象语义、尺度、锚点、许可。

## 未执行

- FPS/内存长跑、跨浏览器、移动端、N=5 用户测试、AI `/api/ask` 闭环：未执行，不得写成通过。
- 储罐独立 Hero `.blend`：本阶段未新建；l3 使用程序化罐组，不能宣称完成独立 Hero。
