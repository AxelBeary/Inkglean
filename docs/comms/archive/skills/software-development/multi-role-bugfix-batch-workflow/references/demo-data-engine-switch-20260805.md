# demo 数据脚本切流 + 容器内脚本验证（v037 二阶段 C 路，2026-08-05）

五号执行 demo-data 切流：演示订单从直插绕过 createOrder 改为补齐新模型四要素（条目账本+引擎分期+locked+守恒）。分支 v037-phase2-demo，commit eb0b4d0，786/786 全绿。

## 方案决策：直插+补齐 vs 改走 createOrder

**选直插+补齐，不改造 createOrder 调用**。理由（写进交付报告，一号一眼能认可）：
- createOrder 无法表达演示剧本：status/stage/paidRatio/daysAgo/deadline 全是演示要精确控制的字段，createOrder 签名里没有
- orderNo 需精确控制（ALICE-001~004），createOrder 走 generateOrderNo 自动分配
- 直插后补齐四要素与 createOrder 内部行为同构（见下），改动面最小

## 四要素补齐模式（直插订单走引擎入口的等价物）

```ts
const orderId = Number(r.lastInsertRowid)
// 1. base 条目（= 总价）：appendPriceEntry 未导出 → demo-data 直接 INSERT，
//    与 createOrder L298 的 appendPriceEntry(orderId, 'base', totalPriceCents, '初始报价', 'system') 同构
db.prepare("INSERT INTO order_price_entries (order_id, type, delta_cents, name, created_by) VALUES (?, 'base', ?, '初始报价', 'system')").run(orderId, cents)
// 2. 分期走引擎（已是 allocateInitial 实现，幂等）
generateInstallmentsForOrder(orderId)
// 3. locked 推导：按 paid_total_cents + current_stage_id + status 自动算（completed 优先 paidOff）
refreshInstallmentLocks(orderId)
// 4. 守恒自检：不守恒抛 PRICING_CONSERVATION 中止脚本
checkOrderConservation(orderId)
```

**幂等靠 FK CASCADE**：脚本开头 DELETE orders（order_no LIKE 'ALICE-%'）→ order_payment_installments / order_price_entries 自动级联清掉 → 重插。无需手动清子表。

## 清理范围扩展（关键踩坑）

脚本原清理是固定 demoNos 列表 `IN ('ALICE-001'..'ALICE-004')`。首次容器重跑被**用户终验残留测试单**（ALICE-005~014：testa/testtas/H1实测/横幅实测）卡住——这些单无条目账本，新断言必然失败。改 `LIKE 'ALICE-%'` 前缀清理，残留随重建清掉（派工背景明确"重建即清理，属预期收益"，报告里提一句即可）。

## 完整性断言扩展（数据层对账，不只查字段缺失）

正式区有报价订单新增四条：≥1 base 条目 / Σ条目delta=final_price_cents / Σ节点价=final_price_cents（仅无额外项订单）/ locked=1 必有 locked_reason。

## 容器内脚本验证模式（demo-data 这类 import '/app/server' 绝对路径的脚本）

1. **本地跑不了**：demo-data.ts 顶部 `import '/app/server/src/...'` 是容器内绝对路径，本地 worktree 无 /app。本地验证用**等价逻辑复现**：临时脚本 + 内存 DB（DB_PATH=':memory:'）+ 相同 SQL/引擎调用，断言一致结果。容器实跑仍是最终验收。
2. **docker exec 内 sh -c 字符串必须单引号**：PowerShell 双引号里 `$DB_PATH` 会被本地展开为空（`docker exec web sh -c "echo $DB_PATH"` 打出空）。用单引号 `docker exec web sh -c 'echo $DB_PATH'` 才传进容器。查容器真实环境变量用 `docker inspect <c> --format '{{json .Config.Env}}'`（单引号包 --format）。
3. **grep 在 docker exec 里假阴性**：`docker exec web sh -c "grep -n 'export function X' file"` 嵌套引号转义可能返回 0 命中（假阴性）。用 sed 直接看行 `docker exec web sh -c 'sed -n "830,845p" file'` 更可靠；或直接 `docker cp` 诊断脚本进容器跑。
4. **生产容器无 devDependencies**：容器内 `npx vitest run` 报 ERR_MODULE_NOT_FOUND（找不到 vitest 包）——正常现象，测试在本地 worktree 跑（786/786），交付报告注明"容器内测试不可用，本地全绿"即可，不是回归。
5. **upload 文件缺失可从 .recycle-bin 恢复**：alice-p03.jpg 08-04 被 GC 回收（uploads/.recycle-bin/2026-08-04/images/2158/），导致 backfill width/height 失败 → 断言失败。Copy-Item 恢复即可（bind mount 即时生效）。
6. **验证脚本放 OS temp + 容器 /tmp**，跑完即删（git 只跟踪 demo-data.ts 一个文件，交付报告 diff --stat 干净）。

## 交付报告要素

守恒核查输出列表（每单 Σ条目/Σ节点价/locked 状态 + 节点明细）+ 备份文件名（重建前 `cp commission.db commission.db.bak-<阶段>-pre-<操作>`）+ 环境操作说明（恢复文件/清理残留）单列。
