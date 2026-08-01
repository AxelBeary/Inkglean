# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-02 v0.25 收工
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`c6f7dab`，与 origin 同步
- **后端测试**：545/545 通过（32 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过（Playwright，已接入 GitHub Actions CI）
- **迁移**：v28 已应用（artwork_is_cover + stage_random_template）
- **容器**：✅ 已重建（v0.25 全部功能）

---
## v0.25 完成清单

| 项 | 角色 | 状态 |
|---|---|---|
| A 封面图指定+轮播（后端 API） | 三号 | ✅ 迁移 v27 + PUT/DELETE cover + 公开 API 封面排前 |
| A 封面图轮播（前端 4 模板） | 二号 | ✅ TplCoverShowcase 共享组件 + 4 模板独立视觉 |
| B 多模板随机（后端） | 三号 | ✅ 迁移 v28 + randomTemplate 开关 + 话术随机选择 |
| C 快捷按钮 localStorage→DB | 二号+一号 | ✅ 前端 DB 优先 + 后端 schema 补 quickActions（审核时补） |
| D 日历时间条视图 | 二号 | ✅ 第三 tab + 两周/一月/两月缩放 + 今天参考线 |
| E 移动端翻月手势 | 二号 | ✅ touchstart/touchend >50px |
| H seedOrder 碰撞修复 | 一号 | ✅ 自增计数器替代 Math.random |
| 路由层集成测试 13 项 | 五号 | ✅ B3（收款/留言/仪表盘/快捷按钮）+ B1（send-code 防枚举） |
| 测试覆盖审计 | 五号 | ✅ 已消费（结论：后端 service 层全覆盖，路由层已补） |
| 文档维护 | 四号 | ✅ 待修复清单+specs 归档+CONTEXT+requirements |
| 桌面端预留研判 | 四号 | 🔵 已交付，一号研判中 |

---
## 后续版本待排

| 项 | 优先级 |
|---|---|
| B 多模板随机（前端 UI 开关） | 中（后端已就绪，前端需在话术编辑区加开关） |
| 桌面端伴侣应用（REQ-014） | v1.0+（四号研判已交付，一号判断：当前零预留） |
| E2E 用例扩充 | 中（用户已拒扩展，保持 5 个基线） |

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | 当前 `c6f7dab` |

> 无残留 worktree / feature 分支。

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
