# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-07-29 深夜（刷新前最终状态）
> 维护者：一号（主理人）

---

## master 状态

- **HEAD**：`9865a11`，与 origin 同步
- **测试**：118/118 通过（7 文件）
- **构建**：通过
- **npm audit**：0 vulnerabilities
- **容器**：commission-web 运行中，http://localhost:3000 可访问

---

## 各角色任务状态

| 角色 | 当前任务 | 状态 | 分支/备注 |
|------|----------|------|-----------|
| 二号 | R21 侧边栏折叠 | 本地 commit 未提交审核 | worktree: artist-commission-client, `feat/client-frontend-r21-sidebar`, commit `bedcad8` |
| 三号 | 待命（等 SPEC-001 实施指令） | 空闲 | 预研完成，SPEC-001 已审核通过 |
| 四号 | 待命 | 空闲 | SPEC-001 定稿已提交 |
| 五号 | 待命 | 空闲 | UI-2 已入库 |

---

## 下一步（按优先级）

1. **审核二号 R21**（等二号提交）
2. **迁移 v12**（需实际操作人确认高风险操作）→ 三号开工
3. **R15/R18/R19 实施**（迁移 v12 后，三号后端 + 二号前端并行）
4. **五号回归**：签名矩阵逐项核对

---

## 已合入 v0.11 内容

R1~R11 全部功能 + R14/R16/R17/R20 补丁 + UI-1/UI-2 + ENV-1 + 签名 URL 补全 + R3 cherry-pick 恢复 + P0/P1 安全全批次 + @fastify/static 8→10 + TRUST_PROXY 收紧

---

## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- 开工前读本文件了解当前状态
