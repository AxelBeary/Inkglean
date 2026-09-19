# 时间条/甘特图拖拽（原生 Pointer Events）+ worktree 验证陷阱

> 来源：v0.28 时间条拖拽实施（QueueBoard.vue）。适用于任何"沿时间轴拖端点改日期"的交互。

## 原生 Pointer Events 拖拽模式（不引库）

vuedraggable 面向列表排序，不适用时间轴拖拽。原生模式（与项目 R30e 滑块取消同款）：

```
handle @pointerdown → e.currentTarget.setPointerCapture(e.pointerId)
handle @pointermove → 算 dayDelta = Math.round((e.clientX - startX) / dayWidth)
handle @pointerup   → 提交 API
handle @pointercancel → 清空拖拽状态
```

要点：
- handle 元素设 `touch-action: none`（移动端防浏览器接管滚动手势），横条主体保持默认允许滚动
- 移动端热区扩大：@media(max-width:768px) handle 宽度 8px→24px
- 浮动日期标签用 `<Teleport to="body">` + `position: fixed` + `transform: translate(-50%, calc(-100% - 10px))`——避免祖先 transform 破坏 fixed 定位
- 拖拽中 `:disabled="drag != null"` 禁用 el-tooltip（否则拖拽时 tooltip 闪烁）
- 约束在 **move 阶段 clamp**（截稿日≥开工日等），up 阶段只做兜底 warning——不要只在 up 拦截
- 吸附到天：`Math.round(deltaX / dayWidth)` 天偏移，松手提交 `YYYY-MM-DD`
- 保存成功后**局部更新源数组**（queue/bufferQueue 本体，不是 computed 展开的副本），触发 computed 重算；不全量 loadQueue 避免闪烁。失败才回滚（loadQueue + loadBufferQueue）
- 被窗口裁剪的端点不显示 handle（拖了等于把日期设成窗口边界，误导）；终态订单不显示 handle
- 拖拽中用 dayDelta 覆盖 left/width（`tlBarStyle(row)`），不直接改 DOM

## worktree 验证陷阱

1. **git worktree 不含 node_modules**：首次在 worktree 跑 eslint/build 前必须 `cd web && npm install`
2. **`npm approve-scripts esbuild` 静默改 package.json**：esbuild postinstall 被 allow-scripts 拦截时需 approve，但 approve 会往 package.json 写入 `allowScripts` 字段。package.json 通常不在授权范围 → approve 后立即 `git checkout -- web/package.json`，只提交授权文件
3. **PowerShell 多行 commit message 破坏链式命令**：`git commit -m "第一行\n\n- 要点"` 在 `;`/`&&` 链中导致解析错误。commit message 保持单行，或写文件后 `git commit -F msg.txt`
