# 收款三连 2026-08-04（P 批：负数卡死 + 多收 + 文案）

五号在 v036-w2-bugfix 分支修复收款弹窗三连的会话记录。重点沉淀三类知识：EP 组件行为诊断、容器 DB 检查配方、跨 worktree 污染事故的最终定论。

## 1. el-input-number :min/:max 硬钳制 = "卡死"类 Bug 的高频根因

**现象特征**（用户原话"卡死"）：
- 输入框带 `:min/-:max` 硬钳制（如 `:min="-poolPaidCents / 100"`）
- 用户输入越界值（如 -100 低于 min=-86）时**输入过程中能显示**
- **blur 瞬间 EP 静默清空为空串**——无 ElMessage、无错误样式、值丢失
- 用户以为输入被吃了/界面卡住，实际提交校验（如 payRefundExceed）根本没机会触发

**复现**（真实输入，不用合成事件）：
```
browser_type 输入框 ref 输入越界值 → browser_console 触发 blur →
读 input.value：修复前 = ""（被吞），修复后 = 保留原值
```

**修复模式**（铁律：前端校验只能是后端规则的子集）：
1. 去掉 `:min/:max` 硬钳制，让输入顺畅、blur 不吞值
2. 提交函数里做范围校验，提示必须含具体上/下限金额（如"退款金额不能超出已收金额 ¥86.00"）
3. 校验失败保留弹窗和输入值，让用户可改正重提
4. 后端已支持的合法输入（如正数多收）前端不许拦——本次 P2 就是放开前端私自收紧的 `cents > poolRemainingCents` 拦截

## 2. ElMessage 瞬逝消息捕获

ElMessage 默认 3 秒自动销毁，点击提交后再查 `.el-message` 大概率为空。正确姿势：

```js
// 点击前装监听
window.__msgLog = [];
window.__msgObs = new MutationObserver(() => {
  document.querySelectorAll('.el-message').forEach(m => {
    const t = m.innerText.trim();
    if (t && !window.__msgLog.includes(t)) window.__msgLog.push(t);
  });
});
window.__msgObs.observe(document.body, { childList: true, subtree: true });
// ... 执行点击 ...
// 之后读 window.__msgLog，记得 window.__msgObs.disconnect()
```

区分"被校验拦截"与"静默吞掉"的三件套：capturedMessages + 弹窗是否仍开 + 输入值是否保留。

## 3. 容器 DB 检查/清理配方（PowerShell 转义地狱的解法）

`docker exec ... node -e "..."` 里含单引号+`$`+中文时，PowerShell 转义几乎必然搞坏。稳定配方 = 写本地 .cjs → docker cp 进容器 → 在 node_modules 所在目录执行 → 删除脚本：

```powershell
# 1. 本地写脚本（write_file），后缀必须 .cjs（server 是 type:module，.js 会报 require is not defined）
# 2. 复制到容器内 /app/server/（better-sqlite3 的 node_modules 在那；放 /tmp 会 MODULE_NOT_FOUND）
docker cp "本地路径\xxx.cjs" commission-web:/app/server/xxx.cjs
# 3. 执行（-w 指定工作目录）
docker exec -w /app/server commission-web node xxx.cjs
# 4. 清理脚本
docker exec commission-web rm /app/server/xxx.cjs
```

常用查询模板（写进 .cjs 里）：
```js
const db = require('better-sqlite3')('/app/data/commission.db')
db.prepare('SELECT ... FROM orders WHERE id = ?').get(id)
```

**操作日志表名/列名**：`order_activity_logs`，列 = id/order_id/action_type/actor/detail_json/created_at（不是 action/details）。清理测试数据要同时删 order_payments 流水 + order_activity_logs 日志 + 还原 orders.paid_total_cents。

**浏览器实测后必须清理共享容器 DB 的测试数据**（其他角色/用户在用），用上面的脚本配方做事务性清理并验证恢复值。

## 4. 跨 worktree 污染事故：本次会话的最终定论（补充 cross-worktree-contamination-protocol）

本次 wt-05 出现 B1（enrichOrderForArtist）的**残缺版**改动：order.routes.ts 里 21 处调用在、函数定义丢，导致 32 个测试 500。

**处置中我最初误判为"三号漏写"，一号打断并给出实锤事实链**：
1. 我的 worktree 基于 B1 合入前的 master（cddb3f2）
2. 三号 B1 已完整合入 master（merge 42fe432），函数定义就在 order.routes.ts 文件内部
3. 本地文件"调用在、定义丢"= 三号的改动被**部分带入**我的文件（不是谁漏写）
4. 32 个测试失败 = 调用未定义函数 → 500，与我的任务无关

**教训**：
- 发现陌生改动时，先 `git log` 对照 master 是否已有该功能的完整合入版本，再下结论——**不要先猜"某角色写漏了"**
- 32 个测试失败的诊断捷径：失败集中在某文件改动的端点 + 全是 500 → 优先怀疑未定义函数/导入缺失，用 grep 验证"调用在、定义不在"
- 恢复协议验证有效：备份脏 diff → 只还原该文件（其他授权文件改动全保留）→ `git merge master` 拉入完整版 → 重跑全量测试确认基线

## 5. 其他细节

- **派工授权路径不存在时的处置**：派工写的 `server/src/features/order/__tests__/` 目录不存在（项目测试在 `server/tests/`），新测试落在同主题现有测试文件（quota-pool.test.js），并在 comms 报告备注栏向一号说明，不擅自扩大授权
- **浏览器会话登录态会丢**：跨多轮操作后 sessionStorage 失效被踢回 /login，重新走登录码流程即可（dev 模式登录码直接显示在前端 alert 里，AUTH_DEV_MODE=*** 时也在 docker logs）
- **browser_navigate 后偶尔快照空**：等一拍再 browser_snapshot，或重新 navigate
- 合成事件（dispatchEvent input/blur）驱动 el-input-number 不可靠，输入验证用 browser_type 真实键入
