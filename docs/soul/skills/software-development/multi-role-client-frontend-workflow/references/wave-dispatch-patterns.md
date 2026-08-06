# Wave 派工执行模式（二号）— v0.31 会话沉淀

一号按 Wave 派工（Wave 1 → 合入 → Wave 2 → …）时的完整执行模式与踩坑。

## 标准流程

1. **rebase**：`git fetch origin; git rebase origin/master`（派工明确要求时执行）
2. **读派工 comms**：`docs/comms/01-to-02-*.md`，确认分支名、授权文件、Wave 顺序
3. **读 STATUS.md**：确认 master 状态、其他角色进度、已定决策
4. **依赖检查**：有前置依赖的功能（如 F8 依赖三号 language 字段），先 `search_files server/src` 验证字段是否存在，不存在则报阻塞、跳到下一项
5. **审计现有实现**：动手前搜索相关组件——"新"功能可能已被前期工作覆盖（如 F5/F6 已由 REQ-017 实现）。已实现的报"已实现+证据"，不重复开发
6. **按序实现**：每个功能一个 commit，i18n 中英同步
7. **验证链**：ESLint 零错零警 + vitest + vite build
8. **写 comms 交付**：`docs/comms/02-to-01-*.md`，含分支/改动文件/验证结果/commit 列表
9. **推送**

## 关键模式：后端不支持新参数时的两步走（F4 案例）

**场景**：录单要设初始节点状态，但 manual API schema 是 `additionalProperties: false`，createOrder 硬编码 `status='pending'`。

**约束**：R30d 规定有工作流的订单不能直接改 status（除 cancelled），必须走 stage API。

**方案**（纯前端，不等后端）：
- 前端复刻后端 `mapStageToStatus` 映射（idx0→pending / idx1且收款→confirmed / 中间→wip / 末→done），判断各状态可达性
- 有工作流但无对应节点时**禁用选项**（UI 层提前拦截，后端仍是最终裁决者）
- 提交后：有工作流→`advanceStage` 推进到目标节点（status 由后端映射）；无工作流→`updateStatus` 直接改
- 工作流变化导致当前选项不可达时自动回退默认值

**原则**：契约稳定即可并行——后端未支持但现有 API 能组合实现时，前端对着现有 API 实施，不阻塞。改动向后兼容。

## 可测试性：纯逻辑提取为 composable

`mapStageToStatus`/`findStageForStatus`/选项禁用/回退逻辑提取为 `useStageStatus` composable（项目既有模式：usePasteUpload/useOrderForm），配单元测试。页面组件只消费 composable。好处：逻辑可测、页面更薄、复用性强。

## 踩坑

### commit 拆分时 i18n 文件混合多功能键
i18n 文件（zh-CN.js/en.js）同时含 F2/F3 和 F7 的键时，拆分 commit 的方法：
1. 临时移除 F7 键 → commit F2+F3（含 i18n）
2. 加回 F7 键 → commit F7（含 i18n）

### git add 多文件时误带已暂存文件
`git add fileA fileB fileC` 时，如果 fileC 之前已被 add 过（如第一次 add 了全部 4 个文件），commit 会把 fileC 也带进去。**commit 后立即 `git show --stat HEAD` 检查文件列表**，发现错误用 `git reset --soft HEAD~N; git reset HEAD` 重做（分支未推送时安全）。

### rebase 引入其他角色的 ESLint 警告
rebase 合入其他角色代码后，ESLint 可能出现新警告（如三号封面排序按钮的换行警告）。**rebase 后必须重跑 ESLint**，自己授权文件范围内的警告顺手修复（属"机动"项），commit 说明注明"顺修 rebase 引入的警告"。

### 阻塞依赖的处理
F8 依赖三号 language 字段。验证方法：`search_files server/src language`，0 结果 = 未合入。报阻塞、写进 comms、继续其他工作。不猜测、不等待。
