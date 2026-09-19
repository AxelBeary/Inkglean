# 二号工作流陷阱备忘（2026-08 会话沉淀）

## PowerShell 终端不支持 `&&` 链式 git 命令

Hermes Windows 终端会把 `&&` 重写为 `; if ($?) {...}`，多段 `git add ... && git commit -m "..."` 会解析失败（报错"标记'&&'不是此版本中的有效语句分隔符"）。

**规则**：`git add` 和 `git commit` 拆成两次独立 terminal 调用；commit message 用单行 `-m`（多行消息也会触发解析问题）。

## Worktree 首次使用需 npm install

独立 worktree（如 `artist-commission-fe/web`）的 `node_modules` 可能缺失，ESLint 报 `Cannot find package '@eslint/js'`。

**规则**：验证链之前先 `cd web; npm install`。这不是环境故障，是 worktree 工作流的固有步骤。

## 验证证据引用而非重跑

改动在独立 worktree 时，系统可能检测不到 canonical 命令（workspace 根目录不匹配，提示"未检测到验证"）。

**规则**：引用 comms 中已记录的验证结果（commit hash + 数字），不重跑——一号合入前会独立验证。这是用户拍板的效率纪律。

## ESLint --fix 先行

`npx eslint . --fix` 可自动修复 multiline-html-element-content-newline 等格式警告。验证链第一步直接带 `--fix`，再跑一次确认 0 错 0 警。

## i18n 只加不改

新增键时不得修改既有键的措辞/标点/格式。本轮在 `installmentsTitle` 行尾追加新键时，保留了原行全部内容，仅在其后插入新行。
