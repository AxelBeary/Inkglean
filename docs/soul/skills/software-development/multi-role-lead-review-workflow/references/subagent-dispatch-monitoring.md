# 子代理派工：预算陷阱 / 监视 / 并行协调

> 适用：一号把二号/三号/五号任务用 delegate_task 以后台子代理形式执行，用户可能同时开着左侧手动角色窗口。

## 迭代预算陷阱（2026-08-05 v0.36 事故）

子代理有 max_iterations 上限。**重度侦察**（读 soul/STATUS/派工 + 逐条核对源码 + npm install）可能在写第一行代码前耗尽预算——任务以 `status=completed, exit_reason=max_iterations` 结束，summary 是"侦察完毕"，worktree 里零 commit。

处置（已验证）：
1. 读 live transcript 尾部确认是预算耗尽而非失败。
2. 重发时在 goal 里写明：**侦察已完成，本轮直接编码，不要重新大量读文件，把工具预算留给编码和测试**。
3. 把上一轮的关键侦察结论（行号、现有代码结构、API 契约要点）直接写进 context，新一轮不必重复侦察。
4. 预防：首轮派工 context 就写"控制侦察深度，定点读文件，别全文件通读"。

## 监视职责

- 用户**看不见**子代理进度（原话"右边子代理我完全看不见 得你自己监视"）——一号是唯一监视人。
- 看进度：`Get-Content <hermes-home>/cache/delegation/live/<delegation_id>/task-N.log -Tail 8`。
- 不等 final 结果也能查交付：worktree 里 `git log <base>..HEAD` 看 commit 是否已落。
- 交付后 self-report 不可信：读 diff + 亲自重跑测试（vitest/tsc）再合。

## 与左侧手动角色并行

- 用户左侧可能同时开着二/三/四/五号手动窗口。一号必须**明确声明**哪些 worktree 被子代理占用（"这三个目录谁都不许进"）。
- 只给手动角色派**零冲突**任务（如四号纯文档 changelog），其余待命。
- 与当前波次改**同一批文件**的任务（locales/QueueBoard/OrderDetail 等）禁止并行派发，等本波合入再派。

## 合并测试门：数目对账

每次合并后跑全量测试并做**数目对账**：基线 ± 增删用例 = 当前数（v0.36 实例：711 −7(五号删) +1(五号增) −10(三号删) = 695）。对不上就查原因，不能只看"全绿"。

## 派工 context 完整清单（2026-08-05 实战固化）

delegate_task 的 context 必须自包含（子代理无会话记忆）：
1. 角色身份 + soul 文件路径 + 全中文输出要求
2. worktree 绝对路径 + 分支名 + 「第一步 cd 进去先 `git merge master` 再读派工文件」
3. 任务逐条摘要（含行号锚点，派工文件是权威）
4. 授权文件白名单 + **禁区点名**（正在被其他子代理改的文件，如 QueueBoard.vue——并行必撞车）
5. 验证步骤（npm install + vitest + eslint + build，基线数字）
6. 完工动作：git add 逐个加（禁 -A）→ commit 格式 → 交付报告路径 → 不推送不合并
7. 返回物要求：commit hash、测试结果、交付报告路径、遗留问题

## 克隆窗口卡死诊断（"分身一直在思考/派发失败几小时"）

用户可能报告某个并行 Hermes 窗口（同一 soul 提示词的"分身"）卡死数小时、反复重开无效。诊断路径（2026-08-04 实战验证）：

1. **看委派现场**：`cache/delegation/live/` 按 LastWriteTime 排序，读最新 manifest.json 的 `status` / `exit_reason`（如 `max_iterations`）和 task log 尾部——确认子代理本身是完成了还是卡住了。
2. **看 API 健康**：`logs/errors.log` + `agent.log` 搜 `APITimeoutError`、`Stream drop`、`incomplete chunked read`、`429`。反复超时/流中断 = provider 端不稳，不是用户操作问题。
3. **看上下文规模**：`agent.log` 搜 `conversation turn`，看 `history=` 数字。几百条消息的会话 + 大缓存 = 每轮越来越慢直至卡死——这解释了"重开也没用"（若重开后仍扛同一份大上下文）。给用户的处方：杀窗口后先 `/new` 开干净会话再干活。
4. **杀前安全确认**：`git fetch origin --quiet` 后 `git rev-list --left-right --count master...origin/master` + `git status --short`，确认产出已 commit+push、工作树干净，才能告诉用户"直接杀，不丢东西"。
5. **卡死≠丢活**：卡住的窗口往往已完成"写派工+commit+push"，只差通知用户转达角色——检查 docs/comms/ 是否已有新派工文件，有则审核内容并直接给用户开工指令，不必重做。

## 验证证据协议（收工时系统可能索要 ad-hoc 验证证据）

合并后的测试门（一号亲手跑的 vitest/tsc/eslint）是底稿。若系统额外索要定向验证证据，标准动作：写临时脚本 `C:\Users\<user>\AppData\Local\Temp\hermes-verify-<主题>.ps1`（Set-Location 到 server 或 web + 全量三件套，逐项打印 exit code）→ 运行记录输出 → `Remove-Item` 删除 → `Test-Path` 确认 False。五号交付曾遇到审批门拦截临时脚本——改用等价内联命令（`npx vitest run tests/x.test.js` 定向跑 + `npx eslint <file>`）同样有效。
