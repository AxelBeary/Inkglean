# git 完整性核查（一号/用户说「疑似删了你的文件」时）

> 触发：用户或一号转达「某文件被删 / 分支丢了 / 交付不见了」。用 git 事实说话，不猜、不恐慌。
> 事件：v0.39 F1F2 批交付后一号说「疑似删了你的文件」，核查结论 = 零缺失，误报源于「master 未合入」+ 脚本转义假错。

## 核查流程（按序，前两步通常已够）

1. **worktree + 分支 + HEAD**：
   `git worktree list` → worktree 还在；`git branch --show-current` → 分支还在；`git log --oneline -3` → 交付 commit 仍是 HEAD。
2. **git status --short**：`clean` = 无任何文件缺失（若有文件被删，git 会显示 `deleted`）。这是最快最可靠的「文件被删了吗」判据，**优先于一切逐文件比对**。
3. **全量比对（需要时）**：
   ```powershell
   $missing = @()
   $files = git -C <worktree> -c core.quotepath=false ls-tree -r --name-only HEAD
   foreach ($f in $files) { if (-not (Test-Path (Join-Path <worktree> $f))) { $missing += $f } }
   ```
4. **区分「被删」与「未合入」**：master 上找不到分支文件 = 正常（合入顺序由一号定，分支文件在 git 对象里完整保存）。合入前 master 没有 ≠ 丢失。

## ⚠️ core.quotepath 陷阱（本次踩坑）

`git ls-tree`（含 `--name-only`）在中文/非 ASCII 文件名上默认输出**八进制转义**（`\345\211\215\347\253\257...`）。
PowerShell 的 `Join-Path`/`Test-Path` 会把 `\xxx` 当字面量路径 → 报「路径中具有非法字符」/ 全部误报 MISS。
**必须加 `-c core.quotepath=false`**，否则脚本结果不可信。

## 回话模板

> 二号核查完毕：文件未删、零缺失。分支 commit `<hash>` 完好，工作区 clean，HEAD `<N>` 个文件全在磁盘上。master 上没有是**尚未合入**（非丢失）。若担心合入前丢失，git 历史已保存，随时可合。

## 附带：交付 commit 自检

交付前同样用 git 事实确认：`git status --short` 无杂物（只含本批文件）、`git status --short server/` 为空（二号铁律 server 零改动）、untracked 非 web 文件只剩交付报告。
