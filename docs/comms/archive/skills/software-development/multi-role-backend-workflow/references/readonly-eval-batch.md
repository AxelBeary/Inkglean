# 只读评估/预研批工作流（三号）

> 触发：一号派「只读研究/评估批」——如「X 表能否 drop」「写路径是否绕过引擎」「schema 核实」。零代码改动，交付物 = 报告 + commit。实战来源：2026-08-05 addons 评估批（assess-addons 分支）。

## 流程骨架

1. worktree 里先 `git merge master` 拿派工文件，读派工逐条对问题编号。
2. **不盲信派工术语**（soul 纪律的落地）：派工说的表名/行号可能过时。先跑 sqlite_master / PRAGMA 验证实际 schema。实例：派工说「addons 表」，实际数据库**没有** `addons`/`order_addons` 表——真实目标是旧体系 `price_addons` + `addon_tiers` 对表；报告开头必须写「范围澄清」纠正术语。
3. 逐问题收集证据，每条结论带 `文件:行号`。
4. 写报告 → git add + commit **尽早一次做完**（见末尾工具预算纪律）。

## 只读 DB 统计（worktree 无 data/ 时）

worktree 是 git worktree，`data/`（gitignore）和 `node_modules` 都不在。不要复制数据库、不要在 worktree 装依赖。模式：

```js
// 脚本放 OS TEMP（%TEMP%\assess-*.js），不进仓库
const Database = require('D:\\...\\artist-commission\\server\\node_modules\\better-sqlite3')  // 主仓绝对路径
const db = new Database('D:\\...\\artist-commission\\data\\commission.db',
  { readonly: true, fileMustExist: true })   // readonly 是纪律证明，报告里写明
```

- 用 `write_file` 写脚本再 `node 路径` 执行——**不要用内联 `node -e`**（PowerShell 吞反引号，SQL 里的反引号/模板串会被剥掉，报 `SyntaxError: Expected ',', got 'ident'`）。
- `write_file` 到 %TEMP% 每次都会报 lint 误报 `Cannot find module 'D:\c\Users\...'`（lint hook 的 node --check 路径解析坏）——**忽略它直接运行**，文件是好的。
- 报告注明：worktree 无 data/，统计查的是主仓同一库（readonly 打开）。

## 「能否 drop 一张表」证据清单

- **写路径**：grep `INSERT INTO <表>` / `UPDATE <表>` / `DELETE FROM <表>` 全仓；区分生产 src 与 tests seed；确认管理 API 是否已删（找删除注释，如「v0.36 C-1 已删除」）。
- **读路径**：grep SELECT；追到路由层确认哪些公开 API 仍消费；检查下单/创建链路是否仍接受旧参数（JSON Schema 里字段还在 = 接口契约还活）。
- **可达性**：前端双模式/兜底分支是否让旧模式仍可达（实例：新画师注册不自动建画风 → isStyleMode=false → 档位模式兜底活着；但档位算价不依赖增项表，addons 默认 []）。
- **存量数据**（只读 SELECT）：表行数 + 明细抽样；引用旧表关联键的订单数；快照字段含旧语义的行数；新体系对照表行数；迁移版本号。
- **FK 反查**：DROP 前确认无下游表 FK/列指向它（grep init.js 全部 DDL + orders 等表结构）。
- **结论三选一**：可以 drop（链路全迁）/ 保留但冻结（写死读残、存量零依赖、drop 卡在代码清理）/ 仍是活表。冻结态要给出升级 drop 的前置清理步骤草案（后端→前端（他角色，需一号协调）→测试→迁移，注明本批不执行）。

## 「写路径审计」证据清单（如 addPayment）

- grep 精确 `INSERT INTO <表>` 全仓，应能数出唯一/全部写点。
- 交叉验证变体：`DELETE FROM` / `INSERT OR REPLACE|IGNORE` / 冗余字段的其他 UPDATE 点（如 paid_total_cents）/ tests 与 demo 脚本直写。
- 对每个写点逐行核对引擎联动（关联字段、锁定推导、守恒自检、日志、事务边界），列成行号表格。
- 唯一调用方追到路由层（grep 函数名于 src/**）。

## 报告结构模板（docs/comms/03-to-01-{主题}-{日期}.md）

1. 元信息（日期/分支/派工文件/纪律执行声明——全程只读、DB readonly 打开）
2. 范围澄清（纠正派工术语，如有）
3. 逐问题：小问表格化（路径|位置|性质）+ 存量数据统计 + 三选一结论
4. 清理建议草案（若适用，供一号评审，本批不执行）
5. 交付摘要（改动文件仅报告、分支、未推送未合并）

commit：单行 `docs(comms): ...`，不推送不合并，最后给一号摘要（Q1 结论/Q2 结论/报告路径）。

## 工具预算纪律（本批踩坑）

证据收集会消耗大量 grep/read/DB 往返（本批 ~30 次调用）。**报告写完后立刻在同一轮 git add + commit**，不要把 commit 留到「下一步」——本批 commit 因迭代上限被推迟，交付时只能附上待执行命令，属半成品。节奏：merge master（1 次）→ 证据（大头）→ 报告 + commit（合并成一轮）。
