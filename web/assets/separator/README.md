# 三相分离器 Hero · 来源与语义

日期：2026-11-23  
资产 ID：`separator_three_phase`  
网页对象：`three_phase_separator`

## 文件

- `.blend`：`assets-source/blender/separator_hero.blend`
- 网页 OBJ/MTL：`web/assets/separator/separator.obj/.mtl`
- GLB 备份：`web/assets/separator/separator.glb`
- 构建脚本：`tools/blender/build_separator_hero.py`
- 检查视图：`docs/phase-reports/evidence/phase-05/asset-*.png`

## 来源与许可

- 由项目脚本用 Blender 4.5.16 程序化生成，无第三方模型/贴图/字体。
- 仅用于本项目教学；**对外再分发或商业交付前需项目权利人书面确认**。
- 教学示意，不是工程设计、CFD 或真实分离效率模型。

## 语义节点

`separator_shell`、`separator_head_left/right`、`separator_cut_shell`、`separator_cut_edge_top/bottom`、`separator_inlet`、`separator_gas_outlet`、`separator_oil_outlet`、`separator_water_outlet`、`separator_internal_oil`、`separator_internal_water`、`separator_internal_gas`、`separator_internal_weir`、`separator_internal_baffle`、`separator_internal_inlet_distributor`、`separator_internal_mist_extractor`、`separator_internal_vortex_breaker`。

## 尺度/原点

- 米制，Blender Z-up；OBJ 导出为 Y-up。
- 分离器中心线约 local `(0,0,2.1)`；地面底座 z≈0。
- 长约 6.8 m、直径约 2 m；数值是教学比例，不是设备选型。
