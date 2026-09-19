# 筛选/查询参数类交付的审核协议（F4 分页 / F5 留言筛选实录）

> 2026-08-05 五号 REQ-022 F5 留言管理三维筛选审核实录（8 文件 +255 行，"低风险"但含动态 SQL 拼接）。
> 适用：给既有列表接口加 query 参数（筛选/排序/分页）的交付。认证/加密类走 security-critical-review.md。

## 交付报告在哪读（常见卡点）

角色把交付报告 commit 在**特性分支**上，master 上没有。用户转交说「文件：docs/comms/0N-to-01-xxx.md」时直接 read_file 主仓路径会 File not found——这是正常的，去 worktree 读：
- `read_file <worktree路径>/docs/comms/0N-to-01-xxx.md`
- 或 `git show <branch>:docs/comms/xxx.md`

## 审核清单（逐项过）

1. **SQL 拼接**：动态 WHERE 只能拼**固定子句字符串**（`clauses.push('m.status = ?')`），值一律 `?` 占位 + params 数组（`.all(...params)`）。出现值插值进 SQL 字符串 = 打回。
2. **枚举参数白名单**：status 类参数 `['pending','approved','rejected'].includes(x)` 校验，非法值忽略返回全量（与全站列表惯例一致，不报错不 400）。
3. **数字参数**：`parseInt(x ?? '')` + `Number.isNaN` 忽略非法值；布尔语义参数用字符串严格相等（如 replied 仅认 `'1'`/`'0'`），防 `'true'`/`'2'` 等歧义值漏入。
4. **权限**：admin 接口 `preHandler: requireAdmin` 在位；测试必须含 **403 越权例**（普通画师 token 调 admin 接口）。
5. **前端筛选语义**：筛选变更必须**重新请求后端**（非前端本地过滤——数据量大时本地过滤是假筛选，且分页场景下必然错）。clearable 下拉清空 = null，axios params 中 null/undefined 自动丢弃，等价"全部"，无需前端特判（确认即可）。
6. **i18n 动态键**：`$t(`prefix.status${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}`)` 类拼接键，先确认枚举值域与 locales 键一一对应（三种状态三个键），防键缺失渲染原始英文。
7. **无夹带 schema 变更**："低风险批"夹带迁移是高危信号——`Select-String init.js 'version:\s*\d+'` 确认迁移版本未变。
8. **测试覆盖矩阵**：无参全量 / 单参各维 / 组合条件 / 空匹配返回 [] / 非法值忽略 / 非数字 ID 忽略 / 403 越权。缺一类要求补。
9. **范围红线**（若派工有红线，如"未读语义不碰"）：grep 红线关键词（read_at 等）确认零触碰，报告声称"零触碰"不算数。

## 合并态门禁

`git merge <branch> --no-ff`（message 写明审核结论要点：SQL 占位/白名单/403 例等）→ 独立复跑 server `npm test` + web **`npm run test:web`**（不是 npm test）+ server `npx tsc --noEmit` + 双侧 eslint → 全绿且与交付报告声称数字一致才 push。

## 收尾（一次 commit）

合入即删 comms，且**顺手核查前几轮已合入批次的派工/交付文件是否残留**（F5 合入时发现 F3/F4 文件在假一号轮合入后从未清理，一并 git rm 批量删）。同 commit 内刷新 STATUS（HEAD/测试基线数/worktree 盘面/角色状态），push。
