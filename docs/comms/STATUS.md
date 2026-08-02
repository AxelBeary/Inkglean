# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-02 v0.29 开工
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`ce737f9`，与 origin 同步
- **后端测试**：567/567 通过（34 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过
- **迁移**：v29
- **容器**：✅ Healthy

---
## 当前阶段：v0.29 — A 类 Bug 修复 + D 类结构调整

68 条体验反馈中，本轮处理不依赖设计稿的全部项：
- A 类（逻辑 BUG）：#4 #35 #36 #43a #43b #45 #47 #48 #54 #63 #66（#37 已修划掉）
- D 类（结构调整）：#7 #8 #2 #17 #44 #68

### 预排查结论

| # | 问题 | 结论 |
|---|------|------|
| #37 | v-html XSS | ✅ 已修（DOMPurify + sanitize.js 白名单），划掉 |
| #43b | 封面 PUT 400 | 根因：schema 要求 body 但前端不发 body。删 schema 即可 |
| #54 | 可约稿+已约满矛盾 | 根因：status='open' + 额度耗尽 slotDisplay='本月已约满' 同时渲染。后端加 effectiveStatus |
| #4 | 时间条拖拽不工作 | 静态分析未见缺陷，需运行时排查 |

---
## 各角色状态

| 角色 | 任务 | 分支 | Worktree | 状态 |
|------|------|------|----------|------|
| 二号 | 客户端前端修复（#54适配 #50 #52 #55/61 #17） | `fix/client-frontend-0802` | `artist-commission-02` | 🔵 待开工 |
| 三号 | 画师后台结构调整（#44 #7 #8 #2 #47 #48 #63 #68） | `feat/artist-structure-0802` | `artist-commission-03` | 🔵 待开工 |
| 五号 | A 类 Bug 修复（#43b #54 #4 #35 #36 #43a #45 #66） | `fix/a-bugs-batch-0802` | `artist-commission-05` | 🔵 待开工 |
| 四号 | 空闲（B 类需求整理等设计方向） | — | — | ⚪ 空闲 |

### 文件域冲突分析

| 角色 | 文件域 | 冲突？ |
|------|--------|--------|
| 二号 | client/ + Tpl*.vue + OrderDetail(仅#17) + locales | — |
| 三号 | ArtistLayout + Settings拆分 + Preferences新建 + admin/ + router + SlotOverview + locales | — |
| 五号 | server/ + QueueBoard + OrderDetail(#35) + Settings(#36#45) + admin(#66) + locales | — |

**locales 是共享文件**：三角色都加文案键，rebase 时保留双方新增即可（纯新增不矛盾）。
**OrderDetail.vue**：二号改 #17（客户沟通区），五号改 #35（日期校验）——不同区域，rebase 冲突概率低。
**Settings.vue**：三号拆分（大改），五号改 #36 公告 + #45 快捷按钮（小改）——**三号先合**，五号 rebase 时处理。

### 合并顺序（预判）

1. **五号**（后端优先，#43b/#54 后端是二号 #54 前端的前置）
2. **三号**（结构改动，Settings 拆分先落地）
3. **二号**（最后合，rebase 拿到五号 effectiveStatus + 三号 Settings 拆分）

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | ✅ 干净 |
| fix/a-bugs-batch-0802 | artist-commission-05 | 🔵 五号 |
| fix/client-frontend-0802 | artist-commission-02 | 🔵 二号 |
| feat/artist-structure-0802 | artist-commission-03 | 🔵 三号 |

---
## 下轮候选（本轮不做）

- B 类功能需求（21 条）→ 四号整理 REQ，等设计方向
- C 类视觉（20 条）→ 等设计稿
- E 类产品决策（7 条）→ 用户拍板
- F 类技术债（3 条）→ 按量级触发

---
## 重要规则提醒

- 合并到 master 后**立即推送**
- 操作 master 前 `git log --oneline -5` 确认 HEAD
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 禁止 `git add -A`
- 并行角色必须在独立 worktree
