# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-01（五号修复×2 合入 + comms 清理）
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`3670925`（docs(comms): 清理已合入的五号修复报告×2），与 origin 同步
- **测试**：320/320 通过（13 文件）
- **构建**：通过
- **迁移**：v19 已应用（batch_buffer_system）
- **容器**：需重建（代码已更新，容器仍跑旧镜像）

---
## 本轮合入

| 分支 | 内容 | 文件 |
|------|------|------|
| fix/bug-sidebar-avatar | 侧边栏头像不跟随上传头像 | ArtistLayout.vue +9/-3 |
| fix/bug6-payment-input | 流程比例手动输入点击冒泡重置 | PaymentBar.vue +9/-3 |

---
## v0.17 已合入内容（完整版）

| 项 | 内容 |
|----|------|
| 三号 R58-8 | 平台 URL 识别 + 迁移 v17 |
| 三号 灵感标签 | inspiration_tags JSON 列 + API |
| 二号 R24 | 校验失败弹窗 + scrollToField |
| 二号 R25 | ThemePicker 右下角 fab（4 模板） |
| 二号 BUG-5 | useSignatureRefresh 按图刷新 |
| 三号 SPEC-003 | 附加工作项（迁移 v18 + CRUD + 尾款重算 + 付款节点） |
| 二号 SPEC-003 前端 | OrderDetail 附加项卡片 + 客户进度页 + UX-1 预览修复 |
| 二号 R58-8 前端 | 设置页平台链接/灵感标签 + 客户页集成 |
| 三号 SPEC-004 | 名额与缓冲系统（迁移 v19 + 分区 + 递补 + 名额显示） |
| 二号 SPEC-004 前端 | 名额设置 UI + 看板缓冲区 + 主页 slotDisplay + 进度页排队位置 |

---
## v0.18 进行中

| 分支 | 角色 | 内容 | 状态 |
|------|------|------|------|
| feat/backend-artist-v018-b1 | 三号 | 节点话术后端 | 🔵 开发中 |
| feat/client-frontend-v018-b1 | 二号 | 节点话术前端 | 🔵 开发中 |

---
## v0.18/v0.19 规划中

| 项 | spec 状态 | 排期 |
|----|-----------|------|
| 仪表盘 | ✅ 完整（C48–C58 已拍） | v0.18 |
| 节点话术 | ✅ 完整 | v0.18（第一批，进行中） |
| 系统自检 | ✅ 完整（用户已拍板） | v0.19 |
| SPEC-005 额度池 | ❌ 需三号出设计 | 待定 |
| 四号 v0.18 排期草案 | 🔵 进行中 | — |

---
## 技术债

| 项 | 优先级 |
|----|--------|
| 前端测试基础设施（vitest + @vue/test-utils） | P1 |
| deleteArtist 软删除 + bumpTokenVersion 补测试 | P1 |
| init.js schema 字符串补齐 8 张表 | P2 |

---
## 各角色任务状态

| 角色 | 当前任务 | 状态 |
|------|----------|------|
| 二号 | v0.18 节点话术前端 | 🔵 进行中 |
| 三号 | v0.18 节点话术后端 | 🔵 进行中 |
| 四号 | v0.18 排期草案 | 🔵 进行中 |
| 五号 | 修复已合入，待新任务 | ⚪ 空闲 |

---
## 分支状态

| 分支 | 状态 |
|------|------|
| master | 当前，3670925 |
| feat/backend-artist-v018-b1 | worktree: artist-commission-03 |
| feat/client-frontend-v018-b1 | worktree: artist-commission-v018-b1 |

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
