# 零代码改动回归实测模式（regression live-test）

> 触发：二号收到"实测/回归/预验收"派工，带零代码改动约束（交付时 git status 必须干净）。
> 本文件是 browser-selftest-patterns.md 的姊妹篇：那篇讲功能自测，这篇讲验收别人已合入的修复。

## 总流程（每个实测点都走四拍）

1. **基线快照**：动手前记录目标区域全部数字（已收/应收/待收/最终价/增项数/状态），页面文本 + API 双渠道各存一份。
2. **变更 → 验证**：执行操作后等 800ms（EP 提交后刷新是异步的）再读页面断言。
3. **恢复 → 验证恢复**：恢复操作本身是同一链路的二次验证（如改价改回原价 = 又测了一遍改价）。
4. **披露**：报告逐项写"改了什么 / 是否已恢复 / 残留什么日志"。系统自动日志（改价记录、增项加/删时间线条目、系统备注）**删不掉**——如实写"日志残留"，不要试图清。

## EP 活体探测配方（browser_console）

- **可见弹窗判定**：`[...document.querySelectorAll('.el-overlay')].filter(o => getComputedStyle(o).display !== 'none')`。关闭的 EP dialog 会以 display:none 留在 DOM，`!!querySelector('.el-dialog')` 永远为真，不能当"弹窗仍开着"用。
- **toast 捕获**：ElMessage ~3s 自毁，跨工具往返必丢。在触发点击的**同一表达式**里先装 MutationObserver 把 `.el-message` innerText 推入 `window.__msgLog`，之后读数组。
- **编程填值**：native setter + dispatch input/change 事件。先查字段 tagName——EP 单行备注常用 input 不是 textarea，用错 prototype 报 "Illegal invocation"。
- **按可见文字找按钮**：`[...document.querySelectorAll('main button')].find(b => b.textContent.includes('改价'))`，比快照 ref 稳（ref 每次快照变）。
- **列表行操作钮**：不要凭猜的类名 closest()。先走 parentElement 打印真实 className，定位后读回行标识文本核对再点；有确认弹窗时核对弹窗里的金额/名称再确认。猜错类名 closest 会静默爬到共享容器，点到第一行的按钮（本会话真实事故：想撤 ¥200 弹出了 ¥84 的撤销确认，幸好弹窗文本核对救回）。

## 本项目最短路径备忘

- 订单列表「详情」按钮在自动化环境可能点了不跳转（重试无效就别耗）→ 用 `fetch('/api/artist/orders', {credentials:'include'})` 拿订单 id，URL 直达 `/orders/{id}`。
- 画师登录：/login 输 QQ → 获取登录码 → `docker logs commission-web --tail 10 | Select-String 登录码` → 输入登录。verify 返回 200 后页面可能不自动跳转；确认 `localStorage.artist_logged_in === '1'` 后手动导航 /dashboard 即可。
- 收款流水 API：`GET /api/artist/orders/{id}/payments` 直接返回数组，元素含 id / amount_cents / note / created_at——撤销/核对用 id 定位最准。

## 恢复手法

- **收款记录** → 收款流水对应行「撤销」按钮（弹确认，核对金额再确认）；点错行先取消再重新定位。
- **价格** → 再走一次改价流程改回原价（原因写"回归实测恢复原价"）。
- **增项** → 行尾 ✕（弹确认）。
- 恢复后重新读一遍基线四数字，与步骤 1 快照完全一致才算闭环。
