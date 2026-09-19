# 合入门禁与收尾坑集（v0.39/v0.40 实录）

## 1. 合入引入新依赖 → 先 npm install 再跑测试门

合入含新依赖的分支（如 simple-icons）后，在主 worktree 直接跑 build/vitest 会报 `Rollup failed to resolve import "xxx"` / 测试挂——**node_modules 没有新包**。任何分支合并后跑测试门前，先在该 worktree `npm install`。同一轮踩了两次（F1+F2 合入主仓 build 挂、polish worktree vitest 挂），install 后全过。

## 2. comms 批量删除：逐文件对照合入清单

"合入即删"清理时，`git rm` 列表必须逐个对照**已合入批次**；在途角色的派工文件绝不能删（角色 merge master 后派工就没了）。v0.39 事故：一次 git rm 七个文件，其中二号/五号在途派工误删，幸而提交前发现，`git restore --staged --worktree <files>` 恢复。操作顺序建议：先列 comms 全量 → 标已合入/在途 → 只 rm 已合入 → `git status` 复核暂存区再 commit。

## 3. 角色窗口滞后重复汇报

角色外部窗口可能重复汇报**已合入**的批次（窗口状态滞后，如三号重报 addons 第一批）。处理前先 `git log --oneline` + STATUS 核对该 commit 是否已在 master：已合入 → 告知用户"已处理，窗口消息滞后"，不重复审核；不在 → 正常流程。不猜测、不静默跳过。

## 4. 分支落后 master 的净 diff（标准流程固化）

角色分支基点落后 master 时，`git diff master..branch` 会把 master 新内容显示为"删除"（噪音，含 locales/其他角色合入文件）。**审核前必做**：角色 worktree 先 `git merge master`（零冲突常态），再看净 diff。merge 后若引入新依赖回到第 1 条。

## 5. 同角色多批排队：派工写明序

给同一角色连派两批（如五号安全批 + 巡检批）时，后派的文件头部写明「前批在前、本批在后、同窗口按序、不可同时开工」，防止角色并行开两批互相污染。只读批可注明"不需新 worktree，用主仓代码"。

## 6. 分支/worktree 生命周期整体盘点（2026-08-06 用户问"有大量分支和细碎小文件"）

用户问"是不是分支/文件堆太多了"时，做**系统清点**而不是随手删。顺序：

1. **全景三查**（并行）：`git branch -a`（本地+远程）、`git worktree list`、`git ls-files docs/comms/`。三查出全貌，再逐个定性。
2. **分支定性**：`git log --oneline -3 <branch>` + `git diff master...<branch> --stat`，判断 ①已合入（含进 master）②在途（有未合 commit）③只读交付（交付物在主仓、分支无代码价值）。已合入/只读 → 可删；在途 → 保留。
3. **回收前必查 worktree 工作区**：`git -C <worktree> status --short` 必须干净才 `git worktree remove`。有未提交改动 → 先处理再回收。
4. **`git branch -d` 拒删只读分支**：只读批分支（如 template-check，改动是截图+报告且已复制进主仓）会被判定"未完全合并"。核实交付物是否已在 master（`git ls-files` 确认），在 → `git branch -D` 安全删（无代码价值）。
5. **comms 批量清理**：`git rm` 前逐个对照合入状态（同第 2 条）。保留：STATUS + 在途派工 + 有效参考报告（研判/审计核实等 STATUS 标注"待排期消费"的）；删除：已合入批的派工 + 交付 + 已消费派工。删完 `git ls-files docs/comms/` 复核。
6. **清理是常驻习惯不是一次性**：每轮收尾（合入批后）顺手删该批派工/交付 + 回收 worktree，不攒到用户问。用户问 = 已经攒过头了，属于门禁失职。

典型结果形态（2026-08-06 实例）：7 分支 → 3（master + 2 在途），7 worktree → 2，comms 14 文件 → 6（STATUS + 2 在途派工 + 3 参考）。
