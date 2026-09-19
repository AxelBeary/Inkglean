---
name: multi-agent-collaboration-setup
description: "多代理协作基础设施搭建：worktree 依赖供给、并行会话协调、跨 worktree 污染防控。历史技能文档，已归档。"
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [multi-agent, worktree, collaboration, infrastructure, setup]
    related_skills: [multi-role-lead-review-workflow, multi-role-backend-workflow, multi-role-client-frontend-workflow]
    archived: true
    archive_date: "2026-09-20"
    archive_reason: "技能库整体归档——路径引用已修正但内容未迁移到可加载技能位"
---

# Multi-Agent Collaboration Setup (多代理协作基础设施)

> **历史文档声明**：本技能已于 2026-09-20 随 `docs/soul/skills/` 整体归档至 `docs/comms/archive/skills/`。路径引用已修正到工作树真实存在的 `.ts` 目标，但内容未做现代化迁移。如需加载为可执行技能，须先评估内容时效性。

## 职责范围

本技能覆盖多代理并行协作的基础设施搭建与运维：

1. **Worktree 依赖供给**：新 worktree 的 `node_modules` 初始化、共享依赖链接策略
2. **并行会话协调**：多角色同时操作同一仓库时的冲突预防与文件归属追踪
3. **跨 worktree 污染防控**：主 worktree 共享协议、分支切换残留清理、容器重建验证

## 关键文件路由（已修正到当前工作树）

| 职责 | 文件路径 |
|---|---|
| 服务端入口 | `server/src/index.ts` |
| 数据库连接 | `server/src/db/connection.ts` |
| 数据库初始化/迁移 | `server/src/db/init.ts` |
| 种子数据 | `server/src/db/seed.ts` |
| 错误码 | `server/src/shared/errors.ts` |
| 测试基建 | `server/tests/setup.ts` |
| 前端路由 | `web/src/router/index.ts` |
| 前端 API 层 | `web/src/api/index.ts` |
| 前端 locale | `web/src/locales/zh-CN.ts` / `web/src/locales/en.ts` |
| 前端 XSS 消毒 | `web/src/utils/sanitize.ts` |
| E2E 全局 setup | `e2e/global-setup.ts` |
| E2E 全局 teardown | `e2e/global-teardown.ts` |
| E2E 认证 fixture | `e2e/fixtures/auth.ts` |
| Playwright 配置 | `playwright.config.ts` |

## 参考文件

- `references/worktree-dependency-provisioning.md` — worktree 依赖供给策略与 npm link 替代方案
