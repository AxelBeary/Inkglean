/**
 * v65: 取消撤销窗口表（815 拍板 #1，用户亲裁 2026-08-15）
 * 取消订单后 5 秒内可撤销：窗口存后端数据库（刷新不丢）；
 * 窗口内队列重排/递补延迟执行（窗口过后才动）；只保留最近一次可撤销（新取消作废旧窗口）；
 * 撤销与过期处理留痕（consumed 语义：0=有效 1=已撤销 2=已过期结算）。
 */
import type { Migration } from './types.js'

export const migration: Migration = {
  version: 65,
  name: 'cancel_undo_windows',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS cancel_undo_windows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        artist_id INTEGER NOT NULL,
        prev_status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at INTEGER NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `)
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_cancel_undo_windows_artist
        ON cancel_undo_windows (artist_id, consumed)
    `)
  }
}
