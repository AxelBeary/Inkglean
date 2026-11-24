import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 24,
    name: 'quota_pool_paid_total',
    up(database) {
      // B7: 额度池 — orders.paid_total_cents + order_payments 表 + 存量换算
      backupDbBeforeMigration(24, database)
      // 1. orders 加 paid_total_cents
      const cols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'paid_total_cents')) {
        database.exec('ALTER TABLE orders ADD COLUMN paid_total_cents INTEGER DEFAULT 0')
      }
      // 2. 收款流水表——必须先于存量换算建立：下面的 NOT EXISTS 哨兵要读它区分
      // 「从未回填的基线订单」与「v24 之后已被流水接管的订单」（含全额退款冲正归零者）。
      database.exec(`
        CREATE TABLE IF NOT EXISTS order_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          amount_cents INTEGER NOT NULL,
          note TEXT DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT DEFAULT 'artist',
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id)')
      // 3. 存量换算：已付分期 SUM → paid_total_cents
      // 守卫（批4B）：新形态库已退役 status 节点列（v52），空表无存量，换算自然不适用；
      // 仅旧形态库（含 status 列）照常执行。探测风格与第 1 步一致：PRAGMA table_info
      const instCols = database.prepare('PRAGMA table_info(order_payment_installments)').all() as ColumnInfo[]
      if (instCols.some(c => c.name === 'status')) {
        // F0077（B2 high）+ SVR-01：旧实现裸 UPDATE 无条件覆盖全部订单已收金额——修复重放
        // （版本表丢失）会把 v24 之后由 addPayment 流水维护的 paid_total_cents（order-pricing.ts
        // 原子自增）冲回旧分期和。WHERE 三重条件：
        // ① COALESCE(paid_total_cents,0)=0 只覆盖从未写过的基线值（ALTER 新增列的存量行）；
        // ② EXISTS 只锁定确有已付分期的目标行（不再扫全体订单）；
        // ③ NOT EXISTS(order_payments) 哨兵排除已被流水接管过的订单——这是归零订单的关键：
        //    全额退款冲正后 paid_total_cents 归零（命中 ①），但 order_payments 已有收/退款行，
        //    靠 ③ 拦下重放，避免旧分期金额凭空「复活」。首跑时流水表空，③ 恒真，回填照常。
        database.exec(`
          UPDATE orders SET paid_total_cents = (
            SELECT COALESCE(SUM(amount_cents), 0)
            FROM order_payment_installments
            WHERE order_id = orders.id AND status = 'paid'
          )
          WHERE COALESCE(paid_total_cents, 0) = 0
            AND EXISTS (
              SELECT 1 FROM order_payment_installments
              WHERE order_id = orders.id AND status = 'paid'
            )
            AND NOT EXISTS (
              SELECT 1 FROM order_payments
              WHERE order_id = orders.id
            )
        `)
      }
    }
  }
