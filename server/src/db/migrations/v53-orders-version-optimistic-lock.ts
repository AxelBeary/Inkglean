import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 53,
    name: 'orders_version_optimistic_lock',
    up(database) {
      // D-1（R-5/P3-1）: 订单 version 乐观锁——双标签页/撤销重放防静默覆盖。
      // F5 语义补充：所有 orders 写路径（含队列/优先级/金额/焦点图直写）一律
      // version = version + 1，未传 expectedVersion 的兼容路径读当前版本后同样递增。
      // 幂等：新库基线 schema 已含该列（init.js 顶部 orders 表），存量库由本迁移补列
      const cols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'version')) {
        database.exec('ALTER TABLE orders ADD COLUMN version INTEGER NOT NULL DEFAULT 1')
      }
    }
  }
