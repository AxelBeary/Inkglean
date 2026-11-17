/**
 * v82: 过程稿上传台账（磁盘水位 + 未绑定字节配额 + TTL）
 *
 * 背景：/api/upload/preview 只有「20 次/10 分 + 单文件 10MB」的次数限流，写盘前既无磁盘
 * 水位、也无累计字节上限；而未挂单的过程稿在库里零行（order_previews 只在挂单时插入），
 * 配额无从求和、也没有行可做 TTL。最坏单画师/IP 可堆 ≈28.8GB/天，72h 孤儿回收窗内
 * ≈86GB（入口是登录态，中危）。
 *
 * 处置（照 v77 参考图范式）：
 * - 本表记录每次落盘的 (artist_id, file_path, file_size, ip)，file_size 取落盘真实字节；
 * - 「是否仍挂单」不在本表复写，以 order_previews.file_path 的 EXISTS 为准（单一事实源）；
 * - 未绑定行的 TTL 在 app.ts gcDatabaseTtl（env PREVIEW_UPLOAD_TTL_DAYS，默认 3 天），
 *   删行后文件才失去 DB 引用、由孤儿回收接手。
 *
 * 幂等：全部 IF NOT EXISTS；新库由 schema.ts 直建、老库走本迁移，两路径结构一致。
 */
import type { Migration } from './types.js'

export const migration: Migration = {
  version: 82,
  name: 'preview_uploads_quota_ledger',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS preview_uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        file_size INTEGER NOT NULL,
        ip TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_preview_uploads_artist ON preview_uploads(artist_id);
      CREATE INDEX IF NOT EXISTS idx_preview_uploads_created ON preview_uploads(created_at);
      CREATE INDEX IF NOT EXISTS idx_order_previews_file ON order_previews(file_path);
    `)
  }
}
