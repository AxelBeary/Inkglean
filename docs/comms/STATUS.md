# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-02 v0.27 完成
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`b8f95d2`，与 origin 同步
- **后端测试**：567/567 通过（34 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过（Playwright，已接入 GitHub Actions CI）
- **迁移**：v29 已应用（order_start_date）
- **容器**：✅ 已重建（v0.27 全部功能）
- **压缩配置**：threshold 0.80 / target_ratio 0.35（720k 才压缩）

---
## v0.27 完成清单

| 项 | 角色 | 状态 |
|---|---|---|
| A 多模板随机前端 UI 开关（checkbox + disabled + tooltip） | 二号 | ✅ StageListView + WorkflowPaymentEditor + i18n |
| B REQ-015 手动录单重设计（全屏双栏 + 响应式 + QQ 历史面板 + 档位卡片） | 三号 | ✅ ManualOrder 重写 + OrderList 抽屉移除 + 路由迁移 |
| C v0.26 路由层集成测试 10 用例 | 五号 | ✅ reorder + start-date 全链路 |
| REQ-014 三轮细化状态同步 | 四号 | ✅ 纯文档，v1.0+ 不影响当前 |
| 审核补修：档位卡片 example_image_path→example_image | 一号 | ✅ API 返回 snake_case 列名 |

---
## 已知遗留

| 项 | 优先级 | 说明 |
|---|---|---|
| admin 端 PUT workflow schema 缺 speechTemplate/randomTemplate | 低 | 二号发现，Fastify removeAdditional 静默剥离，既有行为非本次引入 |
| QQ 历史面板客户端过滤（pageSize=200） | 低 | 画师场景同客户极少超 5 单，实际无影响 |

---
## 后续版本待排

| 项 | 优先级 |
|---|---|
| 桌面端伴侣应用（REQ-014） | v1.0+（不预留） |
| E2E 用例扩充 | 用户已拒扩展 |

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | 当前 `b8f95d2` |

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
