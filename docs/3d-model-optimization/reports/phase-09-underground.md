# Phase 9｜L1 地下开采模型精修（V1.1）

> 日期：2026-11-27 ｜ 分支 `dev` ｜ 依赖：Prompt 01–06 的契约、Manifest、Loader
> 目标：保留地下主体投入，补足断面与井筒结构表现，提升教学可读性——而不是把高面数颗粒铺满场景。

---

## 一、结论

| 维度 | 评级 |
|---|---|
| 资产盘点与现状记录 | **PASS** |
| 资产精修（建模） | **PASS**（真实产出，构建参数可核） |
| 前端精修（Loader / 剔除 / 分层 / 微观 / 退出恢复） | **PASS**（加载与运行时状态已验证） |
| 自动化验收（E2E） | **PASS**：24 / 24（修完测量工具与判据后重跑） |
| 工程审图 / 录屏 / GPU 性能 | NOT_RUN / NOT_RUN / NOT_MEASURED |

**总评：PASS**（资产 / 契约 / 自动化验收 / 画面取景四项均已收口；遗留限制见第八节）。取景与颜色两处问题已在第十一节收掉。

---

## 二、资产与运行逻辑盘点（一）

改之前先把现状测出来，而不是先动手：

**资产**
- `web/assets/underground/underground.obj`（823,552 B）+ `.mtl` + `underground.glb`（710,412 B）；
- **没有任何 manifest**：L1 走的是自研 `window.ObjLite` 直接解析 OBJ，不走 Prompt 01–06 的 Loader/Manifest 契约；
- `assets-source/blender/underground_hero.blend`（1.18 MB）存在。

**现有节点（OBJ 实测 23 个 / 23,848 顶点）**
`geo_overburden` / `geo_caprock` / `geo_reservoir_layer` / `geo_basement`、`reservoir_lens`、`well_casing` / `well_cement` / `well_tubing`、`well_perforation_00..09`、`surface_pad`、`wellhead_tree` / `wellhead_valve` / `wellhead_outlet`、`well_flowline`。

**实测出的三个问题**
1. **四层地层互相重叠 0.59–0.71**（overburden 0.34~−2.10 / caprock −2.1~−4.02 边界不齐，实测 caprock 顶到 −2.1 之上）；
2. **射孔形同虚设**：10 个射孔全在同一高度（y −5.68~−5.52），半径 0.43–0.52，**只到水泥环外缘、没有捅进地层**；虽然 y 落在储层区间内（这一条原来是对的）；
3. **井口只有 3 个节点**（tree / valve / outlet），没有法兰、没有翼阀，`wellhead_valve` 却占 2,304 顶点。

**运行逻辑**
- `l1.js`（1,448 行）第 307 行对**所有** mesh 无差别 `node.frustumCulled = false`；
- 剖切用 `THREE.Plane(0,0,-1)` + `localClippingEnabled`，逐材质挂 `clippingPlanes`；
- 粒子：`wellFlow` / `perfFlow` / `surfaceFlow` / `poreDrops` 均按代码内常量建曲线，**不引用 anchors**；
- 无性能测量数据 —— 本阶段**不给出任何"更快"结论**。

---

## 三、资产精修（二）

`tools/blender/build_underground_v2.py` 真实生成 4 个 GLB（Blender 5.3）：

| GLB | 节点 | 三角形 | 内容 |
|---|---|---|---|
| `underground_strata` | 17 | 1,884 | 四层地层（**严丝合缝不重叠**）+ 每层 3 条层理缝 + 储层透镜；剖切面顶点轻微抖动形成颗粒感 |
| `underground_wellbore` | 15 | 780 | 套管 r=0.30 / 水泥环 r=0.52 / 油管 r=0.13 + **12 个射孔**（3 段高度 × 4 方位，半径 0.26 → 1.15，穿透水泥环进入地层） |
| `underground_wellhead` | 10 | 636 | 井口树 / 主阀+手轮 / 翼阀 / 法兰×2 / 出口 / 出油管线（水平段+立管） |
| `reservoir_micro` | 4 | 10,584 | 岩粒（密堆球）+ 孔隙（暗色腔体）+ 孔喉（连通管）+ 油相，**全部是网格** |

- 层序完全保持：上覆地层 → 盖层 → 储层 → 基底（只消除了层间重叠）；
- 节点名沿用旧资产（`geo_*`、`well_casing/cement/tubing`、`wellhead_*`），因此 `l1.js` 既有的 name→layer/part 绑定**不需要改写**；
- **孔隙结构不用粒子冒充**：岩粒/孔隙/孔喉/油相都是真实几何，且**不写入任何孔隙度、渗透率、压力数值**——Manifest 的 `limitations` 里明确写了这一点；
- Manifest：`tools/gen_underground_manifests.mjs` 生成，`nodeUid` 由 GLB `extras.petro` 读出后独立重算逐节点比对；`validate:assets --strict` **16/16 通过**（12 个既有 + 4 个新增）；
- 另产出 `web/data/underground.anchors.json`（5 个锚点：`wellbore_top` / `perforation_zone` / `wellhead_outlet` / `reservoir_top` / `reservoir_bottom`）。

---

## 四、前端精修（三）

| 要求 | 实现 |
|---|---|
| overview/detail/closeup 分层加载 | `applyRep(level)` 按 Manifest 的 `representations` 只切换**精修附加件**（层理缝、阀门、法兰、孔喉、油相）；岩层/套管/射孔仍由既有开关控制，避免与教学流程抢可见性 |
| 恢复正确包围盒与剔除 | 删掉无差别 `frustumCulled=false`，改为 `frustumCulled=true` + `computeBoundingSphere()`；实测 `enabled=42 / disabled=0` |
| 井筒剖切层级清晰 | 半径严格嵌套（0.13 < 0.30 < 0.52），套管与水泥环上下端一致；水泥环半透明 `opacity 0.52 / depthWrite=false` |
| 粒子路径引用 anchors | **部分完成**：锚点已生成、暴露为 `__l1.anchors` / `anchorPoint(name)`；管路曲线仍沿用既有常量，未改为按 anchors 重建（见第八节） |
| 退出恢复 | `exitLevel()` 复位 `poreMode`、隐藏 `microRoot`、`applyRep('detail')`、恢复层级可见性与剖切平面 |
| 微观放大 | 用真实 `reservoir_micro` 资产替代程序化孔隙点；切入/切出**不移动相机**，因此无比例跳变（实测相机位移 < 0.001） |

v2 加载失败时**自动回退**到旧 OBJ 路径，再失败才回退程序化几何——不会白屏。

---

## 五、验收（四）逐项

| 验收项 | 结论 | 依据 |
|---|---|---|
| 地层正面/侧面/45°/储层放大/井筒剖面截图 | 已产出 | `l1-front.png` / `l1-side-45.png` / `l1-rotated.png` / `l1-micro.png` / `l1-wellbore-cut.png` |
| 关键部件可单独选择和高亮 | PASS | `selectPart` / `selectLayer` 对 v2 节点生效（`parts` = casing/cement/tubing/perforation） |
| 微观放大与整体切换无比例跳变 | PASS | 相机位移 < 0.001 |
| 井筒多层结构不穿插错位 | PASS（按构建参数） | 套管 0.30 < 水泥环 0.52、油管 0.13；上下端一致 |
| 远景没有不必要的微小细节负担 | PASS（分层实现） | overview 的附加件数量 < detail < closeup |
| 资源重复进出不持续增长 | PASS | 两轮进出后几何体增量 ≤ 8 |

---

## 六、截图与 E2E 证据

- 截图：`docs/3d-model-optimization/evidence/phase-09-2026-11-27/`
- E2E：`tools/e2e/run-phase9.mjs`（24 条断言）

---

## 七、三条未通过的断言（逐条定性）

**E2E：PASS 21 / 24，FAIL 3**

1. **`C 四层全部可见` → 失败**
   性质：**断言口径与既有教学流程冲突**。`enterLevel()` 里的 `schedulePoreOnEntry()` 会在 1.2 秒后自动进入孔隙视图，而 `enterPoreOverlay()` 会调 `hideSurfaceScene()` 把四层置为不可见。这是 L1 原有的教学编排，不是本阶段引入的回归。我的断言假设"入场后四层可见"，与设计不符。
   → 需要改的是**断言**（按 `poreMode` 分支），不是产品行为。

2. **`C 层序未改变且不重叠` → 失败**
   性质：**我写的 GLB 解析器有 bug**。它只读 `node.translation`，忽略了 `node.matrix`，于是四个层都解析出同一个包围盒 `[-6.00, 6.02]`。层序本身由 `build_underground_v2.py` 的 `BAND` 常量保证（0.34/−2.10/−4.02/−7.27/−12.28，严丝合缝），但**当前测试没能证明它**。

3. **`D 射孔横向已进入地层` → 失败**
   性质：同上，测量口径问题。射孔是沿 45°+k·90° 方向斜插的锥台，其 x 向包围盒半宽约 0.34–0.81（取决于方位角），并非"半径 1.15"。用 `halfX > 水泥环半径` 判定本身不成立；正确判据是"射孔末端到井轴距离 > 水泥环外径"。

> 这三条我**没有为了让测试变绿去改数值或删断言**。前两条是我的测试工具不对，第三条是判据选错；产品侧的两处真实缺陷（层间重叠 0.59–0.71、射孔未穿透地层）已经在资产里修掉了。

---

## 八、未完成 / 限制（不要当成已完成）

1. **工程审图 NOT_RUN**：层厚、井径、射孔参数都是教学示意，未经工程/地质审图；
2. **录屏 NOT_RUN**；
3. **GPU 性能 NOT_MEASURED**：无移动端帧率/显存数据，因此本报告不含任何"更快/更省"的结论；
4. ~~粒子路径未改按 anchors 重建~~ → **已完成**：`wellFlow` / `perfFlow` / 两条汇流与抽取环的端点改由 `perforation_zone` / `wellbore_top` / `reservoir_top` 锚点推导，锚点值恰好复现原常量（−5.7−1.1=−6.8、1.3−0.4=0.9），画面不变但端点有了数据源；缺锚点时仍回退原常量。
5. ~~`enterPoreOverlay` 重复定义~~ → **已清理**：删掉不可达的叠加态实现（它被放大态同名函数遮蔽），现全文件只剩一份 `enterPore` + 一份 `enterPoreOverlay`，并加了静态守卫测试防止重复回来。
6. **远景小件**：overview 已隐藏层理缝/阀轮/孔喉等，但未做基于屏幕占比的自动剔除。

## 九、复现

```bash
blender -b -P tools/blender/build_underground_v2.py   # 4 个 GLB + .blend
node tools/gen_underground_manifests.mjs              # Manifest + anchors
node tools/validate_assets.mjs --strict               # 16 个 Manifest
node tools/e2e/run-phase9.mjs                         # 24 条断言（当前 21 通过）
```

---

## 十、收口这一轮：三个真 bug 已修，取景仍未收

上一轮记的三条失败已处理，过程中暴露出三个更底层的真 bug：

1. **坐标系**：脚本按"Y 是高度"书写，而 Blender 是 Z-up，导出前缺少 orient_z_up()，导致 export_yup 把高度搬到 Z —— GLB 里地层是**前后堆叠**而非上下堆叠。已补旋正；stats.json 改为发布 **glTF Y-up** 坐标（原先发布的是 Blender 坐标，测试与 Manifest 一直在读另一套坐标系）。
2. **圆柱轴向与盒子约定不一致**：盒子 y 是高度，cyl() 却把竖直圆柱沿 Z，套管因此只量出 0.6（=直径）。已统一"作者空间 y 上"，竖直件显式 axis=y。
3. **旋正对四元数物体无效**：cyl_between 设 rotation_quaternion，改 euler 不起作用，射孔完全没被旋正。改为 matrix_world 左乘后 apply。

修正后的实际几何：上覆地层 −2.10…0.34、盖层 −4.02…−2.10、储层 −7.27…−4.02、基底 −12.28…−7.27，相邻层**严格接触零重叠**；套管与水泥环 y=[−7.3, 1.3] 完全一致，油管 [−6.9, 1.3] 在内；射孔 y≈−5.1 落在储层内，末端半径 1.18 > 水泥环 0.52（穿出进入地层）。

测试工具自身也修了三处：层可见性按 poreMode 分支断言、微观切换改相对位移判据、几何测量改读构建者发布的 stats.json。

### 仍未收：入口取景
l1-front.png 显示镜头落在地层内部：整屏层理带，看不到块体轮廓、井筒与储层透镜。自动化 24 条断言全部通过（它们只验证状态与几何，不验证镜头站位），**这一项必须人眼看截图**，而截图不合格，故总评不给 PASS。

下一轮只需一件事：把 enterLevel() 的 flyTo 目标移到块体外部（建议相机 anchor+(16, 6, 22)、注视 anchor+(0, −6, 0)），并在 loop() 的 orbit 接管后复验取景。

---

## 十一、取景与颜色的最后两处（已收）

### 1. 拍到的"地层内部"其实不是取景 bug，是截图时序
入场 1.2 秒后 `schedulePoreOnEntry()` 会自动进入孔隙视图，`enterPoreOverlay()` 会 `flyTo` 到罐内特写。
我的证据脚本在 `exitPore(true)` 之后只等了 500ms 就截图，恢复动画（900ms）还没跑完 —— 拍到的是罐内画面。
**修的是截图流程**（退出孔隙 + 等 1600ms），没有改产品行为；同时把入场机位从 `(14, 8.6, 18)` 退到 `(17, 7.6, 24)`、注视改为 `(0, −5.2, 0)`，让四层轮廓、井筒、储层透镜同框。

### 2. 四层颜色被冲成米白：颜色空间用错
Blender 的 Principled `Base Color` 是**线性**空间，我按 sRGB 直觉填了 0.49/0.66 这类值，经渲染显示约等于 0.73/0.84，四层全被冲亮、几乎分不出层。
加入 `_srgb_to_linear()` 显式换算后，四层分别是棕（上覆）/灰（盖层）/琥珀（储层）/深灰（基底），层界清晰可读。

### 3. 收口后的状态
- `run-phase9` **24 / 24**、`npm test` **130 / 130**、`validate:assets --strict` **16 / 16**；
- 截图：`l1-front.png`（3/4 总览）、`l1-side-45.png`、`l1-rotated.png`、`l1-micro.png`、`l1-wellbore-cut.png`；
- 仍属已知限制：块体右侧略出画、左侧面板压住约三分之一（不影响层序与井筒阅读）；工程审图、录屏、GPU 性能仍 NOT_RUN。

---

## 十二、还掉两笔技术债（收尾）

### 1. 重复的 enterPoreOverlay
排查后发现那两个同名函数**不是同一个东西**：一个把孔隙叠加层压进基底（不移动相机），一个做放大态（隐藏岩层 + flyTo）。
我上一轮改 `enterPore()` 时把"两选一"的切换逻辑换成了"有微观资产就用资产，否则走放大态"，于是叠加态那份彻底不可达，才表现成"重复定义"。
处理：删掉不可达的那份，保留放大态；现在全文件只有 `enterPore` × 1、`enterPoreOverlay` × 1。

### 2. 粒子路径接 anchors
`perforation_zone` / `wellbore_top` / `reservoir_top` 三个锚点成为曲线端点的数据源：

| 路径 | 端点来源 | 期望值 | 实测 |
|---|---|---|---|
| wellFlow 起点 | perforation_zone − 1.1 | −6.8 | −6.800000000000001 |
| wellFlow 终点 | wellbore_top − 0.4 | 0.9 | 0.9 |
| perfFlow 终点 | reservoir_top − 0.63 | −4.65 | −4.6499999999999995 |

锚点数值恰好复现原来的常量，所以画面不变——这一项的价值不在"看起来不同"，而在于**端点从魔法数字变成了资产数据**；锚点缺失时回退原常量，不会因为锚点加载失败而崩。

### 3. 防止这两笔债再长回来
新增 `tests/l1-structure.test.mjs`（4 条静态守卫）：
- `enterPore` / `enterPoreOverlay` 各只有一份定义；
- 不再出现无差别 `frustumCulled = false`；
- 粒子端点必须调用 `anchorVec('perforation_zone' | 'wellbore_top' | 'reservoir_top')`。

E2E 增加 H 段 4 条断言，验证三条粒子路径都声明了锚点来源、且端点数值确实等于锚点推导值。

### 4. 验证
`run-phase9` **28 / 28**、`npm test` **134 / 134**、`run-levels` **84 / 84**、`validate:assets --strict` **16 / 16**。

---

## 附：L1 已按用户要求退回 Phase 9 之前的实现（2026-11-27）

用户决定 "L1 替换为原图" 并明确选择 **B. 退回 Phase 9 之前的 L1 实现**，因此：

- `web/levels/l1.js` 已用 `git checkout ce0402a^ -- web/levels/l1.js` 精确还原（1377 行，0 处 v2 引用，回到 `underground.obj` + `ObjLite` 加载路径）。
- 本报告前面记录的 v2 四资产 / anchors / 微观视图 / 射孔锚点**在当前代码中已不再生效**；资产文件仍保留在仓库中供以后复用。
- 只对 v2 成立的两项测试已退役：
  - `tools/e2e/run-phase9.mjs` → 归档为 `evidence/phase-11-l1-revert/run-phase9.retired.txt`（不再执行）；
  - `tests/l1-structure.test.mjs`（v2 不变量守卫）→ 删除。
- 退休后回归：`npm test` **137/137**、`run-levels` **84/84**。
- 本报告的总评（PASS）与第三章"资产/几何"结论仍是对 **Phase 9 当时交付物** 的记录，但**不再描述当前 L1 运行时行为**。
