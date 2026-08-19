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
    // 幂等守卫：列已存在 = 已迁移过（含失败残留），直接跳过
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (cols.some(c => c.name === 'calendar_feed_enabled')) {
      return
    }

    backupDbBeforeMigration(69, database)

    database.exec(`
      ALTER TABLE artists ADD COLUMN calendar_feed_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE artists ADD COLUMN calendar_feed_token TEXT DEFAULT NULL
    `)
    console.log('📦 迁移 v69: artists.calendar_feed_enabled / calendar_feed_token 已添加（默认关闭）')
  }
}
