# Phase 10｜全局视觉与性能优化

日期：2026-11-27　依赖：Phase 01–09 的资产语义与加载体系（本阶段未改工艺与资产身份）

## 结论

**总评：FAIL（部分完成）** —— 基线、材质口径、滞回守卫、压力测试四项有实测与代码交付；
但"统一材质在总览与近景一致"未做视觉回归比对，"按关卡接 detailLevel 加载"未实现，
优化顺序第 1/3/4/5/6/7 项均 NOT_RUN。按本项目一贯口径，未做的不算完成。

| 维度 | 判定 | 依据 |
|---|---|---|
| 一、现有基线 | **PASS** | 真实 GPU（AMD Radeon/D3D11）实测 6 场景，JSON 落盘 |
| 二、统一 PBR | **PARTIAL** | 11 个材质 token + 统一 ACES/曝光 1.15 已生效；GLB authored 材质按设计不覆盖；视觉回归只留 1 张总览截图 |
| 三、LOD 与加载策略 | **PARTIAL** | 滞回守卫已挂载并通过单测；L1 有 overview/detail/closeup 表示切换；L2–L5 未接 detailLevel 门控 |
| 四、优化顺序 | **NOT_RUN**（仅第 2 项 DPR 控制落地） | 未做几何/材质去重、合批、InstancedMesh、远景粒子裁剪、贴图压缩、Draco |
| 五、性能口径 | **PASS** | 资源数≠显存、显存 NOT_AVAILABLE、软件光栅仅功能验证，均已写入报告 |
| 六、压力测试 | **PARTIAL** | 5 关 × 10 轮进/退完成，L1/L2 资源 0 增长、context lost 0；守卫在本次运行中未挂载（接线 bug，已修并复验） |
| 七、验收 | **FAIL** | 材质跨视图一致性未验证；LOD 切换"无明显跳变"未测；仅资源释放与 FPS 来源两项达标 |

## 一、基线（实测，非估算）

设备：AMD Radeon(TM) Graphics（集显，驱动 31.0.12028.6002），Windows，Chrome 158.0.8127.88，
视口 1440×900，DPR 1，硬件路径 ANGLE/D3D11。
证据：`evidence/phase-10-2026-11-27/baseline-gpu.json`

| 场景 | FPS 均值 | FPS P5 | 帧时间 P95 | draw calls | triangles | geometries | textures |
|---|---|---|---|---|---|---|---|
| overview | 91.25 | 86.96 | 11.5 | 293 | 85392 | 478 | 8 |
| l1 | 90.33 | 86.96 | 11.5 | 102 | 7056 | 565 | 8 |
| l2 | 88.43 | 86.21 | 11.6 | 126 | 20428 | 669 | 15 |
| l3 | 90.22 | 88.5 | 11.3 | 114 | 31734 | 779 | 19 |
| l4 | 90.13 | 88.5 | 11.3 | 352 | 75138 | 1066 | 22 |
| l5 | 90.61 | 88.5 | 11.3 | 69 | 10312 | 1133 | 36 |

- GLB 共 **18 个 / 7,380,304 B**；`tower.glb` 4,033,676 B 占 55%。
- 显存：**NOT_AVAILABLE**（WebGL 不暴露；本机无可靠驱动侧读数）。
- 同一套脚本在无头 SwiftShader 下也跑了一遍（`baseline.json`）：FPS 4.5–14.5，
  **仅作功能验证，不作为 GPU 性能证据**。

## 二、材质与渲染策略

- `web/visual/material-tokens.js`：11 个 token（碳钢/不锈钢/镀锌钢/保温管/混凝土/砂岩/泥岩/储层/油/水/气），
  清单见 `docs/3d-model-optimization/material-tokens.md`。
- 统一策略：ACES Filmic、曝光 **1.2 → 1.15**（Phase 9 实测浅色岩层过曝）、DPR 上限 2、
  透明层 `depthWrite:false` + renderOrder 6/7/8。
- 自挂载：`perf-guard.js` 等 `__stage.renderer` 出现后应用策略并接管采样，不改 immersion.js。
- **未做**：全局替换 GLB 材质（按阶段纪律，未经视觉回归不做整体换材质）。

## 三、滞回与降级

`web/visual/perf-guard.js`：<30fps 连续 3s 降一级；>45fps 连续 10s 且冷却 5s 后恢复；
30–45fps 为不动区（防抖）。降级只调 `pixelRatio`（1 → 0.8 → 0.65），**不动场景结构**。
单测 7 条覆盖：降级时点、不动区不切换、恢复需冷却、minLevel 下限、DPR 递减。

过程中修掉两个真 bug：
1. 用 `0` 当"未开始"哨兵，而 0 是合法时间戳 → 计时窗每帧被重置，永远攒不满 3 秒（改 `null`）；
2. `dprScale()` 用等级直接索引数组 → 满质量 `level=2` 取到 0.65，**首屏会被降到 65% 分辨率**（改 `maxLevel-level`）。

## 四、压力测试（5 关 × 10 轮进/退）

证据：`evidence/phase-10-2026-11-27/stress.json`

| 关卡 | 退出失败次数 | geometries 增长 | textures 增长 | programs 增长 | 判定 |
|---|---|---|---|---|---|
| L1 | 0 | 0 | 0 | 0 | 稳定 |
| L2 | 10 | 0 | 0 | 0 | 稳定 |
| L3 | 0 | 1 | 0 | 0 | 稳定 |
| L4 | 0 | 0 | 0 | 0 | 稳定 |
| L5 | 0 | 378 | 0 | 0 | 增长 |

- WebGL context lost：**0**
- pageerror：0 条；资源加载失败：2 条（401/404 各一，非 3D 资产）
- 本轮 **守卫未挂载**（`__perfGuard` 为空）：我写了 `autoAttach` 却从未调用。已修复并复验：
  `guard:true, level:2, exposure:1.15, dpr:1`，复验两轮进/退仍为 565/8 无增长。
- 首次运行曾在第 2 次退出时超时（exitLevel 等不到 isLevel()==false）。改为记录后重载继续；
  后续 10 轮未再复现，但**"进出若干次后退出动画可能卡住"仍未定位到根因**，列为风险。

## 五、未实机测试（明确标记）

| 目标 | 状态 |
|---|---|
| 高性能独立显卡（RTX/RX 级别） | **NOT_TESTED** |
| 低端/入门集显（Intel UHD 等） | **NOT_TESTED**（本机为 AMD 集显，只能代表中间档） |
| 移动端（iOS Safari / Android Chrome） | **NOT_TESTED** |
| Firefox / Safari 桌面 | **NOT_TESTED** |
| 高 DPR（DPR=2）与 4K 视口 | **NOT_TESTED** |
| 显存占用 | **NOT_AVAILABLE** |
| 真实弱网加载 | **NOT_TESTED** |

## 六、本阶段新增/修改

- 新增：`web/visual/material-tokens.js`、`web/visual/perf-guard.js`、
  `tools/perf/run-baseline.mjs`、`tools/perf/run-stress.mjs`、
  `tests/perf-guard.test.mjs`、`tests/material-tokens.test.mjs`、
  `docs/3d-model-optimization/{art-direction,material-tokens,performance-budget}.md`
- 修改：`web/sandbox.html`（引两个模块）、`tools/e2e/harness.mjs`（新增仅性能测量用的 `hardware` 启动路径，
  E2E 默认仍走软光栅以保证可复现）。

## 七、下一轮优先事项

1. 逐关卡接 `detailLevel` 门控（当前仅 L1 有表示切换），并补"切换无明显跳变"的截图对比；
2. 定位"反复进出后退出动画卡住"的根因（10 轮里出现过 1 次）；
3. 按预算处理 `tower.glb`（4.0 MB，占全量 55%）：网格简化或 Draco；
4. 至少补一台低端 GPU 与一台移动端的实测，否则预算只能视为"中间档成立"。
