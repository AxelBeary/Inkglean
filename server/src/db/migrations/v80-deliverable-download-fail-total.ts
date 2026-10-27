/**
 * v80: deliverables 增加 download_fail_total（审计 #21 条目 8）
 *
 * 背景：原实现「半途下载达 3 次 → download_locked=1」把 5 分钟冷却写成了不可达分支
 * （锁定先判），客户网络一抖就永久锁死，只能人工再许可。
 * 拍板（2026-10-27）：每 3 次半途进 5 分钟冷却、冷却后可重试；同时保留一条
 * 彻底锁死线防故意刷——累计失败达 9 次永久锁定，需画师再许可。
 * 本列即累计失败数（跨冷却段不清零，再许可时清零）。
 *
 * 幂等：列已存在则跳过（完整 schema 建表处未含本列，新库同样走本迁移补齐）。
 */
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 80,
  name: 'deliverable_download_fail_total',
  up(database) {
    const cols = database.prepare('PRAGMA table_info(deliverables)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'download_fail_total')) {
      database.exec('ALTER TABLE deliverables ADD COLUMN download_fail_total INTEGER NOT NULL DEFAULT 0')
    }
  }
}
