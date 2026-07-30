# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-07-30（v0.16 第一层派工）
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`26be963`（v0.16 派工 comms），与 origin 待同步
- **测试**：197/197 通过（7 文件）
- **构建**：通过
- **迁移**：v15 已应用（accent_color + deadline）
- **容器**：commission-web healthy + commission-caddy running

---
## v0.15 已合入内容（完整版）

| 项 | 内容 |
|----|------|
| 三号后端 | R46 备注删除 + R52 今日统计 + 迁移v15 + R49 取色 + R51 截稿日 + CSP + note-image测试 + R56 倍率排序 + R52 补N单 |
| 五号审计 | 文档14处修复 + 代码质量/安全审计报告 |
| 二号批次1 | R46 备注删除前端 + R40 时间线合并 + R53 焦点替换 |
| 二号批次2 | R48 头像 + R49 取色器 + R50 预览 + R55 示例图拖拽 |
| 二号批次3 | R51 截稿日/待办卡片 + R52 今日统计行 + OrderDetail/ManualOrder 截稿日设置 |
| 二号收尾 | R57 表单防丢失 + UI-9 图库闪烁修复 |
| 文档清理 | README/changelog/REQ-009/REQ-010/soul-01/soul-03/.gitignore/ENV-1/comms清理 |

---
## v0.16 候选（明天排期）

| 项 | 内容 | 前置 |
|----|------|------|
| R54 | 档位页表格→卡片（C63/C64 已确认） | 无 |
| R55 扩展 | 示例图历史版本保留（C65 推翻为保留） | 三号迁移 |
| R58 | 约稿页视觉改版（用户4条方向+视觉原型） | 用户给原型截图 |
| R38 | 附加工作项 | 用户确认 SPEC-003 |
| R57 补 | 约稿页粘贴上传不稳定（UI-9 粘贴 Bug） | 二号排查 |
| 技术债 | 价格回退链×4/活跃过滤×8/ISO格式化×6/大文件拆分 | 无 |
| 覆盖率 | upload 32%/greeting 31% 专项 | 无 |

---
## 各角色任务状态

| 角色 | 当前任务 | 状态 |
|------|----------|------|
| 二号 | 工艺CSS升级 + R54档位卡片（`feat/v016-frontend-batch1`，wt02） | 🔵 进行中 |
| 三号 | 技术债：价格回退链/活跃过滤/ISO日期（`fix/v016-tech-debt`，wt03） | 🔵 进行中 |
| 四号 | 完成 | ⚪ 空闲 |
| 五号 | 覆盖率专项：upload/greeting（`test/v016-coverage`，wt05） | 🔵 进行中 |

---
## 待用户确认

- **SPEC-003 附加工作项**：`docs/specs/SPEC-003-附加工作项.md`
- **R58 视觉原型**：用户今晚生成，明天给截图

---
## 分支状态

| 分支 | 状态 |
|------|------|
| master | 当前，26be963 |
| feat/v016-frontend-batch1 | 二号 worktree wt02 |
| fix/v016-tech-debt | 三号 worktree wt03 |
| test/v016-coverage | 五号 worktree wt05 |
| fix/bug-env1-uploads-dir | ENV-1 已关闭，可删（下次清理） |

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- 开工前读本文件了解当前状态
- **代码必须在 git 里，未 commit 不算完成**
- **实际操作人不是中继，交接写 comms 文件**
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
