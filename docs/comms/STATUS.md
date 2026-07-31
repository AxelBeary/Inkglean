# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-01 v0.21 收工
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`9d73078`+（含收工 commit），与 origin 同步
- **后端测试**：469/469 通过（27 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过（Playwright，15.7s）
- **构建**：通过（main JS 388.64 kB / gzip 145.50 kB）
- **迁移**：v23 已应用（monthly_quota）
- **容器**：✅ 已重建，Healthy，Sentry 后端已启用
- **类型检查**：`npx tsc --noEmit` 零错误（pricing + shared/ 已迁移）

---
## v0.21 完成总结

| # | 项 | 负责 | 状态 |
|---|---|---|---|
| 1 | Sentry 后端错误监控（条件初始化 + 500 上报 + DSN 开关） | 三号 | ✅ |
| 2 | TypeScript 渐进迁移（tsconfig + pricing + shared/ + entities 类型） | 三号 | ✅ |
| 3 | Docker 部署适配（entrypoint tsx + tsx 移 dependencies） | 一号 | ✅ |
| 4 | Dockerfile 前端 Sentry DSN 构建注入（ARG VITE_SENTRY_DSN） | 一号 | ✅ |
| 5 | Playwright E2E（框架 + 5 条核心路径，15.7s 全绿） | 二号 | ✅ |
| 6 | v0.21 需求文档（四号与用户对齐 Q1-Q5 + 模块化约束） | 四号 | ✅ |

---
## 第三方审计剩余

| 级别 | 已修 | 剩余 | 处理方向 |
|------|------|------|----------|
| P0 | 2/2 | 0 | ✅ |
| P1 | 7/7 | 0 | ✅ |
| P2 | 4/6 | 2 | P2-2（Redis 限流，生产前）；P2-11 ✅；P2-12 ✅ |
| 安全债 | 0/4 | 4 | 已知，非紧急 |

---
## 已知遗留（非阻塞）

| # | 项 | 严重度 | 说明 |
|---|---|---|---|
| 1 | SPEC-003 状态确认 | 低 | R38 vs 现有增项系统是否等同，需三号确认 |
| 2 | P2-2 Redis 限流 | 低 | 生产前处理 |
| 3 | PaymentBar 暗色模式 HSL 适配 | 低 | 浅色 94% 亮度在暗色下偏亮 |
| 4 | EP CSS 按需引入 | 低 | 全量 CSS 470kB（gzip 93kB） |
| 5 | Sentry 前端 SDK 接入 | 中 | DSN 已就绪（ARG 注入），等前端 SDK 代码（二号） |
| 6 | E2E 接入 CI | 低 | GitHub Actions 需 playwright install chromium |

---
## v0.22 候选项

| 项 | 工时 | 来源 |
|----|------|------|
| Sentry 前端 SDK 接入 | ~1h | 二号（DSN 注入已就绪） |
| E2E 接入 GitHub Actions CI | ~1h | 二号建议 |
| TS 迁移第二批（路由层/服务层） | 中 | 渐进路线 |
| EP CSS 按需引入 | ~2h | 二号建议 |
| PaymentBar 暗色适配 | ~30min | 审核建议 |
| Phase 2 QQ Bot 规划 | 待估 | 开发自参考 Phase 2 |

---
## 各角色任务状态

| 角色 | 当前任务 | 状态 |
|------|----------|------|
| 二号 | v0.21 全部完成 | ⚪ 空闲 |
| 三号 | v0.21 全部完成 | ⚪ 空闲 |
| 四号 | v0.21 需求文档完成 | ⚪ 空闲 |
| 五号 | v0.20 全部完成 | ⚪ 空闲 |

---
## 分支状态

| 分支 | 状态 |
|------|------|
| master | 当前，v0.21 全部合入 |
| （无活跃开发分支，worktree 已清理） | — |

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
