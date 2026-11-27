# Phase 05 · 自动化验证体系

> 对应方案：《石油科普智能体 3D 模型优化实施方案 V1.1》§Phase 5
> 依赖：Prompt 01（资产契约）、02（L4 语义）、03（连接切片）、04（L2 状态机）
> 基线提交：`dev` @ `2cc8253`
> 执行时间：2026-11-27

---

## 结论：**PASS**

已把前四阶段的能力变成**可重复、能失败、可复现**的工程门禁。

| 门禁 | 命令 | 实测 |
|---|---|---|
| 资产 + 连接 | `npm run validate:assets` | 退出 0（2 Manifest + 1 连接） |
| 资产非法 fixture | `npm run validate:assets:fixtures` | 退出 0（全部符合期望） |
| 发布门禁 | `validate:connections:strict` | 退出 **1**（当前 draft，符合预期） |
| 单元 / 契约 | `npm test` | **130/130** |
| 浏览器冒烟 | `npm run test:smoke` | **14/14**，退出 0 |
| 关卡 E2E | `npm run test:e2e` | **84/84**（L2 32 · L4 19 · L3 33），退出 0 |

**测试量：130 单元/契约 + 14 冒烟 + 84 关卡 E2E = 228 条断言。**

---

## 一、先盘点，复用而非另起炉灶

| 项 | 现状 | 决策 |
|---|---|---|
| 测试框架 | 已有 `node:test`（87 个用例） | **复用**，不引入 Jest/Vitest |
| Schema 校验 | 已有 AJV 8.20.0 | **复用**（Prompt 01 选定） |
| 浏览器 E2E | 无 | 引入 **playwright-core@1.65.1**（不下载浏览器，驱动本机 Chrome 158） |
| 构建阶段 | **无** `build` 脚本（纯静态站点，dev server 直接服务 `web/`） | **不虚构**，标 `NOT_APPLICABLE` |
| Node 版本 | `engines: node>=22`，实跑 v22.20.0 | 未改动 |
| CI | `.github/workflows/validate-assets.yml` | 增补 `npm test`；浏览器 E2E 不进 CI |

没用 Playwright 自带的 download 浏览器，是因为机器上已有 Chrome 158 且 CI 无 GPU —— 下载 200MB 浏览器只为跑软件渲染没有收益。

---

## 二、覆盖矩阵（对照方案 A–E）

### A. 资产契约 —— 由校验器实现 + fixture 强制

校验器 `tools/validate_assets.mjs` 已实现全部所需错误码，本阶段补的是**能让它们真的失败的用例**：

| 要求 | 错误码 | 覆盖方式 |
|---|---|---|
| nodeUid 缺失 | `SCHEMA_REQUIRED` | 既有 fixture |
| nodeUid 重复 | `DUP_NODEUID` | 既有 fixture |
| Manifest 引用不存在节点 | `MISSING_NODE_REF` | 既有 fixture |
| 未知节点无 support 声明 | `NODE_NOT_IN_GLB` / `UNREGISTERED_GLB_NODE` | 既有 fixture |
| **GLB extras 与 Manifest 不一致** | `EXTRAS_OBJECTID_MISMATCH` | **新增**（临时变异真实 tower manifest） |
| **assetVersion/hash 与文件不一致** | `GLB_HASH_MISMATCH` / `GLB_BYTES_MISMATCH` / `GLB_MISSING` | **新增** |
| support 声明非法 | `SUPPORT_ALSO_NODE` / `SCHEMA_*` | **新增** |
| anchor 指向不存在 object | `MISSING_OBJECT_REF` | **新增** |

新文件 `tests/asset-glb-contract.test.mjs`（8 项）：在临时目录里对**真实 tower manifest** 做单点变异再交给校验器，避免把 1MB manifest 复制进仓库。含**阳性对照**（原样副本必须通过），证明测试不会恒真。

### B. Connection —— 19 项契约测试

`tests/connections-contract.test.mjs` + `tests/fixtures/connections/`（1 合法 + 13 非法）：

| 要求 | fixture | 实测错误码 |
|---|---|---|
| connectionId 重复 | `dup-connection-id.json` | `DUP_CONNECTION_ID` |
| from/to anchor 缺失 | `missing-anchor.json` | `MISSING_ANCHOR` |
| coordinateSpaceId 不存在 | `bad-space.json` | `CONN_SPACE_MISMATCH` |
| coordinateSpaceId 与 Manifest 不一致 | + `manifest-override/` | `SPACE_MISMATCH` |
| basis 违规（approved 缺审核人） | `basis-draft-approved.json` | `SCHEMA`（schema allOf 先拦） |
| basis 矛盾（approved + pendingBasis） | `basis-contradiction.json` | `SCHEMA` |
| basis rejected | `basis-rejected.json` | `BASIS_REJECTED` |
| waypoints 坐标非法（非 3 元） | `bad-waypoint.json` | `SCHEMA` |
| waypoints 非有限值（`1e999`→Infinity） | `bad-waypoint-nonfinite.json` | `BAD_WAYPOINT` |
| waypoint 与端点重合 | `waypoint-dup-endpoint.json` | `WAYPOINT_DUP_ENDPOINT` |
| anchor owner 与端点不符 | `anchor-owner-mismatch.json` | `ANCHOR_OBJECT_MISMATCH` |
| geometryRefs 不存在 | `geometry-ref-not-found.json` | `GEOMETRY_REF_NOT_FOUND` |
| GLB 无该 connectionId | `no-geometry.json` + 空 GLB 副本 | `NO_CONNECTION_GEOMETRY` |
| GLB 有多余连接几何 | `unlisted-geometry.json` | `UNLISTED_CONNECTION_GEOMETRY` |
| 发布门禁 | 真实数据 | 默认 0 / `--strict` **1** |

每条非法用例额外断言**错误码集合与预期完全一致**，证明"只注入了一种错误"。

**"Blender build 与前端使用同一 connection 数据"** 由两条互补证据覆盖：
1. 静态：Phase 3 的单源实测（改 waypoint → bbox 29.298→30.648，前端路径同步，端点零漂移）；
2. 运行时：本阶段 E2E 断言 `handles[0].id === "conn_atm_overhead_to_condenser"`、`particles=18`、`points=3`，且该校验器 **从 GLB 反查 `connectionId`** 并要求与前端数据闭合（`NO_CONNECTION_GEOMETRY` / `UNLISTED_CONNECTION_GEOMETRY` 两个方向都测）。

### C. L2 —— 契约测试 + 浏览器断言

- `tests/l2-structure.test.mjs`（10 项，Phase 4 已加）：三态显隐、`half` 必有真实切面节点、**解析 OBJ 证明半剖是真的**、不要 ghost 冒充。
- E2E：三模式 `structureProbe()` 各 0 违规、**连续 20 轮 × 3 模式 = 60 次切换 0 失败**、退出重进回 `external`。

### D. L4 —— 浏览器断言

| 要求 | 实测 |
|---|---|
| 重点设备可分别选中 | 8 个 device 各自 `detail` 绑定，detail 分组子节点数 `atmospheric_tower 18 / vacuum_tower 16 / heater 5 / stripper_* 4 / overhead_condenser 11 / reflux_drum 1`，`selectedObjectId` 随选中变化 |
| 未知节点数为 0 或 support 登记 | `validate:assets:strict` 覆盖（`UNREGISTERED_GLB_NODE`） |
| 正则不再是设备归属权威 | `tests/l2-structure.test.mjs` 断言 `l2.js` 不再用名称前缀；L4 的身份来自 `tower.manifest.json` 的 `objects[]`（E2E 现场 fetch manifest 比对 8/8） |
| 连接与粒子引用 connectionId | `handles[0].id` 匹配 `/^conn_/`，`particles=18`，`summary.renderable=true` |

### E. L3 业务回归 —— 6 项（按当前主线规则）

`tests/l3-rules.test.mjs`：

| 要求 | 断言 |
|---|---|
| 液位 70% 即完成 | 完成判定恰好出现 2 处且都是 `level >= 0.70`；**无其它阈值**（防某个入口改成 80%） |
| 不启动泵送仍完成 | `complete()` 不读 `pumpRunning/pumpPaused`，完成判定行不含 pump 条件 |
| 不要求先观察两个罐型 | 完成判定与 `complete()` 都不读 `observedTanks` |
| 每次进入复位 | `enter()` 含 `level=0.02` / `pumpRunning=false` / `pumpPaused=false` / `completed=false` / `selectedTankId='fixed_roof_tank'` / `observedTanks` 清空 / 滑块回 `'2'` |
| 重置清除节点完成状态 | `mission.reset()` 遍历 `STEP_DEFS` 调 `setNodeDone(i,false)` |
| 完成时记账 | `complete()` 写教学账本 + `setNodeDone(2,true)` + UI `done` |

浏览器侧再验一遍：进关 `level=0.02 / pump=false / completed=false / 固定顶罐`；**不启泵**把液位推到 70% → `completed=true`、按钮变"完成，返回总览 →"、`pumpRunning` 全程 `false`；退出重进全部回到初态。

---

## 三、浏览器 E2E 说明（按方案第四节要求）

| 项 | 值 |
|---|---|
| 浏览器 | Google Chrome **158.0.8127.88**（`playwright-core` 驱动，`executablePath` 指向本机 Chrome） |
| 视口 | **1440×900 CSS px** |
| DPR | **1** |
| WebGL | `webgl2` / `WebGL 2.0 (OpenGL ES 3.0 Chromium)`，ANGLE + **SwiftShader 软件光栅** |
| 资产版本 | tower.glb `e9aca088…`（4,033,676 B）、separator.glb `e41799c4…`（403,472 B）、连接数据 `web/data/process-connections.json`（详见 `summary.json` 的 `assets`） |
| 渲染证据 | `calls=293, triangles=85,392, geometries=478, textures=8` |
| 网络 | 同源 50 请求，**0 个 4xx/5xx**；console errors 0 / pageErrors 0 / requestFailed 0 |

**明确声明**：headless + SwiftShader 只能证明"场景能渲染出帧"，**不代表 GPU 性能**。实测 headless rAF 仅约 5 fps，因此测试里没有任何按 60 fps 假设的时间断言。

**断言方式**：全部用只读调试 API 与 DOM，**没有一处用固定截图 hash**。
- L2/L4：只用只读 API（`__l2.structureProbe()`、`__l4Connections`、`PETRO_DEVICE_STATE.snapshot()`）
- L3：`__l3` 未暴露 `selectedTankId` getter，罐型改读 DOM `#l3-state` 文本 + `#l3-fixed/#l3-float` 的 `aria-pressed`；液位读 `#l3-level.value` 与 `#l3-pct`
- 截图仅作视觉复核，不参与判定

---

## 四、证据目录

`docs/3d-model-optimization/evidence/phase-05-2026-11-27/`

| 文件 | 内容 |
|---|---|
| `meta.json` | commit SHA `2cc8253…`、分支、dirty 状态、Node/npm/平台、**7 个资产文件的 sha256 + 字节数** |
| `summary.json` | 每条门禁的退出码、测试计数、NOT_RUN 说明、截图清单、浏览器/视口/DPR |
| `validate-assets.log` / `-fixtures.log` / `-connections.log` / `-connections-strict.log` | 校验日志（strict 日志记录的是**退出码 1** 的预期失败） |
| `npm-test.log` | 130/130 |
| `e2e-smoke.log` / `e2e-levels.log` | 14/14、84/84，含每条断言的 expected/actual |
| `smoke/sandbox.png` | 首页/沙盘 |
| `levels/l2-external.png` `l2-half.png` `l2-ghost.png` | L2 三态 |
| `levels/l3-initial.png` `l3-completed.png` | L3 初态与 70% 完成 |
| `levels/l4-connections.png` | L4 塔顶连接与粒子 |
| `PRE-FIX-FAILURE.md` | **修复前真实失败的输出摘录**（见 §六） |

---

## 五、验收对照

| # | 要求 | 结果 | 证据 |
|---|---|---|---|
| 1 | 全新安装依赖后命令可运行 | ✅ | `npm ci` 后 `npm test` 130/130、`validate:*` 全绿；playwright-core 已入 devDependencies（`package-lock.json` 已更新） |
| 2 | 正常 fixture 全部通过 | ✅ | `valid.json` → 0；真实 manifest 原样 → 0（阳性对照） |
| 3 | 非法 fixture 必须失败 | ✅ | 13 个连接 fixture + 7 个资产变异，全部非 0 且命中**具体**错误码 |
| 4 | 进入 L2/L4/L3 完成关键断言 | ✅ | 84/84 |
| 5 | 报告可复现，未执行项标 NOT_RUN | ✅ | `summary.json.notRun`：`npm run build`（无构建阶段）、GPU 性能、CI 浏览器 E2E |
| 6 | CI 存在且不把软件 GPU 当性能 PASS | ✅ | CI 只跑 node 级门禁 + `npm test`；注释与报告都写明 headless WebGL ≠ GPU 性能 |

---

## 六、必须说明的三件事（不掩盖）

### 6.1 E2E 第一次独立运行是**失败**的，我修好了才 PASS

E2E 由子代理产出，其自述为"84/84 全绿"。我按规矩独立重跑：

```
LEVEL.L2: 26/27 passed, 1 failed
LEVEL.L4:  0/1  passed, 1 failed
LEVEL.L3:  0/1  passed, 1 failed
TOTAL: 26/29 passed      exit 1
FAILED: ... {"error":"等待超时：stage.isLevel() === false（exit 动画结束）"}
```

根因：关卡退场动画靠 `requestAnimationFrame` 推进，headless 下窗口被判为后台/遮挡时 rAF 被降频甚至停顿，`exit()` 永远走不完。修复是给 Chrome 加三个标准开关（`--disable-background-timer-throttling`、`--disable-renderer-backgrounding`、`--disable-backgrounding-occluded-windows`），复跑 84/84、exit 0。

**这件事反而证明了测试不是恒真**：它真的会因为环境问题失败，而不是"写完就绿"。原始失败输出存为 `PRE-FIX-FAILURE.md`。

### 6.2 有些错误码在当前 schema 下不可达（防御性死代码）

- `BASIS_UNAPPROVED` / `BASIS_CONTRADICTION`：schema 的 `allOf` 先拦（approved ⇒ 必须有 `reviewedBy`/`reviewedAt` 且 `pendingBasis=false`），校验器在 schema 阶段提前返回。测试断言的**实际**拦截层是 `SCHEMA`，并校验具体报错路径。
- `BAD_SUPPORT_UID`：schema 的 `uuidV5` pattern 先拦，同理。
- `ENDPOINT_DRIFT`：端点恒取自 Manifest 锚点、`displayOffset` 对两端一致施加，构造上不可能偏离，**未建 fixture**（不假装测过）。

这些在 `tests/fixtures/connections/README.md` 与测试注释里都写明，没有伪造成"测过"。

### 6.3 NOT_RUN / NOT_MEASURED

| 项 | 状态 | 原因 |
|---|---|---|
| `npm run build` | **NOT_APPLICABLE** | 仓库无构建阶段（纯静态站点），未虚构一个假 build |
| GPU 性能 | **NOT_MEASURED** | 本机仅 AMD 集显；headless 为 SwiftShader 软件渲染。任何帧率/吞吐数字都不可用于性能验收 |
| CI 中的浏览器 E2E | **NOT_RUN** | CI 无 GPU / 无本机 Chrome；CI 只跑 node 级门禁。浏览器 E2E 在本机执行并留证 |
| `tower.html` 连接消费 | 未测 | Phase 3 已登记未接入 |

---

## 七、禁止项自查

| 禁止 | 是否触犯 |
|---|---|
| 删除失败用例或降低断言掩盖 bug | 否。反而**公开了修复前的真实失败**（§6.1），并保留阳性对照防恒真。 |
| 用固定截图 hash 代替结构测试 | 否。全部断言走只读 API / DOM；截图只作复核。 |
| 改 L3 业务阈值 | 否。`l3.js` 一行未改；`tests/l3-rules.test.mjs` 反而把 70% 与"不依赖泵/罐型"钉死。 |
| 把 CI smoke 写成 GPU 性能验收 | 否。CI 不跑浏览器；报告与脚本输出均写明 headless WebGL ≠ 性能。 |

---

## 八、后续建议

1. **CI 里补一个"结构门禁"job**：现在浏览器 E2E 只在本地跑，若要走 CI 需装 `--with-deps chromium`，但仍只能当功能冒烟。
2. **把 `ENDPOINT_DRIFT` 与 basis 语义码变成可达**：要么放宽 schema 顺序、要么在 schema 层给更具体的关键字映射，否则这些码长期是"永远不触发"的代码。
3. **L3 补 `selectedTankId` getter**：现在 E2E 只能读 DOM 文本，脆弱；暴露只读 getter 后断言可全部走 API。
4. **性能测量补齐**：需要一台有独显的机器按方案的单列指标表实测，在此之前性能保持 NOT_MEASURED。
