# Phase 01 交接报告 · 审计基线

日期：2026-11-22
阶段：01_AUDIT
状态建议：**REVISE**（不是 PASS）
用户签收：**待用户签收**

> 前置文件说明：工作区没有 `00_MASTER.md`、`PHASE_HANDOFF_TEMPLATE.md`，也没有上一阶段交接。阶段 01 无上一阶段，不因此判定阻塞；本报告按本轮总控消息中的模板字段组织。缺失本身记录为风险，未用历史记忆补齐。

## 1. 任务逐项状态

| 任务 | 状态 | 证据 |
|---|---|---|
| A 仓库与版本 | **通过** | `git status` 干净；`main` / `be08acf`；Three `REVISION='180'`；package/README/CHANGELOG 3.4.0；`PACKAGE-README.md` 缺失、代理注释过期已记录 |
| B 页面与业务结构 | **通过** | 9 个正式页面、入口/深链/回链、五关与六章映射、无 API 行为，见 `docs/audit-baseline.md` §2 |
| C 三维结构 | **通过（有 P0 发现）** | `immersion.js`/`tower.js` 审查；渲染、相机、区域、关卡、Raycaster、RAF、fallback 见 §3 |
| D 资产盘点 | **通过** | `docs/asset-inventory.md`：49 个资产/19.16 MB，逐项加载与质量 |
| E 互动与内容 | **通过** | `docs/interaction-inventory.md`：13 设备、5 关、塔页、AI 矩阵 |
| F 工具准备度 | **通过** | `docs/tooling-readiness.md`：Git/Node/Python/Blender/Chrome/FFmpeg/glTF Transform 已装；Playwright 未装 |
| G 资产质量与来源 | **通过（Hero Gate 未达）** | 五台 Hero/塔无 `.blend`、无部件语义、无 UV/贴图/授权；分离器无内部剖切 |
| H 测试基线 | **通过（已建立基线；含失败项）** | `docs/test-baseline.md`：语法、HTTP、页面健康、五关 E2E、FPS、塔剖切、context lost、无 API |

## 2. 修改文件

- `docs/audit-baseline.md`（重写）
- `docs/asset-inventory.md`（重写）
- `docs/interaction-inventory.md`（新增）
- `docs/test-baseline.md`（新增）
- `docs/tooling-readiness.md`（新增）
- `docs/phase-reports/phase-01-handoff.md`（本文件）
- `docs/phase-reports/evidence/phase-01/*.png`（14 张浏览器证据）

未修改任何业务代码、未删除/移动/重命名资产。

## 3. 起止 Commit

- 起始：`be08acf`（`main`，工作区干净）
- 审计文档提交：`41b69ed`（docs-only；提交信息 `docs: phase 01 audit baseline`）
- 结束：本报告修订提交（docs-only，见 `git log -1`）

## 4. 执行命令

```bash
git status --short
git log --oneline -5
git remote -v
node --check <web/**/*.js>                  # 16 个文件
node --check server/dev.mjs server/proxy.mjs
python -m py_compile tools/make_hero_assets.py tools/spike_separator.py
python -m http.server 8789 --bind 127.0.0.1 --directory web
curl -s -o NUL -w "%{http_code}" <pages/assets>
node tools/level-e2e.cjs                    # headed Chrome 9333
node tools/fps-probe.cjs                    # headed Chrome 9333
# Chrome + CDP：页面健康、错误收集、截图、DOM/Canvas 断言
# PIL：tower-half.png vs tower-full.png 像素差
```

## 5. 真实测试证据

| 证据 | 结果 |
|---|---|
| 静态语法 | 16/16 JS + 2 mjs + 2 Python 通过 |
| HTTP | 9 页面全 200；关键资产 200；404 正常 |
| 页面健康 | 8 个页面 0 JS 错误；**sandbox 1 个 P0 错误** |
| 五关 E2E | 5/5 通过，五关都写回 interaction 且退出清空 |
| 深链 | `#stage=3` → `stageId='refine'` |
| 设备列表 | 13 项，点选写回 `selectedObjectId` |
| FPS | 89.4 fps / p95 11.2 ms / 0 long frames（AMD 集显 DPR2） |
| 塔剖切 | 外观 vs 半剖 mean diff 21.21/255；半剖 vs 全剖 **0.29/255** |
| Context lost | fallback 显示正确文案；恢复后观察部分未执行 |
| 无 API | ask 库内命中；write 显示原始 JSON 错误；proxy 503 |

截图目录：`docs/phase-reports/evidence/phase-01/`（sandbox、stage0/1/2/3、device、tower 三态、ask、write、chapter、context-lost）。

## 6. P0 清单

| # | P0 | 事实证据 | 影响 |
|---|---|---|---|
| 1 | 沙盘 AI 面板运行时崩溃 | `ai.js:104` `insertBefore` NotFoundError；`.leadai` 不存在；`#leadai-q` 不存在 | 右栏问一句/生成材料/设备“问 AI”全部不可用 |
| 2 | Hero Asset Gate 未达 | 五台 Hero + 塔无 `.blend`；OBJ 只剩材质桶名；无 UV/贴图/授权；分离器无内部剖切 | 不能宣称资产验收通过；阶段 04/05/06 必须补齐 |
| 3 | 塔全剖与半剖视觉差异不足 | 像素 mean diff 0.29/255；仅粒子/说明变化 | 不满足验收底线第 9 条“外观/半剖/全剖真正不同” |

**任一 P0 未解决，阶段不得 PASS。**

## 7. P1 / P2

### P1

- `write.html` 无 API 时显示 `Unexpected token '<'`，无可读降级。
- 塔页无 `__sceneContext`，不能把热点/剖切状态传给 AI。
- `ask.html` 服务不可用时提示“暂时没有找到”，未区分无答案/服务故障。
- 13 个设备只有观察层；分离器/储罐/加热炉无结构探索。
- l1–l5 的操作结果没有写回总览设备/知识库，闭环停在关卡提示。

### P2

- `PACKAGE-README.md` 缺失；旧 `audit-baseline/asset-inventory` 与现状冲突。
- 未使用资产约 9–10 MB；未清理/未标设备用。
- 测试脚本依赖外部 Chrome 9333；无 Playwright 套件。
- 无真实用户测试、无跨浏览器/无 WebGL 基线。

## 8. 资产情况

| 资产 | 判断 |
|---|---|
| 分离器 | 需精修（无内部剖切、无部件语义、无 `.blend`） |
| 抽油机 | 需精修（三组动画可复用） |
| 井口 | 需精修 |
| 外浮顶罐 | 需精修 |
| 加热炉 | 需精修 |
| 常减压塔 | 需精修（全剖需重做） |
| 地下地质/井筒 | **必须新建**（阶段 04） |

结论：可运行演示 ≠ Hero Asset Gate 通过。

## 9. 遗留问题

1. 三个 P0 必须返修后重新提交证据。
2. 真实用户测试、无 WebGL 环境、跨浏览器、真实 API Key 响应未执行；不得写成通过。
3. 未执行移动端（本期明确不适配）。
4. 本阶段未修改业务代码，因此 P0 修复不在本阶段完成。

## 10. Agent recommendation

**REVISE。**

理由：审计任务本身完成，基线、页面、资产、交互、测试证据齐全；但当前 HEAD 存在沙盘 AI 运行时 P0、Hero Asset Gate 未达、塔全剖视觉差异不足。按总控规则，P0 未解决不得建议 PASS。

建议返修顺序（仅建议，不执行）：

1. 修复 `ai.js` 插入位置（P0，最小改动）；
2. 明确塔全剖内部结构方案并补齐资产（P0）；
3. 为五台 Hero/塔补 `.blend`、语义节点、材质/贴图/授权记录（P0，阶段 04/05/06 前置）；
4. 再进入阶段 02 体验设计。

## 11. User acceptance

**待用户签收。**

Agent 不代替用户勾选。请用户明确回复类似“阶段 01 验收通过，放行进入阶段 02”，才可继续；若要求返修，按总控规则留在阶段 01 更新本报告和证据。

## 12. 停止声明

**本阶段已停止，等待下一阶段 Prompt。**
