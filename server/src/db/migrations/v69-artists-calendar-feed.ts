/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

/**
 * v69: 日历订阅（ICS）——oimimo 吸纳批一
 *
 * artists 增加两列：
 * - calendar_feed_enabled：订阅开关（0=关闭默认，1=开启）
 * - calendar_feed_token：订阅私密令牌（令牌即凭证；公开端点据此放行，可旋转）
 *
 * 对齐 v68 的简单 ALTER 风格：
 * - **必须 noTransaction**：备份的 VACUUM INTO / wal_checkpoint 在事务内均不可用
 * - 幂等：PRAGMA table_info 命中 calendar_feed_enabled 即跳过（两列同批添加）
 */
export const migration: Migration = {
  version: 69,
  name: 'artists_calendar_feed',
  // ⚠️ 事务外执行：backupDbBeforeMigration 依赖 VACUUM INTO（事务内不可用），与 v64/v67/v68 同口径
  noTransaction: true,
  up(database) {
    // B3-F0097（原 B1）：原守卫只认 calendar_feed_enabled 一列。两条 ALTER 写在同一 exec，
    // 崩溃可能只落地第一列（better-sqlite3 exec 多语句顺序执行、非整体原子），重跑时旧守卫
    // 直接 return，导致 calendar_feed_token 永久缺失。改为两列都检查，缺哪列补哪列。
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    const hasEnabled = cols.some(c => c.name === 'calendar_feed_enabled')
    const hasToken = cols.some(c => c.name === 'calendar_feed_token')
    if (hasEnabled && hasToken) return // 两列齐全 = 已完整迁移，直接跳过

    backupDbBeforeMigration(69, database)

    if (!hasEnabled) {
      database.exec('ALTER TABLE artists ADD COLUMN calendar_feed_enabled INTEGER NOT NULL DEFAULT 0')
    }
    if (!hasToken) {
      database.exec('ALTER TABLE artists ADD COLUMN calendar_feed_token TEXT DEFAULT NULL')
    }
    console.log('📦 迁移 v69: artists.calendar_feed_enabled / calendar_feed_token 已添加（默认关闭）')
  }
}
