# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-02 v0.27 完成 + hotfix
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`fba3178`，与 origin 同步
- **后端测试**：567/567 通过（34 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过（Playwright，已接入 GitHub Actions CI）
- **迁移**：v29 已应用（order_start_date）
- **容器**：✅ 已重建（含五号 hotfix）

---
## v0.27 完成清单

| 项 | 角色 | 状态 |
|---|---|---|
| A 多模板随机前端 UI 开关 | 二号 | ✅ |
| B REQ-015 手动录单重设计（全屏双栏） | 三号 | ✅ |
| C v0.26 路由层集成测试 10 用例 | 五号 | ✅ |
| REQ-014 三轮细化状态同步 | 四号 | ✅ |
| 文档维护（changelog v0.25-27 + README） | 四号 | ✅ |
| admin workflow PUT schema 补字段 | 一号 | ✅ |
| Hotfix: 截稿日/开工日 date-picker 点选无效 | 五号 | ✅ computed→ref+watcher |

---
## 已知遗留

| 项 | 优先级 | 说明 |
|---|---|---|
| app.js Windows 路径分隔符 bug | 中 | `startsWith(WEB_DIST + '/')` 在 Windows 永远 false，本地 E2E 全挂。1 行修复（path.sep 兼容）。五号发现，Docker/CI 不受影响 |
| QQ 历史面板客户端过滤（pageSize=200） | 低 | 画师场景同客户极少超 5 单 |

---
## 下轮核心候选

| 项 | 来源 | 说明 |
|---|---|---|
| **REQ-016 后台界面逻辑重组** | 四号+用户 | 7 问题诊断 + 设置页 4 Tab 重组 + 接稿状态归位 + 菜单位整理。用户已拍"先记录，下一轮改进"。6 项待拍板决策 |
| app.js Windows 路径修复 | 五号 | 1 行，可并入任何后端任务 |

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | 当前 `fba3178` |

---
## 各角色状态

全部空闲。

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
