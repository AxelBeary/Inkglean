# v0.36 实战教训（2026-08-05）：子代理接力 / 暂存区污染 / Transition 验证

三条从 v0.36 派工-审核-合入全流程里挖出的可复用教训。SKILL.md 已超 100KB 上限，暂无法加指针，本文件为正式载体。

---

## 1. 子代理撞迭代上限 → 接力模式，不要整任务重发

leaf 子代理有工具调用上限（约 50 次）。侦察型开场会把预算耗在读文件上——"侦察做完但一行代码没写就中断"是高频死法（v0.36 二号两轮中招：第一轮侦察完零落码，第二轮落码一半）。

**处置流程**：
1. 子代理结束通知到达后，**立即检查 worktree 实况**（`git log` + `git status --short` + `git diff --stat`），不轻信 summary——summary 文件可能缺失/为空（deleg_2b79019e 就没落盘）
2. **一号亲自把已完成部分审核后固化成 commit**：v0.36 实例 = 子代理改好的 QueueBoard.vue（四档缩放+刻度适配，读 diff 确认质量）+ 一号补齐的 i18n 两个键 → 测试门全绿 → 固化 `f64e793`
3. **重发时 context 第一句明写**："侦察已由上一轮完成，本轮直接编码，不要重新大量读文件，把预算留给测试"，并给出精确行号锚点（onTlHandleUp 约 L850、poolRemainingCents 约 L948）+ 剩余任务清单
4. 大任务主动拆轮：一轮 = 一个子代理预算内能落盘 + 自测的量

**监视责任全在一号**：用户原话"右边子代理我完全看不见，得你自己监视"。进度查询：`Get-Content <live_transcript>.log -Tail 5`（注意日志中文是 GBK 乱码，只看 tool/final 行）。

## 2. 主 worktree 有角色直提时，commit 前必查暂存区

直提模式（角色在主 worktree 改完自己 commit）下，角色可能 `git add` 后未及时 commit。此时一号的任何 `git commit` 会把**别人已暂存的改动**一并带走。

**v0.36 事故（e04f2f5）**：一号提交五号-B 派工文件时，捎带了三号 staged 未 commit 的 errors.ts 改动，commit message 只写了派工，且已 push。

**纪律**：
- commit 前 `git status --short` + `git diff --cached --stat`，逐行确认暂存区只有自己的目标文件
- 发现污染且已推送：**绝不 reset 已推送历史**。处置 = 补审改动正确性（对照原派工清单逐项 + 重跑测试门）→ comms 写瑕疵记录（`01-note-合入瑕疵-<sha>.md`）→ STATUS 记录 → 告知涉事角色"改动已合入，不用再 commit，回报测试结果即可"
- 预防：派直提任务时写明"改完立即自己 commit 并推送"；一号在共享 worktree 永远只 `git add` 明确的文件路径

## 3. Vue Transition 组件的浏览器验证要等动画

审核前端交付做浏览器实测时，`.click()` 后**立即读 DOM 拿到的是旧值**（`<Transition mode="out-in">` 换页/切图有动画时长），会误判"点击无效"（v0.36 画廊翻页验证：两次连续 click 后计数仍是 1/5，实际是动画未落定）。

**统一模式**：
```js
new Promise(r => { el.click(); setTimeout(() => r(读取状态), 600) })
```

翻页/切图/筛选重置类交互验证全部用延迟读取。Element Plus 的 el-image 加载也要给余量。

**配套辨析**：筛选后结果为空可能是**数据没标注**而非组件 bug——v0.36 画廊验证点"头像"筛选后 0 结果，先查容器 API 发现 alice 作品 size_tags 全空（真实状态，STATUS 早有记录），是预期行为不是回归。**先查 API 返回再下结论。**

## 4. 附带小经验

- 子代理交付常留临时脚本（`server/_tmp-*.cjs`、`server/data/`）：合入前先 `git ls-files` 确认未跟踪、`Remove-Item` 清掉，别带进 master
- 关键 UI 拍板项（用户点名的"大小交错"）合入前必须浏览器截图 + vision 双重确认视觉效果，不能只看 DOM 结构存在
