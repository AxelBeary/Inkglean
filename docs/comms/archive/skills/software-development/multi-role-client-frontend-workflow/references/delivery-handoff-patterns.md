# 交付、转交与 Patch 任务模式（二号）

来源：v0.31 遗留 + v0.32 Phase1/Phase2 派工实践（2026-08-03）。

## 转交纪律（用户纠正过）

任务完成后，给操作人的最终回复**必须**是明确的转交行，格式：

```
二号转交一号，文件：docs/comms/02-to-01-xxx-report.md
分支 <branch>，N 个 commit：<hash> <简述> + <hash> <简述>。ESLint 零错误，build 通过。
```

不能只说"待命"或给工作总结。操作人照此句转达。用户曾明确纠正："你要输出给我 '二号转交一号xxxxx：'"。

## 接到派工：同一轮就要动手

读完派工文件后，**同一轮回复必须包含工具调用**：读派工 → git 状态确认 → `git worktree add` → 开始读契约文件。
禁止以"先确认契约"结尾却不发工具调用——操作人会把这理解成"派工没收到"（用户曾问"是我刚才没成功给你派工吗？"）。

## "找不到交付" → 先查是否已合入

交付报告**合入即删**。一号/用户说找不到报告/分支时：
1. 主 worktree `git log --oneline -10`，找 merge commit（如 `merge: v0.32 Phase1 ...（二号）`）。
2. 已合入 = 工作已落地，报告删除是预期行为。改读新 STATUS.md / 新派工。
3. **不要重做，不要重建报告**。

## Patch 任务工作流（对已交付工作打补丁）

派工写"patch"且复用已有分支时：
1. `cd` 进**已有** worktree（不新建）；`git branch --show-current` + `git status --short` 确认干净。
2. `git merge master`（派工说后端已合入时通常无冲突）。
3. 对已提交文件做最小改动。
4. worktree 的 web/ 目录跑完整验证链：`npx eslint .` + `npm run build` + `npx vitest run`（前端 106 测试必须过——master 上后端有变更时此项强制）。
5. 用派工指定的 commit message 新提交。
6. 在**原**交付报告末尾追加 `## Patch: ...` 章节（不新建报告文件）：派工引用、commit hash、改动内容、验证数字、闭环了哪个关注项。

## 后端字段未就绪的向前兼容 fallback

契约未合入（schema `additionalProperties: false` 会拒绝新字段）时：
- 写码前先读路由 .ts 的 schema 确认（在路由文件里搜 `additionalProperties`）。
- 实现兼容 fallback（如信息嵌入 `description` 前缀、新字段传 null），保证功能端到端可用。
- 交付报告的"需一号关注"里显式列为未闭环项，后续 patch 干净替换。
- patch 到来时**整段删除** fallback，不留双路径。

## Worktree 机制备忘

- 新派工新分支：主 worktree 里 `git worktree add ../artist-commission-wt-XX -b <branch> master`（主 worktree 永远停 master，不切分支）。
- 新 worktree 没有 node_modules：先 `cd web; npm install` 再 eslint/build/test。**后端也一样**：`server/` 缺 node_modules 时 `npm run dev` 报 `'tsx' is not recognized`——要起后端自测就先 `cd server; npm install`，别浪费一轮启动失败才发现。
- patch/write_file 工具的 lint 报 `Cannot find module 'D:\d\...'` 是工具路径拼接问题（MSYS 风格路径），**不是代码错误**——以真实 eslint/build 输出为准。
- 验证证据：comms 报告里记录 commit hash + 精确数字（ESLint 0/0、build 秒数、测试 N/N）。系统注入"重新验证证据"提示时引用报告，不重跑。
- **terminal 的 cwd 会在长会话中悄悄退回主 worktree**（v0.36-w2 实测）：两次 terminal 调用之间工作目录可能被重置，输出里的 `cwd` 字段是唯一可靠信号。若不察觉，后续 git grep/编辑会落在错误 worktree——最坏情况是动到主 worktree（别的角色或一号可能正在用）。纪律：发现 `cwd` 与预期 worktree 不符时，下一条命令永远以 `Set-Location "<worktree>"; git branch --show-current` 开头；git add/commit 前也顺手带 `git branch --show-current` 防落错分支。

## 联调 patch 工作流（mock-first 交付 → 换真实 API）

波 2 mock-first 交付已合入 master、后端 API 也合入后，一号会派"联调删 mock"补丁（新分支新 worktree）。固定流程：

1. **先探真实契约再写码**：`docker exec commission-web node -e "fetch(...)"` 实测新端点返回（见 browser-selftest-patterns §十七），与派工的"预判契约"逐条比对，把差异列成清单（字段名/数据源/函数签名）逐项适配——v0.35 实测 3 处差异全在派工预告内。
2. **纯函数层是唯一适配点**：适配层（useArtistData）的纯函数改签名/实现对齐新契约，组件与页面只换数据来源，不碰交互逻辑。
3. **删 mock 注入点要删干净**：mock 函数整删 + 调用处恢复直读 + mock import 行删除，grep 旧函数名确认零残留（`search_files` 旧名 0 命中）。
4. **组件签名变化时同步所有消费方**：如 TplGallery 的 styles prop 换成 gallery prop → 4 模板传参一次改齐；被裁掉的 prop（如 TplStyleGrid 的 artworks）同步从模板移除。
5. **测试按新契约重写**：删 mock 形状用例、写真契约用例，测试数变化（如 153→144）在 comms 写清算式。
6. **浏览器验证需要真实数据**：画师还没配置时用容器 DB 临时种子（§十七），验完清理。
7. locales 通常零改动（联调不加文案）；有改动仍只动授权命名空间。

## 接力发现工作树里有上一轮未提交的代码（v0.36 第三轮实测）

症状：到达时 `git status` 干净，但 merge 后几分钟内工作树冒出改动（时间戳落在上一轮活动时间窗）；或 patch 工具报 `_warning: modified by sibling subagent 'sa-0-xxx'`。原因：上一轮接力写完代码撞上迭代上限没来得及 commit。

**不重写，也不盲目 commit。** 固定协议：

1. **先确认写者已停**：`Get-Item <file> | Select-Object LastWriteTime,Length` → `Start-Sleep 6~8` 再查一次，大小/时间戳两次一致才算稳定。还在变就继续等，变的过程中不动文件。
2. sibling warning 是工具的过期读保护，不等于真在并写：重新读目标区域 + mtime 稳定性复验后再动手。既不恐慌放弃自己的修正，也不没读就覆盖。
3. **拿派工规格逐条审未提交 diff**：`git diff` + `??` 新文件通读，对照派工原文查 i18n 键名、颜色/样式、精确文案——这是最高频偏差点（v0.36 实测 3 处：toast 浅色背景 vs 规格深色白字；键名 common.undo vs 规格 queue.tlUndo/tlUndone；en 文案 "changed to" vs 规格 "set to"）。上一轮凭记忆写码出偏差是常态，接力的价值就是这道审计。
4. 修偏差 → 完整验证链（vitest/eslint/build）→ **同一轮立刻 commit**（见 browser-selftest §十"先 commit 再手动验证"）→ comms。
5. comms 写清：哪些是前轮成果（审计通过原样保留）、哪些是本轮修正（逐条列偏差与修法）、哪些没做完（浏览器自测/commit/报告）——下一轮接力好接。

## 重复派工（同一派工反复送达）

用户重发/并行会话会导致同一派工收到多次。处理纪律：**先查 git 三件套确认进度，只补缺口，不重做**。
- 代码已改未 commit → 复跑验证 + commit。
- 已 commit 但 comms 未进 git → 补 commit comms（v0.35 联调实测：派工送达 3 次，第 2 次补上 comms commit，第 3 次只需确认状态）。
- 全部完成 → 回复"已完成，见 comms + commit hash"。
- 派工要求 `git worktree add` 但 worktree 已存在 → `git worktree list` 确认后直接进，不重复 add（会报 already exists）。
