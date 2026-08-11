import type { Migration } from './types.js'

export const migration: Migration = {
    version: 55,
    name: 'reference_uploads_ownership',
    up(database) {
      // F-10（P2-13 后端侧）: 参考图归属凭据——上传按匿名凭证登记，下单校验并绑定。
      // 幂等：IF NOT EXISTS（新库基线 schema 已含，存量库重复执行直接跳过）
      database.exec(`
        CREATE TABLE IF NOT EXISTS reference_uploads (
          id INTEGER PRIMARY KEY,
          anon_id INTEGER NOT NULL,
          file_path TEXT NOT NULL UNIQUE,
          order_id INTEGER,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
    }
  }
