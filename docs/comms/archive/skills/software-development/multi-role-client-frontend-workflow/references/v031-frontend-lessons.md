# v0.31 前端实施经验（二号）

## 1. 已实现审计（必做，节省 1.5 天）

动手前逐项审计"是否已实现"。v0.31 Wave 1 中 F5（增项点击勾选）和 F6（作品主图设置）经代码审查确认已由现有代码覆盖：
- F5：AddonManager 已有 `@click="startEdit(a)"` + `handle=".drag-handle"`，点击和拖拽天然不冲突
- F6：ArtworkManage 已有 REQ-017 封面星标（`setArtworkCover`/`unsetArtworkCover` API）

审计方法：
1. 搜索相关组件/页面的现有代码
2. `git log --oneline -5 -- <file>` 查最近改动
3. 对照 REQ 验收标准逐条确认
4. 已实现的项在 comms 注明"已由 XXX 实现，无需改动"

## 2. R30d 约束处理模式（F4 录单设节点状态）

**约束**：manual API schema `additionalProperties: false` 不支持新字段；R30d 规定有 `current_stage_id` 的订单不能直接改 status（除 cancelled），必须走 stage API。

**解法（纯前端两步走）**：
- 前端复刻后端 `mapStageToStatus` 映射（idx0→pending / idx1且takesPayment→confirmed / 中间→wip / 末→done），判断各状态可达性
- 有工作流但无对应节点时禁用选项（如 2 节点工作流无 confirmed/wip）
- 提交后：有工作流→`advanceStage(orderId, targetStageId)` 推进（status 由后端映射）；无工作流→`updateStatus(orderId, status)` 直接改
- 工作流变化导致当前选项不可达时自动回退默认值

**架构**：映射逻辑提取为 `useStageStatus` composable + 19 个单元测试，不内联在页面中。

## 3. 动态筛选选项模式（F8 留言语言过滤）

REQ 拍板"根据实际数据动态生成"时：
- 从数据聚合选项（`Object.entries(counts).sort((a,b) => b[1]-a[1])` 按数量降序）
- 未知值 fallback 显示原始代码（语言名用原文显示是惯例：中文/English/日本語）
- watch 选项列表：当前筛选值在数据中消失时自动重置（如该语言留言全部删除）
- 与现有筛选条件组合过滤（AND 逻辑，两个 filter 各自独立判断）

## 4. Commit 拆分技巧（共享 i18n 文件）

i18n 文件混合多个功能的键时，用"先移除→提交→再加回→提交"精确拆分：
1. 临时移除功能 B 的 i18n 键
2. `git add` 功能 A 的文件 + i18n → commit A
3. 加回功能 B 的键
4. `git add` 功能 B 的文件 + i18n → commit B

**事故教训**：第一次 `git add` 时误把 ArtworkManage.vue 也加进暂存区，导致 F7 主体混入 F2+F3 commit。分支未推送时用 `git reset --soft HEAD~2` + `git reset HEAD` 重做。每次 `git add` 后先 `git status --short` 确认暂存区内容。

## 5. Rebase 引入的 lint 清理

rebase 合入其他角色代码后可能引入 ESLint 警告（如三号封面排序按钮 `>↑</button>` 缺换行）。虽然不是我引入的，但文件在授权范围内就顺手修复（属于"机动：修体验问题"）。验证链必须重跑确认零警告。

## 6. 阻塞项处理

F8 依赖三号 language 字段、F1 依赖三号 GET /logs API。确认阻塞的方法：
- `search_files` 搜索 server/src 确认字段/API 是否存在
- 不存在→comms 注明"阻塞中，等三号 XXX 合入"，不空等
- 前置合入后 rebase 再实施
