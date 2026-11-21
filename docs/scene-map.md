# 产业链数字沙盘 · 空间与语义地图

## 1. 总体布局（世界坐标，y=0 为地面）

```
              z=-17 ─────────────────────────────────────────────
                    远景低模轮廓（雾中，低对比）
              z=-8        [地下剖面台阶]        [炼化塔器/加热炉]
              z=0    ┌ 地下开采 ┐┌ 地面处理 ┐┌ 储运 ┐┌ 炼化 ┐┌ 产品去向 ┐
   x=-36 ─────────────┴──────────┴──────────┴────────┴────────┴──────────── x=42
              z=+8        [抽油机]      [泵撬]     [防火堤]  [管廊]   [产品台]
                    工艺脊线：地面物流带（z≈0）+ 管架（z≈2.4–3.1）
              z=+17 ─────────────────────────────────────────────
```

| 区域 | ID | 中心 x | 台面 | 主要对象 | 语义 objectId |
|---|---|---|---|---|---|
地下开采 | `drill` | -26 | 13×12 | 地质台阶、井筒、井口采油树、抽油机 | `pumpjack`、`wellhead` |
地面处理 | `gather` | -11 | 11×12 | 三相分离器、泵撬、缓冲罐 | `three_phase_separator` |
储运 | `store` | 4 | 12×12 | 固定顶罐、外浮顶罐、防火堤、泵 | `fixed_roof_tank`、`floating_roof_tank` |
炼化 | `refine` | 19 | 14×14 | 常压塔、减压塔、加热炉、管廊 | `atmospheric_tower`、`vacuum_tower`、`heater` |
产品去向 | `use` | 33 | 12×12 | 加油机、塑料瓶、纤维卷、润滑油桶、沥青样块 | `fuel_dispenser`、`plastic_bottle`、`fiber_spool`、`lubricant_can`、`asphalt_slab` |

## 2. 场景分组

| Group | 内容 |
|---|---|
`industry-sandbox` | 地形、分区台、工艺脊线、远景 |
`modelGroups[0..4]` | 五区设备（关卡仍按 `group.position` 取锚点） |
`pipes / particles` | 区域间流程管线与流动粒子 |
`labels` | HTML 区域标签（可点击，另有右侧列表等价入口） |

## 3. 语义锚点（相机与知识共用）

- `stage:drill|gather|store|refine|use`（DOM `data-stage`）
- `objectId`：见上表，写在各设备主体的 `userData.objectId`，点击射线命中后传给 `window.__sceneContext.selectedObjectId`
- 章节映射：`drill→chapter?id=drill`、`gather→gather`、`store→store`、`refine→refine`、`use→use`
- 塔页锚点：`hs_crude_feed`、`hs_heater`、`hs_atm_tower`、`hs_vacuum`、`hs_products`（见 `scene-distillation-tower.md`）

## 4. 相机预设（`CAM_PRESETS`）

| 区域 | targetY | radius | elevation | azimuth |
|---|---|---|---|---|
全景 | 3.0 | 44 | 0.50 | 0.30 |
drill | -1.7 | 13 | 0.34 | -0.05 |
gather | 2.0 | 12 | 0.28 | 0.12 |
store | 2.4 | 13 | 0.26 | 0.18 |
refine | 4.8 | 16 | 0.20 | 0.22 |
use | 1.9 | 11 | 0.24 | 0.30 |

所有预设都用「区域中心 + 相对偏移」表达，区域移动时相机自动跟随；没有把设备坐标复制到多个文件。

## 5. 已知简化

- 地形是整块概念基底，不是真实厂区总图；区域之间没有道路级别的精确连接。
- 地下剖面是下沉展台，不是真实油藏三维地质模型。
- 五个关卡的锚点仍是区域中心（关卡内部自带局部场景），与总览设备不是同一套 Mesh。
