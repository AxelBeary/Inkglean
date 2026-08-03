# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-03 夜 v0.34 派工（用户体验反馈批次，二号/三号在途）
> 维护者：一号（主理人）
> **刷新后自包含**：新会话只读本文件即可完全恢复，不依赖任何对话记忆。

---
## master 状态

- **HEAD**：`7b27b8c`（v0.34 派工），与 origin 同步
- **后端测试**：666/666 | **前端测试**：118/118 | **迁移**：v36
- **容器**：Healthy，跑 v0.33 代码

---
## 当前阶段：v0.34 反馈批次执行中

用户 2026-08-03 晚体验 v0.33 后一次性报了 7 项反馈（alice 主页截图标注 1-4 + emoji 清理 + 404 + 作品顶位置 + 档位图不对）。一号已逐条核实根因并派工。

### 反馈清单与派工归属

| # | 反馈 | 根因（一号已核实） | 派给 |
|---|------|------|------|
| 1 | hero「查询进度」按钮框看不见 | ghost 按钮 border 用 --pal-border，背景图上对比不足 | 二号 任务D |
| 2 | 价格表封面图「被切掉」（用户澄清：不是变形是裁切） | TplStyleGrid fit=cover + 固定 220px 高；应对齐 TplTierGrid 的 contain 不裁切 | 二号 任务C |
| 3 | 价格区空间浪费 + 款式不能点 | 尺寸行纯展示无交互 | 二号 任务G（空间）+B（可点） |
| 4 | 「约稿流程与收款」模块没优化 | WorkflowOverviewStrip 仅 39 行朴素圆点列表 | 二号 任务E |
| 5 | 全站 emoji 删掉（SVG 无所谓） | 260 处命中 | 二号 locales+客户端；三号 画师/管理后台 |
| 6 | 404 丑 + 亮暗中英按钮逻辑与主页不一致 | catch-all 直接复用 LandingPage，偏好按钮位置形态与主页浮窗不一致 | 二号 任务A |
| 7 | 作品展示「顶位置」复发 | demo-data.ts INSERT 缺 width/height 列，TplGallery aspect-ratio 占位失效 | 三号 任务1 |
| 8 | 「档位图怎么不是我后台设置的」 | **封面上传 UX 陷阱**：uploadCover 只写表单，必须点「确定」才发 PUT；用户传了 3 张图后未点确定（日志无 PUT art-styles），DB 里还是 demo 脚本写死的旧封面。非数据丢失 | 三号 任务2 |

### 二号：客户端反馈批次（7 项）

> **分支**：`fix/v034-client-ui-batch`
> **Worktree**：`D:\Hermes Agent CN Desktop\workspace\artist-commission-wt-02`
> **派工文件**：`docs/comms/01-to-02-v034客户端反馈批次-20260803.md`（含每项的代码行号现状）
> **执行顺序**：B（尺寸可选+预选跳转）→ C（封面不裁切）→ A（404 重做）→ D（ghost 按钮）→ E（流程模块）→ F（emoji）→ G（空间）

**关键约束**：
- 任务 B：goOrder 带 `?styleId=&sizeId=` query；OrderForm/useOrderForm 读 query 预选；**query 预选 > 草稿恢复**
- 任务 C：对齐 TplTierGrid contain 不裁切
- 任务 A：新建 NotFound.vue，主题切换复用 ClientFloatingActions 右下角浮窗（与主页一致），删 LandingPage 的 isNotFound
- 任务 F：locales emoji 全归二号，**不碰画师/管理后台 .vue**（归三号）

交付 comms：`02-to-01-v034客户端批次-{日期}.md`

### 三号：演示数据回填 + 封面上传 UX + 后台 emoji

> **分支**：`fix/v034-demo-dims-cover-ux`
> **Worktree**：`D:\Hermes Agent CN Desktop\workspace\artist-commission-wt-03`
> **派工文件**：`docs/comms/01-to-03-v034后端画师批次-20260803.md`
> **顺序**：任务1（width/height 回填，用户等体验）→ 任务2（封面上传即时保存）→ 任务3（后台 emoji）

**关键事实（任务 2，不用再排查）**：用户 22:14 上传 3 图落盘成功，但日志无 PUT /api/artist/art-styles——uploadCover 只写 styleForm 不发请求，要点「确定」才 saveStyle。修复方向：编辑已有画风时上传成功立即 PUT（同 R48 头像即时保存模式）。

交付 comms：`03-to-01-v034后端画师批次-{日期}.md`

### 五号

空闲。待二号/三号交付后跑回归（客户端 4 模板 × 亮暗主题走查截图）。

### 四号

空闲。REQ-024 已提交并**通过审核**（一号验证全部关键断言属实，showcase 拍板项已写入文档）。下一任务：v0.35 开工时写拆解排期草案；v0.36 负责 changelog 补写 + docs 归档。

---
## 版本计划（用户 2026-08-03 拍板 + 一号定版本数）

| 版本 | 内容 | 状态 |
|------|------|------|
| v0.34 | 今晚 8 项体验反馈（二号 7 项客户端 + 三号 3 项后端画师） | 在途 |
| **v0.35（最后功能版）** | REQ-024 画风档位统一 F1-F5（档位带图/后台合并+多画风开关/点档位切大图/下单预选/旧模型迁移 v37） | 需求已审通过，待 v0.34 合入后派工 |
| **v0.36（清账版）** | 全部旧账：changelog/docs 归档/snake_case 统一/P2 剩余/测试补缺/4 模板走查调整 | v0.35 后 |

做不完加 v0.37，不硬撑（用户授权加班但不压缩质量）。

**v0.35 两波拆解（预排，派工时细化）**：波 1 三号——v37 迁移（style_sizes 加图/描述/天数字段 + artists 加多画风开关字段）+ 画风带图 API + 后台「画风与价格」合并入口 + 开关 + F5 旧模型迁移脚本；波 2 二号——客户端展示柜 F3 点档位切大图 + F4 下单预选（在 v0.34 任务 B 基础上扩展入口区分与跳第三步）。F5 迁移为高风险项，合入前按大型迁移清单逐项审。

---
## 已知遗留（排后版本）

- 画师后台视觉统一（纸墨颜料盘设计系统，提案 v2 已入库）
- REQ-022 B 类低优先、REQ-014 桌面端伴侣应用
- 画风 API snake_case 全链路（前后端自洽，不改，记录在案）

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | ✅ 干净 |
| fix/v034-client-ui-batch | wt-02 | 二号在途 |
| fix/v034-demo-dims-cover-ux | wt-03 | 三号在途 |

残留：`artist-commission-02`、`artist-commission-p0` 磁盘目录为旧 worktree 残留（git 记录已清），无害，重启后可删。

---
## 重要规则提醒

- 合并到 master 后**立即推送**；操作前 `git log --oneline -5` 确认 HEAD
- 禁止对 master `git reset --hard` / `git rebase`；禁止 `git add -A`
- 并行角色必须在独立 worktree；Docker 环境 SQLite 用 DELETE 模式
- 幂等脚本「清理」与「种子」显式区分归属（v0.33 教训）
