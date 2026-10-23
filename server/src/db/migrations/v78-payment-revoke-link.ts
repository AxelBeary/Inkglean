/**
 * v78: order_payments 增加 revoke_of_payment_id（审计 #21 条目 4）
 *
 * 背景：撤销/退款只写一条独立负数流水，不关联被撤的那笔正数收款，服务端仅校验
 * 「订单总额不为负」。于是同一笔 1000 可以连撤两次（第二次刷新后按钮仍在），
 * 退款归属错乱、流水无法对账。
 * 修法：负数撤销流水记下被撤行 id，服务层按「单笔已撤合计 ≤ 该笔金额」设限。
 *
 * 幂等：PRAGMA 守卫对齐 v72/v74/v77（列已存在则跳过；完整 schema 建表处已含本列，
 * 新库走 CREATE 即有、存量库走本迁移补齐）。
 * 回滚思路：单列纯追加无数据搬迁，回滚 = 重建表剔除该列（与 v74 同级别）。
 * 存量负数行保持 NULL：历史上未关联的退款不追溯定性（它们本就无法回填目标行），
 * 读侧按「未关联撤销」处理，不计入某笔正数收款的已撤额度。
 */
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 78,
  name: 'payment_revoke_link',
  up(database) {
    const cols = database.prepare('PRAGMA table_info(order_payments)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'revoke_of_payment_id')) {
      database.exec('ALTER TABLE order_payments ADD COLUMN revoke_of_payment_id INTEGER')
    }
  }
}
