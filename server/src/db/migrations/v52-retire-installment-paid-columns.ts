import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 52,
    name: 'retire_installment_paid_columns',
    up(database) {
      // 批4B 用户拍板（方案 B = base schema 严格删列 + v24 探测守卫）：
      // 「如果我们现在有更好的解决方案，且确认无bug、更优，则老数据库允许丢弃。最终目的一定是最优解，
      // 最直觉，最符合设计，且最低屎山和技术债。现在没有真数据随时可以删数据库内容」
      // —— 历史迁移不可动的保护对象（存量库升级路径）已不存在；paid_cents/status/paid_at/requested_at
      // 属应消灭的僵尸列，节点已收一律由 orders.paid_total_cents 顺序推导（R7），本迁移在存量库上收尾删列。
      backupDbBeforeMigration(52)
      // 1) 清零冻结（防 DROP 前残留脏值；新形态库列不存在则跳过，空表无存量）
      const cols = (database.prepare('PRAGMA table_info(order_payment_installments)').all() as ColumnInfo[]).map(c => c.name)
      if (cols.includes('paid_cents') && cols.includes('status') && cols.includes('paid_at')) {
        database.exec(`
          UPDATE order_payment_installments
          SET paid_cents = 0, status = 'pending', paid_at = NULL
          WHERE paid_cents <> 0 OR status <> 'pending' OR paid_at IS NOT NULL
        `)
      }
      // 2) 列删除（幂等：每次 DROP 前重新 PRAGMA 探测，列不存在即跳过）
      for (const col of ['paid_cents', 'status', 'paid_at', 'requested_at']) {
        const curCols = (database.prepare('PRAGMA table_info(order_payment_installments)').all() as ColumnInfo[]).map(c => c.name)
        if (curCols.includes(col)) database.exec(`ALTER TABLE order_payment_installments DROP COLUMN ${col}`)
      }
    }
  }
