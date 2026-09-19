# Worktree 依赖复制：先找生态方案，不造轮子（2026-08-14 实证）

触发：每次 `git worktree add` 后 node_modules/.env 等 gitignored 文件要手动复制，
用户抱怨重复劳动。**用户明确纠正：先去找 git/生态的现成方案，不是自己造轮子。**

## 结论速查

1. **git 官方没有此功能**（git-scm.com/docs/git-worktree 全文无 ignored 文件共享机制；
   设计如此：worktree 只 checkout tracked 文件，ignored 文件天然独立——共享反而有
   分支依赖分叉风险）。不要再试图找 git 原生开关。
2. **生态标准答案是 `.worktreeinclude`（Claude Code 官方约定）**：仓库根放一个
   gitignore 语法的文件，列出要带进 worktree 的 ignored 文件；worktree 创建工具
   读它并复制。已在 7392+ 仓库使用（GH code search 实证），是事实上业界约定。
   - 官方文档：https://code.claude.com/docs/en/worktrees#copy-gitignored-files-into-worktrees
   - 规则：①匹配 .worktreeinclude 的 pattern 且 ②确实是 gitignored（tracked 不复制）
   - 支持目录级（`node_modules/`、`.convex/`）、否定（`!`）、gitignore 全语法
3. **node_modules 用 copy 而非 symlink**（cleo 仓库实证注释：symlink node_modules
   across worktrees 会坏 pnpm store；本仓也有 junction 被 npm 替换的教训）。
   大而只读的目录可用 symlink（nub 的 `[copy|symlink]` 两档），node_modules 走 copy。
4. **pnpm 全局 store 是另一条正道**：pnpm 用内容寻址 store + 硬链接，每个 worktree
   的 node_modules 硬链接到共享 store，5 个 worktree ≈ 1 个磁盘占用，install 秒级。
   架构级迁移（CI/Dockerfile/开发流程），需用户拍板。

## 推荐落地（本仓）

```gitignore
# .worktreeinclude（仓库根，Claude Code 约定，生态兼容）
server/node_modules/
web/node_modules/
```
配合一个 `scripts/new-worktree.ps1`：`git worktree add` → 读 .worktreeinclude →
robocopy 复制（copy 档）→ 冒烟验证。一次写脚本，所有角色共用，替代每次手动 robocopy。

## 研究方法（本次实证有效）

- DDG HTML 中文查询可行，英文查询常 0 结果 → 直接 gh code search：
  `gh api "search/code?q=worktreeinclude+in:file"`（返回 7392 结果）
- `gh api "search/repositories?q=..."` 找工具仓库
- 拉真实仓库的 `.worktreeinclude` 文件 + 实现脚本（new-worktree.ts）看规则细节
- 官方文档 SPA 抓不到具体段 → 用实际仓库文件补齐细节

## 用户偏好（重要）

- "不是 是去找找git有没有专门针对这种情况的解决方案，不是让你自己造轮子"——
  遇到重复劳动/工具缺失，先查生态现成方案（git 官方文档、GH code search、
  业界约定），确认没有再自己写。写脚本是最后手段，且要引用生态约定让未来兼容。
