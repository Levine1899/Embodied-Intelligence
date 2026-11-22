# Phase 03 evidence

浏览器：Chrome 157；静态服务 `http://127.0.0.1:8795`；页面 `sandbox.html`。
截图均为真实浏览器（headless Chrome + CDP `Page.captureScreenshot`），不是 Blender 静帧/设计稿。

| 文件 | 尺寸 | 内容 | 说明 |
|---|---|---|---|
| `overview-1440.png` | 1440×900 | 总览 | 六区/五 stage、S 形高差、产业链空间示意 |
| `overview-1920.png` | 1920×1080 | 总览 | 同上，桌面大屏 |
| `subsurface-1440.png` | 1440×900 | 地下特写 | 地面开口、分层体块、井筒/井口/抽油机 |
| `geology-close.png` | 1820×1363 | 地层近景 | 早期调试图；最终以 `subsurface-1440` 为准 |
| `oilfield-1440.png` | 1440×900 | 油田生产区 | 井口/抽油机/井场 |
| `gathering-1440.png` | 1440×900 | 集输处理区 | 分离器/泵撬 |
| `storage-1440.png` | 1440×900 | 储运区 | 双罐/防火堤 |
| `refining-1440.png` | 1440×900 | 炼化区 | 塔器/加热炉/管廊 |
| `city-1440.png` | 1440×900 | 产品应用区 | 产品台/加油机 |
| `detail-continuity-1440.mp4` | 1440×900 | 连续录屏 | 总览→`enterDetail('atmospheric_tower')`→`setCut(true/false)`→`exitDetail()`；相机级连续性，不是高模细节/正式 Hero 验收 |

## 边界

- 所有设备/地形为程序化占位或现有中低模；不是 Hero Asset Gate 通过证据。
- 地下剖面是地面开口 + 分层体块，不是可下潜井筒内部。
- 录屏展示的是**同一逻辑对象**的相机进入/退出与现有塔剖切，不证明 detail GLB/状态继承已完成。
- 未执行：真实用户测试、FPS/内存长跑、跨浏览器、移动端（本期不适配）。
