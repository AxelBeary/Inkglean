# 文档维护批次陷阱（2026-08-02 会话）

## 搜索源码文件路径

搜索项目 .js 文件验证 TS 迁移状态时，路径必须限定到 `server/src`：

```powershell
# ✅ 正确
Get-ChildItem -Path server/src -Filter "*.js" -Recurse

# ❌ 错误 — 会搜到 node_modules 上万行
Get-ChildItem -Path server -Filter "*.js" -Recurse
```

## git mv 目标目录

`git mv` 到不存在的目录会静默失败（PowerShell 下 exit code 仍为 0 但文件没移动）。
归档前必须先建目录：

```powershell
if (!(Test-Path "docs\archive\specs-done")) { New-Item -ItemType Directory -Path "docs\archive\specs-done" -Force }
```

## 文档维护批次标准流程

一号派工后的执行顺序：
1. 读派工 comms 文件，确认任务清单
2. 读目标文件（待修复清单、CONTEXT.md、要归档的文件）
3. 批量 patch 状态变更（待修复清单、SPEC 状态、CONTEXT 数据）
4. `git mv` 归档文件（先建目录）
5. `git add` 所有变更 → `git diff --stat --cached` 确认只有 docs
6. 单次 commit + push，message: `docs: v0.XX 文档维护——<摘要>`

## CONTEXT.md 更新检查项

- 测试数（后端/前端/E2E）
- 迁移版本号（看 migrations/ 目录最新文件）
- 新术语行（v0.XX 新增的业务概念）
- TS 迁移描述（验证剩余 .js 入口是否变化）
