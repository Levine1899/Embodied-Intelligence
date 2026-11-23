# Phase 04 evidence

日期：2026-11-23  
来源：Chrome 157 headless CDP，真实页面 `http://127.0.0.1:8796/sandbox.html`，1440×900。  
不是设计稿；截图/录屏来自实际 WebGL 页面。

## 截图

| 文件 | 内容 |
|---|---|
| `phase04-01-entry.png` | 从总览进入地下剖面，四层/剖切/井筒 |
| `phase04-02-strata-toggle.png` | 盖层逐层隐藏 |
| `phase04-03-strata-info.png` | 上覆地层选中/解释 |
| `phase04-04-reservoir.png` | 储层高亮 + 油/气/水图例 |
| `phase04-05-pore.png` | 孔隙放大（教学示意，非扫描/流场） |
| `phase04-06-wellbore.png` | 射孔井段 / 井筒局部 |
| `phase04-07-pressure.png` | 压力差示意 75%，流动反馈 |
| `phase04-08-surface.png` | 沿井筒上行至地面井口/集输管线 |
| `phase04-09-back-overview.png` | 返回总览，关卡状态保留 |

`phase04-verify.json`：实际断言（资产、层/部件、上下文、交互、history、退出）。

## 实时录屏

- `underground-continuity.mp4`：1440×900，52.75 s，CDP screencast 实时操作；包含入口 → 地层切换 → 储层（射线点选）→ 孔隙放大 → 剖面 → 压力差 → 沿井筒上行 → 地面。
- 不是把静帧剪辑成视频；同一页面同一会话。

## Hero asset 检查视图

- `asset-front.png`、`asset-side.png`、`asset-45.png`：整体轮廓/层理。
- `asset-wellbore-close.png`、`asset-wellbore-structure.png`：井筒/储层局部。
- `asset-reservoir-cutaway.png`：隐藏上覆/盖层的储层剖切。
- `underground-asset-manifest.json`：对象/语义/尺寸/锚点/材质/哈希/来源许可。

## 回归/回退

- `phase04-regression.json`：五关、`#stage=0..4`、章节、塔页、新注册表 ID。
- `fallback.json`：运行时 `webglcontextlost` 后 sandbox/塔页 2D 回退；不扩大为“所有无 WebGL 冷启动已测”。

## 未执行

- FPS/内存长跑、跨浏览器、真实用户测试、移动端、AI `/api/ask`/生成闭环：未执行，不得写成通过。
