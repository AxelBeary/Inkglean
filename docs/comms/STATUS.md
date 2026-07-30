# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-07-30（v0.16 第一层全部合入）
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`973d62a`（二号前端批次1合入），与 origin 同步
- **测试**：241/257 通过（9 文件）——16 条为预存失败（hidden 状态 CHECK 约束 + FK 约束），非本轮引入
- **构建**：通过（Vite build 9.57s）
- **迁移**：v15 已应用（accent_color + deadline）
- **容器**：commission-web healthy + commission-caddy running

---
## v0.16 已合入内容

| 项 | 内容 |
|----|------|
| 三号技术债 | 价格回退链→`utils/price.js` / 活跃过滤→`utils/order-status.js` / ISO日期→`utils/date.js`，order.service + admin.service 统一引用 |
| 五号覆盖率 | upload 32%→89%（29 条）/ greeting 31%→100%（31 条），共 +60 条测试 |
| 二号批次1 | 工艺CSS升级（--ease-bounce 全局变量/按钮三态/clamp 流式字号/minmax 防溢出/reduced-motion 兜底）+ R54 档位页表格→卡片 |

---
## v0.16 待排期（等用户拍板）

| 项 | 内容 | 前置 |
|----|------|------|
| R58 | 约稿页视觉改版（H5原型分析报告已审核通过） | 用户确认方向 |
| R55 扩展 | 示例图历史版本保留（C65 推翻为保留） | 三号迁移 |
| R38 | 附加工作项 | 用户确认 SPEC-003 |
| R57 补 | 约稿页粘贴上传不稳定（UI-9 粘贴 Bug） | 二号排查 |
| 技术债 | 大文件拆分（剩余项） | 无 |
| 预存测试修复 | 16 条失败：hidden 状态 CHECK 约束 + FK 约束 | 三号排查 |

---
## 各角色任务状态

| 角色 | 当前任务 | 状态 |
|------|----------|------|
| 二号 | 已合入，待派新任务 | ⚪ 空闲 |
| 三号 | 已合入，待派新任务 | ⚪ 空闲 |
| 四号 | 已合入，待派新任务 | ⚪ 空闲 |
| 五号 | 已合入，待派新任务 | ⚪ 空闲 |

---
## 待用户确认

- **R58 方向**：H5 原型分析报告已审核（`docs/comms/04-to-01-H5设计原型完整分析报告-0730.md`），用户思考中
- **SPEC-003 附加工作项**：`docs/specs/SPEC-003-附加工作项.md`

---
## 分支状态

| 分支 | 状态 |
|------|------|
| master | 当前，973d62a |
| feat/v016-frontend-batch1 | 已合入，可删 |
| fix/v016-tech-debt | 已合入，可删 |
| test/v016-coverage | 已合入，可删 |
| fix/bug-env1-uploads-dir | ENV-1 已关闭，可删 |

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
