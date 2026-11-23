# Underground Hero asset

- `underground.obj` / `underground.mtl`：网页运行格式（ObjLite），由 `tools/blender/build_underground_hero.py` 从 Blender 4.5.16 导出。
- `underground.glb`：同一源的 GLB 备份；当前页面不使用 GLTFLoader。
- 源文件：`assets-source/blender/underground_hero.blend`。
- 语义清单/尺寸/锚点/哈希：`docs/phase-reports/evidence/phase-04/underground-asset-manifest.json`。
- 对象名（稳定）：`geo_overburden`、`geo_caprock`、`geo_reservoir_layer`、`geo_basement`、`reservoir_lens`、`well_casing`、`well_cement`、`well_tubing`、`well_perforation_00…09`、`wellhead_tree`、`wellhead_valve`、`wellhead_outlet`、`well_flowline`、`surface_pad`。
- 来源：项目内自产脚本生成；无第三方模型、贴图、字体。
- 许可：供本项目使用；对外再分发/商用需项目权利人确认。不得把脚本自产自动等同为已取得第三方授权。
- 教学边界：4 层岩性、储层透镜、井筒/套管/水泥环/射孔与井口均为**教学示意**，不是真实油藏、真实地质比例、实际岩心或工程级套管设计。
- 材质：8 个 Principled 材质，无贴图；详见 manifest 的 `materials`。
