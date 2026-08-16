/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, FkViolation, MasterSqlRow, Migration } from './types.js'

/**
 * v67: 问候系统重构——7 档时段（815 过堂用户拍板终稿 2026-08-16）
 *
 * 旧 6 档（morning/afternoon/evening/night/latenight/any）→ 新 7 档搬家：
 *   morning→morning（上午）｜ afternoon→afternoon（下午）｜ evening→evening（夜晚）
 *   night→midnight（深夜）｜ latenight→midnight（深夜，双档困惑合并）｜ any→any（全天）
 * 新增档：early（清晨 4:00~6:59）、noon（午后 12:00~13:59）——空池，由管理端后续填充。
 * 归属（artist_id 专属/NULL 全局）、启停、特别日关联一律不变。
 *
 * CHECK 无法 ALTER，重建走 SQLite 官方 12 步流程（v64 同款纪律）：
 * 事务外关 FK + 显式列搬运 + foreign_key_check，失败即中止。
 */
export const migration: Migration = {
  version: 67,
  name: 'greeting_slot_rework',
  // ⚠️ 必须事务外执行：重建 greeting_templates（DROP 旧表），
  // PRAGMA foreign_keys 在事务内是 no-op——由迁移自管 FK + 事务
  noTransaction: true,
  up(database) {
    // 幂等守卫：CHECK 已含新档 midnight → 已迁移过，跳过（顺带清失败残留）
    const tableSql = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='greeting_templates'"
    ).get() as MasterSqlRow | undefined
    if (tableSql && tableSql.sql.includes("'midnight'")) {
      database.exec('DROP TABLE IF EXISTS greeting_templates_new')
      return
    }

    backupDbBeforeMigration(67, database)

    const cols = database.prepare('PRAGMA table_info(greeting_templates)').all() as ColumnInfo[]
    database.pragma('foreign_keys = OFF')
    // 事故教训双保险：确认 FK 真的关了（事务内 PRAGMA 是 no-op，此处若仍返回 ON → 直接中止，绝不 DROP）
    const fkState = database.pragma('foreign_keys', { simple: true })
    if (fkState !== 0) {
      throw new Error('迁移 v67: foreign_keys 未能关闭（值=' + String(fkState) + '），中止重建以防数据丢失')
    }
    try {
      // 索引定义必须在 DROP 前抓取（DROP TABLE 会连同索引一起删除）
      const indexes = database.prepare(
        "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='greeting_templates' AND sql IS NOT NULL"
      ).all() as MasterSqlRow[]
      // 显式列搬运（除 time_slot 按搬家规则映射，其余列原样；未知旧值兜底归 any）
      const colList = cols.filter(c => c.name !== 'time_slot').map(c => c.name).join(', ')
      database.transaction(() => {
        database.exec(`
          CREATE TABLE greeting_templates_new (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            artist_id      INTEGER,
            text           TEXT NOT NULL,
            time_slot      TEXT NOT NULL DEFAULT 'any'
                           CHECK(time_slot IN ('early','morning','noon','afternoon','evening','midnight','any')),
            is_enabled     INTEGER NOT NULL DEFAULT 1,
            special_day_id INTEGER,
            created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
            FOREIGN KEY (special_day_id) REFERENCES greeting_special_days(id) ON DELETE CASCADE
          )
        `)
        database.exec(`
          INSERT INTO greeting_templates_new (${colList}, time_slot)
          SELECT ${colList},
            CASE time_slot
              WHEN 'morning'   THEN 'morning'
              WHEN 'afternoon' THEN 'afternoon'
              WHEN 'evening'   THEN 'evening'
              WHEN 'night'     THEN 'midnight'
              WHEN 'latenight' THEN 'midnight'
              ELSE 'any'
            END
          FROM greeting_templates
        `)
        database.exec('DROP TABLE greeting_templates')
        database.exec('ALTER TABLE greeting_templates_new RENAME TO greeting_templates')
        for (const idx of indexes) database.exec(idx.sql)
      })()
      // 官方 12 步流程要求：FK 关闭期间完成重建后，恢复前验证无悬空外键引用
      const fkViolations = database.pragma('foreign_key_check') as FkViolation[]
      if (fkViolations.length > 0) {
        throw new Error('迁移 v67: foreign_key_check 发现 ' + fkViolations.length + ' 处悬空引用，中止: ' + JSON.stringify(fkViolations.slice(0, 3)))
      }
    } finally {
      // 事务失败也必须恢复 FK，否则连接留在 OFF 状态（后续 CASCADE 全部失效）
      database.pragma('foreign_keys = ON')
    }
    console.log('📦 迁移 v67: greeting_templates 重建——7 档时段（night/latenight 合并 midnight，新增 early/noon）')
  }
}
