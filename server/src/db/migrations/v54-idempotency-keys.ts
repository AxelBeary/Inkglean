import type { Migration } from './types.js'

export const migration: Migration = {
    version: 54,
    name: 'idempotency_keys',
    up(database) {
      // D-2（R-9）: 下单/收款幂等键——UNIQUE order_no 只兜单号不兜业务重复，
      // 双标签页/慢渲染双击可产生两笔收款/两个订单；scope+key 复合主键兜业务幂等。
      // 幂等：IF NOT EXISTS（新库基线 schema 已含，存量库重复执行直接跳过）
      database.exec(`
        CREATE TABLE IF NOT EXISTS idempotency_keys (
          scope TEXT NOT NULL,
          key TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (scope, key)
        )
      `)
    }
  }
