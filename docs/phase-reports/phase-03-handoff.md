# Phase 03 交接报告 · 世界骨架（rev3 契约返修）

日期：2026-11-23
阶段：03_SCENE_SKELETON（返修轮 3）
状态建议：**PASS（阶段 03 技术范围）**
用户签收：**阶段 03 待用户签收**；阶段 02 已由用户签收 **ACCEPTED**
起始 Commit：`4cf1ba430eec37679d136f8afbcc243100fc9064`（rev2 最终记录）
结束 Commit（真实 SHA）：`9d66a4381196ed20e469ed9f488d3db747de7cb1`（本报告内容提交；最终 tag `phase-03-rev3`）
分支：`main`

## 1. 本轮审查处理

用户 2026-11-23 复核判定 `REVISE`。本轮只做定向修订，不扩建 Hero/后端：

| 审查项 | 处理 | 结果 |
|---|---|---|
| P1-01 `focusZone('subsurface')` 上下文仍是 oilfield | `syncSceneContext(index, objectId, action, explicitZoneId)` 接受显式 zone；设备 zoneId 优先；`focusZone` 传真实 zone；仅无显式 zone 且 index=0 时默认 oilfield | **已修复** |
| P1-02 `enterDetail` 上下文没有设备 | 进入近景后以 objectId + 设备注册表 zoneId 再 `syncSceneContext`；Store 与 context 同源；退出恢复进入前选择/上下文 | **已修复** |
| P1-03 context 破坏只增不删/history | 以旧 context 为基底增量更新；保留 `scene/stage/object/knowledge/mode` 别名；`stage` 保留索引语义；interaction 保留 action/value/unit 并新增 actionId/result；history 跨 stage/zone/device 保留（最多 12 条） | **已修复** |
| P1-04 分离器“送进各自的罐” | 改为油相→储运、气相→回收/处理（特定工况可能火炬）、采出水→水处理；同步 LEVEL_BRIEF、导览、设备卡、关卡、章节/AI 搜索 | **已修复** |
| P2-01 `reset()` 不恢复 overviewVisible | `reset()` 先 `overviewVisible=true`，逐设备 apply；新增 getter 断言 | **已修复** |
| P2-02 地下文案重复 | “很多油藏中的油藏在…” → “很多油藏中的石油赋存在…” | **已修复** |
| P2-03 phase02 任务行仍写未执行 | §2 改为“已执行 / ACCEPTED（整段签收；未逐项勾选）”，保留 Agent REVISE 技术建议 | **已修复** |
| 额外发现：异步 Hero 替换后表示失绑 | `bind` 幂等；`loadHeroAsset`/`loadAnimatedPumpjack` 完成后重新绑定新树；13/13 设备有实际 overview 表示 | **已修复** |

## 2. 当前代码行为

### 2.1 `__sceneContext` 契约

```text
sceneId: oil_industry_journey        scene: 同 sceneId（旧别名）
registrySceneId: petro-chain-v3
stageId: drill|gather|store|refine|use
stage: 0..4（旧别名，保留索引语义）
zoneId: subsurface|oilfield|gathering|storage|refining|city
selectedObjectId / object: 同一 objectId
deviceName
knowledgeIds / knowledge: 数组 / 首项
experienceMode / mode
levelId
interaction: {action, value, unit, actionId, result}
history: 最近 12 条
```

- `focusZone('subsurface')` → `zoneId=subsurface, stageId=drill, stage=0`；
- `focusZone('oilfield')` → `zoneId=oilfield, stageId=drill`；
- `enterDetail('three_phase_separator')` → context + Store 均为 `three_phase_separator`，`zoneId=gathering`，`deviceName=三相分离器`；
- 返回后恢复进入前 stage/章节/任务面板/context/选择；清空选择不重置结构/动画；
- `setInteraction` 追加 history，保留旧行动作字段，`result` 未确定时为 `null`。

### 2.2 设备表示

- `bind()` 幂等；后绑定 detail 立即继承状态。
- `loadHeroAsset` 异步替换后对新的 Hero 树重新绑定；解决分离器/浮顶罐旧 shell 已移除、新树无 logicalObjectId 的失绑。
- 13/13 设备有实际可见 overview 表示；`setOverviewVisible(false)` 实测所有 13 个逻辑设备表示隐藏，detail 仍可见；`reset()` 恢复 overviewVisible=true。
- `reset()` 仍是完整场景 reset；阶段 04–06 若需“只重置设备”另立 API，不改变当前语义。

## 3. 验证命令与结果

```text
node --check web/immersion.js / web/world/state.js / web/levels/l2.js -> exit 0
HTTP sandbox/chapter/tower/... -> 200
Chrome 157 headless CDP（1440×900）:
  zones=6, devices=13, logical overview objects=13
  focusZone('subsurface') -> zoneId=subsurface, stageId=drill, stage=0
  focusZone('oilfield') -> zoneId=oilfield, stageId=drill
  enterDetail(separator/tank/tower) -> context+Store 同名、zone/deviceName 正确
  2 interactions -> 切换区域/设备/近景前后 history 仍为 2 条
  13/13 actual overview hidden failures=0; reset overviewVisible=true
  __auditErrors=[]
五关 E2E（真实浏览器）:
  l1 adjust_pressure / l2 choose_outlet / l3 change_liquid_level /
  l4 choose_fraction / l5 select_product；均 interaction 写入，退出后 levelId=null
深链/章节/塔页/fallback:
  #stage=0..4 -> drill/gather/store/refine/use
  chapter.html?id=store -> 储运调配；回链 sandbox.html#stage=2
  tower.html -> __tower.loaded=true
  canvas webglcontextlost -> sandbox/tower 均显示 2D fallback 文案
```

## 4. 证据

- 截图：`overview-1440.png`、`overview-1920.png`、`subsurface/oilfield/gathering/storage/refining/city-1440.png`
- 录屏：`detail-continuity-1440.mp4`（相机级；不是高模 detail 验收）
- 状态：`state-contract.json`（bind/select/可见性/reset/图层）
- 上下文：`context-contract.json`（zone/detail/alias/interaction/history）
- 五关：`level-e2e.json`
- fallback：`fallback.json`
- README：`docs/phase-reports/evidence/phase-03/README.md`

## 5. P0 / P1 / P2

### P0

- **无阶段 03 技术 P0 剩余。**
- 阶段 02 用户签收：**ACCEPTED**（2026-11-22，用户原话 `签收阶段02。`；任务行已改为已执行/ACCEPTED，Agent 技术建议仍为 REVISE）。
- Hero Asset Gate：**未来阶段 BLOCKED**（04 地下、05 分离器、06 塔；09 全局来源/许可/网页证据），不是阶段 03 P0。

### P1

- 本轮 P1-01–P1-04 已关闭，证据见 §3/§4。
- 不把“本轮未复跑 FPS/跨浏览器”写成通过。

### P2（后续）

- P2-01 视觉仍偏低模展台；阶段 04–07 做地形过渡、台面边缘、远景/光照层次，不推翻坐标。
- P2-02 性能仅单场景快照（142 calls / 52,892 tris），阶段 09 做 FPS/内存长跑与切换泄漏。
- P2-03 Blender 可执行文件未定位，`.blend→.glb` 未实跑；阶段 04 前必须验证。
- P2-04 AI 面板已挂载，`/api/ask`/`/api/gen` Key/代理降级未测试；阶段 08 验收。
- P2-05 真实用户测试/跨浏览器/移动端不在阶段 03 范围。
- P2-06 fallback 测试是运行时 context-loss 触发，不扩大为“所有无 WebGL 冷启动已测”。

## 6. 验收矩阵

| 验收项 | 判断 | 说明 |
|---|---|---|
| 六区连续产业链骨架 | **通过（骨架）** | 坐标/高差/路径未回退；低模视觉列 P2 |
| 设备注册表 | **通过** | 13 objectId/zone/stage/knowledge/camera 一致 |
| 区域相机 | **通过** | 注册表 CAMERAS；显式 zoneId 同步 |
| 设备 Store bind/select/可见性 | **通过** | bind 即时应用、切换重置、13/13 实际表示、reset |
| detail 进入/退出 | **通过（相机/上下文）** | context+Store 一致；返回恢复；高模 detail 待 04–06 |
| `__sceneContext` 兼容 | **通过** | 旧别名、interaction 扩展、history 跨场景 |
| 场景图层 | **通过** | environment=4 等断言 |
| 五关与深链 | **通过** | l1–l5 E2E；#stage 0–4、章节、塔页 |
| 科学表达 | **通过** | 分离器三向分流修正；旧表述检索清理 |
| 无 API/2D fallback | **通过（范围）** | 静态页/context-loss fallback；冷启动不扩大 |
| Hero Asset Gate | **未来阶段 BLOCKED** | 04/05/06 分别验收 |
| 阶段 02 用户签收 | **ACCEPTED** | 记录一致 |
| 阶段 03 用户签收 | **待用户签收** | 仅用户本人签收后才能进入 04 |

## 7. Agent recommendation

**PASS（阶段 03 技术范围）。**

本轮审查指出的上下文 zone/object 同步、向后兼容/history、分离器文案、reset 可见性均已修复并有浏览器证据；额外修复了异步 Hero 替换导致的表示失绑。Hero 仍按 MASTER 归阶段 04–06，视觉门禁 `BLOCKED` 不属于阶段 03 当前 P0。

## 8. User acceptance

- 阶段 02：**ACCEPTED**；用户原话 `签收阶段02。`；日期 2026-11-22。
- 阶段 03：**待用户签收**；Agent 不代签。
- 阶段 04：**未开始**；必须取得阶段 03 用户签收后，按阶段 04 Prompt 单独启动。

## 9. 停止声明

**阶段 03 rev3 已停止，等待用户签收；不执行阶段 04。**
