# Phase 05 交接报告 · 地面处理与储运（分离器 Hero / 储罐泵送）

## 头部

- 日期：2026-11-23
- 阶段：05_PRODUCTION_STORAGE
- 状态建议：**REVISE（阶段 05 技术项已修复；阶段 06 仍被用户签收门禁阻塞）**
- 用户签收：**待用户签收**
- 起始 Commit：`3890822b66041c4d4d0dca6ad9a976cd08d288f5`（阶段 04 rev4）
- 结束 Commit：`b6d2f047e06204d525a0c4869e5574a20d195704`
- 分支：`main`
- 工作区 `git status --short`：提交后记录（目标为空）

## 1. 前置检查

- 已读 `docs/agent-prompts/00_MASTER.md`、本阶段用户 Prompt、`docs/agent-prompts/PHASE_HANDOFF_TEMPLATE.md`、`docs/phase-reports/phase-04-handoff.md`。
- 已读：`scene-map.md`、`device-state-contract.md`、`interaction-spec.md`、`asset-gaps.md`、`hero-assets.md`、`asset-spike-separator.md`、`web/world/registry.js`、`web/levels/l2.js`、`web/levels/l3.js`。
- 阶段 03 已签收，阶段 04 由用户本轮启动阶段 05；未代签用户原话。
- 缺失项：`00_MASTER.md`/模板实际位于 `docs/agent-prompts/`，已读取；没有阶段 05 的独立 Prompt 文件，用户本轮消息即 Prompt。
- 是否因此阻塞：否。

## 2. Review 返修记录（2026-11-23）

- 分离器：新增半壳 `separator_cut_shell`、上下切边、圆柱切片液层；`.blend/OBJ/GLB` 重导出；网页以半透明壳+内部切片+相层标签显示，避免矩形箱体。
- l2：补齐 `inspect_separator_structure`、`start/pause/step/replay_separation`、`assign_outlet_target`；初始按钮改“启动分离”；修复壳/动画重进 UI 同步；出口/去向改用真实 pointer 事件测试。
- l3：补齐 `inspect_tank_structure`、`start/pause/replay_pump`；添加选中环、液位/剖面/泵状态重进同步；修复 `lastInteraction`。
- 证据：新增 `phase05-03a-wrong-target.png`、`phase05-03b-complete.png`；重录 71.55s 录屏；交接与 README 更新为 10 张截图。

## 2a. Review P1 修复验证

- P1-01：暂停后 `phaseDots=21`，单步后仍为 21 且 `phaseT` 前进；播放按钮为“继续分离”并同步 `aria-pressed=false`。
- P1-02：进入后 280ms 快速退出，`quickExit.active=false`、`separatorMeshes=5`、`visible=5`，暂存的 overview Mesh 全部恢复。
- P1-03：气/油/水出口和三个去向都有真实 HTML 按钮；验证脚本通过 DOM 按钮完成三条正确路径。
- P1-04：`solved={gas:true,oil:true,water:true}`、`completed=true`、`actHidden=true`、`nodeDone=1`，保留 `phase05-03b-complete.png`。
- P1-05：`__l3.routeInfo.pathId='path_store_refine'`，本地泵送终点 localEnd 与全局 storageOutlet 使用同一坐标。
- P1-06：Manifest 统计 7,364 tris / 43 meshObjects / 3,790 verts，附 4 个文件 SHA-256；交接日志同步。

## 2b. 任务逐项

| 任务 | 状态 | 证据 |
|---|---|---|
| 同一世界、注册表、状态源 | **通过** | `l2`/`l3` 使用 `stage.baseScene`、`PETRO_DEVICE_STATE`、`three_phase_separator`/`fixed_roof_tank`/`floating_roof_tank`/`transfer_pump` |
| 三相分离器 Hero `.blend` + 运行格式 | **通过（最小）** | `assets-source/blender/separator_hero.blend`、`web/assets/separator/separator.obj/.mtl/.glb` |
| 分离器内部结构/剖切 | **通过（教学最小）** | 内部油/水/气/堰板/挡板/雾沫捕集器；`phase05-02-separator-internal.png` |
| 分离过程启动/暂停/重播 | **通过** | 三按钮 + `phaseT` 粒子路径；`phase05-verify.json.internal` |
| 出口选择与错误解释 | **通过** | 气/油/水出口 + 去向；错误红色粒子/文案；`phase05-03` |
| 储罐、泵组、阀门、管线/管架 | **通过（程序化）** | l3 双罐、泵体/电机/出口阀、泵送管线；`phase05-05/06` |
| 罐体剖面/外观 | **通过** | `罐体剖面` 切换罐壁透明度；`phase05-06` |
| 液位/气相空间 | **通过** | 0–100 滑块；`fixed_roof_tank.level=0.55`；页面显示油气空间 |
| 泵送/暂停/重播/路径 | **通过** | 泵送粒子、方向、暂停/重播；`phase05-06` |
| 外浮顶非零排放 | **通过** | 顶部提示“减少油气空间，不等于零排放”；文案不换算排放 |
| 总览→近景→返回 | **通过** | 真实 CDP 指针+HTML 按钮；`phase05-03a`、`phase05-03`、`phase05-03b`、`phase05-04`；快速退出计时器测试通过 |
| 交互矩阵 ≥3 | **通过** | `production-storage-experience.md` §3/§4，5 个矩阵 |
| 真实截图 ≥6 | **通过** | 10 张 1440×900 |
| 实时连续录屏 | **通过** | `production-storage-continuity.mp4`，1440×900，71.55s |
| 五关回归 | **通过** | E2E l1–l5 通过；17 devices |
| 深链/章节/塔页 | **通过** | navcheck 退出 0 |
| 阶段 06 塔 | **不适用** | 未开始 |

## 3. 修改文件

- 修改：`web/levels/l2.js`、`web/levels/l3.js`、`web/world/registry.js`（`transfer_pump`）、`web/immersion.js`（泵 overview 绑定）、`web/sandbox.html`（版本）。
- 新增：
  - `tools/blender/build_separator_hero.py`
  - `assets-source/blender/separator_hero.blend`
  - `web/assets/separator/separator.obj/.mtl/.glb/README.md`
  - `docs/production-storage-experience.md`
  - `docs/phase-reports/evidence/phase-05/*`
  - `tools/phase05-verify.cjs`、`tools/phase05-record.cjs`
- 修改文档：`CHANGELOG.md`、`scene-map.md`、`device-state-contract.md`、`interaction-spec.md`、`asset-gaps.md`。
- 未修改：阶段 06 塔代码；AI `/api/*` 未调用。

## 4. 执行命令与结果

```bash
"D:\tools\blender\blender-4.5.16-windows-x64\blender.exe" -b -P tools/blender/build_separator_hero.py
# -> 7,364 tris; 43 meshObjects; 3,790 verts; OBJ 495,915 B; GLB 391,188 B; .blend 1,119,702 B

node --check web/levels/l2.js        # exit 0
node --check web/levels/l3.js        # exit 0
node --check web/world/registry.js   # exit 0
node tools/phase05-verify.cjs        # exit 0; 暂停/单步粒子、三相完整路径、DOM 按钮、真实 pointer
node tools/phase05-record.cjs        # exit 0; 71.55s; 4,312,470 B
node .../level-e2e-rev2.cjs          # l1–l5 exit 0
node .../navcheck.cjs                # #stage=0..4/章节/塔页 exit 0
```

真实断言：`devices=17`；l2 `assetLoaded=true`、`struct half`、`running`；l3 `stage=store`、`zone=storage`、`level=0.55`、`pumpRunning=true`、`__auditErrors=[]`。

## 5. 证据

| 证据 | 结果 | 路径 |
|---|---|---|
| 分离器外部 | 通过 | `docs/phase-reports/evidence/phase-05/phase05-01-separator-external.png` |
| 分离器内部 | 通过（教学低模/半壳） | `phase05-02-separator-internal.png` |
| 错误去向 | 通过 | `phase05-03a-wrong-target.png` |
| 出口选择 | 通过（真实 pointer） | `phase05-03-outlet-choice.png` |
| 返回集输总览 | 通过 | `phase05-04-back-overview.png` |
| 储罐外部 | 通过 | `phase05-05-storage-external.png` |
| 罐体剖面/泵送 | 通过 | `phase05-06-storage-cut.png` |
| 外浮顶 | 通过 | `phase05-07-floating-tank.png` |
| 返回储运总览 | 通过 | `phase05-08-storage-overview.png` |
| 连续录屏 | 通过 | `production-storage-continuity.mp4`（71.55s, 1440×900） |
| 断言 | 通过 | `phase05-verify.json` |
| Hero 检查视图 | 通过 | `asset-front/side/45/internal/internal-side.png` |
| Hero 清单 | 通过 | `separator-asset-manifest.json` |

## 6. P0 / P1 / P2

### P0（未关闭则不得 PASS）

- **P0-GOV-01 未关闭（流程门禁）。** 阶段 04 handoff 仍为 `待用户签收`；阶段 05 仍为 `待用户签收`。Agent 不能代签，因此在用户本人明确签收前，阶段 06 必须 BLOCKED。
- 分离器/储罐/泵送的实现 P0 已修复；资产和交互证据见下。

### P1

- P1-01 分离器内部是教学低模（圆柱切片液层/挡板），不是工程级内部；网页用半透明壳体保证可读，`.blend` 保留半壳剖切。
- P1-02 储罐仍是 l3 程序化几何，不是独立 Hero `.blend`；浮盘/密封细节为最低可读。
- P1-03 泵送路径是本地区段示意，未把每米管线接到全球 `path_store_refine`。
- P1-04 储罐/泵组在部分镜头仍偏小；视觉细节和标签层级可继续整理。
- P1-05 资产对外再分发许可仍需权利人书面确认。

### P2

- 真实浏览器 FPS/内存长跑、跨浏览器、移动端、N=5 用户测试：未执行。
- AI `/api/ask`/生成闭环：阶段 08，未执行。
- 储罐独立 Hero `.blend`、分离器焊缝/法兰/内部流场纹理：后续资产轮。

## 7. 资产与许可

- 分离器：`separator_three_phase`，项目内 Blender 4.5.16 自产；无第三方贴图/字体。对外再分发需确认。
- 储罐/泵组：l3 程序化几何，不是 Hero 资产；不能称为最终视觉资产。
- 语义节点/尺度/锚点：见 `separator-asset-manifest.json`、`web/assets/separator/README.md`。
- 最小资产门禁：**通过（内部结构/语义/网页证据）**；视觉质量标 P1，不宣称专业资产完成。

## 8. 设计—研发追踪

- zoneId/stageId：`gathering`/`gather`；`storage`/`store`
- objectId：`three_phase_separator`、`fixed_roof_tank`、`floating_roof_tank`、`transfer_pump`
- levelId：l2/l3
- knowledgeId：`kb_gather`、`kb_store`
- actionId：`inspect_separator_structure`、`start_separation`、`pause_separation`、`step_separation`、`replay_separation`、`choose_outlet`、`assign_outlet_target`、`inspect_tank_structure`、`change_liquid_level`、`start_pump`、`pause_pump`、`replay_pump`
- API/深链/fallback：不调用 `/api/ask`/`/api/gen`；五关和 `#stage=0..4` 保留。

## 9. Agent recommendation

- 建议：**技术项 PASS；阶段 06 BLOCKED（等待用户签收阶段 04/05）**
- 理由：同一 objectId/状态源、分离器内部/三相路径/出口、储罐液位/剖面、泵送路径/暂停重播、10 张真实截图和 71.55s 连续录屏、五关回归均有实际证据。
- 未关闭项：视觉细节、储罐独立 Hero、全球管线连接、性能/用户测试/跨浏览器属后续；不阻塞本阶段技术 PASS。

## 10. User acceptance

- 状态：**待用户签收**
- 用户原话：未填写（不得代签）
- 日期：未填写

## 11. 停止声明

- 本阶段是否停止：**是**。
- 下一阶段是否允许开始：**否**；等待用户明确签收阶段 05 后才执行 `06_REFINERY_TOWER.md`。
- 等待事项：用户签收；阶段 06 塔全剖/馏分/城市交付/性能与视觉深化。
