# 性能预算（V1.1 · Phase 10）

> 预算来自 **实测**（AMD Radeon 集显 + Chrome，D3D11 硬件路径），不是拍脑袋填的值。
> 数据源：`docs/3d-model-optimization/evidence/phase-10-2026-11-27/baseline-gpu.json`。

## 1. 实测现状（单场景稳态）
| 场景 | FPS 均值 | FPS P5 | 帧时间 P95 | draw calls | triangles | geometries | textures |
|---|---|---|---|---|---|---|---|
| 总览 | 91.3 | 87.0 | 11.5 ms | 293 | 85,392 | 478 | 8 |
| L1 地质剖面 | 90.3 | 87.0 | 11.5 ms | 102 | 7,056 | 565 | 8 |
| L2 集输 | 88.4 | 86.2 | 11.6 ms | 126 | 20,428 | 669 | 15 |
| L3 储运 | 90.2 | 88.5 | 11.3 ms | 114 | 31,734 | 779 | 19 |
| L4 炼化 | 90.1 | 88.5 | 11.3 ms | 352 | 75,138 | 1,066 | 22 |
| L5 终端 | 90.6 | 88.5 | 11.3 ms | — | — | — | — |

结论：**当前设备上帧率不是瓶颈**（受 60Hz/垂直同步影响实际稳在 88–91），
真正需要盯的是 draw calls 与常驻 geometry 数（每次进出关卡都 +100 左右）。

## 2. 预算（按实测上浮 20% 作为上限）
| 指标 | 预算 | 依据 |
|---|---|---|
| draw calls / 场景 | **≤ 420** | 实测峰值 352（L4），留 20% |
| triangles / 场景 | **≤ 100k** | 实测峰值 85.4k（总览） |
| geometries 常驻 | **≤ 1,300** | 实测峰值 1,066（L4） |
| textures 常驻 | **≤ 26** | 实测峰值 22（L4） |
| 单个 GLB | **≤ 700 KB** | 除 `tower.glb`（4.0 MB）外最大值 710 KB |
| 单场景 GLB 总量 | **≤ 8 MB** | 实测全量 7.38 MB |

## 3. 超标项（已知，非本轮引入）
- `assets/tower/tower.glb` = **4,033,676 B**，占全量 55%。若需压预算，优先对它做
  网格简化或 Draco（本轮**未做**，见报告"未做"清单）。
- `assets/underground/underground.glb` 710 KB 是 Phase 9 的旧版回退资产，
  已由 4 个 v2 资产替代；保留仅作 fallback，**计入预算但不进首屏**。

## 4. 口径纪律
- `renderer.info.memory.geometries/textures` 只是**资源数量**，不是显存。
- 资源字节按 `BufferAttribute` 与贴图尺寸估算时必须标 **estimate**。
- 显存占用本机 **NOT_AVAILABLE**（WebGL 不暴露）。
- CI/无头环境走 SwiftShader，**只做功能验证**，其结果不得作为 GPU 性能证据。
