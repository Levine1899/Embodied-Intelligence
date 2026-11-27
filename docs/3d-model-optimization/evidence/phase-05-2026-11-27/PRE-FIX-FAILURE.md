# 修复前的失败记录（控制台摘录）

这两条是**在修复 harness 之前**由 captain 独立运行 `npm run test:e2e` 得到的真实输出，
说明该 E2E **不是"永远通过"的空测试**。修复内容见 harness.mjs 的 CHROME_ARGS
（增加 --disable-background-timer-throttling / --disable-renderer-backgrounding /
--disable-backgrounding-occluded-windows）。

根因：关卡退场动画靠 requestAnimationFrame 推进；headless 下窗口被判定为后台/遮挡时
rAF 降频甚至停顿，导致 exit() 永远走不完。

================ E2E SUMMARY ================
LEVEL.L2: 26/27 passed, 1 failed
LEVEL.L4: 0/1 passed, 1 failed
LEVEL.L3: 0/1 passed, 1 failed
TOTAL: 26/29 passed

FAILED: LEVEL.L2.L2.section.completed  {"error":"等待超时：stage.isLevel() === false（exit 动画结束）"}
FAILED: LEVEL.L4.L4.section.completed  {"error":"等待超时：stage.isLevel() === false（exit 动画结束）"}
FAILED: LEVEL.L3.L3.section.completed  {"error":"等待超时：stage.isLevel() === false（exit 动画结束）"}
e2e_exit=1

修复后同一命令：TOTAL 84/84 passed，exit 0（见 e2e-levels.log）。
