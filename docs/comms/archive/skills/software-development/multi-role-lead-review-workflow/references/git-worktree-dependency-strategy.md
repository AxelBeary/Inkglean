# Git Worktree 依赖管理策略（node_modules 不共享的标准解法）

> 触发：每次派工建 worktree 都要处理依赖；或用户问「每次建 worktree npm 依赖得手动复制，有解法吗」。2026-08-14 研究结论（用户明确要求：先查生态标准解法，不造轮子）。

## 第一性：git 官方没有也不该有这功能

- git worktree 只复制 **tracked** 文件；node_modules 在 .gitignore 里，对 git 来说**不存在**，每个 worktree 天然独立。
- 官方文档（git-scm.com/docs/git-worktree）无 ignored/untracked 共享机制——这是设计边界，不是遗漏。
- **共享反而危险**：不同分支 package.json/package-lock.json 可能不同，共享 node_modules 会版本冲突、难排查（gitworktree.org 原话）。

## 生态标准解法（按推荐度，2026-08-14 查证）

| 方案 | 原理 | 结论 |
|------|------|------|
| **① pnpm + 全局 store**（业界标准答案） | 内容寻址 store + 硬链接，每个 worktree 的 node_modules 指向全局 store，5 worktree ≈ 1 的磁盘，`pnpm install` 秒级 | ✅ 推荐。专门为多 worktree 依赖重复设计 |
| ② npm ci | 跳过解析直接用 lock，比 npm install 快 | 只是快，没解决根本问题（仍全量装） |
| ③ symlink 共享 node_modules | 手动 ln -s 指向主仓 | ❌ gitworktree.org 明确警告：分支依赖分叉就炸。**本项目已踩坑**：worktree junction 被 npm install 替换致 jsdom 只落单边 |
| ④ git-worktree-share（第三方） | bash 脚本，ignored 文件放 .git/shared/ + symlink 进每个 worktree | 适合 .env 等小文件；node_modules 用 symlink 有③风险；bash 脚本 Windows 不友好 |

## 生态约定：.worktreeinclude（Claude Code 官方）

仓库根放一个 gitignore 语法的文件，列出要带进 worktree 的 ignored 文件；worktree 创建工具读它并复制。已在 7392+ 仓库使用（GH code search 实证），是事实上业界约定。

- 官方文档：https://code.claude.com/docs/en/worktrees#copy-gitignored-files-into-worktrees
- 规则：①匹配 .worktreeinclude 的 pattern 且 ②确实是 gitignored（tracked 不复制）
- 支持目录级（`node_modules/`、`.convex/`）、否定（`!`）、gitignore 全语法
- node_modules 用 **copy 而非 symlink**（cleo 仓库实证注释：symlink node_modules across worktrees 会坏 pnpm store；本仓也有 junction 被 npm 替换的教训）。大而只读的目录可用 symlink（nub 的 `[copy|symlink]` 两档），node_modules 走 copy。

## 结论与迁移代价

- **正解是迁移 pnpm**（包管理器层原生能力，不复制、不 symlink、不脚本），代价：server/web lockfile 换 pnpm-lock.yaml + CI/Dockerfile 同步改 + 开发流程变化。
- 属于**架构级改动，用户拍板**。未拍板前维持 robocopy 复制 node_modules（现状，简单可靠）。
- 给用户呈现时：先给「git 官方没有这功能」事实 → 再给方案对比表 → 建议 pnpm → 问是否做迁移可行性评估。

## 并行提交撞车教训（2026-08-14 实战）

多角色并行会话可能同时处理同一问题：一号在 worktree 修复 CodeQL #18/#19 时，另一进程以相同 diff 提交 `0d938d7c` 并合并清理了 worktree，导致：
- 一号的 commit 命令报 `did not match any file(s)`（worktree 目录已被删）
- 一号在 master 上找不到自己写的 comms 交付文件（文件只在分支 worktree 里，未合并）

**预防**：① 建 worktree 前 `git worktree list` + `git fetch` 确认无并行会话占用；② 合并前先 `git fetch` + 对照 `origin/master` 状态；③ 交付文件写完后若发现分支已被并行合入，**直接验证 master 内容一致性**（`git show <commit>` 对比 diff），内容一致即复用，不要重复提交；④ 遇到「文件找不到」先查分支/worktree 归属，再查 master。
