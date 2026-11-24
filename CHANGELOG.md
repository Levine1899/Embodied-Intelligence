## 阶段 08 — 2026-11-23 · AI 场景上下文与动作白名单

- 新增 `web/scene-context.js`：单一短期场景上下文（scene/stage/level/object/knowledge/interaction/history/ledger），不写 localStorage、不跨会话。
- 新增 `web/ai-actions.js`：AI 动作白名单、场景/关卡/对象/参数/revision 校验，失败不改场景；支持执行前切换场景的安全拒绝。
- `web/ai.js` 接入 `SceneContext.buildForAI()`，AI 请求继续使用兼容字段 `question/ctx/tier/mode`，并保留 Dify 页面现状。
- 新增“带入写作页”显式 handoff：只传当前设备、关卡和已核验事实，写作页预填 Dify 的 topic/facts；无 handoff 不继承。
- 写作页无代理时显示可编辑“预置模板 · 未连接模型”，不冒充模型输出；浏览器 AI 无代理时保留本地知识回答。
- `docs/API.md` 补充 Dify 问答/写作端点，并注明 `/api/ask`、`/api/gen` 兼容；新增 `docs/ai-scene-context.md`。
- 阶段验证：36 项真实浏览器断言 0 失败；入口/动作/写作场景记录均有断言；Dify chat/write 与旧 ask/gen 生产 API 均 200。
- 复审修复：设备卡“问 AI”自动展开侧栏；写作 Dify facts 追加带边界的场景记录；`/api/ask action:true` 真实模型动作建议；生产动作块实测。
- 体验入口合并：页面不再显示“沉浸导览/自由探索/任务关卡”三张模式卡，只保留场景头“开始导览”；自由探索为默认，任务从右栏“任务”进入；旧模式按钮仅作隐藏程序化兼容钩子。
- 工具栏修正：浏览器“朗读”现在读取并朗读右侧当前讲解（原先没有写入文本，点击后无反应）；移除“更多→声音”重复入口，并合并侧栏“朗读讲解”到顶部朗读，只保留顶部合成环境音/音量控制。
- 储运清理：去掉通用“按住液位条”引导条和“教学示意/不代表实际排放/（示意）”文字；参照地面处理改成“选择设备 → 调节液位”两步，结构/泵送收进“演示与结构”；移除罐顶说明标签并修复设备标签截断；储运默认改为半剖；隐藏前景平台遮挡，45% 液位也能看到罐内液面。
- 地下开采清理：移除左栏教学长文/状态说明、右栏“沿井筒上行/暂停流动”和底部工具条；恢复原压力滑块（仅保留滑块与百分比，无文字说明/操作引导）和 V3 式抽取动画（储层汇流 + 井筒上升粒子 + 脉动环）。进入关卡保持地层剖面并叠加孔隙视图；孔隙球收在最底层基底内；井筒沿纵深半剖，露出管腔内的液体柱和上升颗粒；拖动滑块时井筒粒子上升、底部颗粒同步减少，反向拖动恢复；M1 由滑块 ≥50% 判定。
- 结论：**技术/交互复审修复完成（36/0）；仍因继承的旧 Dify key 有效而保持 REVISE；用户签收待完成**。

## 阶段 07 — 2026-11-23 · 系统整合（导览/任务/音频/档案）

- 新增 `web/journey.js`：10 站沉浸导览状态机，显式「开始/继续/暂停/退出」，用户拖动/滚轮立即暂停；真实驱动 l1 储层/井筒、l2 半剖/分离、l3 浮顶液位/泵送、l4 全剖/馏分、l5 产品选择。
- 新增 `web/mission.js`：M-YJ-001 任务状态机（M1–M5），成功由真实 `scene-context` 操作判定；含错误去向反馈、分级提示、暂停/退出/继续/重置、总结。
- 新增 `web/journey-store.js`：本机探索档案（区域/环节/设备/知识/任务/导览），不上传；新增档案查看与清空确认。
- 扩展 `web/assets/site/ambient.js`：合成环境音开关/音量/静音；默认关闭，无资产不阻塞。
- 新增 l1 `setPressure`、l3 `setLevel/startPump/pausePump`、l4 `selectFraction/startFlow`、l5 `select/picked` 供导览/任务稳定调用。
- 新增 `docs/tour-state-machine.md`、`docs/mission-state-machine.md`；`tools/phase07-verify.cjs`（63 断言）与 `tools/phase07-record.cjs`；两段 1440×900 真实浏览器录屏。
- 结论：**复核修复后建议 PASS（技术/交互）；用户签收待完成**。75 断言 0 失败；P0 已修复；剩余 P1：跨浏览器/移动端/用户测试，P2 动效细化。

## 阶段 06 rev4 — 2026-11-23 · audit-2 定点返修

- l4 拆分 atmospheric_tower / vacuum_tower / heater 的独立 detail Object3D 子组，修复同一 root 绑定三个 objectId。
- l4 退出隐藏关卡 Group，重进恢复；异步加载后无条件幂等补绑三设备。
- 渣油 overlay 改为塔底→减压塔，独立路径与提示，不再称侧线。
- l4 引导以稳定 levelId 识别并禁用错配的 l5 演示条。
- 新增隔离/Group/异步加载/渣油目标/引导断言；重跑 verify、E2E、tower-check、nav。

## 阶段 06 rev3 — 2026-11-23 · review 返修二
- `tower.html` 接入 `world/state.js`，剖切写 `PETRO_DEVICE_STATE`；新增启动/暂停/重播汽液按钮和 `tower-state-flow` 证据。

- 修正常压渣油：移除中部 `GasOil` 错误侧线，改为塔底 `Pipe_Residue_Bottom` → `Box_Residue`；“常压瓦斯油”不再与常压渣油混称。
- `tower.html` 的全剖进一步弱化半壳到 0.18、关闭 depthWrite，与半剖形成结构级差异；真实截图 `tower-full-cut.png`。
- 明确 canonical 入口：sandbox l4 是主体验；overview 为 LOD；`tower.html` 是兼容/fallback 页，不冒充共享 Store。
- 阶段 04/05 用户签收原话已记录；标准 handoff 与 refining-experience 文件在 `docs/phase-reports/` 与 `docs/` 可读。
- 证据：新增常压渣油底部截图；重新验证、录屏、打包。

## 阶段 06 rev2 — 2026-11-23 · review 返修

- 修复 P0-ASSET-01：`make_tower.py` 新增换热器组（3 台卧式管壳式）、泵组（3 台+电机/阀轮）、管廊、平台/格栅/栏杆/直梯、设备基础、保温带；网页可辨识为成套装置。资产 151 Mesh / 14,328 verts / 27,054 tris；生成器导出前保存 `tower_hero.blend`。
- 修复 P1：删除重复 `buildUi`；外观态“重播/塔板结构”自动切半剖；加载回调加 active 守卫；加入 5 个可点击 3D 语义热点；退出恢复世界、双次返回与重进测试；证据 5 张截图、57.15s 录屏。
- 结论：**阶段 06 技术/交互范围建议 PASS；资产为教学示意，P1 高精度/全 Mesh 热点/面板布局保留；P2 性能/用户测试未执行；用户签收待定。**

## 阶段 06 — 2026-11-23 · 炼化与常减压塔

- `l4` 从简化程序化塔切换为 `tower.obj` 装置群：常压塔/减压塔/加热炉/冷凝器/泵组/管线/平台/产品箱，主 objectId `atmospheric_tower`，与 `vacuum_tower`/`heater` 共用注册表与 `PETRO_DEVICE_STATE`。
- 实现外观/半剖/全剖：完整壳→半壳/塔板→弱化半壳/塔板/汽液/进料/侧线路径；加载完成后显式回外观。
- 新增常压/减压两条教学进料路径、汽液接触启动/暂停/继续/重播、塔板结构、五个馏分路径、恢复外观与返回总览；HTML 按钮为可访问入口。
- 新增 `docs/refining-experience.md`（设备群/三状态/5 个互动矩阵/科学边界）；更新 `scene-distillation-tower.md`。
- 新增 `tower_hero.blend` 可编辑源、资产 manifest（哈希/语义/锚点/限制）；保留 `tower.html` 旧入口/fallback。
- 证据：5 张 1440×900 截图、41.3s 连续录屏、`phase06-verify.json`；E2E l1–l5 与 navcheck exit 0。
- 结论：**阶段 06 交互正向路径可用，但 review 发现 P0-ASSET-01：运行塔仍是基础几何拼装的遗留 `tower.obj`，视觉资产门禁未通过；建议 REVISE，不是 PASS。** P1 源脚本/死代码/空动作/迟到回调/边界测试未关闭；P2 性能/用户测试未执行；用户签收待定。

# CHANGELOG

## 阶段 05 — 2026-11-23 · 地面处理与储运

- 新增三相分离器 Hero：Blender `.blend`、OBJ/MTL、GLB、半壳 `separator_cut_shell`、圆柱切片油/水/气层、堰板/挡板/雾沫捕集器、语义节点、5 张检查视图与许可记录。
- l2 复用同一 `three_phase_separator`：Hero 加载、外部/内部结构、启动/暂停/单步/重播、三相路径、真实 pointer 出口/去向与错误反馈、返回总览；补齐全部 actionId。
- l3 增补储罐剖面、固定顶/外浮顶对比、液位/气相空间、泵组/出口阀/管线、泵送暂停/重播/路径、选中高亮与重进 UI 同步；新增稳定 `transfer_pump` objectId。
- 修正外浮顶表达：减少油气空间但**不等于零排放**；液位不换算排放量。
- 文档：`production-storage-experience.md`、矩阵、场景/状态/actionId 补充；证据见 `docs/phase-reports/evidence/phase-05/`。
- 修复 review 指出的 P0/P1：半壳/内部结构、actionId、真实 pointer、初始按钮、罐体选中高亮、重进状态；9 张证据含错误去向，66.15s 连续录屏。
- 结论：**阶段 05 修复后技术/交互范围建议 PASS；视觉细节 P1；用户签收待定。** 未执行阶段 06。

## 阶段 04 rev3 — 2026-11-23 · 交互一致性/导航语义返修

- 增补 `updatePartChips()`，图层/部件在加载、reset、enter、exit-re-enter 后统一从实际 Mesh 反向同步按钮与 `aria-pressed`。
- `traceUp()` 不再暗中修改压差值/动画状态；仅做镜头与结构导航；回调静默选中井口，保留 `trace_up_wellbore` 交互语义。
- 修复 manifest 中 `wellhead_valve/outlet` 的 `objectId` 与 `assetId` 混用，部件级 `semanticId` 保留。
- 更新地下体验验收表五关状态；关闭阶段 03 遗留的 Blender 导出待办（已由阶段 04 的 4.5.16 实际构建验证）。
- 增补 reset/re-entry 控件一致性、traceUp 解耦的真实浏览器断言；用户签收仍待定，阶段 05 未启动。

## 阶段 04 rev4 — 2026-11-23 · P1 控件同步/导航语义收口

- 新增 `updatePartChips()`；加载、reset、enter、exit-re-enter 统一按实际 Mesh 同步按钮与 `aria-pressed`。
- `traceUp()` 不再修改压差/暂停状态；镜头导航与 `adjust_pressure` 解耦，井口静默选中。
- manifest 区分 `assetId/objectId/semanticId`；地下体验验收表引用实际五关证据。
- 新增 `controlCheck`、`controlsBeforeExit`、`reentry`、`traceZero`、`trace75` 浏览器断言；重录 52.75s 录像。

## 阶段 04 — 2026-11-23 · 地下开采（Hero 最小门禁通过）

- 新增地下 Hero：Blender 4.5 源文件 `.blend`、运行 OBJ/MTL、GLB 备份、6 张资产检查视图、对象/语义/尺寸/锚点/材质清单与许可说明。
- 新增 4 层波浪地层、储层透镜、井筒套管/水泥环/油管/射孔、井口树/地面管线；网页端由 ObjLite 实时加载，绑定 `underground_geology/reservoir/wellbore/wellhead`。
- 重写 `web/levels/l1.js`：地层逐层显隐/剖切、储层图例/孔隙放大、井筒整体/射孔井段、沿井筒上行、地面集输端点、压力差示意与暂停/重置；保留 `adjust_pressure`。
- 新增长逻辑 ID 3 个（`underground_geology`/`reservoir`/`wellbore`），`wellhead` 复用；总览与近景同 Store，退出恢复环境组/总览。
- 文档：`underground-experience.md`、交互矩阵、资产门禁、场景/状态/actionId 补充；阶段 03 用户签收记录为 ACCEPTED。
- 证据：9 张 1440×900 截图、52.75s 实时录屏、`phase04-verify.json`、五关/深链/章节/塔页/fallback 回归。
- 结论：**阶段 04 技术范围 PASS（最小 Hero 门禁）；视觉细节/纹理列 P1；用户签收待定。** 未执行阶段 05。

## 阶段 04 rev2 — 2026-11-23 · review 返修

- 注册表缓存版本 `v39`，交付页实际 16 个设备；新增 `wellbore` overview 表示。
- 修复重进关卡压力/视角/完成态未复位；`resetView` 同步清 `__sceneContext`。
- 修复清除高亮覆盖剖切自发光；压力面板移入左侧滚动栏，教学声明去重。
- 重新生成 9 张 1440×900 截图和 52.75s 实时录屏；`phase04-verify` 增加 16 设备/overview/reset/reentry 断言。
- 地面场景增加地表平面/网格地平线；五关、深链、塔页、context-loss fallback 复跑通过。


## 阶段 03 — 2026-11-22 · 世界骨架（代码，未通过 Hero 视觉门禁）

- 六区概念空间：真实地面开口 + 台地高差 + S 形对角管线，五 stage/深链保持；页面标注“产业链空间示意 / 非真实地理比例”。
- 新增 `web/world/registry.js`（6 zone / 13 device / 5 route）与 `web/world/state.js`（单一逻辑设备状态、overview/detail 绑定）。
- 相机：总览/区域/设备近景/返回；`enterDetail/exitDetail` 相机级连续；用户拖动可接管。
- 新增 `scene-architecture.md`、`asset-gaps.md`、`asset-pipeline.md`、`device-state-contract.md`、Blender 导出脚本与目录约定。
- 修复 `ai.js` 右栏 AI 面板 `insertBefore` 回归；AI 内容归入 `.side__body`，不再撑破侧栏。
- 证据：1440/1920 全景、六区截图、`detail-continuity-1440.mp4`；均标注程序化占位，不是 Hero 验收。
- **Hero Asset Gate 仍未通过（BLOCKED）**；阶段 03 不宣称视觉/PASS。产品版本仍 3.4.0。

## 阶段 03 rev3 — 2026-11-23 · 上下文契约返修

- `syncSceneContext` 增量更新旧 context：保留 `scene/stage/object/knowledge/mode` 别名、interaction 旧键 + `actionId/result`、history 跨场景（12 条）。
- `focusZone` 显式传 zoneId；`subsurface` 与 `oilfield` 共用 drill 但上下文不再一律 oilfield。
- `enterDetail` 进入后同步 `selectedObjectId/object/deviceName/zoneId`，Store 与 context 同源；返回恢复进入前选择/上下文。
- 分离器完成文案改为油→储运、气→回收/处理（特定工况火炬）、水→水处理；同步导览/设备卡/关卡/章节/AI 检索。
- `reset()` 恢复 `overviewVisible=true` 并 apply；异步 Hero 替换后重新绑定，13/13 设备有实际 overview 表示。
- 修正阶段 02 交接任务行“用户设计签收”为已执行/ACCEPTED（整段签收，未逐项勾选）。
- 新增 `context-contract.json`；五关/深链/章节/塔页/fallback 重新通过；Hero 仍归 04–06。

## 阶段 03 rev2 — 2026-11-22 · 审查返修

- 修复设备状态 Store：bind 即时应用、切换重置旧设备 structure/animation、overview/detail 可见性分离、setOverviewVisible 全量重应用。
- 区域镜头改为消费 `CAMERAS` position/lookAt；地下/储运/炼化按 1440 截图重新校准。
- `enterDetail/exitDetail` 恢复 stage/章节/任务面板/`__sceneContext`/进入前选择；清空选择不重置设备状态。
- 地面 Mesh 保留 `layerType=environment` 且不参与静态合并；合并桶保留 layerTypes；图层计数可断言。
- 清理五关/完成弹窗/AI/chapters/kb-sources 中的浮顶零损耗、四种产品、产品绝对化表述。
- 真实浏览器 l1–l5 进入/操作/退出、#stage 0–4、章节回链、塔页、context-loss fallback 回归；新增 `state-contract.json`、`level-e2e.json`、`fallback.json`。
- 阶段 02 用户签收记录为 ACCEPTED（用户原话「签收阶段02。」）；Hero 仍归 04–06，不作为阶段 03 P0。


## 设计基线 — 2026-11-22 · 阶段 02 体验设计（文档基线，非产品运行版本）

- 方向 C《批次 YJ-001：一张能源通行证》；六区、三层地图、三个 Hero Moments、T0–T7 任务/五关映射。
- 五知识章 + 两流程标记；T5 单一 priority；fraction→application→cityObject 映射与 5 张必做应用卡。
- 六维正交状态、上下文兼容、N=5 验证方案、展厅显式复位、整场景性能预算。
- 5 张浏览器灰盒参考、Hero 规格/阶段门禁、总控/交接模板落库。
- **不改变产品版本号 3.4.0**；本条目只标识设计文档基线，不代表网页/3D 已实现或验收。


## 3.4.0 — 2026-11-21 · 连续产业链数字展馆（沙盘重构 + 导览 + 科学修正）

- **空间重构**：五块漂浮底座改为一块 78×34 连续地形 + 五个嵌地分区 + 工艺脊线（物流带/管架/管线）+ 远景轮廓；新增下沉式地质剖面台阶（6 层岩性、储层油点、井筒/井口/抽油机）。
- **设备升级**：三相分离器（封头/鞍座/接管/阀轮）、固定顶 vs 外浮顶罐（浮盘/密封圈/导向杆）、常压塔/减压塔（平台/护栏/梯子/侧线）、加热炉+烟囱、加油机/塑料瓶/纤维卷/润滑油桶/沥青样块。
- **体验模式**：沉浸导览（7 步、约 90 秒、可暂停/跳过、输入即接管）、自由探索、任务关卡；reduced-motion 不自动播放。
- **上下文与 AI**：`window.__sceneContext`（scene/stage/object/knowledge/mode/interaction/history）；设备 objectId + 按三维锚点定位的设备卡片（名称/用途/问 AI/读本章）；关卡压力差、液位、出口、馏分、产品选择回写 interaction 并保留 12 条历史；`/api/ask` 的 `ctx` 追加场景行，契约保持兼容。
- **科学修正**：l1 压力差示意边界；l3 删除排放量推断与“压没”；l4 改为五种馏分并说明馏分≠成品油；l5 产品路线不绝对化。
- **稳定性**：l1–l4 真实 deltaTime；塔页 WebGL2 检测、上下文丢失处理、加载后 `setLevel(0)`。
- **文档**：新增 audit-baseline / asset-inventory / experience-design / scene-map / scene-sandbox / implementation-report，重写塔场景文档；版本号统一 3.4.0。
- **布局 B**：场景全宽、右栏可收成 46px、工具分两级、说明条压成一行、声明移入「关于本页」。
- **主管线接入**：炼化区新增主管到装置进料口的连接管；程序化塔组 skipMerge 并隐藏，修复残留巨型楼梯。
- **上下文恢复**：沙盘处理 `webglcontextlost/restored`，并用渲染帧数兜底隐藏提示；实测丢失提示出现、恢复后自动消失。
- **录屏证据**：新增 100 秒导览与 65 秒自由探索录屏（CDP screencast + ffmpeg），并补充用户测试方案（未执行）。
- **合成环境音**：新增 `assets/site/ambient.js` 与「声音」按钮，默认关闭、无音频资产、按环节变调、失败静默；明确标注非现场录音。
- **塔页语义锚点**：热点坐标与对象匹配改读 `tower.meta.json`，旧坐标/正则仅作兜底；移动端本期明确不适配。
- **设备列表 + 移动抽查**：新增可键盘操作的设备列表（13 项，与 3D 共用 objectId）；390/820 设备模拟无横向滚动。
- **默认动画 + 装置清理**：流向默认播放、自动旋转默认开启、点选环节自动停；剔除常减压装置在总览下呈细线的 Ladder/Railing/Post 等。
- **常减压装置 + 半剖 + 运动**：tower.obj 接入炼化区替换程序化双塔；新增「半剖」「自动旋转」按钮；抽油机按 static/beam/crank 三组导出并动画；地下开采相机拉远。
- **五关 E2E**：headed Chrome 下五关全部「进入→操作→退出」通过，l1 压力 / l2 出口 / l3 液位 / l4 馏分 / l5 产品均写回 interaction 且退出后 levelId 清空；新增 `tools/level-e2e.cjs` 与 l2/l5 测试钩子。
- **五关回归**：l1/l2/l3/l4/l5 入口与面板全部可进，l1/l3/l4 控件写回 interaction；修复退出后 `levelId` 残留；l2 退出与 3D 点选仍未自动化，见 `docs/scene-levels-qa.md`。
- **真实帧率**：headed Chrome + CDP 实测 90 fps（105 calls / 50.5k 面 / DPR2 / AMD 集显），p95 11.3 ms；脚本 `tools/fps-probe.cjs`。
- **静态合批**：按材质外观合并程序化杆件/栏杆/梯档，并把区域间管线与场景静态件并入，总览 draw calls 348 → 104（-70%），三角面基本不变；hero 容器 skipMerge 保证异步替换不被吞。
- **性能基线**：新增 `__stage.stats()`；总览 348 draw calls / 49,010 面，地面处理 69 / 10,930，炼化 263 / 27,162。
- **五台 Hero 资产接入**：抽油机/井口/外浮顶罐/加热炉也接入，合计 20 个材质 mesh，点击均弹对应卡片；缩放按场景校准。
- **Hero 资产接入**：新增共享 OBJ 解析器 `obj-lite.js`；三相分离器已替换为 Blender 资产（5 材质 mesh、OBJ 8 ms），点击可弹设备卡片；其余四台未接入。
- **Hero 资产 v1**：Blender 脚本生成五台设备（分离器 8,236 / 抽油机 1,208 / 井口 3,948 / 外浮顶罐 5,448 / 加热炉 1,364 三角面），按材质合并为 4–5 个对象，输出 OBJ/MTL/meta/stats 与 Cycles 预览；抽油机与加热炉标记“需美术复审/重做”，未接入沙盘。
- **GLB spike**：Blender 三相分离器（10.4k 面 / 500 KB）导出并在真实浏览器加载（72 ms / 29 draw calls）；确认现有 three 包缺 GLTFLoader，近期推荐 OBJ 管线，见 `docs/asset-spike-separator.md`。

## 3.3.2 — 2026-11-21 · 问答页统一暖墨；导航文案收口

- **问答页统一**：远端新版问答页（含 science-logo.png）由冷蓝 `#0b141c` 改为暖墨 `#0b0f11`；强调色改灰青/赭黄；标题与品牌改得意黑；大标题去掉「，。」；输入条与气泡圆角收到 4–8px；`shortcut-label` 提到 12px。
- **导航统一**：ask / write / kb 的导航改为「首页 / 探索 / 问答 / 写作」，首页链接指向 `index.html`。
- **部署**：ask.html、kb.html、write.html、assets/science-logo.png 已上线；线上读取标题字体为 Smiley Sans 40px。

## 3.3.1 — 2026-11-21 · 塔剖面页统一与沙盘双向衔接

- **塔剖面页换暖墨**：顶栏/标题/侧栏统一站点变量与得意黑；三维场景背景 `#0b0f11`、设备暖灰、汽相灰青、原油管线赭黄、地面暖褐。
- **取景重设**：初始/重置/剖切镜头统一到更近机位（dist 33 / 剖切 23），模型占画面约 65%，不再是原来的四成。
- **热点标签重排**：五个标签分开，不再互相遮挡；手机端隐藏 3D 标签，保留下方热点列表。
- **双向衔接**：塔页 HUD 增加「← 回到流程沙盘 · 炼化环节」→ `sandbox.html#stage=3`；沙盘说明栏的「看塔剖面 →」改为常驻，任何环节都能进塔页。

## 3.3.0 — 2026-11-21 · 三维为主线：首页入口、环节衔接、章节补充

- **首页主入口改为三维**：主按钮「进入三维演示」直跳 `sandbox.html`；三个入口依次为三维演示 / 六章知识 / 塔剖面。
- **沙盘 ↔ 章节打通**：每个环节（0–4）右下显示「读本章知识 · 第 N 章」（对应第 2–6 章）；`#stage=N` 深链修复，可直达指定环节并同步章节入口。
- **章节页做补充**：标题下加「← 回到三维演示 · 环节名」；第 1 章「形成与勘探」无对应 3D 环节，不显示该入口。
- **镜头保留并逐级下降**：切环节仍为 700ms 缓动飞行，机位高度按流程 2.6 → 0.9、仰角 0.30 → 0.15。
- **沙盘暖墨换皮**：顶栏/标题改用得意黑与站点变量；三维场景背景、雾、地面、设备与管线材质统一为暖灰/赭黄/灰青；关卡材质同步换色。
- **沙盘排版整改**：修掉 33 项（11px 小字、来源对比度 4.03、知识库链点按区 20px、移动端 3D 标签重叠等），`check_design` 0 问题。

## 未发布 — 首页设计定稿（大图海报 + 动图）

- 首页方案定稿：`design-home/home-b.html`（暖墨底、得意黑标题、无标点大标题、六章改为 01–06 索引），编辑刊物式 A 版归档。
- 新增首页动图 `web/assets/tower/hero-loop.mp4`（1920×1200 / 24fps / 12s / 1.3 MB）与首帧海报 `hero-poster.jpg`：半剖塔绕开口侧 ±32° 摆动，塔内汽柱上升、液滴下落、每层塔板液膜脉动；罐间加热炉→常压塔、塔底→减压塔、塔顶→冷凝器、四条侧线横向输送。
- 新增 `tools/render_flow_loop.py`：在 `make_tower.py` 建模基础上渲汽液流动循环，周期可整除总帧数，循环无缝；`tools/render_loop.py` 为不含流动的基础版。
- 首页交互：自动循环、悬停暂停、拖动转塔（松手 1.2s 恢复）、暂停/播放按钮；`prefers-reduced-motion` 与视频失败均有静态兜底。

## 3.2.0 — 2026-11-21 · 常减压蒸馏塔剖面（程序化，Blender 生成）

- 新增 `web/tower.html` + `web/tower.js`：常压塔 / 减压塔 3D 剖面页，五个热点、三档剖切（外观 / 半剖 / 全剖）、进料与侧线流向动画、轨道相机与自动镜头打断、WebGL 失败 2D 兜底。
- 新增 `tools/make_tower.py`：Blender 4.5 headless 程序化建模，导出 `tower.obj/.mtl/.glb`、`tower.meta.json` 与两张 1920×1200 渲染图（外观 / 剖切）；半剖壳由 `bisect_plane` 生成。
- 沉浸页在「炼化」环节显示「看分馏塔剖面 →」入口；问答页支持 `?q=` 预填，塔页热点可直接跳去追问。
- 渲染图可用于 PPT；OBJ 加载器通过对象名绑定热点、按层切换整壳/半壳，不依赖 GLTFLoader（r180 UMD 包不含）。
- 半剖壳改为脚本生成（壁厚 0.14 m + 切面封盖），塔板补泡罩与降液板，塔体补 3 个接管法兰。
- 半穹顶 *DomeHalf 上线；全剖档新增塔内汽液示意（9 个青色上升锥 + 7 个琥珀下降球），并显示对应说明。
- 模型 56 个对象 / 约 7.6k 面，obj 1.04 MB / glb 1.19 MB。

## 3.1.0 — 2026-11-21 · 六项决策落地（1–5 按推荐，6 保持不变）

- **导航收敛为 3 Tab**（沉浸讲解 / 科普问答 / 文案生成）；知识库降为辅助入口：问答页与文案页各加一个链接，沉浸页保留页脚入口；kb.html 顺带修掉一处字面量 `` `n `` 渲染缺陷。
- **问答补齐三档**（童话 / 通俗 / 工程），问答框底部可切换；此前后端已支持 `kid`，前端只接了 2 档。
- **新增 2D 前置章「第一站 · 石油从哪来」**（`web/origin.js` + 对话框）：四步时间轴 + 生储盖剖面 SVG + 三条要点 + 常见误区（"不是恐龙变的"），点击可进入第一环节。不占三维场景、不改五环节结构。
- **审核口径统一**为「机器初筛（**含来源约束**）→ 编辑复审 → 专家终审」；来源核验并入初筛的数字底稿检查，不新增关卡。
- **新增标杆场景脚本** `docs/scene-distillation-tower.md`：五热点、三档剖切、语义锚点与相机预设、动画与科学审核清单、外包交付要求。**脚本已定，模型未制作**。
- **部署形态不变**（公网 nginx + 公网模型 API），仅在 README「已知限制」写明不能作为上线基线，及上线前需确认的三件事。
- 童话档**服务端重写守卫**：超过 120 字或出现专业术语时自动重写一次（实测从 175 字/带术语 → 74 字/吸管比喻）。

## 3.0.0 — 2026-11-21

从内部演示版 V3 抽离为独立工程。

- 目录重构：`web/`（前端，零构建）+ `server/`（代理与开发服务器）+ `docs/`。
- 问答升级为**三段策略**：库内直答 / 库外石油题走模型（`mode:"open"`，界面标「模型补充 · 未逐条核验」）/ 无关与敏感题拒答。
- 新增服务端 `ASK_OPEN_SYS` 提示词：限制越界输出 `【超出范围】`、敏感输出 `【不宜回答】`；公司沿革必须「年份 + 机构名」同时说清，否则只回"记不准"；数字不推算。
- 修复关键词打分两处误判：1 字关键词不再计分；标题前缀先剔除疑问词再匹配（此前任何"为什么…"都会命中「为什么要脱水」）。
- 问答交互：换档（通俗/工程）、加入待审补库、复制、相近条目点选、待审计数。
- 文案页新增**句级信源**（本地库检索 + 命中分）与**三道防线**（初筛 / 编辑复审 / 专家终审，可退回、必填原因、记人与时间）。
- 新增本地开发服务器 `server/dev.mjs`：静态托管 + `/api` 转发，一条 `npm run dev` 起全栈。

## 3.0.0 之前

内部演示路径：V1 方案 → V2 静态 → V3（3D 流程沙盘 + 关卡）→ V4 / V5 试验版（未纳入本仓库）。
