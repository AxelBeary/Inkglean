# 多步写事务包裹 + 启动守卫（db.transaction wiring pattern）

> 来源：2026-08-05 workflow 事务批（order-workflow.service.ts advanceStage/rollbackStage P0-1 + init.js ADMIN_QQ fail-fast P1-4）。
> 适用触发：派工含「事务包裹」「原子提交」「中间态」「fail-fast」「启动守卫」「缺配置启动即抛错」——多步写在中间步骤抛错时留半态（orders 已更新但锁/日志未写），或生产启动需前置校验防静默死锁。

## 执行步骤（按序）

1. **核实事务内调用的函数**：
   - 逐个看被调服务函数（refreshInstallmentLocks / logActivity 等）实现：必须同 db 单例（`connection.js` 导出），且内部**无** `db.transaction()` 嵌套（better-sqlite3 嵌套事务报错）。logActivity 注释本就声明"事务内调用，随主操作一起提交/回滚"——设计意图吻合。
   - 查 import 关系：要 mock 的模块是否被目标模块反向依赖（循环依赖会让 vi.mock 行为异常）。
2. **事务边界划分**：校验（读 + throw：getOrder / 权限 / 状态机检查 / 状态映射）全部留在事务外，事务**只包写步骤**。单步写（如 stageId=null 关闭跟踪）不包事务。
3. **better-sqlite3 事务写法**：模块顶层缓存事务函数（better-sqlite3 推荐），内部直接 `db.prepare(...).run(...)`：
   ```ts
   const advanceStageTx = db.transaction((orderId: number, stageId: number, newStatus: string, stageName: string): void => {
     db.prepare('UPDATE orders SET ...').run(...)
     refreshInstallmentLocks(orderId)   // 同 db 单例，随事务提交/回滚
     logActivity(orderId, ...)
   })
   ```
   事务函数抛错自动回滚并**重新抛出**；正常返回后提交。
4. **回滚测试（关键陷阱）**：
   - 断言基线必须是「操作前基线」而非臆想值：先 `db.prepare(...).get(order.id)` 读 before，断言 `after.current_stage_id).toBe(before.current_stage_id)`。
   - ⚠️ R30d 陷阱：本项目 createOrder 自动接入工作流（current_stage_id = 画师第一个节点）——初始 current_stage_id 是第一个节点 id 而非 null。臆想 null 基线会写出错误断言（本次实际踩坑：断言 null，实测 1）。
5. **vi.mock ESM 包装模式**（模拟事务中间步骤抛错，验证回滚）：
   ```js
   vi.mock('../src/features/order/order.service.js', async (importOriginal) => {
     const mod = await importOriginal()
     return { ...mod, refreshInstallmentLocks: vi.fn(mod.refreshInstallmentLocks) }  // 默认真实实现
   })
   // 测试体：mockImplementationOnce(() => { throw new Error('boom') })；beforeEach: vi.mocked(...).mockRestore() 防跨测试污染
   ```
   - `importOriginal()` + spread 保留其他导出（createOrder / getOrder 等仍走真实实现）。
   - `vi.mocked()` 在 .js 测试文件里只返回原值，可放心用。
   - 断言回滚面：orders 未变 + 事务内各写表（activity_logs / order_notes）无新行。
6. **生产启动 fail-fast 守卫**（ADMIN_QQ 类）：
   - 判定放 initDatabase 自举段开头：环境变量缺失 && 配置空/对应账号不存在 → `throw new Error(带 .env 指引文案)`。
   - 已有配置（重启场景）不抛错；开发环境保持原静默行为（`process.env.NODE_ENV === 'production'` 才生效）。
   - 测试：手动切 `process.env.NODE_ENV = 'production'` + afterEach 恢复（vitest.config.js 固定注入 `NODE_ENV: 'test'`，fail-fast 默认不触发）；cleanDb 不清 platform_config，测前显式 `UPDATE platform_config SET value='' WHERE key='admin_qq'`。
   - 三例覆盖：生产缺配置抛错 / 生产有管理员不抛错 / 开发缺配置不抛错。
7. **⚠️ .js 文件不能写 TS 语法**（本次实际踩坑）：
   - init.js 是纯 JS，写 `as { value: string }` 类型断言 → esbuild 转换报 `Expected ")" but found "as"`，跑测试全部 Failed Suites 才暴露（vitest 加载 init.js 时 vite:define 插件转换失败）。
   - 改 .js 文件用普通 JS：`const row = db.prepare(...).get(); const v = (row && row.value) || ''`。
   - 判断依据：**只有 .ts 后缀可写类型断言**；TS 渐进迁移项目里 init.js / seed.js / scripts/*.ts 混存，动手前看后缀。

## 验证

- 新增测试文件（本批 6 例：事务回滚 3 + fail-fast 3）+ 受影响现有回归文件（order.service.test.js / pricing-phase2.test.js 用到 advanceStage/rollbackStage）。
- 完整套件全绿 + lint/tsc 零错；交付报告含基线对比（891→897 新增 6，无删除）。
