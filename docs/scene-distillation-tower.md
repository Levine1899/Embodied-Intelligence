# 常减压蒸馏塔 · 剖切、语义与热点

文件：`web/tower.html` / `web/tower.js` / `web/assets/tower/*`

## 1. 模型与加载

- 实际加载：`fetch('assets/tower/tower.obj')` + `tower.mtl`，**没有**切到 GLB。
- 塔体来自 `tools/make_tower.py`（Blender 程序化），是教学模型，不是工程设计模型；塔板数、侧线位置为教学简化，页面已标注。
- 加载失败 → `showFallback`，回退 2D 剖面 SVG，不白屏。

## 2. 三档剖切（2026-11-21 修正）

| 状态 | 显示规则 | 说明 |
|---|---|---|
外观 `level=0` | 完整壳/穹顶显示，半剖壳隐藏，内部汽液隐藏 | 加载完成后显式 `setLevel(0)`，不依赖初始 DOM 状态 |
半剖 `level=1` | 半剖壳/半穹顶显示，完整壳隐藏；内侧塔板可见 | 与外观有可观察结构差异，不只是粒子数量 |
全剖 `level=2` | 进一步弱化外壳，显示塔板、进料/侧线与汽液示意 | 汽液为教学示意，颜色在图例说明 |

状态切换同时更新：按钮 `aria-pressed`、`#flow-note`、`internals.visible`、相机 `flyTo`（`dist 33 / 23`）。

## 3. 语义锚点与热点

| 热点 ID | 名称 | 语义锚点 |
|---|---|---|
`hs_crude_feed` | 原油进料 | `anchor_tower_feed`：进料管线与塔中部接口 |
`hs_heater` | 加热炉 | `anchor_tower_heater`：炉体与炉管 |
`hs_atm_tower` | 常压塔 | `anchor_tower_trays`：塔体/塔板 |
`hs_vacuum` | 减压塔 | `anchor_tower_vacuum`：减压塔 |
`hs_products` | 馏分去向 | `anchor_tower_products`：侧线/产品箱 |

- 热点通过 `userData.hotspot` 与 OBJ 节点名匹配，位置用 `HOTSPOTS[i].pos` 的三维锚点投影到屏幕；名单在右侧可点击，等价键盘入口。
- 已知脆弱点：匹配仍依赖 OBJ 节点名正则；若重新导出模型命名变化，需同步 `match`。后续可把锚点完全外置到 `tower.meta.json`。

## 4. WebGL 与稳定性

- `webglOK()` 已对齐 r180：必须 `window.WebGL2RenderingContext` 且 `canvas.getContext('webgl2')` 成功。
- `new THREE.WebGLRenderer` 包在 try/catch 中，失败显示 fallback 文案。
- `webglcontextlost` → 显示“上下文丢失，等待恢复”；`webglcontextrestored` → 重新加载页面。
- 相机：初始/重置/剖切统一到 `target (0.5, 9.6/11.5, 0)`，`dist 33`（外观）/`23`（剖切），避免模型只占画面四成。

## 5. 科普口径

- 常压塔按沸点范围分出：塔顶油气、石脑油馏分、煤油馏分、柴油馏分、常压渣油；**馏分不等于成品油**。
- 减压塔的作用是降低压力、降低沸点，避免高温裂解。
- 汽相/液相粒子只解释塔内接触方向，不表示真实流量、温度或塔板效率。


## 语义锚点（2026-11-22）

- 热点位置与对象匹配改为读取 `assets/tower/tower.meta.json`：`anchor_web_y_up` 提供目标点，`groups.hotspots` 提供对象名；
- 映射：`hs_crude_feed → anchor_tower_feed`、`hs_atm_tower → anchor_tower_overview`、`hs_vacuum → anchor_tower_vacuum`、`hs_products → anchor_tower_products`；加热炉用 `heater_bbox_obj_y_up` 中心；
- 取不到 meta 时保留旧的坐标/正则作为兜底；
- 实测 `tower.meta.json` 200，5 个热点可点，详情正常。


## 阶段 06 · 沙盘 l4 集成（2026-11-23）

- `web/levels/l4.js` 已从简化程序化塔切换为加载 `assets/tower/tower.obj` 的完整装置群（常压塔、减压塔、加热炉、冷凝器、泵组、管线、平台、产品箱）。
- 近景 objectId 主绑定 `atmospheric_tower`；`vacuum_tower`、`heater` 共享同一装置群/状态源。总览仍使用同一注册表。
- l4 提供外观/半剖/全剖、常压/减压进料、汽液接触暂停/重播、塔板结构、五馏分路径和恢复外观；按钮与 `PETRO_DEVICE_STATE` 同步。
- 三状态由 `tower.obj` 的 `Tower_*_Shell/Dome` 与 `*ShellHalf/*DomeHalf`、`Trays_A/V` 实现；全剖把半壳 opacities 弱化到 0.18；`tower.html` 也执行同样的半壳弱化/`depthWrite=false`，不是只叠加粒子。
- 阶段 06 返修把装置群扩到 151 个 Mesh：3 台卧式换热器、3 台泵组、管廊、平台/梯子/基础、保温带；`tools/make_tower.py` 导出前保存 `.blend`。
- 独立 `tower.html` 仍保留原有 OBJ 加载、三档剖切、热点和 2D fallback，作为深链/兼容/回退入口；其剖切状态是页面局部状态，canonical 详情状态在 sandbox l4。
- 关键限制：`.blend` 是可编辑导入源，完整生成器仍是 `tools/make_tower.py`；塔板数/侧线位置为教学简化；不提供工程参数。
