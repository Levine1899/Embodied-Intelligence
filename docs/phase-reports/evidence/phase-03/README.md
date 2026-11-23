# Phase 03 evidence（rev3）

浏览器：Chrome 157 headless；静态服务 `http://127.0.0.1:8796`；页面 `sandbox.html`。
截图/录屏均为真实浏览器 CDP 产物，不是 Blender 静帧/设计稿。

| 文件 | 内容 | 说明 |
|---|---|---|
| `overview-1440.png` | 总览 1440×900 | 六区/五 stage、S 形高差、产业链空间示意 |
| `overview-1920.png` | 总览 1920×1080 | 桌面大屏 |
| `subsurface-1440.png` | 地下特写 | 地面开口、分层体块、井筒/井口/抽油机；使用注册表 `cam_subsurface` |
| `geology-close.png` | 早期地层近景 | 调试图；最终以 `subsurface-1440` 为准 |
| `oilfield-1440.png` | 油田生产区 | 井口/抽油机/井场 |
| `gathering-1440.png` | 集输处理区 | 分离器/泵撬，区域镜头已按注册表预设校准 |
| `storage-1440.png` | 储运区 | 双罐/防火堤 |
| `refining-1440.png` | 炼化区 | 塔器/加热炉/管廊 |
| `city-1440.png` | 产品应用区 | 产品台/加油机 |
| `detail-continuity-1440.mp4` | 连续录屏 | 总览→`enterDetail('atmospheric_tower')`→`setCut(true/false)`→`exitDetail()`；**相机级连续性**，不是高模 detail/正式 Hero 验收 |
| `state-contract.json` | 状态契约断言 | bind 即时应用、select 重置旧设备、13/13 实际 overview 可见性、reset、图层数量、detail 返回上下文/选择 |
| `context-contract.json` | 上下文契约断言 | focusZone subsurface/oilfield zoneId、三种 detail 的 object/zone/deviceName、旧别名、interaction/history 跨场景保留 |
| `level-e2e.json` | 五关回归 | l1–l5 均进入、核心操作写入 interaction、退出后 levelId 清空 |
| `fallback.json` | 2D fallback | 对运行中 canvas 派发 `webglcontextlost`，sandbox/tower 均出现 2D fallback 文案 |

## 边界

- 所有设备/地形为程序化占位或现有中低模；不是 Hero Asset Gate 通过证据。
- 地下剖面是地面开口 + 分层体块，不是可下潜井筒内部。
- 录屏展示同一逻辑对象的相机进入/退出与现有塔剖切，不证明 detail GLB/高模状态继承已完成。
- `fallback.json` 是运行时上下文丢失触发，不是无 WebGL 冷启动；冷启动路径仍由代码保证。
- 未执行：FPS/内存长跑、跨浏览器、真实用户测试、移动端（本期不适配）。
