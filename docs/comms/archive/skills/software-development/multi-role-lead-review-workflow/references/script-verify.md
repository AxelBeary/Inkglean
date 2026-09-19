# 脚本类交付的容器实跑验证协议（角色换新模型时审核升级）

> 2026-08-05 五号 C 路（demo-data 切流）审核实录。用户警告：「其他几个换了最新的模型 麻烦仔细审核 我还没试过他们的正确率」。

## 触发条件

用户明示某角色换了新模型 / 正确率未验证时，该角色交付在常规「读 diff + 跑测试门」之外**必加三项**：

1. **独立容器/运行时实跑**：脚本类、运行类交付不信报告里的「我跑过了」，一号亲自实跑。
2. **语义逐条对照**：DB/界面实际状态对照业务场景逐个核对（如 locked 节点 vs 订单当前阶段是否符合 R4 完成即锁），不只看测试断言通过。
3. **拷源路径核对**（最易踩）：容器内验证交付物时，`docker cp` 的源**必须是交付 worktree 的版本**——主仓 master 上同名文件还是旧版（交付未合入），拷错源会把交付误判为失败。

## 实录：误拷旧源 → 误判失败 → 脏库恢复重跑自证

五号交付 demo-data.ts 切流（DELETE 从 `IN (demoNos)` 改 `LIKE 'ALICE-%'`，新增条目/locked/守恒补齐）。

1. 一号 `docker cp server\scripts\demo-data.ts`（**主仓路径，cwd=主仓 master，旧版**）进容器实跑 → 断言失败：ALICE-005（08-04 用户终验残留单）缺字段。
2. 险些误判为「五号交付有 bug」。查库取证发现 ALICE-005 的 `source='manual'` 且 DELETE 确实没覆盖它——但五号新版用的是 `LIKE 'ALICE-%'` 应该能删。
3. 对比两份文件的 DELETE 行，实锤**自己拷的是主仓旧版**（IN 列表），交付 worktree 才是 LIKE 版。
4. **脏库恢复重跑**：从验证前备份恢复数据库（含 ALICE-005 残留）→ 改拷**交付 worktree 的新版**重跑 → 通过。

结论反转：这次失误反而成了更强证据——旧 IN 列表版确实会被残留单卡死，新 LIKE 版连脏库都能清理。交付经得起脏数据考验。

## 标准动作序列

```powershell
# 0. 实跑前先备份容器库（验证本身会改演示数据）
docker exec commission-web sh -c "cp /app/data/commission.db /app/data/commission.db.bak-<目的>"

# 1. 拷交付 worktree 的版本（不是主仓！），用带后缀的临时名防与镜像内文件混淆
docker cp ..\<交付worktree>\server\scripts\<脚本>.ts commission-web:/app/server/<脚本>-verify.ts

# 2. 容器内实跑
docker exec -w /app/server commission-web npx tsx <脚本>-verify.ts

# 3. 失败时先别怪交付——核对拷源版本（对比关键行），再决定是否脏库恢复重跑
docker exec commission-web sh -c "grep -n '<关键改动标识>' /app/server/<脚本>-verify.ts"

# 4. 清理容器内临时脚本
docker exec commission-web rm -f /app/server/<脚本>-verify.ts
```

诊断用 `.cjs` 一次性脚本纪律：写 `C:\Users\<user>\AppData\Local\Temp\hermes-<用途>.cjs`（避免污染仓库），docker cp 进容器跑完即删（容器内 + 本地都删）。容器内 server 是 ESM（`"type": "module"`），诊断脚本必须用 `.cjs` 扩展名。

## 语义对照实例（locked 推导）

报告声称 locked 状态正确时，一号查库对照工作流节点逐个验证：

```sql
-- 工作流节点（哪些 takes_payment，各自 sort_order）
SELECT id, name, sort_order, takes_payment FROM artist_workflow_stages WHERE artist_id=? ORDER BY sort_order;
-- 订单当前阶段 + 节点 locked
SELECT current_stage_id FROM orders WHERE id=?;
SELECT label, locked, locked_reason FROM order_payment_installments WHERE order_id=? ORDER BY sort_order;
```

对照规则（R4 完成即锁）：节点 sort_order < 当前阶段 sort_order → 应锁(completed)；≥ 当前阶段 → 不应锁（除非付清 paidOff）。实录：ALICE-002 当前=上色确认(sort5) → 线稿确认(sort4)已锁；ALICE-003 当前=草稿确认(sort3) → 线稿确认(sort4)未锁。两单锁状态不同是**当前阶段不同**，不是矛盾——怀疑「矛盾」时先核对场景差异再下结论。

## 角色在主仓直接工作（无 worktree）的提交卫生

需求深聊批类任务让角色直接在主仓 `docs/` 写需求稿。其未提交的 `REQ-*.md` 新文件 + 对既有 REQ 的修改混在一号工作树里：

- 一号每次 commit 前 `git status` 全量扫，`git add` 只加自己本轮的具体文件路径，逐行核对暂存区
- 角色在途产物**一律不碰、不代提交**，STATUS 里标注「勿动」
- 角色正式转交后再审核落库
- 这是 e04f2f5 事故规则在「主仓文档工作」场景的延伸

## 关联教训

- **同名文件多版本陷阱**：交付未合入期间，主仓 master / 交付 worktree / 容器镜像内是三份不同的同名文件。容器验证前先想清楚要验证的是哪一份。
- **验证失败先查自己的验证方法**：角色报告说跑过且贴了输出，我跑出失败——矛盾出现时先核对拷源/env/路径，再怀疑交付。这次是一号错，但流程保住了没误合也没误退。
