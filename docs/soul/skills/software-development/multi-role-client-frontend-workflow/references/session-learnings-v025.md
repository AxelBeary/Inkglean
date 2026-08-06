# v0.25 会话经验（2026-08-02）

## 1. 上下文压缩后必须验证 git 状态

压缩摘要中的进度声明（如"C/E/D 已 commit"）**不可信**。恢复后第一件事：

```bash
git log --oneline -5
git status --short
```

摘要说"已完成"但 git 显示无 commit = 从零开工。不要信任摘要，信任 git。

## 2. 新 worktree 必须先 npm install

`git worktree add` 创建的工作目录**不共享 node_modules**。验证链（ESLint/build）前必须：

```bash
cd web && npm install
```

否则 ESLint 报 `ERR_MODULE_NOT_FOUND: Cannot find package '@eslint/js'`。

## 3. patch 工具内置 lint 在 Windows 上的误报

patch 工具的自动 lint 检查在 Windows 上会因路径拼接错误产生误报：

```
Error: Cannot find module 'D:\d\Hermes Agent CN Desktop\...'
```

注意 `D:\d\` — 工具把 `/d/` 前缀错误拼接到盘符上。**这不是真实语法错误**。以 `npx eslint .` 和 `npm run build` 的实际结果为准。
