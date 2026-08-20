/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

/**
 * v70: 仪表盘自定义偏好（「自定义我的首页」批一骨架）
 *
 * artists 增加一列：
 * - dashboard_prefs：布局偏好 JSON（schema v1；排序/显隐/宽度档位/行数/款式/页宽）
 *
 * 与旧 dashboard_modules（视觉批 P2 四开关）的关系=吞并：
 * - 读路径：prefs 为空时服务层把旧开关 false→hidden 合并为默认偏好；
 * - 写路径：首次保存 prefs 成功后旧列置 NULL，单一事实源（旧信息已含在 hidden 里）。
 *
 * 对齐 v68/v69 的简单 ALTER 风格：
 * - **必须 noTransaction**：备份的 VACUUM INTO / wal_checkpoint 在事务内均不可用
 * - 幂等：PRAGMA table_info 命中 dashboard_prefs 即跳过
 */
export const migration: Migration = {
  version: 70,
  name: 'artists_dashboard_prefs',
  // ⚠️ 事务外执行：backupDbBeforeMigration 依赖 VACUUM INTO（事务内不可用），与 v64/v67/v68/v69 同口径
  noTransaction: true,
  up(database) {
    // 幂等守卫：列已存在 = 已迁移过（含失败残留），直接跳过
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (cols.some(c => c.name === 'dashboard_prefs')) {
      return
    }

    backupDbBeforeMigration(70, database)

    database.exec(`
      ALTER TABLE artists ADD COLUMN dashboard_prefs TEXT DEFAULT NULL
    `)
    console.log('📦 迁移 v70: artists.dashboard_prefs 已添加（NULL=默认布局）')
  }
}
