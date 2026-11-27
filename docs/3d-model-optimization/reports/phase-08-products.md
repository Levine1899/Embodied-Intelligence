# Phase 8｜L5 产品去向优化（V1.1）

> 日期：2026-11-27 ｜ 分支 `dev` ｜ 前序：Phase 00–07 已 PASS
> 本阶段目标：替换 L5 方块/圆柱/球/圆锥占位几何，修正产品分类，避免把"石油路线产品"误解为"只能由石油生产"。

---

## 一、结论（三级分开评级）

| 维度 | 评级 | 依据 |
|---|---|---|
| **数据契约** | **PASS** | `web/data/products.json` + JSON-Schema + 校验器；`oil` 布尔已删除，判定从 `typicalFeedstocks` 推导 |
| **模型资产** | **PASS（真实产出）** | Blender 5.3 脚本真实生成 7 个 GLB / 72 节点 / 7,056 三角形，全部带稳定 `nodeUid` 与 Manifest，`validate:assets --strict` 12/12 |
| **网页集成** | **PASS** | L5 E2E 66/66；模型按装配单元整件渲染，热点绑 `productId`，判定/文案/模型三处一致 |
| **工程审图** | **NOT_RUN** | 无工程审图流程，本轮未做 |
| **录屏** | **NOT_RUN** | 未录制 |

**总评：PASS**（数据 / 资产 / 前端三项均为 PASS；审图与录屏仍是 NOT_RUN，见第六节）。

---

## 二、这一阶段最重要的发现：L5 原本是**黑的**

改之前先取证，结果推翻了"只需把占位几何换成模型"的前提：

- `renderer.info.render.calls === 0`、`triangles === 0`，四张截图字节完全相同；
- 场景里 538 个可见 mesh、灯光齐全、画布 919×626、相机位置正常；
- 手动 `renderer.render(scene, camera)` 依然 0 次绘制调用；
- 最终定位：`__lvlGroup` 注册的关卡组**默认不可见**，L3/L4 的 `enter()` 都有 `G.visible = true`，**L5 漏了这一步**。

也就是说：第五关在我改之前，无论几何是方块还是精模，用户看到的都是一片黑。原代码里 `ITEMS` 的方块/圆柱从来没有被真正看见过。

第二个同类缺陷：**退出重进不复位**。`picked`、`completed`、`checkBtn.disabled`、选中高亮都不重置，表现为"重进后按钮仍 disabled、少选几件也能判定完成"。这条是 E2E 写出来才暴露的——原有测试完全没有覆盖 L5。

两个缺陷都不是"占位几何"问题，但它们决定了这一阶段能不能被验收：**没修之前，任何模型替换都无法在画面上被证明**。

---

## 三、数据契约（一）

`web/data/products.json`，12 项，字段按需求逐条落地：

```
productId, displayName, productCategory, representationType,
typicalFeedstocks[], petroleumRouteDescription, teachingNote,
modelAssetId, modelNodeUid, inTask
```

- `representationType` ∈ `product | material | manufacturedItem | applicationScene`
- `typicalFeedstocks` ∈ `petroleum | natural_gas | coal | biomass | other`
- **`oil: true/false` 已彻底删除**，`l5.js` 里 grep 不到 `it.oil`

判定口径集中在 `isPetroleumRoute(item)`：`typicalFeedstocks.includes('petroleum')`。`__l5.classification` 直接自证 `usesOilBoolean === false`，E2E 断言这一项。

题目表述同步修正为「常见的**石油 / 石化路线**产品」，并在标题下常驻一行「**石油不是它们的唯一来源**」。

### 校验器固化的四条禁令

`tools/validate_products.mjs`（AJV + 业务规则）不只校验 Schema，还把你禁止的退化写成断言：

| 禁令 | 校验方式 |
|---|---|
| 不得把道路场景当成沥青材料本身 | `asphalt.representationType === 'material'` 且 `modelNodeUid` 不得匹配 `road|scene|street` |
| 不得把塑料瓶当成树脂原料 | `plastics.representationType === 'manufacturedItem'` 且节点不得匹配 `resin|pellet|granule` |
| 不得删除多原料来源说明 | `plastics / synthetic_fiber / synthetic_rubber` 必须 ≥2 种原料且仍含 `petroleum` |
| 不得宣称只能由石油生产 | 文本不得含「只能由石油 / 仅来自石油 / 只能来自石油 / 唯一来源是石油 / 全部由石油」 |

> 校验器当场抓到了我自己写的一句话：「塑料不等于**只能来自石油**」。虽然是**否定用法**，但这种绝对化字串留在文本里迟早被误读，所以改写成「石油不是塑料的唯一来源」。这条规则刻意做成简单字串匹配——它逼作者一开始就不要写那种句式。

---

## 四、资产（二）

### 产出

| GLB | 节点 | 三角形 | 节点内容 |
|---|---|---|---|
| `products_fuel_containers` | 11 | 1,772 | 汽油桶（桶身/提手/加油口/盖）、柴油卧桶（桶身/双箍）、航煤立罐（罐身/肩/颈/标牌） |
| `products_asphalt` | 6 | 660 | **沥青块**（材料，3 块不规则体）、**道路剖面**（应用场景，基层/沥青层/标线） |
| `products_plastics` | 6 | 844 | **树脂颗粒**（材料，12 粒合并节点）、**塑料瓶**（制品，瓶身/肩/颈/盖/标签） |
| `products_wax` | 3 | 52 | 蜡块 + 斜面 + 烛芯 |
| `products_fiber` | 16 | 1,048 | **纤维丝束**（材料，9 根丝 + 两端扎带）、**织物**（制品，平板 + 经纬线） |
| `products_rubber` | 14 | 1,272 | **生胶颗粒**（材料，10 块）、**胎面**（制品，环 + 12 花纹块） |
| `products_nonpetro` | 16 | 1,408 | 玻璃板、棉铃、水泥袋、盐晶（对比项也给真实模型） |
| **合计** | **72** | **7,056** | 16 个装配单元 |

- Blender 脚本：`tools/blender/build_product_heroes.py`（可重跑，`blender -b -P` 一条命令）
- 源文件：`assets-source/blender/*.blend`
- Manifest 生成：`tools/gen_product_manifests.mjs`（`npm run gen:products`）
- 映射：`web/data/products.models.json`，16 个装配单元 → 72 个 `nodeUid`

### 装配单元：一个产品 = 一个 objectId

第一版把"一个产品的零件"写成兄弟节点，前端按单节点渲染，结果是**塑料瓶只剩一根圆柱、柴油桶没有箍、棉铃只剩一颗**。这不是渲染瑕疵，是辨识度不达标。

改法：Blender 侧**按产品给 objectId**（`gasoline_can`/`plastic_bottle`/`cotton_boll`…），Manifest 的 `objects[]` 按装配单元分组，前端整件克隆 + 整件居中缩放。E2E 用 `partCount` 断言（塑料瓶 5、棉铃 6、丝束 3…），至少 10 件必须是多零件装配——**单一方块会直接失败**。

### 与资产契约的一致性

- `nodeUid = uuid5(NS, "{assetId}/{objectId}/{semanticId}")`：生成器从 GLB 读 `extras.petro`，在 JS 侧独立重算并逐节点比对，不一致即失败；
- `validate:assets --strict` 共 12 个 Manifest（5 个旧资产 + 7 个产品）全部通过；
- 产品资产无剖切壳，`structureModes` 四种模式等价——**没有虚构 half/ghost 差异**。

过程中被校验器拦下的三个真实不一致（说明校验有效，不是走过场）：
1. `nodes[].role` 写了 camelCase（`manufacturedItem`）→ 契约要求 snake_case，改源头并重建；
2. Manifest 节点 `objectId` 仍写资产级值 → 与 GLB `extras.objectId` 不符，`[EXTRAS_OBJECTID_MISMATCH]`；
3. `systems[].objectIds` 仍引用不存在的资产级 objectId → `[MISSING_OBJECT_REF]`。

---

## 五、前端（三）

- **热点绑定**：拾取命中区与模型 mesh 都带 `userData.productId` / `modelNodeUid`；点模型走 `productId` → 索引，不依赖顺序；
- **详情面板**：`#l5-detail` 展示 `displayName / representationType / productCategory / 典型原料 / 石油路线 / 说明`，全部来自 `products.json`，与判定同源；
- **判定**：只读 `typicalFeedstocks`，`oil` 布尔已不存在；
- **玩法不变**：多选 + 「确认选择」，仍是一次判定、仍显示「漏了/多了」；
- **未加载不冒充**：装配失败时只画**线框轮廓** + 红色告警条（`failed>0` 才显示）、chip 加 ⚠，`modelLoaded=false`，`usingFallbackAsset=true`。绝不画实心方块/球体假装成功。

### 相对原状的改动与影响（先说清）

| 改动 | 影响 |
|---|---|
| 物品 10 → 12 件（新增 合成纤维、合成橡胶） | 答案集 6 → 8；网格 5 列 → 6 列。**玩法与判定方式不变**；新增两件正是"石油不只是燃料"最有力的例子 |
| 标题文案改为「石油 / 石化路线」 | 明确多来源，不改变答案集 |
| 新增详情面板 | 新增一块只读信息区，不改变操作步骤 |
| 入场复位 | 修复缺陷：重进回到未选、未完成 |

---

## 六、验收 A–F

| 项 | 结论 | 证据 |
|---|---|---|
| A 每项分类与 `representationType` 一致 | PASS | 12 项逐条断言（类型 + 原料集合 + 石油路线判定），目标 8 / 非目标 4 |
| B 不能只靠文字辨识 | PASS | 12/12 真实 GLB；≥10 件多零件装配；`draw calls > 0`；塑料瓶 5 件、棉铃 6 件 |
| C 塑料等多原料说明准确 | PASS | `plastics` 4 种原料（石油/天然气/煤/生物质）；纤维 3 种、橡胶 2 种；文本无绝对化字串 |
| D 点击 / 判定 / 解释一致 | PASS | 逐项 `toggle` 后比对详情"判定"行与数据判定；点模型选中对应 `productId`；正解完成、少选不完成 |
| E 未加载不得静默冒充 | PASS | 全加载时告警条隐藏；`failed=0 && !usingFallbackAsset`；失败路径只画线框 + ⚠ 标注 |
| F 玩法保持 | PASS | 多选 + 确认；退出重进复位（本轮修复） |

### 测试

| 命令 | 结果 |
|---|---|
| `npm run test:e2e:products` | **66 / 66 PASS** |
| `node tools/validate_products.mjs` | ✓ 12 项（8 目标 / 4 非目标） |
| `node tools/validate_assets.mjs --strict` | **12 / 12** |
| `npm run test:e2e:levels` | 84 / 84 |
| `npm test` | 130 / 130 |

新增脚本：`gen:products`、`test:e2e:products`。

---

## 七、未做与限制（不要当成已完成）

1. **工程审图 NOT_RUN**：7 个 GLB 是教学示意级，比例与细节未经工艺/工程审图；
2. **录屏 NOT_RUN**；
3. **GPU 性能 NOT_MEASURED**：本轮未测移动端帧率与显存；
4. **模型是脚本生成的低模**：沥青块、生胶颗粒这类"不规则体"由球/块变形拼出，不是扫描或雕刻资产；可辨识但不是高保真；
5. **未引入任何第三方素材**：无商业模型、无外部贴图，许可证为 `LicenseRef-Proprietary`（脚本生成，仅项目内部）；
6. **详情面板为只读**：不参与判定，也不记录答题路径。

## 八、复现

```bash
blender -b -P tools/blender/build_product_heroes.py   # 重新生成 7 个 GLB + .blend
node tools/gen_product_manifests.mjs                  # 重算 uuid5、写 Manifest + 映射
node tools/validate_products.mjs                      # 数据契约（含四条禁令）
node tools/validate_assets.mjs --strict               # 12 个 Manifest
node tools/e2e/run-phase8.mjs                         # L5 E2E 66 项
```
