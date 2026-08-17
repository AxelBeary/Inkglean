/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

/**
 * v68: 留言功能画师手动开关（820-L 需求一）
 *
 * artists 增加 guestbook_enabled：
 * - 1=开启（默认）：客户主页显示留言板块，可提交留言
 * - 0=关闭：客户主页隐藏整个留言板块、留言读写接口返回隐藏/空；
 *   画师后台隐藏「留言审核」导航与仪表盘留言模块（历史留言不删，重新打开即恢复）
 *
 * 对齐 v66 的简单 ALTER 风格；备份与幂等守卫对齐 v67：
 * - 备份：迁移前 backupDbBeforeMigration(68)（失败即中止，防无法回滚）
 * - 幂等：PRAGMA table_info 命中 guestbook_enabled 即跳过（重复执行不报错）
 */
export const migration: Migration = {
  version: 68,
  name: 'artists_guestbook_enabled',
  up(database) {
    // 幂等守卫：列已存在 = 已迁移过（含失败残留），直接跳过
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (cols.some(c => c.name === 'guestbook_enabled')) {
      return
    }

    backupDbBeforeMigration(68, database)

    database.exec(`
      ALTER TABLE artists ADD COLUMN guestbook_enabled INTEGER NOT NULL DEFAULT 1
    `)
    console.log('📦 迁移 v68: artists.guestbook_enabled 已添加（默认 1=开启）')
  }
}
