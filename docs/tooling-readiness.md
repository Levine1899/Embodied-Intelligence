# Phase 01 · 工具准备度

> ⚠ **本文是 2026-11-22 的历史快照。** Blender 已于 2026-11-25 复测为 **5.3.0**（本文原记 4.5.16 LTS），
> 且现有 GLB 产物的导出器版本不一致：`tower.glb` 由 Blender I/O `v5.3.43` 生成，`separator/underground/spike.glb` 由 `v4.5.51` 生成。
> 最新权威数据见 [`docs/3d-model-optimization/reports/phase-00-baseline.md`](3d-model-optimization/reports/phase-00-baseline.md) §7.1。

日期：2026-11-22（Blender 行于 2026-11-25 更正）
原则：只盘点，**未安装任何软件、未改全局环境**；版本均在本机实测。

| 工具 | 用途 | 实测 | 状态 | 本轮实际用途 |
|---|---|---|---|---|
| Git | 分支、提交、回滚、审计 | `git version 2.45.1.windows.1` | **已安装且验证** | 分支/提交/远端/worktree 审计 |
| Node.js | 代理、测试脚本、工具 | `v22.20.0` | **已安装且验证** | `node --check`、E2E/FPS 脚本、proxy 503 测试 |
| npm | 包管理 | `10.9.3` | **已安装且验证** | 只读 `package.json`；未安装依赖 |
| Python | 静态服务器、资产生成脚本 | `Python 3.12.7` | **已安装且验证** | `http.server 8789`、`py_compile` |
| Blender | Hero Asset 制作、`.blend`、GLB/OBJ 导出 | **`Blender 5.3.0`**（build 2026-11-10，路径 `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`，不在 PATH） | **已安装且验证** | 仅版本核验；本轮未改资产 |
| Google Chrome | 浏览器/WebGL/交互测试 | `157.0.8103.79` | **已安装且验证** | headed 五关 E2E、FPS、截图、错误收集 |
| ego-browser（本会话） | 浏览器自动化替代 | 已运行，CDP 可用 | **已安装且验证** | 页面健康、截图、DOM/Canvas 检查 |
| FFmpeg | 录屏/视频工具链 | `2025-10-27 git-68152978b5-full_build` | **已安装且验证** | 仅盘点，本轮未录制 |
| glTF Transform | GLB 体积优化（可选） | `4.5.1`（`D:\npm\global\gltf-transform.ps1`） | **已安装且验证** | 仅盘点；不是项目启动依赖 |
| Playwright | 浏览器测试框架 | 本地 `node_modules/.bin/playwright` 不存在；仓库无依赖 | **未安装** | 用 Chrome CDP/ego-browser 替代，未自动安装 |
| 真实 DeepSeek Key | 真实问答/写作响应 | `server/.env` 不存在，环境变量未提供 | **未配置** | 仅验证无 Key 的 503，不伪造模型输出 |

## 能力缺口与替代

1. **Playwright 未安装**：现有 `tools/level-e2e.cjs`、`tools/fps-probe.cjs` 通过 CDP 连接外部 Chrome 9333，不是零依赖测试；本轮用同一路径完成基线。
2. **Blender 已安装**：Hero Asset 的 `.blend`、GLB、预览可以在本机制作，不构成环境阻塞；缺少的是资产制作工作量与验收。
3. **无 GPU 独立显卡**：FPS 测试机是 AMD 集显；不能把该结果外推到低端设备。
4. **无移动端设备**：本期明确不适配移动端，未准备手机/模拟器。
5. **无真实 API Key**：不能评估真实模型延迟/质量；只能验证前端契约和 503 降级。

## 结论

工具链足以支持后续阶段的代码修改、本地静态运行、浏览器截图和 Blender 资产生成；不足的是 Playwright 自动化套件和真实 API Key，但都有现有替代路径，不构成本阶段 BLOCKED。
