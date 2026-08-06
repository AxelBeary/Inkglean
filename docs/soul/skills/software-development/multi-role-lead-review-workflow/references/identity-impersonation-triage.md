# 角色窗口跑偏 / 冒充一号 — 挽回分诊剧本

触发：用户说「有个 X 号窗口以为自己是 Y 号，瞎干了 N 小时，确认损失、检视什么能用、正确派工」。
实例：2026-08-05 一个二号窗口误认自己是一号，代行了约 4 小时门禁/派工/合并。最终定性零代码损失。

## 核心心态

1. **不预设破坏**。跑偏窗口可能实际在正常执行完整工作流（本次实例：冒充者把 v0.37 五路收官+TOTP+v0.38 全部派工都做完了，每笔 merge 带审核 trail）。先验证再定性，不要上来就回滚。
2. **审核权被代行 ≠ 成果作废**，但真一号必须补做追溯门禁：独立复跑测试 + 历史核查。对方留了审核 trail 也不能免检（trail 是冒充者自己写的，self-report 不可信）。
3. **author 信息无用**：项目所有 commit 都是同一个 git 身份（AxelBeary noreply）。定性靠：reflog 线性度（有无 reset/rebase/force）、commit message 规范（带「一号审核:...」的 merge = 门禁行为）、时间窗对照。

## 八步分诊

### 1. 冻结与主仓侦察（并行批量）

```powershell
cd <主仓>
git status; git worktree list; git log --oneline -8
git for-each-ref --sort=-committerdate refs/heads --format="%(committerdate:iso8601) %(refname:short) %(objectname:short) %(subject)"
git reflog --date=iso -20          # 找 reset/rebase/force 痕迹
git rev-parse origin/master; git rev-parse master   # 跑偏者是否推送了
```

### 2. 时间窗文件扫描

按跑偏时长反推窗口起点，扫描该窗口内所有被改文件（排除 node_modules/.git/dist/coverage）。关键用途：
- 确认跑偏者碰过哪些目录（主仓 vs worktree）
- 确认「最后一个 commit 时间」之后主仓是否还有动静 → 判断跑偏者是否已停手

### 3. 读 STATUS.md + comms 最新文件

特别是「用户侧接力指令」类文件——那是跑偏者留给执行窗口的最新指令，后面第 7 步要逐条验证后决定沿用还是重写。

### 4. 定性 master 历史

- reflog 线性 commit 链、无 reset/rebase → 历史未被重写
- `git log --since="<当天0点>" --format="%h %ci %s"` 列出全部提交，对照 STATUS 记账逐步核对（测试基线每一步是否对得上、迁移版本是否一致）

### 5. 独立复跑测试门禁（master）

- server：`npm test`
- web：**`npm run test:web`**（⚠️ 脚本名是 `test:web` 不是 `test`，`npm test` 会报 Missing script）
- 顺手查：`Select-String init.js 'version:\s*\d+'` 迁移版本、`docker ps` 容器健康、备份文件是否存在

### 6. 盘点各并行 worktree 分支

```powershell
git log --format="%h %ci %s" master..<branch>        # 独有 commit
git diff --stat master...<branch>                     # 增量规模
git -C ../<worktree> status --short                   # 是否有未提交残留
```

断点可信判据：阶段 commit 的 message 写明了「进行中/待续」清单，且 diff 规模与描述相符。

### 7. 什么能用 + 正确派工

- master 测试全绿+历史干净 → 全部可用
- worktree 断点可信 → 沿用
- **跑偏者最后落盘的接力指令不要盲目重写**：逐条对照分支实况（断点 hash、范围红线、纪律条款），对得上就直接沿用——重写是浪费且可能引入新错误。
- 派工时提醒用户：每个窗口粘贴指令必须带角色名开头（「你是X号…」）。

### 8. 防再发落库

STATUS.md 加「身份自检」条款（所有窗口开工先确认身份/一号只有一个/执行窗口不碰 master 不派工不改 STATUS/指令必须带角色声明），commit + **立即 push**（合并安全规则）。

## 汇报格式（给用户的挽回报告）

损失确认表（master 历史/测试/迁移/容器/备份/工作区逐项 ✅❌）→ 那段时间实际干了什么（定性：瞎干 or 正常跑流程）→ 什么能用 → 正确派工 → 防再发措施。
