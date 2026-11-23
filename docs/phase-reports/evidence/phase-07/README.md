# Phase 07 Evidence · 导览 / 任务 / 音频 / 档案

日期：2026-11-23  
浏览器：Chrome 157（CDP，1440×900，deviceScaleFactor=1）  
本地服务：`http://127.0.0.1:8796`（静态 `web/`）  
页面：`sandbox.html`

## 1. 验证结果

`phase07-verify.json`：**63 passed / 0 failed**。

覆盖：

- 导览 10 站逐站进入，l1/l2/l3/l4/l5 的真实状态变化；
- 导览暂停、继续、退出、档案打开；
- 任务 M1–M5 真实操作完成；
- 错误去向反馈、提示、暂停/继续、重置；
- 任务总结/档案；
- 音频用户开启/静音；
- 探索档案读取。

运行：

```bash
CDP_PORT=4344 BASE_URL=http://127.0.0.1:8796 node tools/phase07-verify.cjs
```

## 2. 截图

| 文件 | 内容 |
|---|---|
| `phase07-01-overview.png` | 初始全景 |
| `phase07-02-tour-overview.png` | 导览第 1 站 |
| `phase07-03-tour-underground.png` | 地下穿越（储层高亮） |
| `phase07-04-tour-separator.png` | 三相分离（半剖+运行） |
| `phase07-05-tour-storage.png` | 储运（浮顶液位+泵送） |
| `phase07-06-tour-refining.png` | 炼化全剖+汽液 |
| `phase07-07-tour-products.png` | 产品应用（选中产品） |
| `phase07-08-tour-archive.png` | 导览结束档案 |
| `phase07-09-mission-brief.png` | 任务背景/角色/目标 |
| `phase07-10-mission-active.png` | M1 任务卡与场景 |
| `phase07-11-mission-error.png` | 错误去向反馈 |
| `phase07-12-mission-hint.png` | 分级提示可见 |
| `phase07-13-mission-done.png` | 任务完成总结 |
| `phase07-14-mission-archive.png` | 任务后档案 |
| `phase07-15-journey-archive.png` | 任意时点档案 |

## 3. 录屏

| 文件 | 时长 | 说明 |
|---|---|---|
| `full-tour-continuity.mp4` | 68.95s | 10 站完整导览：全景→地下→井筒→井口→分离→储运→炼化→馏分→产品→档案；含真实关卡切换/设备状态 |
| `free-plus-mission.mp4` | 73.30s | 任务接单→地下→三相分离（含错误→提示→改对）→储运→炼化→产品→总结→自由探索拖拽 |

- 录屏由 CDP screencast 从真实浏览器捕获，没有后期剪辑/拼接；任务操作通过页面 DOM 与关卡 API 驱动，成功/失败由真实前端状态逻辑判定。
- 录屏使用 `everyNthFrame=3` 以 20fps 编码；不是静止帧序列。
- 音频未写入录屏；默认静音符合“声音不强制播放”。

## 4. 命令

```bash
node --check web/journey-store.js
node --check web/mission.js
node --check web/journey.js
node --check web/levels/l1.js
node --check web/levels/l3.js
node --check web/levels/l4.js
node --check web/levels/l5.js
node --check web/assets/site/ambient.js
node tools/phase07-verify.cjs
node tools/phase07-record.cjs tour
node tools/phase07-record.cjs mission
```

## 5. 边界

- 没有语音讲解资产：文字讲解始终可见，声音开关只控制合成的环境氛围音；不标“语音已完成”。
- 没有独立设备音效库：环境音为 WebAudio 现场合成，明确标注非现场录音。
- 移动端/跨浏览器/长时间 FPS 内存未测试，列 P1/P2。
- 录屏是自动化真实浏览器操作，不等于 N=5 用户测试。
