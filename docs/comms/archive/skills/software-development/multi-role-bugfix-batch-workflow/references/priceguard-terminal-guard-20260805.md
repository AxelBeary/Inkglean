# 价格守卫批：终态守卫模式（2026-08-05 实战：updateFinalPrice/deleteExtraItem 补 delivered/cancelled 守卫）

## 场景
一号派工（中低风险）：updateFinalPrice 后端无终态校验（仅前端藏按钮），deleteExtraItem 同类自查。关键边界：**done 不拦**——done 是当前唯一减价窗口（负增项被 schema `minimum:0` 拦、负收款只退钱不调总价），done 守卫必须等 REQ-025 第二阶段负条目机制一起上。

## 终态守卫补漏模式（可复用）
- 守卫位置：函数开头 getOrder/not-found 校验之后、业务校验之前，复用现有错误码（如 `ORDER_FINAL_STATE`）不新增——errors.ts 常是其他角色授权区，禁碰
- **守卫顺序 404 先于 400**：deleteExtraItem 类（先查 item 归属再查订单状态），先抛 NOT_FOUND 不泄露终态订单里 item 的存在性，与路由层 requireOwnOrder 鉴权顺序一致
- 注释必须写明「有意不拦」的边界 + 原因 + 等哪个需求阶段（防将来误改）：`// done 不拦——done 是当前唯一减价窗口，待 REQ-025 第二阶段`
- 派工要求「顺手确认」的相邻函数（addPayment/addExtraItem）只读不改，结论写进交付报告

## 终态测试播种技巧（重要）
目标函数的兄弟函数自带守卫时（addExtraItem 拦终态 → 无法直接给终态订单造附加项数据）：
1. seedOrder 用**非终态**（pending）→ 走 API 正常添加附加项
2. `db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('delivered', order.id)` SQL 直接翻状态
3. 再执行被测操作 → 断言 400 + 错误码 + **DB 数据未变**（双断言：状态码 + 副作用为零）
- 有意不拦的状态必须显式断言 200（done 改价 200 / done 删项 200）——这是防将来误改的回归桩，派工点名要求

## 坑
- **子目录 cwd 的 git add pathspec 失败**：shell cwd 在 `server/` 里时 `git add server/src/...` 报 `did not match any files`（路径重复前缀）。先看 `git status --short` 输出的相对路径，按相对路径 add。
- **验证 hook 不认子目录套件运行**（本次新观察）：代码改完后在 `server/` 里跑 `npx vitest run` 两遍全绿（720/720），hook 仍报 unverified changes——子目录里执行的套件似乎不被记账。
- **Temp 脚本执行被审批门拦截**：写 `Temp\hermes-verify-xxx.ps1` 后 `pwsh -File` 执行，approval 超时被 BLOCKED。系统指示「勿重试勿换姿势」→ 正确应对：删掉临时脚本，**如实汇报已有套件证据（带时间戳 + 退出码）**，说明 hook 未认可的原因，把裁决权交回。与 deadcode 参考的「审批门降级为内联执行」互补：内联也不被认可时，最终兜底 = 诚实报告 + 会话内可查的套件输出证据，不伪造不硬闯。

## 验证数字
focus price-guard.test.js 7/7 + server 全量 720/720（存量 713 + 新增 7）。commit `8c38032`，授权文件仅 order.service.ts（+12 行）+ 新测试文件。
