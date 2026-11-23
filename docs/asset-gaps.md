# Asset gaps · 当前资产（Phase 04 已交付地下 Hero）

日期：2026-11-22
范围：当前 `web/assets/` 与阶段 03 程序化占位；不是最终资产验收。

## 1. 结论

| 资产组 | 当前状态 | 阶段 03 可视证据 | 阶段责任 |
|---|---|---|---|
| 地下地质/储层/井筒/井口一体化 | **已新建**：Blender 4.5 `.blend` + OBJ/GLB + 语义节点 + 实际网页集成；断面纹理细节列 P1 | `phase-04/asset-*.png` / `phase04-01…09.png` | 阶段 04；最小 Hero 门禁通过，细节需精修 |
| 三相分离器（含内部/剖切） | **需精修**；现有 OBJ 8,236 面，材质桶合并，无内部结构 | `gathering-1440.png` | 阶段 05；当前内部结构 `BLOCKED` |
| 炼化装置/常减压塔（含全剖） | **需精修**；OBJ 54 个命名对象、半剖可用，全剖差异弱 | `refining-1440.png` | 阶段 06；当前全剖 `BLOCKED` |
| 抽油机 | **可直接复用（中景）**；无 `.blend`/UV | `oilfield-1440.png` | 阶段 04 精修可选 |
| 井口 | **已纳入地下 Hero**：井口树/阀/出口/地面管线与同一 `wellhead` objectId；阶段 05 可精修阀门 | `phase-04/phase04-08-surface.png` | 阶段 04/05 |
| 固定顶/外浮顶罐 | **需精修**；浮盘在关卡程序化对象里 | `storage-1440.png` | 阶段 05 |
| 加热炉 | **需精修**；中景结构简单 | `refining-1440.png` | 阶段 06 |
| 城市产品 | **占位**；基础几何体/产品卡 | `city-1440.png` | 阶段 06/07 |
| 地形/台地/道路/管架 | **程序化占位**；允许用于环境/辅助 | 全部截图 | 阶段 04–06 可逐步替换 |

## 2. 待专业建模清单

### 2.1 地下地质与井筒（阶段 04）

- 目标：地层剖面、储层、井筒/套管、井口具备可信空间关系；可从南侧看入，镜头沿井筒上升不穿模。
- 主要部件：地表/上覆地层、盖层、储层、井筒套管/水泥环、射孔段、采油树、井场平台。
- 参考视图：`docs/phase-reports/evidence/phase-02/blockout-subsurface.png`、`docs/phase-reports/evidence/phase-03/subsurface-1440.png`（仅布局，不是资产参考）。
- 交付：`.blend` + `.glb` + 语义节点 + 材质/贴图 + 许可证。
- 许可证：**未确定**；不得使用来源不明模型。

### 2.2 三相分离器（阶段 05）

- 目标：卧式壳体、封头、鞍座、气/油/水接管、仪表、可剖切内部（挡板/堰板/除雾器）。
- 参考：`web/assets/hero/separator/separator.obj`、`separator/preview.png`；当前 5 个材质桶，无 inlet/outlet 语义。
- 交付：`.blend` + `.glb` + `separator_shell/separator_inlet/...` 语义节点 + 半剖/全剖结构。
- 许可证：项目自产脚本生成，**无书面授权记录**；阶段 05 前补记录或重建。

### 2.3 炼化装置/常减压塔（阶段 06）

- 目标：成套装置特征；常压塔/减压塔外观与内部（塔板/降液管/侧线）可识别、可剖切；半剖/全剖有结构级差异。
- 参考：`web/assets/tower/tower.obj`、`tower.meta.json`、`render-cutaway.png`；当前全剖差异不足。
- 交付：`.blend` + `.glb` + 稳定塔段/侧线/塔板节点 + 剖切壳。
- 许可证：项目自产脚本生成，**无书面授权记录**；阶段 06 前补。

## 3. 资产来源与许可

- `tools/make_hero_assets.py`、`tools/make_tower.py` 生成当前 OBJ；仓库没有 `.blend`、UV/贴图、书面许可/授权文件。
- 现有 `web/assets/hero/*/preview.png`、`tower/render-*.png` 是渲染/预览，不是网页实跑证据。
- 不得把“脚本自产”自动等同“可商用/已授权”；阶段 04–06/09 必须补来源、许可证、修改记录。
- 第三方字体（得意黑）为 SIL OFL 1.1；Three.js 为 MIT；其它外部图片/模型未授权不得引入。

## 4. 阶段 03 使用声明

- 阶段 03 只使用**明确标注的程序化占位/现有中低模**搭建世界骨架；不宣称通过 Hero Asset Gate。按 00_MASTER §5，三类 Hero 是阶段 04/05/06 的责任，不是阶段 03 的当前 P0；阶段 09 做全局来源/许可/网页证据验收。
- 当前三类 Hero 的视觉验收均为 **BLOCKED**；阶段 03 可继续代码骨架，但不能以占位图作为核心视觉交付完成。
- 三角面数不作为质量判断；必须结合轮廓、比例、部件结构、材质、语义节点、局部可读性和网页展示。


## 5. Phase 04 交付状态（2026-11-23）

| 项 | 状态 |
|---|---|
| 地下地质/储层/井筒 Hero | **交付**：`assets-source/blender/underground_hero.blend`、`web/assets/underground/underground.obj/.mtl/.glb`、`underground-asset-manifest.json` |
| 语义节点 | `geo_overburden/geo_caprock/geo_reservoir_layer/geo_basement/reservoir_lens/well_casing/well_cement/well_tubing/well_perforation_*/wellhead_*/well_flowline` |
| 材质/贴图 | 8 个纯材质，无第三方贴图；色彩空间/贴图问题不适用 |
| 单位/轴/原点 | 米；Blender Z-up 导出 OBJ Y-up；井口/地表中心为局部 0,0,0 |
| 来源/许可 | 项目内自产脚本生成，无第三方模型/贴图；对外再分发需权利人确认，见 manifest |
| 检查视图 | `asset-front/side/45/wellbore-close/reservoir-cutaway/wellbore-structure.png` |
| 网页证据 | 9 张 1440×900 截图 + 57.45s 实时录屏 + `phase04-verify.json` |
| 结论 | **最小 Hero 门禁通过；视觉细节 P1**（纹理/断面/层内粒度） |
| 未完成 | 专业地质纹理/UV、跨浏览器、FPS/内存长跑 → P1/阶段 09 |

三相分离器（阶段 05）与塔（阶段 06）仍按原计划，不由本阶段提前验收。


## Phase 05 交付状态（2026-11-23）

- 三相分离器 Hero 已交付：`.blend`、OBJ/MTL、GLB、40 个 mesh 语义节点、内部油/水/气/堰板/挡板/雾沫捕集器；`web/assets/separator/`。
- 内部结构为教学低模，非工程细节；视觉细节仍列 P1（层内纹理/焊缝/法兰细节）。
- 固定顶/外浮顶罐仍为 `l3` 程序化几何 + 浮盘/密封/导向；储罐 Hero `.blend` 未在本阶段新建，不能宣称完成独立资产。
