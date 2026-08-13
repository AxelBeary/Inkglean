import { createHash, randomBytes } from 'crypto'
import type { ColumnInfo, Migration } from './types.js'

/**
 * v63: 围剿 F1——客户访问令牌化（根治 QQ+订单号弱双因子）
 *
 * - orders 新增 customer_token_hash TEXT：只存 sha256 hex，不存明文令牌。
 * - 订单号保留 CODE-xxx 人类友好（不改生成规则），安全由 144bit 高熵令牌承担
 *   （用户拍板：最安全 + 客户最方便）。
 * - 存量行回填：逐行生成随机令牌写哈希。旧令牌无人持有 = 旧链接全部失效，
 *   符合「不做存量兼容」的产品决策；回填仅为非空一致性。
 */
export const migration: Migration = {
  version: 63,
  name: 'orders_customer_token',
  up(database) {
    const cols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'customer_token_hash')) {
      database.exec('ALTER TABLE orders ADD COLUMN customer_token_hash TEXT')
    }

    // 存量回填：逐行随机令牌 → sha256 hex（旧令牌无人持有，旧链接失效属预期）
    const rows = database.prepare(
      'SELECT id FROM orders WHERE customer_token_hash IS NULL'
    ).all() as Array<{ id: number }>
    const update = database.prepare(
      'UPDATE orders SET customer_token_hash = ? WHERE id = ?'
    )
    for (const row of rows) {
      const token = randomBytes(18).toString('base64url')
      const hash = createHash('sha256').update(token).digest('hex')
      update.run(hash, row.id)
    }
  }
}
