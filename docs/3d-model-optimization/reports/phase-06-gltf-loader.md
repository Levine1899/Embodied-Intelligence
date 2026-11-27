# Phase 06 · GLB Loader（单一 Three runtime）

> 依赖：Prompt 01–05。基线：`dev` @ `c11b923`。执行：2026-11-27

## 结论：**PASS**

页面现在只有**一套** Three.js runtime（esbuild 打的本地 bundle），GLTFLoader 与 THREE 来自同一 `three@0.180.0` 实例；L2 试点已迁移到 GLB 并带 hash/extras 对账、OBJ 回退与 dispose。

| 验收项 | 实测 |
|---|---|
| 页面只存在一套 THREE runtime | ✅ `THREE.__petroRuntime='bundle'`，`<script src>` 只有 `three.bundle.js`，无 `three.browser.js` 请求 |
| GLTFLoader 与 THREE revision 精确匹配 | ✅ 同包同实例，`REVISION='180'`，`window.__PETRO_THREE_REVISION='180'` |
| 本地离线可加载、不访问 CDN | ✅ 全部请求同源，外部域请求 0 |
| GLB 节点语义映射正确 | ✅ 43/43 节点带 `extras.petro`，43/43 与 Manifest 对账通过，sha256 校验通过；索引 obj 1 / sys 1 / sem 23 / anchor 5 |
| 失败能 fallback 且明确提示 | ✅ 强制 GLB 404 → 回退 OBJ，`usingFallback=true`，常驻徽标「⚠ 备用示意模型（GLB 加载失败）」 |
| 重复进出 10 次无资源增长 | ✅ 10/10 重载成功（reconciled=43），退出后句柄释放，几何计数 546→546（Δ0），纹理 15 恒定 |
| 现有 L1–L5 无回归 | ✅ `run-levels` **84/84**，`npm test` 全绿，`validate:assets:strict` 2/2 |

E2E：`tools/e2e/run-phase6.mjs` **26/26**，退出码 0。

---

## 一、版本确认（先确认再动）

| 来源 | 结果 |
|---|---|
| 运行中的 `web/assets/three.browser.js` | `const REVISION = '180';` |
| 浏览器实际运行 | `window.THREE.REVISION === '180'`（改造前经 E2E 读取） |
| npm registry | `three@0.180.0` 真实存在；0.181.0/0.182.0… 是后续版本，0.180.0 **不是别名** |
| 项目原有构建工具 | **无**（无 bundler、无 build 脚本）→ 直接采用 esbuild，不存在双工具并存 |

`package.json` 精确锁定：`"three": "0.180.0"`、`"esbuild": "0.28.2"`（`--save-exact`，无 `^`/`~`）。lockfile 已提交。

---

## 二、Runtime bridge

| 文件 | 作用 |
|---|---|
| `web/assets/three-entry.js` | 唯一 import `three` 的地方；导出 `window.THREE` + `window.GLTFLoader`；**入口处断言**：已存在非 bundle 的 `window.THREE` 就抛错（防双 runtime）、`REVISION !== '180'` 抛错、GLTFLoader 非函数抛错 |
| `scripts/build-three.mjs` | esbuild → `web/assets/three.bundle.js`（IIFE，746,085 B）；先写 `.tmp` 再原子 rename；**失败即删除产物**并 exit 1，不允许旧 bundle 冒充成功；banner 与 `three.bundle.meta.json` 记录版本/REVISION/sha256 |
| `web/assets/model-loader.js` | 统一加载接口（见 §三） |

`npm run build` 已可用（Phase 5 的 `build` NOT_APPLICABLE 至此关闭）。

**HTML 切换**：`sandbox.html` / `tower.html` / `_spike-separator.html` 三处 `<script src="assets/three.browser.js">` → `assets/three.bundle.js`；旧的 `three.browser.js` **已删除**（git 历史可回滚），页面不可能再并行加载两套。

浏览器口径：Chrome 158.0.8127.88 headless / viewport 1440×900 / DPR 1 / SwiftShader（仅功能冒烟，不代表 GPU 性能）。

---

## 三、ModelLoader

`load({glbUrl, manifestUrl, onProgress})` → handle：

- **Manifest 结构校验**：必填字段、`runtime.format==='glb'`、`sha256` 存在、nodeUid 唯一。
- **字节/sha256 绑定**：字节数与 `runtime.bytes` 不符即失败；`crypto.subtle` 计算 sha256 与 `runtime.sha256` 比对，不符即失败（实测篡改后报错）。
- **extras 对账**：GLB 每个节点必须有 `extras.petro.nodeUid` 且在 Manifest 登记；nodeUid/objectId/semanticId 三方一致；数量必须双向吻合（43↔43）。
- **索引**：`nodeUid / objectId / systemId / semanticId / anchorId`，并可从 nodeUid 反查 `Object3D`。
- **进度/错误**：`onProgress({phase,loaded,total,ratio})`；错误一律 throw，不返回半成品。
- **OBJ 回退**：`loadObjFallback()`，返回 `usedFallback:true` + 原因。
- **dispose()**：geometry / material / texture 去重释放、`ImageBitmap.close()`、AnimationMixer 停止并 uncache、从父节点移除、索引清空；`disposed=true`。
- **所有权**：一次加载内由 handle 独占；L2 侧对每个网格**克隆材质**，避免共享材质实例被逐网格模式切换互相覆盖（见 §五）。

---

## 四、单资产试点对比（OBJ vs GLB）

| 维度 | OBJ 路径（旧） | GLB 路径（新） |
|---|---|---|
| 位置/轴向/尺度/朝向 | 一致 | 一致（同一 Blender 源，Y-up；实测结构模式锚点、相机取景无位移） |
| 材质/透明度 | MTL + 逐网格材质 | glTF 材质 + **逐网格克隆**；半透明件（气层）与 ghost 表现一致 |
| 语义索引 | 靠 `nodeName` 回查 Manifest | 直接来自 `extras.petro`，另有 name 兜底 |
| anchor | 来自 Manifest | 同样来自 Manifest，实测 5 条、坐标与 owner 正确 |
| 真实 half/ghost | 可用（Phase 4 已验） | 可用且**修复了共享材质导致的 ghost 被冲掉**问题 |
| 加载错误与 fallback | 无 | GLB 失败自动回退 OBJ + 常驻徽标 |
| dispose 后重复进出 | 不释放（常驻） | 每次退出释放、进入重载，10 次无增长 |

只迁移 **separator** 一份；其余 OBJ 资产与 `ObjLite` / tower 解析器**原样保留**。

---

## 五、过程中发现并修复的真实缺陷

1. **GLB 材质共享**：同一材质实例被多个网格引用时，`setStructureMode` 逐网格改材质会互相覆盖 —— `run-levels` 立刻报 `GHOST_MATERIAL separator_head_left/right/shell`（79/84）。按"明确所有权"在每个网格上克隆材质后恢复 **84/84**。
2. **dispose 后重进不重载**：exit 释放资产后 enter 未触发重新加载，10 次进出全部拿不到 stats。已在 `enter()` 补 `if (!assetLoaded && !assetRoot) loadHero()`。
3. **回退提示会被覆盖**：`hint` 被后续交互覆盖，改为常驻徽标 `#l2-asset-badge`，E2E 断言徽标文本与 `hidden=false`。
4. **Manifest 缺 `systemId`**：33 个节点都没有该字段（尽管 `systems[]` 有 1 条），systemId 索引必然为空。已补进生成器与 `asset-manifest.schema.json` 的可选字段（向后兼容），重新生成后 33/33。
5. **`extrasStatus` 恒为 `pending_rebuild`**：GLB 早已 43/43 带 extras，但生成器写死，导致校验器**跳过逐节点对账**。改为按产物实测后 `extrasStatus=verified`，strict 现已真的逐节点核对。
6. **ESM 下 `require('three/package.json')` 不可用**：three 0.180 的 `exports` 不导出 package.json，改用 ESM import 或直接读文件。

---

## 六、禁止项自查

| 禁止 | 是否触犯 |
|---|---|
| 一次性把全站 OBJ 换成 GLB | 否。只迁移 separator；其余资产与 ObjLite/tower 解析器保留 |
| 未确认版本就更新 Three.js | 否。先三方交叉确认 r180 ↔ 0.180.0，再精确锁定 |
| 页面并行加载两套 THREE | 否。旧脚本已删，入口还有运行时断言兜底 |
| 删除 ObjLite / tower.js parser | 否。两者原样保留，作为回退通道 |

---

## 七、NOT_RUN / 限制

- **GPU 性能**：NOT_MEASURED（本机集显，headless 为 SwiftShader）。
- **其余资产迁移**：未做（按禁止项）。
- **tower.html 是否也用 GLB**：未迁移，仍走 OBJ 解析；bundle 已就位，后续阶段可切换。
- **L2 的 `full` 模式**：仍不提供（Phase 4 结论不变）。
- **浏览器 CI**：仍不进 CI（无 GPU），本地执行。
