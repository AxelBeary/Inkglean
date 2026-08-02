# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-03 v0.33 草稿恢复合入
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`f7e5ecd`（merge: v0.33 草稿恢复画风状态），与 origin 同步
- **后端测试**：666/666 通过（39 文件）
- **前端测试**：118/118 通过（6 文件）
- **迁移**：v36（multi_style_model）

---
## 当前阶段：v0.32 收工，等下版本开工

### v0.32 合入清单（REQ-023 多画风模型，3 阶段全完成）

| 阶段 | 内容 | 合入 commit |
|------|------|------------|
| Phase 1 后端 | 迁移v36 + 5表 + 老数据迁移 + CRUD API + 公开配置 | `8a4ea03` |
| Phase 1 画师端 | 增项库管理 + 画风管理（尺寸/增项导入/尺寸覆盖）+ tabs 集成 | `7b06e79` |
| Phase 2 价格引擎 | calculate-style-price（三级覆盖+倍率+折扣码） | `e7ea43d` |
| Phase 2 订单扩展 | POST /orders 接受 styleSizeId+styleAddons，服务端算价 | `8b519aa` |
| Phase 2 客户端 | 三步走（选画风→选尺寸→勾增项）+ 单画风退化 + 结构化提交 | `830b645` |
| Phase 3 四模板 | TplStyleGrid 画风展示柜 + 4 模板入口适配 | `279b4c8` |
| 插入修复 | #5b 订单管理页焦点图懒加载（五号） | `5a263f7` |

### 遗留（排下版本）

- 4 模板视觉走查（建议用真实画师数据有/无画风各过一遍，`?_tpl=` 参数切模板）——等三号示例数据合入后做

### ✅ 已完成（v0.33 草稿恢复）

- 草稿恢复覆盖画风状态：✅ 2026-08-03 合入（merge `f7e5ecd`）——saveDraft 存 styleState、restoreDraft 按 isStyleMode 互斥恢复带有效性校验，前端测试 106→118

### ✅ 已完成（v0.32 收尾验证）

- 容器重建验证迁移 v36：✅ 2026-08-03 重建 Healthy，日志确认 `multi_style_model 已应用` + 自动备份
- 老数据回填验证：✅ alice 公开接口 `/api/public/styles/alice` 返回"默认"画风，旧档位价格已迁入（头像¥50/半身¥120/全身¥200）
- 迁移前手动备份：`data/commission.db.bak.pre-v36`
- 视觉提案 v2 归档入库（`755256c`）

### 技术债（非阻塞）

- 画风 API 全链路 snake_case（cover_image/base_price/sort_order），与项目其他 API camelCase 约定不一致——前后端已自洽（ArtStyleManager/TplStyleGrid/useOrderForm 均用 snake_case），不改，记录在案

---
## 各角色状态

- **二号**：草稿恢复画风状态已合入（2026-08-03，merge `f7e5ecd`）。空闲待命
- **三号**：示例数据制作中（CC0 图片 + 真实化内容）。分支 `chore/v032-demo-data`，worktree `artist-commission-03`，派工 `docs/comms/01-to-03-示例数据制作-0803.md`
- **四号**：文档维护已完成（2026-08-03，`66a1155`+`513c90f`）。空闲待命
- **五号**：空闲（无 bug 反馈，待三号交付后可审）

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | ✅ 干净 |
| chore/v032-demo-data | artist-commission-03 | 🔵 三号示例数据制作中 |

---
## 下版本排期

待用户确认方向。候选：
- v0.33：草稿恢复画风状态 + 容器重建验证 + 4 模板视觉走查（收尾性质，~1-2天）
- 视觉统一（画师后台纸墨颜料盘设计系统，docs/画师工作台视觉提案-v2.html）
- 画师后台其他功能需求

---
## 重要规则提醒

- 合并到 master 后**立即推送**
- 操作 master 前 `git log --oneline -5` 确认 HEAD
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 禁止 `git add -A`
- 并行角色必须在独立 worktree
- Docker 环境 SQLite 必须用 DELETE 模式
