# 阶段 04 · 地下开采体验

日期：2026-11-23  
范围：阶段 03 同一 `petro-chain-v3` 世界、同一注册表、同一 `PETRO_DEVICE_STATE`；不是独立地下 Demo。  
教学边界：本页是**教学示意**，不是真实油藏、真实地质比例、实际岩心扫描、CFD/流场或数值模拟。

## 1. 入口与空间

- 入口：`sandbox.html#stage=0` 的「进入本环节」或地下开采设备标签；仍使用 `__lvlEntry(0, ...)`。
- 空间锚点：沿用阶段 03 `subsurface` 区中心 `[-24, 0, 8]`；近景组 `underground-experience` 挂在该锚点。
- 场景：`stage.baseScene`；进入时隐藏总览环境组 `industry-sandbox`，退出恢复；没有新建第二套 Three.js 场景。
- 镜头：总览机位 → 地下剖面（可拖拽/滚轮自由观察）→ 分层 → 储层/孔隙局部 → 井筒整体/射孔井段 → 沿井筒上行 → 地面井口/集输管线 → 返回总览。
- 每个镜头都可被用户拖拽/滚轮中断；`沿井筒上行` 期间仍允许指针拖拽打断飞行动画。

## 2. 数据与语义

### 2.1 逻辑对象 / 稳定 ID

| objectId | 类型 | 区域 | 近景表示 | knowledgeIds |
|---|---|---|---|---|
| `underground_geology` | 地质剖面（层组） | subsurface | 4 层网格 + 代理锚点 | `kb_formation` |
| `reservoir` | 储层 | subsurface | 储层透镜 + 孔隙示意组 | `kb_formation`, `kb_drill` |
| `wellbore` | 井筒/套管 | subsurface | casing/cement/tubing/perforation | `kb_formation`, `kb_drill` |
| `wellhead` | 井口/采油树 | oilfield | 井口树 + 地面管线起点 | `kb_formation`, `kb_drill` |

- `wellhead` 是阶段 03 已有 ID；本阶段的近景井口绑定同一个 `wellhead`，不是新的逻辑设备。
- 地质层不是独立设备；`underground_geology` 作为层组的逻辑父对象，层名与 `semanticId` 见资产清单。
- 资产对象名（稳定）：`geo_overburden`、`geo_caprock`、`geo_reservoir_layer`、`geo_basement`、`reservoir_lens`、`well_casing`、`well_cement`、`well_tubing`、`well_perforation_00…09`、`wellhead_tree`、`wellhead_valve`、`well_flowline`、`surface_pad`。

### 2.2 `__sceneContext`

进入地下后显式写 `zoneId=subsurface`；选择不同对象时更新：

```text
sceneId/scene = oil_industry_journey
stageId = drill, stage = 0
zoneId = subsurface（地面井口时为 oilfield）
selectedObjectId/object = underground_geology | reservoir | wellbore | wellhead
deviceName、knowledgeIds/knowledge、mode
levelId = l1
interaction = {action,value,unit,actionId,result:null}
history = 最近 12 条，跨阶段/区域保留
```

## 3. Hero Asset

| 项 | 内容 |
|---|---|
| 资产 ID | `underground_hero` |
| Blender 源文件 | [underground_hero.blend](../../assets-source/blender/underground_hero.blend) |
| 生成脚本 | [build_underground_hero.py](../../tools/blender/build_underground_hero.py) |
| 网页运行格式 | `web/assets/underground/underground.obj` + `.mtl`（现有 ObjLite 格式，已核验）；同时导出 `.glb` |
| 单位/朝向/原点 | 米；Blender Z-up，导出 OBJ Y-up；井口/地表中心为局部 `(0,0,0)`；以 1:1 放到 `[-24,0,8]` |
| 尺度 | 18 m × 12 m（水平）× 13.6 m（垂向，含井口） |
| 语义节点 | 见 `underground-asset-manifest.json` 的 `objects`、`anchors`；网页端按对象名映射 `ugLayer/ugPart/objectId` |
| 材质 | 8 个 Principled 材质：上覆/盖层/储层/基底/钢/水泥/琥珀/地表垫层；无第三方贴图 |
| 来源/许可 | 项目自制（Blender 脚本生成）；无第三方纹理；对外再分发需权利人确认 |
| 检查视图 | `asset-front.png`、`asset-side.png`、`asset-45.png`、`asset-wellbore-close.png`、`asset-reservoir-cutaway.png`、`asset-wellbore-structure.png` |
| 网页集成证据 | `phase04-01…09` 截图、`underground-continuity.mp4`、`phase04-verify.json` |

**资产状态：通过最小 Hero 门槛（可编辑源文件 + 语义节点 + 实际网页集成）；细节/断面纹理仍列 P1。**

## 4. 统一设备互动验收矩阵

> 计数规则：每个核心互动都必须有“用户动作 → 可区分状态变化 → 可观察结果 → 原理解释/反馈”。单纯 hover、知识卡、自动播放不计。

### 4.1 地层 / 层组 `underground_geology`

| 字段 | 说明 |
|---|---|
| `objectId` | `underground_geology`（层对象另有 `geo_overburden` 等） |
| 初始状态 | 4 层可见、剖切开启；无选中；镜头在剖面总览 |
| 用户动作 | 点击 3D 岩层；或点击左侧「上覆地层/盖层/储层/基底」按钮；可再次点击恢复 |
| 前置条件 | 关卡 `l1` 已进入；资产已加载；孔隙放大模式下禁止切层 |
| 状态变化 | 点击岩层：`selectedLayer/selectedObjectId` 更新；按钮：对应 `layer.visible` 翻转；剖切时显示内部井筒/储层 |
| 可观察反馈 | 岩层高亮、信息面板名称/解释、按钮 `aria-pressed`、状态行 |
| 知识解释 | `kb_formation`：层序、盖层封闭、储层赋存；强调非真实厚度/数据 |
| 错误/边界反馈 | 隐藏的层不能被 Raycaster 选中；资产加载失败显示备用剖面且明确不能作为资产门禁通过 |
| 重置/恢复 | 「重置观察」恢复四层可见、剖切开启、回总览；退出关卡恢复总览 |
| 可访问替代 | 四个 HTML 按钮，键盘 Enter/Space 可切换；不依赖 3D 点选 |
| AI 上下文 | `sceneId=oil_industry_journey, stageId=drill, zoneId=subsurface, objectId=underground_geology, knowledgeId=kb_formation, interaction=inspect_layer/toggle_layer` |
| 验收证据 | `phase04-01-entry.png`、`phase04-02-strata-toggle.png`、`phase04-03-strata-info.png`、`phase04-verify.json` |

至少 3 个不同结果：① 选中上覆地层看解释；② 隐藏/恢复盖层；③ 点击储层进入储层语义（由 4.2 完成）。

### 4.2 储层 / 孔隙 `reservoir`

| 字段 | 说明 |
|---|---|
| `objectId` | `reservoir` |
| 初始状态 | 储层透镜位于储层段内；剖切后可看到；无选中；孔隙组隐藏 |
| 用户动作 | 点击储层岩层/透镜；点「孔隙放大（示意）」；点「退出孔隙放大」；拖拽/滚轮自由观察 |
| 前置条件 | 资产加载；孔隙模式下先退出才能切层；不声称真实扫描 |
| 状态变化 | `selectedObjectId=reservoir`；储层/透镜高亮；图例显示油/气/水；孔隙模式隐藏地层、显示岩骨架+流体颗粒与放大壳 |
| 可观察反馈 | 信息面板「孔隙与流体」、油/气/水图例、孔隙局部视图、状态行；退出恢复剖面 |
| 知识解释 | `kb_formation`/`kb_drill`：孔隙/裂缝赋存、颜色只是教学编码、渗透性影响流动但不等于产能 |
| 错误/边界反馈 | 未加载资产时按钮无效；放大视图明确标注“不是实际岩心扫描/流场模拟” |
| 重置/恢复 | 「重置观察」/退出孔隙恢复层可见；退出关卡回总览 |
| 可访问替代 | HTML 按钮 + 键盘；图例为文本 + 色点 |
| AI 上下文 | `objectId=reservoir, zoneId=subsurface, knowledgeId=kb_formation/kb_drill, interaction=inspect_reservoir/inspect_pores` |
| 验收证据 | `phase04-04-reservoir.png`、`phase04-05-pore.png`、`phase04-verify.json` |

至少 3 个结果：① 选中储层并看到图例；② 进入孔隙放大；③ 退出放大恢复地层。

### 4.3 井筒 `wellbore`

| 字段 | 说明 |
|---|---|
| `objectId` | `wellbore`（部件：casing/cement/tubing/perforation） |
| 初始状态 | 剖切显示井筒；套管/水泥/油管/射孔段均可见；未选中 |
| 用户动作 | 点击井筒部件；切换「套管/水泥环/油管/射孔段」按钮；「井筒整体」/「射孔井段」；沿井筒上行 |
| 前置条件 | 资产加载；射孔段只在储层段有意义；隐藏部件不可点 |
| 状态变化 | `selectedPart`、`selectedObjectId=wellbore`；部件 visible 翻转；镜头移至井筒整体/射孔段；剖切开启 |
| 可观察反馈 | 部件高亮/信息、按钮条纹、镜头位置、状态行、射孔段与储层邻接关系 |
| 知识解释 | `kb_drill`：套管加固井壁、水泥环封隔层位、油管通道、射孔连通储层；不是工程级套管设计 |
| 错误/边界反馈 | 未进入关卡/未加载资产时按钮无效；隐藏全部地层仍需剖切/显示恢复；不把井筒称“吸油管” |
| 重置/恢复 | 「重置观察」恢复部件/层可见与总览；退出关卡关掉近景 |
| 可访问替代 | 四个 HTML 部件按钮 + 两个镜头按钮；键盘可操作 |
| AI 上下文 | `objectId=wellbore, zoneId=subsurface, knowledgeId=kb_formation/kb_drill, interaction=inspect_wellbore_part/toggle_wellbore_part/trace_up_wellbore` |
| 验收证据 | `phase04-06-wellbore.png`、`phase04-07-pressure.png`、`phase04-08-surface.png`、录屏、`phase04-verify.json` |

至少 3 个结果：① 选射孔段并局部聚焦；② 隐藏/显示套管或水泥环；③ 沿井筒上行。

### 4.4 井口 / 采油树 `wellhead`

| 字段 | 说明 |
|---|---|
| `objectId` | `wellhead`（与阶段 03 总览井口同一 ID） |
| 初始状态 | 地表井口树；总览阶段可见；进入地下后在地面端 |
| 用户动作 | 沿井筒上行到地面；点击井口；观察地面管线/支撑/端点 |
| 前置条件 | 已沿井筒上行到地面；井口与井筒是同一口井的两端 |
| 状态变化 | `zoneId=oilfield`、`selectedObjectId=wellhead`、`selectedPart=wellhead`；地层全隐藏，显示地表垫层/管线/集输端点，地面流动粒子显示 |
| 可观察反馈 | 井口信息卡、地面管线与 6 个支撑、端点组件、状态行“地面井口 · 集输管线” |
| 知识解释 | `kb_drill`：井口阀组控制流出/压力，产出物进集输；阀门操作留阶段 05 |
| 错误/边界反馈 | 不把井口与井筒当两个设备；不声称真实井底压力/产量；不混搭抽油机与自喷井逻辑 |
| 重置/恢复 | 「重置观察」回剖面/地层；退出关卡回总览 |
| 可访问替代 | 「沿井筒上行」按钮 + 井口可点击/信息面板 |
| AI 上下文 | `objectId=wellhead, zoneId=oilfield, knowledgeId=kb_formation/kb_drill, interaction=inspect_wellhead/trace_up_wellbore` |
| 验收证据 | `phase04-08-surface.png`、录屏后段、`phase04-verify.json` |

### 4.5 压力差 / 流动示意（采油过程）

| 字段 | 说明 |
|---|---|
| `objectId` | `wellbore`（作用于储层→井筒→井口流程） |
| 初始状态 | 压力差 0%，流体静止；井筒流动粒子静止 |
| 用户动作 | 拖动「压力差示意」滑块 0–100%；播放/暂停流动 |
| 前置条件 | 已进入地下；滑块始终可用；不表示真实井底压力/注入量/采收率 |
| 状态变化 | `pressure` 变化；井筒/地面流动粒子速度提升；状态行更新；≥90% 记录本关完成 |
| 可观察反馈 | 油滴沿井筒上移加快；`note` 文案从“未明显运移”到“向井筒方向移动”；完成标记 |
| 知识解释 | 压差推动流体向井筒；真实产能还受渗透性、流体性质、井底流压、开发方式影响 |
| 错误/边界反馈 | 滑块极端 100% 仍只称“教学示意”；不产生产量/压力数值；暂停时粒子停 |
| 重置/恢复 | 「重置观察」压力归零；退出/重进重置 |
| 可访问替代 | 原生 `input[type=range]`，键盘方向键可调；提示文字 |
| AI 上下文 | `actionId=adjust_pressure,value=0..100,unit=示意百分比` |
| 验收证据 | `phase04-07-pressure.png`、`phase04-verify.json` history `adjust_pressure` |

## 5. 验收门禁对照

| 门禁 | 状态 | 证据/说明 |
|---|---|---|
| 同一世界/注册表/状态源 | 通过 | `stage.baseScene`、`subsurface` 锚点、`PETRO_DEVICE_STATE` bind detail |
| 4 层地层 + 层理/断面 | 通过（最小） | 波浪界面 + 4 材质 + 剖切；非等厚彩色方盒 |
| 逐层显示/隐藏/剖切 | 通过 | 四个按钮 + 默认剖切裁剪 |
| 点击地层名称/解释 | 通过 | Raycaster + HTML 按钮；面板解释 |
| 储层突出/孔隙/图例 | 通过（示意） | 储层高亮 + 放大壳/颗粒 + 油/气/水图例；明确非扫描 |
| 井筒贯穿/局部/部件 | 通过 | 井筒从地表至储层；部件按钮/镜头；稳定名称 |
| 上行到井口/管线 | 通过 | `traceUp` + 地面垫层/6支撑/端点 |
| 采油压差因果反馈 | 通过 | 滑块 + 粒子速度 + 边界文案；保留 `adjust_pressure` |
| 五关/其它区域不破坏 | 待本轮回归 | 见 `phase04-regression.json` |
| 截图 ≥6 / 实时录屏 | 通过 | 9 张 1440×900 + 50.8s 录屏 |
| Hero `.blend`/运行格式/语义/视图/许可 | 通过（最小） | 见 §3 与 manifest |
| 真实油藏/工程数据 | 明确不是 | 页面/文档双重标注 |

## 6. 未覆盖与后续

- 真实用户测试、跨浏览器、FPS/内存长跑：阶段 09；本阶段未执行。
- 地质纹理、层内粒度/裂缝细节、专业 UV/贴图：P1 视觉精修；不阻塞最小 Hero 门禁。
- 井口阀门操作、分离/储运：阶段 05。
- AI `/api/ask`/生成：阶段 08；本阶段仅写上下文，不声称 AI 闭环完成。
- 移动端：明确不在本期。
