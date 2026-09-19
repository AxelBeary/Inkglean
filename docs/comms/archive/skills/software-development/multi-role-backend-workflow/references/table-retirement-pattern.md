# 冻结表代码清理批（table/field retirement pattern）

> 来源：2026-08-05 addons 冻结表清理第一批（price_addons/addon_tiers 算价读路径）。
> 适用触发：派工标题含「冻结表」「表处置」「清理批」——表已冻结（保留但不写入新数据），需分批删除代码读路径，最终 DROP 表。

## 执行步骤（按序）

1. **全量搜引用面**（开工前必做，决定改动边界）：
   - `server/src` 搜表名/字段名 → 读路径清单
   - `server/tests` 搜表名 → seed 函数 + 断言清单
   - `web/src` 搜响应字段消费方（如 `tier?.addons`）→ **只读评估**，不修改（前端兜底分支往往与 POST schema 删除耦合，需前后端同批，由二号处理）
2. **确认调用方是否仍传废弃参数**（决定签名去留）：
   - 搜 `calculatePrice(` / 对应函数的所有调用点；只要有一个调用方还传（如 createOrder 仍传 addons），签名必须保留该字段，否则 TS 对象字面量 excess property check 编译报错。
3. **TS 参数渐进废弃模式**（本次核心技巧）：
   - 正确姿势：函数签名从「解构对象参数」改为「接收整个 opts 对象 + 只解构仍需要的字段」：
     ```ts
     export function calculatePrice(artistId: number, opts: CalculatePriceOpts): PriceResult {
       const { tierId, usageMultiplierId = null, rushMultiplierId = null } = opts
       // opts.addons 等价忽略（调用方仍传，下批删 schema 时同步移除）
     ```
   - 为什么不能直接删字段：调用方传对象字面量 `{ tierId, addons, ... }` 时 TS excess property check 报 "may only specify known properties"。
   - 为什么不能解构了不用：eslint `no-unused-vars` 对解构变量也报（`argsIgnorePattern: '^_'` 只保护函数参数名，不保护解构出的变量）。
   - 废弃字段留在接口类型里（CalculatePriceOpts 仍声明 `addons?`），等调用方 schema 删除的批次同批移除。
4. **响应结构字段保留空值而非删除**（接口契约优先）：
   - 例：`getPublicPricing` 不再读 price_addons，但返回 `tiers: tiers.map(t => ({ ...t, addons: [] }))`——前端 `tier?.addons || []` 兜底自然走空，旧模型增项 UI 不渲染，但不破坏响应结构。
   - 原则：响应字段只增不删；删读取逻辑 ≠ 删响应字段。
5. **测试改写**：
   - 删除「行为已不存在」的测试（数量增项/超量拒绝/inquiry/档位不匹配/禁用项拒绝等）。
   - 新增/改写 1~2 例「传废弃参数不影响结果」回归——用**不存在的 ID + 重复 ID** 验证等价忽略（旧逻辑会拒绝，现不拒绝=正确行为）：
     ```js
     const result = calculatePrice(artist.id, { tierId, addons: [{ addonId: 99999 }, { addonId: 1 }, { addonId: 1 }] })
     expect(result.addonTotal).toBe(0)
     ```
   - `setup.js` cleanDb 里对应表的 DELETE 行：确认全测试无插入路径后删（否则成死代码）。
6. **测试基线会下降**（删除的行为测试数）：交付报告明确写「864→859，减少 5 = 删除的增项行为测试」，避免一号误判为回归失败。

## 交付

- 代码 commit + 交付报告 commit **两个 commit 都落分支**（报告写 worktree 的 `docs/comms/03-to-01-*.md` 并 commit，一号审核才能看到）。
- 报告含：改动清单 / 测试基线前后对比 / 剩余清理项清单（明确列下批内容：POST schema 字段删除、createOrder 参数删除、DROP 表迁移——若已占用版本号，写明下个可用版本号，如 v43）。

## 验证证据注入处理

系统要求「新鲜验证证据」时：引用 comms 已写的验证结果（commit hash + 数字）+ 针对性复跑**直接受影响的测试文件子集**（`npx vitest run tests/a.test.js tests/b.test.js`），不重跑全套。若系统**连续注入且明确要求 temp 脚本**（hermes-verify- 前缀），按要求写 `C:\Users\<user>\AppData\Local\Temp\hermes-verify-*.ps1`（cd server → 聚焦 vitest → lint → typecheck → ALL PASS/exit code），执行后删除，并在回复里如实标注为 ad-hoc 聚焦验证（完整套件数字引用自 commit 前那次）。项目有 canonical 命令但检测器不识别（在 server/ 子目录而非仓库根）。

## DROP 收尾批（第二批：schema 删除 + 死码 + DROP 迁移）

> 来源：2026-08-05 addons 收尾批（`802af46`）。第一批只清读路径（见上），本批在前端停传 + 第一批合入后执行：POST schema 删 addons 字段 + createOrder 参数 + 死码 + DROP price_addons/addon_tiers（v43）。触发：派工含「DROP」「收尾批」「schema 删除」「死码清理」。

### 任务清单（按序）

1. **schema 删除**：所有 POST/PUT 路由 schema 的废弃字段（订单/手动录单/calculate）+ handler 解构 + service 传参，三处一起删。
2. **参数清理**：service 层 CreateOrderParams / CalculatePriceOpts 的废弃字段、函数解构、下游调用（第一批保留的类型字段此时正式删）。
3. **死码清理**：errors.ts 错误码+中文消息、entities.ts interface、fastify.d.ts 死注释——**grep 确认零业务引用再删**（`STYLE_ADDON_*` 是画风增项，属于活模型，勿误删）。
4. **DROP 迁移**（守 v38 事故规则）：
   ```js
   {
     version: 43, name: 'drop_addon_tables', noTransaction: true,
     up(database) {
       database.pragma('foreign_keys = OFF')
       const fkState = database.pragma('foreign_keys', { simple: true })
       if (fkState !== 0) throw new Error('foreign_keys 未能关闭，中止 DROP 以防 CASCADE')
       try {
         database.exec('DROP TABLE IF EXISTS addon_tiers')
         database.exec('DROP TABLE IF EXISTS price_addons')
         const violations = database.pragma('foreign_key_check')
         if (violations.length > 0) throw new Error('悬空引用，中止')
       } finally { database.pragma('foreign_keys = ON') }
     }
   }
   ```
5. **迁移前备份**：交付报告写备份文件名。WAL 模式库不能直接 copy——用 better-sqlite3 只读打开 + `db.backup()` API（node -e 内联跑，server/ 目录下）。

### ⚠️ 最关键坑：DROP 后重跑 initDatabase 表被重建（本次实测抓到）

`initDatabase()` 每次执行都会先跑 `database.exec(schema)`——**schema 常量里若还有 `CREATE TABLE IF NOT EXISTS <废弃表>`，v43 DROP 后重跑会把表重建回来**（迁移已标记 applied 不会再 DROP）。生产重启同样中招。

- 修复：**DROP 迁移必须同时删除 schema 常量里对应表的建表定义**。
- 保留项：历史迁移（v36 等）up 里的 `CREATE TABLE IF NOT EXISTS` 不动（已 applied 不重跑；全新库顺序 = schema 无表 → v36 建表 → v43 DROP，正确）。
- 验证：迁移测试必须含「幂等重跑」用例——`expect(() => initDatabase(db)).not.toThrow()` 后断言表仍不存在。**没有这个用例，重建 bug 不会暴露**（本次 TC-MV-02 实测抓到，TC-MV-01 只查首次应用是绿的）。

### 回归测试断言：removeAdditional 静默剥离 ≠ 400 拒收

派工可能预期「删 schema 字段后 ajv `additionalProperties:false` 天然拒收旧客户端残留请求 → 400」——**本项目 Fastify 默认 `removeAdditional=true`，未知字段被静默剥离而非 400**（routes.test.js / style.test.js 多处现有测试已实证）。处理：按派工授权「按删 schema 后实际行为定断言」，断言改为「请求成功 200 + 字段被剥离、结果不含废弃功能」（如 `totalPriceCents=20000` 无增项 / `addonTotal=0`），并在交付报告写明与派工预期的差异（技术判断修正，不盲信指令——memory 纪律）。迁移测试三例：TC-MV-01 已应用且表不存在 / TC-MV-02 幂等重跑仍不存在 / TC-MV-03 活表（price_tiers）不受影响。

### 交付

- 测试基线**上升**（新增回归+迁移测试，如 897→903，55 文件）。
- 报告含：改动清单 / 迁移内容 / 测试结果 / 备份文件名 / 与派工预期的差异说明。
