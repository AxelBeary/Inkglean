# 跨 worktree 污染诊断 + 交付文件查找 + 卡死会话处置

> 来源：v0.36 波 2 实战（五号 enrichOrderForArtist 污染事故、三号/五号-B 交付位置差异、一号分身窗口卡死诊断）。

## 场景 A：角色报"别人的活出现在我的 worktree" / 大面积测试 500

**症状**：某角色 worktree 里出现对未定义函数的调用（如 20 处 `enrichOrderForArtist(...)` 调用、0 处定义），几十个测试全 500；角色怀疑"别的角色的改动漏进来了"并开始自行侦查。

**一号诊断步骤（亲自做，4 步定案）**：
1. `git log --oneline -3` 看该 worktree HEAD 是否落后 master——被怀疑"泄漏"的改动是否已在期间合入 master。
2. grep 双计数：`调用次数 = Select-String "funcName\("` vs `定义次数 = Select-String "function funcName"`。调用>0 且定义=0 = **部分污染**（改动被带进来但只带了调用没带定义）。
3. 读 master 上该函数完整版，确认定义位置（本例就定义在 routes 文件内部，不在 service）。
4. `git status --short` 分清哪些文件是角色自己的活、哪些是污染文件。

**角色高频误诊（必须打断纠正）**：五号当时判断"三号只写了 routes 没写 service → 函数未定义"——方向错。函数本就不该在 service 里，真相是**别的角色的改动被部分带进了本地文件**。让角色继续自查只会烧掉迭代预算（子代理约 50 次上限），方向明确错误时**立即打断**。

**打断消息模板**（四段式，可直接复制给角色）：
1. 停止侦查 + 一句话实锤根因
2. 事实链（编号列出：worktree 基线、master 现状、调用/定义计数证据、与角色自己工作无关的证明）
3. 恢复步骤（精确命令）：
   - `git checkout -- <被污染文件>`（**只还原这一个文件**，角色其他改动全保留）
   - `git merge master`（拉入完整版改动）
   - 重跑全量测试确认基线
   - 继续原任务
4. 安抚 + 顺带确认角色自己的工作成果没问题（看一眼他自己的 diff，质量 OK 就明说保留）

**预防规则（补进派工纪律）**：任一角色的改动合入 master 后，所有在途角色**跑测试前必须先 merge master**——在过期基线上跑测试会出这种幻影失败。审核交付时若角色基线落后，确认其 merge 后重跑过测试再合。

## 场景 B：交付文件位置查找顺序

用户说"X 转交，文件：docs/comms/..."时，文件可能在两处（两种习惯都真实存在）：
1. **主仓 docs/comms/**——先查这里；可能未 commit（五号-B 直接写进主仓 comms 未入库）
2. **角色 worktree 的 docs/comms/**——角色 commit 在自己分支未推送（三号案例）

两处都没有 → 去角色 worktree `git status --short` + `Get-ChildItem docs/comms -Filter "<编号>-*"`。找到后注意：worktree 里的交付文件会随 merge 一起进来，主仓未跟踪的要在合并后一并清理（comms 合入即删）。

## 场景 C：卡死的角色窗口（一直"思考"数小时）

**诊断路径**：
- `logs/errors.log` 尾部：`APITimeoutError` / `Stream drop ... incomplete chunked read` = 上游 provider 流中断，不是本地 bug
- `cache/delegation/live/*/manifest.json` 按时间倒序：确认最后的 delegation 是否已 completed
- 会话 history 过大（几百条消息）会放大超时概率

**杀窗口前的安全判定**：确认产出已持久化——`git log` + `git rev-list --left-right --count master...origin/master` = 0/0（已推送）+ 工作树干净 → 杀窗口零损失。

**杀完必做**：重开窗口先 `/new` 开干净会话再干活（旧会话上下文太大，不 /new 重开还会卡）。
