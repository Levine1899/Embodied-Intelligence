# Phase 04 交接报告 · 地下开采（Hero Asset 最小门禁）

## 头部

- 日期：2026-11-23
- 阶段：04_UNDERGROUND（地下开采 / Hero Asset）
- 状态建议：**PASS（阶段 04 技术范围；Hero 最小门禁通过）**
- 用户签收：**待用户签收**
- 起始 Commit：`b97816471bb2256b5245dd65f7ba21f1c46e642a`（阶段 03 签收后的 rev3）
- 结束 Commit（真实 SHA）：9b6ba64ec9bcc698d8a2128610567b85433f3304
- 分支：`main`
- 工作区 `git status --short`：见提交后记录（目标为空）

## 1. 前置检查

- 已读 `00_MASTER.md`、阶段 04 Prompt（用户本轮消息）、`PHASE_HANDOFF_TEMPLATE.md`、`phase-03-handoff.md`。
- 已读前置交付：`scene-map.md`、`experience-design.md`、`interaction-spec.md`、`device-state-contract.md`、`asset-gaps.md`、`asset-pipeline.md`、`web/levels/l1.js`、`web/world/registry.js`、`web/world/state.js`。
- 阶段 03 已由用户签收：用户原话 `阶段03签收。`；日期 2026-11-23。
- 缺失项：无（阶段 04 阶段文档在开工时不存在，属于本阶段产出）。
- 是否因此阻塞：否。

## 2. 任务逐项

| 任务 | 状态 | 证据 |
|---|---|---|
| 同一世界/注册表/状态源，非独立 Demo | **通过** | `web/levels/l1.js` 使用 `stage.baseScene`、`subsurface` 锚点、`PETRO_DEVICE_STATE` bind detail |
| 地下 Hero `.blend` + 运行格式 + 语义节点 | **通过（最小）** | `assets-source/blender/underground_hero.blend`、`web/assets/underground/*.obj/.mtl/.glb`、manifest |
| 4 层有层理/颜色差异、剖面特征 | **通过（最小）** | 波浪界面网格 + 4 材质；`asset-front/45`、`phase04-01` |
| 逐层显示/隐藏或剖切 | **通过** | 四按钮 + 裁剪平面；`phase04-02`；`phase04-verify.json.chipOff` |
| 点击地层名称/解释 | **通过** | Raycaster + HTML 按钮；`phase04-03` |
| 储层突出/油/气/水图例 | **通过** | 储层高亮 + 图例；`phase04-04` |
| 孔隙局部放大（非扫描/非流场） | **通过（示意）** | 放大壳 + 颗粒 + 声明；`phase04-05` |
| 井筒从地表贯穿储层 | **通过** | Hero casing 从地表至储层；剖切默认可见 |
| 整体/局部井段、部件显隐 | **通过** | 井筒整体/射孔按钮 + 四部件按钮 + 裁剪；`phase04-06` |
| 井口与地面管线连接 | **通过** | 同 `wellhead`、地表垫层、6 个支撑、集输端点；`phase04-08` |
| 沿井筒上行 | **通过** | `trace_up_wellbore`；录屏后段 |
| 压力差示意 + 因果反馈 | **通过** | `adjust_pressure` 0–100；粒子速度/文案；`phase04-07` |
| 暂停/重播/退出 | **通过** | 播放/暂停、重置观察、返回总览 |
| 镜头可中断/自由观察 | **通过（本轮实现）** | 指针拖拽/滚轮取消飞行动画；没有做触摸端 |
| 五关与其它区域未破坏 | **通过** | `phase04-regression.json` l1–l5 |
| 深链/章节/塔页/fallback | **通过** | `#stage=0..4`、`chapter.html?id=store`、`tower.html`、context-loss |
| 至少 6 张实际运行截图 | **通过** | 9 张 1440×900 |
| 一段实时全流程录屏 | **通过** | `underground-continuity.mp4`，1440×900，56.8s |
| 交互矩阵（≥3 核心） | **通过** | `docs/underground-experience.md` §4，5 个矩阵 |
| Hero 的 `.blend`/语义/材质/尺度/许可/检查视图 | **通过（最小）** | manifest + README + 6 检查视图；授权记录为项目内自产 |
| 阶段 03 签收记录 | **通过** | `phase-03-handoff.md` ACCEPTED + 原话 |
| 阶段 05 分离器/塔 | **不适用** | 明确未开始 |

## 3. 修改文件

- 修改：`web/levels/l1.js`（重写为地下体验）、`web/world/registry.js`（3 个地下 ID）、`web/immersion.js`（`setContextObject` + 地下设备卡片）、`web/sandbox.html`（l1 版本）。
- 新增：
  - `tools/blender/build_underground_hero.py`
  - `assets-source/blender/underground_hero.blend`
  - `web/assets/underground/underground.obj/.mtl/.glb/README.md`
  - `docs/underground-experience.md`
  - `docs/phase-reports/evidence/phase-04/*`（9 截图、录屏、manifest、verify、regression、fallback、README）
  - `tools/phase04-verify.cjs`、`tools/phase04-record.cjs`
- 修改文档：`docs/asset-gaps.md`、`docs/scene-map.md`、`docs/device-state-contract.md`、`docs/interaction-spec.md`、`CHANGELOG.md`、`docs/phase-reports/phase-03-handoff.md`（签收）。
- 删除：无业务删除；清理 Blender `.blend1` 备份，不入库。

## 4. 执行命令与结果

```bash
# Hero asset（Blender 4.5.16 portable）
"D:\tools\blender\blender-4.5.16-windows-x64\blender.exe" -b -P tools/blender/build_underground_hero.py
# -> ASSET_OK; .blend 1,180,982 B; OBJ 823,552 B; GLB 710,412 B; 6 views

# 语法
node --check web/levels/l1.js          # exit 0
node --check web/world/registry.js     # exit 0
node --check web/immersion.js          # exit 0

# 真实浏览器验证
node tools/phase04-verify.cjs           # exit 0
node tools/phase04-record.cjs           # exit 0; 1136 frames; 56.8s
node C:\...\level-e2e-rev2.cjs          # l1–l5 全通过
node C:\...\navcheck.cjs                # #stage=0..4/章节/塔页通过
node C:\...\fallback-phase04.cjs        # context-loss fallback 通过
```

- 浏览器：Chrome 157 headless CDP；页面 1440×900；本地 `http://127.0.0.1:8796`。
- `phase04-verify.json`：`assetLoaded=true`、`assetFailed=false`、4 layers、4 parts、`zoneId=subsurface`、交互后 history 9 条、`__auditErrors=[]`；并含 `devices=16`、`overviewWellbore=true`、`resetCheck`、`reentry` 真断言。
- 五关：l1 adjust_pressure、l2 choose_outlet、l3 change_liquid_level、l4 choose_fraction、l5 select_product；退出均 `levelId=null`。
- fallback：context-loss 后 sandbox 显示恢复文案；塔页显示 2D 剖面。

## 5. 证据

| 证据 | 结果 | 路径/说明 |
|---|---|---|
| 入口/地层 | 通过 | `docs/phase-reports/evidence/phase-04/phase04-01-entry.png` |
| 逐层隐藏 | 通过 | `phase04-02-strata-toggle.png` |
| 地层解释 | 通过 | `phase04-03-strata-info.png` |
| 储层/图例 | 通过 | `phase04-04-reservoir.png` |
| 孔隙放大 | 通过 | `phase04-05-pore.png` |
| 井筒局部 | 通过 | `phase04-06-wellbore.png` |
| 压力差 | 通过 | `phase04-07-pressure.png` |
| 地面井口/管线 | 通过 | `phase04-08-surface.png` |
| 返回总览 | 通过 | `phase04-09-back-overview.png` |
| 实时录屏 | 通过 | `underground-continuity.mp4`（1440×900, 56.8s, 1,998,338 B） |
| 断言 | 通过 | `phase04-verify.json` |
| 回归 | 通过 | `phase04-regression.json` |
| fallback | 通过（运行时） | `fallback.json` |
| Hero 清单 | 通过 | `underground-asset-manifest.json` |
| 资产检查视图 | 通过 | `asset-front/side/45/wellbore-close/reservoir-cutaway/wellbore-structure.png` |

## 6. P0 / P1 / P2

### Review 返修（2026-11-23）

| 找出的问题 | 修复 | 实际断言 |
|---|---|---|
| 注册表仍 `?v=v38`，缓存页只有 13 个设备；回归 JSON 却写 16 | `registry.js?v=v39`；补 `wellbore` overview 表示 | `devices=16`，三个新 ID 均可查 |
| 重进关卡仍保留 70% 压力/surface 视角 | `enterLevel` 重置 pressure/paused/completed/viewMode，更新 slider/按钮 | `reentry={pressure:0,view:'block',slider:'0',done:false}` |
| `resetView()` 清画面但不清 `__sceneContext` | 重置时 `setContextObject(null,'subsurface')` | `resetCheck={ctx:null,zone:'subsurface'}` |
| 清除高亮会把剖切面自发光清零 | `clearLayerHighlight` 后恢复 `applyClip()` 基准 | 代码审查 + 截图复验 |
| 总览井筒只进关后创建，`overviewRepresentation=null` | `immersion.js` 世界构建时创建 `wellbore_overview` 并 bind；随 overview 显隐 | `overviewWellbore=true`，`representations=['overview']` |
| 压力面板遮住剖面主体 | 压力面板移入左侧可滚动信息栏，不再绝对定位 | 1440×900 截图复验 |
| 教学声明重复 | `setInfo` 去重，已有声明不再追加 | 信息栏单条声明 |

### P0（未关闭则不得 PASS）

- **无阶段 04 技术 P0 剩余。** 上述 review P0 已关闭：交付页实际 `devices=16`，不再是“证据写 16、页面只有 13”。
- 地下 Hero 已具备可编辑 `.blend`、OBJ/MTL + GLB、语义对象、材质/尺度/原点、来源/许可记录、6 检查视图、实际网页截图/录屏；不是仅 Box/Cylinder 且无源文件的占位。

### P1

- P1-01 地质视觉细节：层内粒度/裂缝、断面纹理、贴图/UV、剖切面收边；当前是低模教学式波浪层。
- P1-02 孔隙放大：当前是概念颗粒 + 线框壳，不是岩心扫描；视觉可再设计为更清晰的局部剖面。
- P1-03 地面井口环境：地面垫层/管线支撑为程序化辅助，缺天空/远景层次；保留为后续视觉精修。
- P1-04 资产许可：项目内自产、无第三方贴图；对外再分发仍需权利人书面确认，阶段 09 归档。
- P1-05 性能：未跑 FPS/内存长跑；当前只做页面实时交互和截图。

### P2

- P2-01 跨浏览器/GPU 兼容、低端机。
- P2-02 真实用户测试（N=5）。
- P2-03 AI `/api/ask`/生成闭环（阶段 08）。
- P2-04 移动端（明确不做）。
- P2-05 fallback 仅测 context-loss，不扩大为所有无 WebGL 冷启动。

## 7. 资产与许可

- Hero：**地下地质/储层/井筒/井口一体化**（资产 ID `underground_hero`）。
- `.blend`：`assets-source/blender/underground_hero.blend`；运行格式 OBJ/MTL；GLB 备份。
- 语义节点：manifest `objects`/`anchors`；网页按对象名映射。
- 来源：项目内 Blender 脚本生成；无第三方模型/贴图/字体。
- 许可：供本项目使用；对外再分发需项目权利人确认；不是“已自动可商用”。
- 门禁：**最小 Hero 门禁通过；视觉细节 P1，不宣称专业地质资产完成。**
- 阶段 05 分离器/阶段 06 塔：未开始，仍按各自阶段门禁。

## 8. 设计—研发追踪

- zoneId / stageId：`subsurface`（地面井口 `oilfield`）/ `drill`
- objectId：`underground_geology`、`reservoir`、`wellbore`、`wellhead`（复用）
- levelId / taskId：`l1` / 阶段 01 地下开采
- knowledgeId：`kb_formation`、`kb_drill`
- shotId：总览入口、剖面、储层/孔隙、井筒整体/射孔、上行井口
- actionId：`inspect_layer`、`toggle_layer`、`inspect_reservoir`、`inspect_pores`、`inspect_wellbore_part`、`toggle_wellbore_part`、`adjust_pressure`、`trace_up_wellbore`、`inspect_wellhead`
- 影响 API/深链/fallback：保留 `/api/ask` 与 `/api/gen` 不调用；`#stage=0` 不变；新增 3 个稳定 ID；fallback 仍可用。

## 9. Agent recommendation

- 建议：**PASS（阶段 04 技术范围，review 返修后）**
- 理由：review 指出的注册表缓存/证据不一致、重进状态、reset 上下文、剖切高亮、总览井筒表示、面板遮挡、文案重复均已修复并有实际浏览器断言；P0 为空。
- 未关闭项：视觉细节 P1；真实用户测试/跨浏览器/性能/AI 属后续阶段；不阻塞本阶段 PASS。

## 10. User acceptance

- 状态：**待用户签收**
- 用户原话：未填写（不得代签）
- 日期：未填写

## 11. 停止声明

- 本阶段是否停止：**是**；交付后停止。
- 下一阶段是否允许开始：**否**；等待用户明确签收阶段 04 后，才能执行 `05_PRODUCTION_STORAGE.md`。
- 等待事项：用户签收；阶段 05 分离器内部/三相路径/HM-2；阶段 04 的 P1 视觉精修可在后续资产轮处理。
