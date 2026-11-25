# Asset pipeline · Phase 03

> ⚠ **本文是 2026-11-22 的历史快照，其中"当前状态"部分已被 2026-11-25 的实测推翻。**
> 需知：① Blender 实为 **5.3.0**（本文记 4.x LTS 且"未定位"）；② `web/assets/models/` **从未建立**，
> 实际并存 `web/assets/<asset>/`（tower/separator/underground）与 `web/assets/hero/<asset>/`（5 个 Hero）两套；
> ③ `assets-source/blender/` 下已有 **3 个 `.blend`**；④ 仓库仍**无 GLTFLoader**，生产页只加载 OBJ。
> 目录与命名的最终裁决见 [`docs/3d-model-optimization/decisions.md`](3d-model-optimization/decisions.md)。
> 基线与实测数据见 [`docs/3d-model-optimization/reports/phase-00-baseline.md`](3d-model-optimization/reports/phase-00-baseline.md)。

日期：2026-11-22（Blender 与目录现状于 2026-11-25 更正）
适用：阶段 04–06 的 Hero、阶段 03 的环境/地形辅助资产。
原则：**可编辑源 + 可复现导出 + 稳定语义 ID + 可核验网页加载**；不以三角面数代替质量。

## 1. Blender 版本与运行

- **实测（2026-11-25）**：Blender **5.3.0**（build 2026-11-10），路径 `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`，**不在 PATH**。`--version` 可正常返回，headless 可用。
- **版本锁定建议**：以 5.3.0 为唯一构建版本。现有产物的导出器版本**不一致**——`tower.glb` 为 Blender I/O `v5.3.43`，`separator/underground/spike.glb` 为 `v4.5.51`；`tools/blender/build_separator_hero.py` 的 docstring 仍硬编码 `D:\tools\blender-4.5.16-windows-x64\blender.exe`，与实机不符，须在 Phase 1 统一。
- 命令行模板（路径按本机 5.3.0 实际替换）：

```bash
blender -b assets-source/blender/<assetId>.blend \
  -P tools/blender/export_glb.py -- \
  --out web/assets/models/<assetId>/<assetId>.glb \
  --manifest docs/phase-reports/evidence/phase-04/<assetId>-manifest.json
```

- 导出脚本：`tools/blender/export_glb.py`；导出前检查对象命名、单位、原点、材质/贴图。
- 不在网页运行时用 Blender；`.blend` 只作为源文件。

## 2. 目录与命名

```text
assets-source/
  blender/<assetId>.blend                 # 可编辑源
  references/<assetId>/                   # 参考图（必须有来源/许可）
  textures/<assetId>/                     # 源贴图
web/assets/models/<assetId>/
  <assetId>.glb                           # 运行时
  <assetId>.meta.json                     # 语义节点/锚点/许可摘要
  textures/                               # 压缩后贴图（如使用）
tools/blender/
  export_glb.py
  check_glb.py                            # 可选：结构/命名检查
docs/asset-gaps.md                        # 待建/精修/复用状态
```

- `assetId` 用稳定小写：`underground_wellbore`、`separator_three_phase`、`refinery_cd_tower`。
- 运行格式优先 `.glb`；现有 OBJ/MTL 可复用，但必须补语义节点/许可记录；当前页面无 GLTFLoader，阶段 04 接入前必须补加载器或继续用 OBJ。
- `.glb` 不提交重复的旧版本；版本变更写 manifest。

## 3. 单位、轴向、原点、缩放

- 单位：米（Blender Unit Scale = 1.0）；场景 1 unit = 1 m。
- 轴向：Blender Z-up；glTF 导出 Y-up。网页 Three.js Y-up。
- 原点：
  - 设备原点在**设备底面中心**（地面接触点），不是几何中心；
  - 管线/塔等有明确基座时，原点在基座中心；
  - 井筒原点在井口地面中心。
- 缩放：导出前 Apply Scale（1,1,1）；不要靠网页缩放补偿。
- 旋转：Apply Rotation；只保留必要的层级动画。
- 坐标：与 `web/world/registry.js` 的 `anchor` 对应；不把世界坐标写进 GLB 节点（GLB 局部坐标，网页放到 anchor）。

## 4. 语义 ID / glTF extras / 节点命名

- 根节点名：`asset_<assetId>`；根 `extras.objectId = <objectId>`（与注册表一致）。
- 子节点：`part_<semantic>`，例如 `part_shell`、`part_inlet_gas`、`part_outlet_oil`、`part_tray_1`、`part_davit`。
- 剖切壳：`cut_half_shell` / `cut_full_shell`；不可与外观壳同名。
- 锚点：`anchor_<name>`，用 Empty，导出为节点；`extras.anchorId`。
- 任何可交互部件必须有稳定 `semanticId`，不得依赖导出顺序/材质桶名。
- 网页加载后：`root.userData.objectId` 必须存在；`PETRO_DEVICE_STATE.bind(objectId,'detail',root)`。

## 5. 材质、贴图、色彩空间

- 材质命名：`mat_<assetId>_<role>`，如 `mat_tower_steel`。
- 贴图命名：`tex_<assetId>_<role>_<size>.png`；基础色 sRGB；法线/粗糙度/金属度 Non-Color。
- 纹理尺寸：Hero 近景 ≤ 2048；中景 ≤ 1024；远景 ≤ 512；同一资产不超过 4 张 2K。
- 压缩：PNG/JPEG 二选一，记录在 meta；不得把 8K 贴图直接塞进网页。
- 当前现有资产无 UV/贴图；这是需精修项，不是“材质已完成”。

## 6. 导出后检查

1. Blender 重新打开 `.blend`：单位/原点/轴向/命名/材质完整。
2. 导出 `.glb`：检查节点数、材质数、贴图引用、`extras`、动画（如有）。
3. 网页加载：控制台无错误；模型出现在正确 anchor；包围盒/比例与场景匹配；近景不穿模。
4. 语义检查：`objectId`、`anchorId`、部件 `semanticId` 与注册表一致。
5. 结构检查：半剖/全剖确有结构差异；不是只改材质/粒子。
6. 证据：正面/侧面/斜 45°/局部剖切截图 + 网页加载/交互截图或录屏；文件 SHA-256 记录。
7. 失败回退：保留上一版 `.glb` 与 manifest，网页按注册表回退到 overview 占位；不得静默换模型。

## 7. 来源、许可证、修改记录

- 每个资产在 `<assetId>.meta.json` 记录：作者/工具、来源 URL、许可证、允许商用/再分发、修改摘要、生成日期。
- 项目自产也要记录“由 `tools/...` 生成”，但不能自动写成“已授权商用”。
- 第三方模型/贴图必须有许可证文件；无授权不得进入仓库或网页。
- 字体/Three.js 等第三方代码按现有 NOTICE；新增资产不得改变其许可边界。

## 8. 阶段门禁

- 阶段 03：允许程序化占位；不要求 Hero `.blend` 完成。
- 阶段 04：地下 Hero 未达 → 地下视觉验收 `BLOCKED`。
- 阶段 05：分离器内部/剖切未达 → 处理体验不得 PASS。
- 阶段 06：塔全剖无结构级差异 → 炼化体验不得 PASS。
- 阶段 09：三类 Hero 的 `.blend`、`.glb`、语义节点、来源/许可、网页证据缺一不可。

## 9. 当前状态（2026-11-25 更正）

- `web/assets/models/` **从未建立**；实际并存两套：`web/assets/<asset>/`（tower / separator / underground）与 `web/assets/hero/<asset>/`（separator / pumpjack / wellhead / heater / floating_roof_tank）。目录唯一形态待 Phase 1 裁决。
- Hero `.blend`/`.glb` **已存在**：`assets-source/blender/{tower,separator,underground}_hero.blend`；GLB 在 `web/assets/{tower,separator,underground}/`。但**生产页一律不加载 GLB**（无 GLTFLoader），只有 `_spike-separator.html` 经 `MiniGLB` 加载过 spike 版。
- 现有 OBJ 可继续作为 overview/占位；未按本流程核验，不得标"已通过"。
- Blender 已定位并验证为 5.3.0（见 §1）。
- 已有 manifest 质量分化：phase-04/phase-05 的哈希与当前文件**全部匹配**；phase-06（tower）**全部失配**，不可作为基线。
