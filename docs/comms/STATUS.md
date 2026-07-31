# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-01 收工（v0.19 全部完成 + 体验 bug 修复 + 欠账回收）
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`bb72a35`，与 origin 同步
- **后端测试**：454/454 通过（26 文件）
- **前端测试**：87/87 通过（5 文件）
- **构建**：通过
- **迁移**：v22 已应用（guestbook_messages）
- **容器**：✅ 已重建，Healthy

---
## v0.19 完成总结

| 项 | 内容 | 状态 |
|------|------|------|
| F2 瀑布流 | TplGallery 默认 masonry，4 模板统一 | ✅ |
| F3 小公告 | 后端 v21 + TplAnnouncement + 4 模板各自视觉 + Settings 编辑入口 | ✅ |
| F1 点赞 | 后端 v21 + ArtworkLikeButton + localStorage + T5（0 赞不显示） | ✅ |
| F4 留言板 | 后端 v22 + TplGuestbook + 画师审核 + 管理端 + 限流 2/min | ✅ |
| HC 系统自检 | 后端 8 项检查 + 诊断包下载 + HealthCheck.vue | ✅ |
| S2 进度条 | TrackOrder 节点名 X/Y + el-progress + 回退显示节点名 | ✅ |
| P1-4 tooltip | 参考图 label 旁 ℹ️ hover 说明（中英双语） | ✅ |
| P1-5 阻止删除 | deleteStage 有活跃订单→400 STAGE_IN_USE | ✅ |
| P2-7 db.close | uncaughtException 退出前关闭数据库 | ✅ |
| P2-1 滑动限流 | 固定窗口→滑动日志，消除边界突发 | ✅ |
| hidden 画师 | 留言板公开路由补 status=hidden→404 | ✅ |
| Bug 1 花括号 | speechPlaceholder 花括号被 vue-i18n 解析→转义 | ✅ |
| Bug 2 计价崩溃 | availableAddons 未从 composable 解构（真正根因） | ✅ |
| Bug 4 看板穿透 | Queue API 缺 currentStageId 映射（snake→camel） | ✅ |

### 附带完成

| 项 | 内容 |
|----|------|
| 前端测试扩充 | 17→87 用例（useOrderForm 40 + usePasteUpload 13 + datetime 7 + sanitize 10） |
| P2 预排查 | 7 项已修 / 5 项仍存在（P2-2/7/11/12 + P2-1 已修） |
| changelog 补写 | v0.16/17/18/19 四个版本 + README 功能列表 + 测试数 532 |
| vue-i18n 评估 | 升级零风险（改一行版本号），排 v0.20；不能替代 Bug 1 修复 |
| S5 额度池设计 | 三号出方案（monthly_quota 字段 + 实时计算），排 v0.20 实施 |
| 嵌入废弃清理 | EmbedOrderPage + embed.html + vite 入口删除 |
| CI lint 清理 | 3 个未使用变量修复 |

---
## 第三方审计剩余

| 级别 | 已修 | 剩余 | 处理方向 |
|------|------|------|----------|
| P0 | 2/2 | 0 | ✅ |
| P1 | 7/7 | 0 | ✅（P1-4 tooltip + P1-5 阻止删除 + P1-6 重复注册 + P1-7 healthcheck） |
| P2 | 2/6 | 4 | P2-2（Redis 限流，生产前）；P2-11（404 首页）；P2-12（SEO meta）；P2-7 已修 |
| 安全债 | 0/4 | 4 | 已知，非紧急 |

---
## 已知遗留（非阻塞）

| # | 项 | 严重度 | 说明 |
|---|---|---|---|
| 1 | Bug 3 按钮位置 | P2 | 约稿页 ThemeToggle 视觉位置仍偏右上，CSS 已改但效果不理想，v0.20 重做 |
| 2 | 流程比例界面美化 | P2 | 用户反馈"有点丑"，v0.20 待办 |
| 3 | SPEC-003 状态确认 | 低 | R38 vs 现有增项系统是否等同，需三号确认 |

---
## v0.20 候选项

| 项 | 工时 | 来源 |
|----|------|------|
| EP 按需引入（主包 1289→~450KB） | ~2h | 性能优化 |
| vuedraggable 动态引入（-175KB） | ~30min | 性能优化 |
| vue-i18n v9→v11（改一行版本号） | ~45min | 五号评估 |
| S5 额度池实施 | ~2.5h | 三号设计 |
| P2-11 404 渲染首页 | ~30min | 二号预排查 |
| P2-12 SEO meta | ~10min | 二号预排查 |
| Bug 3 按钮位置重做 | ~15min | 体验 bug |
| 流程比例界面美化 | 待估 | 用户反馈 |

---
## 各角色任务状态

| 角色 | 当前任务 | 状态 |
|------|----------|------|
| 二号 | v0.19 全部完成 + bug 修复 | ⚪ 空闲 |
| 三号 | v0.19 全部完成 + P2 修复 | ⚪ 空闲 |
| 四号 | changelog 补写完成 | ⚪ 空闲 |
| 五号 | vue-i18n 评估完成 | ⚪ 空闲 |

---
## 分支状态

| 分支 | 状态 |
|------|------|
| master | 当前，bb72a35 |
| （无活跃开发分支，远端残留已清理） | — |

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
