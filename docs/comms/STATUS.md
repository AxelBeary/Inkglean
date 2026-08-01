# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-02 v0.26 进行中
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`3c56871`，与 origin 同步
- **后端测试**：545/545 通过（32 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过（Playwright，已接入 GitHub Actions CI）
- **迁移**：v28 已应用（artwork_is_cover + stage_random_template）
- **容器**：✅ 已重建（v0.25 全部功能 + 两个 hotfix）
- **压缩配置**：threshold 0.80 / target_ratio 0.35（720k 才压缩）

---
## v0.25 完成清单

| 项 | 角色 | 状态 |
|---|---|---|
| A 封面图指定+轮播（后端+前端 4 模板） | 三号+二号 | ✅ 多张共存，el-carousel 轮播 |
| B 多模板随机（后端） | 三号 | ✅ 迁移 v28 + randomTemplate 开关 |
| C 快捷按钮 localStorage→DB | 二号+一号 | ✅ 前端 DB 优先 + 后端 schema 补全 |
| D 日历时间条视图 | 二号 | ✅ 第三 tab + 缩放 + 今天参考线 |
| E 移动端翻月手势 | 二号 | ✅ |
| H seedOrder 碰撞修复 | 一号 | ✅ |
| 路由层集成测试 13 项 | 五号 | ✅ |
| 文档维护 | 四号 | ✅ |
| Hotfix: 截稿日日历点选失效 | 一号 | ✅ 只读 computed → 可写 |
| Hotfix: 仪表盘待办返回导航 | 一号 | ✅ 加 ?from=dashboard |

---
## v0.26 进行中

| 项 | 角色 | 分支 | 状态 |
|---|---|---|---|
| A 档位卡片拖动排序 | 三号 | feat/v026-slots-drag | 🔵 已派工 |
| B 开工日 + 截稿日自动建议 | 三号 | feat/v026-slots-drag | 🔵 已派工 |
| C 开稿管理独立页（/slots） | 三号 | feat/v026-slots-drag | 🔵 已派工 |

---
## 明天开工指南

### 三号：v0.26 三件

> **分支**：`feat/v026-slots-drag`
> **Worktree**：`D:\Hermes Agent CN Desktop\workspace\artist-commission-03`（已基于 master 3c56871）
> **派工文件**：`docs/comms/01-to-03-v026-slots-drag-startdate-20260802.md`

**任务**（按顺序）：
| 序 | 工作 | 预估 |
|----|------|------|
| A | 档位拖动排序（vuedraggable + PUT /api/artist/tiers/reorder） | 1h |
| B | 开工日（迁移 v29 + PUT start-date + OrderDetail 开工日 picker + 截稿日自动填充 + QueueBoard 带子起点） | 3h |
| C | 开稿管理独立页（/slots 路由 + SlotManage.vue + 侧边栏 + Settings 移出字段） | 3h |

**关键提醒**：
- 迁移版本号 **v29**（v28 是 stage_random_template）
- 开工日 date-picker 必须用**可写 computed**（v0.25 截稿日 bug 就是只读 computed 导致的）
- GET 订单/队列返回必须含 `startDate` camelCase 映射（v0.19 Queue API 漏映射事故）
- 开稿管理页保存走已有 `PUT /api/artist/profile`（字段已全支持，零后端改动）

完成后写 comms `03-to-01-v026-slots-drag-{日期}.md`，申请审核。

### 二号：空闲

可选任务：多模板随机前端 UI 开关（后端已就绪，话术编辑区加"随机"checkbox）。等用户确认是否排入 v0.26。

### 四号：空闲

桌面端研判已回复（结论：当前零预留，等 v1.0）。REQ-014 保持活文档。

### 五号：空闲

---
## 后续版本待排

| 项 | 优先级 |
|---|---|
| B 多模板随机前端 UI 开关 | 中 |
| 桌面端伴侣应用（REQ-014） | v1.0+（不预留） |
| E2E 用例扩充 | 用户已拒扩展 |

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | 当前 `3c56871` |
| feat/v026-slots-drag | artist-commission-03 | 三号 |

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
