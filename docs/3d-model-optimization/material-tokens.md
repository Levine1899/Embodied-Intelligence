# 材质 Token 清单（V1.1 · Phase 10）

实现：`web/visual/material-tokens.js`（`window.PetroVisual.TOKENS`）。
颜色为 **sRGB 十六进制**（给人读的口径），转线性由 Three 的 ColorManagement 负责。

| Token | 中文名 | hex | metalness | roughness | 透明 |
|---|---|---|---|---|---|
| `steel_coated` | 涂装碳钢 | `#6E7A80` | 0.72 | 0.42 | 否 |
| `steel_stainless` | 不锈钢 | `#9AA4A8` | 0.88 | 0.28 | 否 |
| `steel_galvanized` | 镀锌钢 | `#A9B2B4` | 0.62 | 0.52 | 否 |
| `pipe_insulated` | 保温管 | `#B9A98C` | 0.10 | 0.88 | 否 |
| `concrete` | 混凝土 | `#8C8C86` | 0.00 | 0.94 | 否 |
| `rock_sandstone` | 砂岩 | `#B99C6B` | 0.00 | 0.92 | 否 |
| `rock_mudstone` | 泥岩 | `#7C7A72` | 0.00 | 0.90 | 否 |
| `reservoir` | 储层 | `#C9A25E` | 0.00 | 0.86 | 否 |
| `fluid_oil` | 油（教学） | `#C98A2E` | 0.00 | 0.34 | 0.86 |
| `fluid_water` | 水（教学） | `#3E7FA6` | 0.00 | 0.22 | 0.72 |
| `fluid_gas` | 气（教学） | `#C9D8D8` | 0.00 | 0.10 | 0.42 |

## 使用约定
- 程序化材质走 `PetroVisual.toMaterial('steel_coated', THREE)`，禁止再散写 hex。
- **GLB 资产保留建模时 authored 的 PBR 参数**，本轮不批量覆盖（避免无视觉回归的整体换材质）。
- 令牌自检：`PetroVisual.audit()` 返回缺失字段；已接入单测，令牌漏字段会让 CI 变红。
- 新增令牌必须同时更新本表与 `tests/material-tokens.test.mjs` 的必需项。
