# Phase 06 Review Response

日期：2026-11-23  
当前审查基线：以本文件提交的 HEAD 为准（最终 SHA 见 handoff）。

## 对 P0 的核对

### P0-01 验证脚本/运行入口
本轮在当前 HEAD 上重新执行 `node tools/phase06-verify.cjs`，exit 0，得到：

- `window.__l4.loaded=true`；
- `level=0/1/2`；
- `groups={full:4, half:4, trays:2, hotspots:5}`；
- 5 个馏分、常压渣油底部路径、暂停、复位、退出/重进均通过；
- `web/levels/l4.js` 明确加载 `assets/tower/tower.obj?v=08`，并提供 `hotspotPoint`、`groups`、`loaded`、`selectHotspot` 等 API；
- `web/sandbox.html` 实际加载 `levels/l4.js?v=v52`。

如果审查读取的是 `34c7839` 或更早的 l4，会出现“只有 enter/exit”的旧结论；请以本次推送的 HEAD 复核。

### P0-02 阶段 04/05 签收
`docs/phase-reports/phase-04-handoff.md` 与 `phase-05-handoff.md` 已记录用户原话：

`签收阶段04、05，继续阶段06。`（2026-11-23）

P0-GOV-01 已关闭；阶段 06 的用户签收仍为待签收，不代签。

### P0-03 handoff/文档路径
当前仓库存在可读文件：

- `docs/phase-reports/phase-06-handoff.md`
- `docs/refining-experience.md`
- `docs/scene-distillation-tower.md`

若公开仓库返回 404，请确认读取的是 `main` 的本次 HEAD，而不是旧缓存/旧提交。

## P1 修复

- **P1-01 半剖/全剖**：`tower.js` 全剖把半壳 opacity 降到 0.18、关闭 depthWrite；`tower-full-cut.png` 已截图。l4 同样弱化半壳。
- **P1-02 常压渣油**：移除中部 `GasOil` 错误侧线；塔底 `Pipe_Residue_Bottom` → `Box_Residue`，l4 渣油路径改到底部；`phase06-06-residue-bottom.png`。中部只保留石脑油/煤油/柴油。
- **P1-03 入口统一**：canonical 详情是 `sandbox#stage=3` 的 l4；overview 是 LOD；`tower.html` 明确为兼容/回退页，不声称与 l4 共享 Store。详见 `refining-experience.md` §6。
- **P1-04 四出口旧文案**：当前 l4/文档无“四个抽出口”文案；保留的仅有其他阶段的“四个按钮/四个字段”等无关文本。

## audit-2 新增关闭项

- **P1-01 对象隔离**：`l4` 将常压塔/减压塔/加热炉分别拆成独立 detail 子组再 bind；验证 `detailIsolation.isolated=true`、单独隐藏 `vacuum_tower` 不影响常压塔/加热炉。
- **P1-02 Group 退出**：`exit()` 设置 `G.visible=false`；验证 `exit.groupVisible=false`、`reentry.groupVisible=true`。
- **P1-03 异步加载**：加载完成无条件拆分并幂等 bind；`enter()` 再补绑；race 测试 `bindings=atmospheric_tower,vacuum_tower,heater`。
- **P1-04 渣油路径**：overlay 改为塔底→减压塔，提示“塔底至减压塔路径”，`fractionTarget('residue')='vacuum_tower'`。
- **P1-05 引导**：l4 用 `data-level-id="l4"` 识别，禁用 l5 演示条；截图里已不再出现“点出石油化工常见下游产品”横条。

## 范围限制

- 资产仍是教学示意，不是工程级高精度模型。
- 辅助设备热点/面板排布仍需用户观察验证。
- FPS/内存、跨浏览器、N=5 用户测试未执行。
