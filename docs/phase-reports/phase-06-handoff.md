# Phase 06 交接报告 · 炼化与常减压塔（设备群 / 三状态 / 馏分）

## 头部

- 日期：2026-11-23
- 阶段：06_REFINERY_TOWER
- 状态建议：**PASS（技术/交互范围；P0-ASSET-01 已修复；用户签收待完成）**
- 用户签收：**待用户签收**
- 起始 Commit：`34c7839abcfec13da75f55fe61d8a23b73a86c77`
- 结束 Commit（真实 SHA）：`e2580f7494bc0cec24194811ed76296318797f5b`（阶段 06 review 修复内容提交）
- 分支：`main`
- 工作区 `git status --short`：提交后记录（目标为空）

## 1. 前置检查

- 已读 `docs/agent-prompts/00_MASTER.md`、本阶段用户 Prompt、`docs/agent-prompts/PHASE_HANDOFF_TEMPLATE.md`、`docs/phase-reports/phase-05-handoff.md`、`phase-04-handoff.md`。
- 已读前置：`docs/scene-distillation-tower.md`、`docs/experience-design.md`、`docs/interaction-spec.md`、`docs/device-state-contract.md`、`docs/scene-map.md`、`web/levels/l4.js`、`web/world/registry.js`、`web/tower.js`、`web/assets/tower/*`、`tools/make_tower.py`。
- 用户已签收阶段 04/05，原话：`签收阶段04、05，继续阶段06。`（2026-11-23）；签收记录已补入阶段 04/05 handoff。
- 阶段 05 储运出口与本阶段炼化入口：`path_store_refine` 在 `l3` 的 `routeInfo.storageOutlet` 与全局路线相接；本阶段 l4 使用同一 `refining` zone / `atmospheric_tower` objectId。
- 缺失项：没有独立的 `06_REFINERY_TOWER.md` 文件；用户本轮消息本身即本阶段 Prompt。没有导致阻塞。
- 是否因此阻塞：否。

## 2. 任务逐项

| 任务 | 状态 | 证据 |
|---|---|---|
| 炼化区成套装置群（常压塔/减压塔/加热炉/换热器组/泵组/管廊/平台/产品箱） | **通过（最低视觉门禁）** | `phase06-01` 可见双塔、加热炉、2 组卧式换热器、3 台泵组底座、管廊、平台/梯子、基础；资产 151 个 Mesh、14,328 顶点、27,054 三角面 |
| 复用现有 OBJ/GLB 与 Blender 源，不盲目切格式 | **通过** | 运行时明确使用 `tower.obj` + `tower.mtl`，未切 GLB；`.blend` 源与生成脚本保留 |
| 常压/减压/塔板/进料/侧线语义一致 | **通过（最小）** | meta anchors、OBJ 对象名、`atmospheric_tower` / `vacuum_tower` 绑定 |
| 外观 | **通过** | 完整壳/封头显示；`phase06-01` |
| 半剖 | **通过** | 完整壳隐藏、半壳显示、塔板可见；`phase06-02` |
| 全剖 | **通过** | 半壳弱化、塔板/汽液/进料/侧线路径；`phase06-03` |
| 模型加载后显式初始化外观 | **通过** | `loadAsset()` 完成后 `setLevel(0,false)`；`phase06-verify.json.external.level=0` |
| 状态/相机/按钮/说明同步 | **通过** | `setLevel` 同步 `PETRO_DEVICE_STATE.structure`、`aria-pressed`、相机；验证 JSON 记录 external/half/full |
| 连续点击可逆，不失控 | **通过** | 0→1→2→1→0、恢复外观；`phase06-verify` 反复切换 |
| 热点/标签不指向隐藏结构 | **通过（最小）** | 常压/减压/加热炉/馏分出口标签可见；塔内塔板只由剖切显示 |
| 总览/近景同一 objectId/状态源 | **通过** | l4 主绑定 `atmospheric_tower`；`vacuum_tower`/`heater` 共享 `tower.obj`；`PETRO_DEVICE_STATE` 唯一状态 |
| 总览→近景→操作→返回连续 | **通过** | l4 进入/退出；`refining-continuity.mp4` 57.15s；`phase06-05-back-overview.png` |
| 选择进料位置并显示路径 | **通过（两种）** | “常压进料”加热炉→常压塔中部；“减压进料”常压塔底→减压塔 |
| 启动/暂停/重播汽液接触 | **通过** | 启动/暂停/继续/重播；`phase06-verify.json.paused` |
| 选择塔内结构查看作用 | **通过** | “塔板结构”；塔板/泡罩/降液板说明 |
| 选择五馏分并显示教学路径 | **通过** | 五个 HTML 按钮；`phase06-verify.json.fractions` 5 条均有 selected/note |
| 塔顶油气/石脑油/煤油/柴油/常压渣油 | **通过** | `FRACTIONS` 五条；对应侧线路径 |
| 馏分≠成品油 | **通过** | l4 note 明示；`refining-experience.md` §5 |
| 馏分→典型后续加工/用途 | **通过（文字示意）** | 冷凝/气分、重整/乙烯、航煤精制、加氢/调和、减压/深加工；标“典型示意” |
| 常压/减压关系与科学边界 | **通过** | 减压降低沸点、避免高温裂解；不编造压力/温度/收率 |
| 完整镜头（全景→塔→近景→半剖→全剖→进料/汽液→馏分→全景） | **通过** | `refining-continuity.mp4` |
| 真实浏览器截图 | **通过** | 5 张 1440×900 + 2 张资产检查渲染 |
| 实时连续录屏 | **通过** | 57.70s；1,675,828 B；1440×900 |
| 更新 `docs/scene-distillation-tower.md` | **通过** | 追加阶段 06 l4 集成 |
| 新增 `docs/refining-experience.md` | **通过** | 设备群/三状态/互动矩阵/科学边界 |
| 交互矩阵（每个核心设备） | **通过** | 5 个矩阵：三状态、进料、汽液、塔板、馏分 |
| 旧塔页入口、返回和 2D fallback 保留 | **通过** | `tower.html` 未删；navcheck 塔页通过；l4 加载失败提示 fallback |
| 五关回归 | **通过** | E2E l1–l5，exit 0 |
| AI `/api/*` / 阶段 08 | **不适用** | 未调用、未实现 |

## 3. 修改文件

- 修改：
  - `web/levels/l4.js`（从简化程序化塔改为 `tower.obj` 装置群，三状态、进料/汽液/塔板/馏分/复位）
  - `web/world/registry.js`（`atmospheric_tower`/`vacuum_tower`/`heater` 的 detail、anchor、assetStatus、interaction）
  - `web/sandbox.html`（l4 v41）
  - `docs/phase-reports/phase-04-handoff.md`、`phase-05-handoff.md`（记录用户签收原话）
  - `docs/scene-distillation-tower.md`
- 新增：
  - `assets-source/blender/tower_hero.blend`
  - `docs/refining-experience.md`
  - `docs/phase-reports/phase-06-handoff.md`（本文件）
  - `docs/phase-reports/evidence/phase-06/*`（5 截图、资产检查渲染、资产清单、验证 JSON、录屏、README）
  - `tools/phase06-verify.cjs`、`tools/phase06-record.cjs`
  - `tools/make_tower.py` 扩展设备群，并在导出前保存 `tower_hero.blend`
- 删除：无。
- 未修改：`tower.html`/`tower.js`（旧塔页/深链保留）；阶段 05 分离器/储运实现未改。

## 4. 执行命令与结果

```bash
node --check web/levels/l4.js             # exit 0
node --check web/world/registry.js        # exit 0
node tools/phase06-verify.cjs              # exit 0；5 馏分、三状态、暂停、复位、退出
node tools/phase06-record.cjs              # exit 0；1143 帧；57.70s；1,675,828 B
node level-e2e-rev2.cjs                    # l1–l5 exit 0
node navcheck.cjs                           # #stage=0..4、章节、塔页 exit 0
```

真实断言：

- `external.loaded=true`；`level=0`；`groups={full:4,half:4,trays:2,hotspots:5}`。
- `half.level=1`；`full.level=2`；`full.flow=true`；`full.fraction='diesel'`。
- 五个馏分全部选中并返回各自 note。
- 暂停：`flow=true, paused=true, button='继续汽液'`。
- `reset.level=0, flow=false, fraction=null`。
- 外部态“重播/塔板结构”自动切到半剖；real DOM click 命中 3D `vacuum` 热点；退出 `level=false, isolated=0`；重进 `level=true`；双次返回无错误。
- 退出后 `__sceneContext.stage/zone` 为 `refine/refining`。

## 5. 证据

| 证据 | 结果 | 路径 |
|---|---|---|
| 独立塔全剖 | 通过 | `tower-full-cut.png`（半壳 opacity 0.18） |
| 常压渣油底部 | 通过 | `phase06-06-residue-bottom.png` |
| 装置群外观 | 通过 | `docs/phase-reports/evidence/phase-06/phase06-01-refining-external.png` |
| 半剖塔板 | 通过 | `phase06-02-refining-half.png` |
| 全剖+进料+汽液+柴油路径 | 通过 | `phase06-03-refining-full.png` |
| 恢复外观 | 通过 | `phase06-04-refining-restored.png` |
| 返回总览 | 通过 | `phase06-05-back-overview.png` |
| 连续录屏 | 通过 | `refining-continuity.mp4`（57.70s, 1440×900, 1,675,828 B） |
| 独立塔页状态/流程 | 通过 | `tower-state-flow.png`、`tower-state-flow.json` |
| 验证断言 | 通过 | `phase06-verify.json` |
| 资产外观检查 | 参考（Blender 静帧） | `asset-overview.png`、`asset-cutaway.png` |
| Hero 资产清单/哈希 | 通过 | `tower-asset-manifest.json`（151 Mesh / 14,328 verts / 27,054 tris） |
| 阶段包 | 已生成 | `dist/phase-06-web.tgz`，10,297,154 B，SHA-256 `89FAE9B66F1D7EABCC7315FB403BD92E3BAA87711E9DF48960B9BF1170CF5BC0` |

## 6. P0 / P1 / P2

### P0（未关闭则不得 PASS）

- **P0-ASSET-01 已关闭（最低视觉门禁）。** `tools/make_tower.py` 已扩展为 151 个 Mesh：常压/减压塔、加热炉、换热器组（3 台卧式管壳式 + 鞍座/接管）、泵组（3 台 + 底座/电机/阀轮）、管廊、平台/格栅/栏杆/直梯、设备基础、保温带、冷凝器/产品箱。网页 `phase06-01` 能辨识这些设备，不是“几根孤立圆柱”。
- 该资产仍是**教学示意**：细节/表面精度不是工程级；保留 P1，不再阻塞最低门禁。

### P1

- P1-01 资产仍是程序化教学模型，不是高精度工程资产；平台/炉管/设备比例简化，不能当真实总平面。
- P1-05 `tower.html` 是兼容/fallback 页；已接入 `PETRO_DEVICE_STATE`（页面内）和汽液启动/暂停/重播控制，但不做跨页持久化，canonical 详情仍是 sandbox l4。
- P1-06 常压渣油已改塔底路径；中部只保留石脑油/煤油/柴油侧线。
- P1-02 3D 热区是 5 个球形语义锚点 + HTML 按钮；不是所有 Mesh 都可点，深层部件仍靠标签/按钮。
- P1-03 外部全景中设备群可见，但 `lvl__act` 面板仍占据部分下方画面；可在后续视觉轮优化相机/面板布局。
- P1-04 资产对外再分发许可仍需权利人书面确认。

### P2

- 真实浏览器 FPS/内存长跑、跨浏览器、移动端、N=5 用户测试：**未执行**。
- 真实工程参数/塔板效率/CFD：未执行，且不在科普范围。
- AI `/api/ask`/生成闭环：阶段 08，未执行。

## 7. 资产与许可

- Hero：`distillation_unit_hero`；objectId：`atmospheric_tower`（主）、`vacuum_tower`、`heater`。
- 可编辑源：`assets-source/blender/tower_hero.blend`（1,852,949 B）。
- 网页运行格式：`web/assets/tower/tower.obj` + `tower.mtl`（`tower.obj` 1,065,642 B；`tower.glb` 1,242,776 B 保留给后续，不冒充已验证运行时格式）。
- 语义/锚点：`tower.meta.json` + `tower-asset-manifest.json`。
- 来源：项目内 Blender/OBJ 自产；无第三方贴图/字体。外部再分发需书面许可。
- 视觉门禁：**最低通过**（装置群、半壳/塔板、网页截图可辨识）；不等于高精度工程资产。

## 8. 设计—研发追踪

- zoneId / stageId：`refining` / `refine`
- objectId：`atmospheric_tower`、`vacuum_tower`、`heater`
- levelId：`l4`
- knowledgeId：`kb_refine`
- actionId：`inspect_tower_structure`、`choose_feed_position`、`start_vapor_liquid`、`pause_vapor_liquid`、`resume_vapor_liquid`、`inspect_tower_trays`、`replay_refining_flow`、`select_fraction`、`restore_refining_view`
- API/深链/fallback：未调用 `/api/ask`/`/api/gen`；`#stage=3`、章节、`tower.html` 保留。
- 总览/近景：同一 `atmospheric_tower`；`PETRO_DEVICE_STATE` 单一状态源；退出不重置总览镜头到其他区域。

## 9. Agent recommendation

- 建议：**PASS（技术/交互范围）**。
- 理由：装置群已补齐换热器/泵组/管廊/平台/基础，151 Mesh、27,054 三角面；网页截图能看到成套设备；三状态、5 馏分、两种进料、汽液、3D 热点与边界测试均有证据。
- 未关闭项：P1 高精度资产/3D 热区覆盖/面板布局；P2 性能/用户测试。不阻塞本阶段技术 PASS，但不能宣称工程级资产。

## 10. User acceptance

- 状态：**待用户签收**
- 用户原话：未填写（不得代签）
- 日期：未填写

## 11. 停止声明

- 本阶段是否停止：**是**。
- 下一阶段是否允许开始：**否**；等待用户明确签收阶段 06 后才执行 `07_IMMERSIVE_JOURNEY.md`。
- 等待事项：用户签收；P1 视觉精修与 P2 性能/用户测试未关闭；不得进入阶段 07。
