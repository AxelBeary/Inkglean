/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, FkViolation, MasterSqlRow, Migration } from './types.js'

/**
 * v64: E 清单波 4——问候系统池扩展（深夜池 + 可配置特别日池）
 *
 * 1. 新表 greeting_special_days：可配置特别日（date_key 形如 'MM-DD' 年重复；
 *    artist_id NULL=全平台、否则该画师专属；is_enabled 启停）。
 *    画师被删除时其专属特别日 CASCADE 清理。
 * 2. greeting_templates 重建（CHECK 无法 ALTER）：
 *    - time_slot CHECK 补 'latenight'（深夜池，23:00~次日 04:59，服务层判定）
 *    - 新增可空列 special_day_id 关联特别日文案，ON DELETE CASCADE（删除特别日级联删除文案）。
 *    普通时段池查询在服务层以 special_day_id IS NULL 排除特别日文案。
 *
 * 重建表走 SQLite 官方 12 步流程（v38 事故同款纪律）：事务外关 FK + 回读校验 +
 * foreign_key_check，失败即中止，绝不带着半开 FK 进入 DROP。
 */
export const migration: Migration = {
  version: 64,
  name: 'greeting_special_days',
  // ⚠️ 必须事务外执行：重建 greeting_templates（DROP 旧表），
  // PRAGMA foreign_keys 在事务内是 no-op——由迁移自管 FK + 事务
  noTransaction: true,
  up(database) {
    // 1) 特别日表（新表，CREATE IF NOT EXISTS 天然幂等）
    // date_key 粗粒度 GLOB 守卫（严格 MM-DD 语义范围校验在服务层 isValidDateKey）
    database.exec(`
      CREATE TABLE IF NOT EXISTS greeting_special_days (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        date_key   TEXT NOT NULL CHECK(date_key GLOB '[0-1][0-9]-[0-3][0-9]'),
        artist_id  INTEGER,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `)
    database.exec('CREATE INDEX IF NOT EXISTS idx_greeting_special_days_date ON greeting_special_days(date_key)')
    database.exec('CREATE INDEX IF NOT EXISTS idx_greeting_special_days_artist ON greeting_special_days(artist_id)')

    // 2) 幂等守卫：templates 已带 special_day_id 且 CHECK 已含 latenight → 跳过重建
    //（同时清理上次失败残留的临时表）
    const cols = database.prepare('PRAGMA table_info(greeting_templates)').all() as ColumnInfo[]
    const tableSql = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='greeting_templates'"
    ).get() as MasterSqlRow | undefined
    if (cols.some(c => c.name === 'special_day_id') && tableSql && (tableSql.sql.includes("'latenight'") || tableSql.sql.includes("'midnight'"))) {
      // 817 注：midnight 分支为 v67 重构后基线形态（新装库直接落终态），同样跳过
      database.exec('DROP TABLE IF EXISTS greeting_templates_new')
      return
    }

    backupDbBeforeMigration(64, database)

    database.pragma('foreign_keys = OFF')
    // 事故教训双保险：确认 FK 真的关了（事务内 PRAGMA 是 no-op，此处若仍返回 ON → 直接中止，绝不 DROP）
    const fkState = database.pragma('foreign_keys', { simple: true })
    if (fkState !== 0) {
      throw new Error('迁移 v64: foreign_keys 未能关闭（值=' + String(fkState) + '），中止重建以防数据丢失')
    }
    try {
      // 索引定义必须在 DROP 前抓取（DROP TABLE 会连同索引一起删除）
      const indexes = database.prepare(
        "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='greeting_templates' AND sql IS NOT NULL"
      ).all() as MasterSqlRow[]
      // 显式列搬运（旧表无 special_day_id，新列默认 NULL）
      const colList = cols.map(c => c.name).join(', ')
      database.transaction(() => {
        database.exec(`
          CREATE TABLE greeting_templates_new (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            artist_id      INTEGER,
            text           TEXT NOT NULL,
            time_slot      TEXT NOT NULL DEFAULT 'any'
                           CHECK(time_slot IN ('morning','afternoon','evening','night','latenight','any')),
            is_enabled     INTEGER NOT NULL DEFAULT 1,
            special_day_id INTEGER,
            created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
            FOREIGN KEY (special_day_id) REFERENCES greeting_special_days(id) ON DELETE CASCADE
          )
        `)
        database.exec(`INSERT INTO greeting_templates_new (${colList}) SELECT ${colList} FROM greeting_templates`)
        database.exec('DROP TABLE greeting_templates')
        database.exec('ALTER TABLE greeting_templates_new RENAME TO greeting_templates')
        for (const idx of indexes) database.exec(idx.sql)
        database.exec('CREATE INDEX IF NOT EXISTS idx_greeting_templates_special_day ON greeting_templates(special_day_id)')
      })()
      // 官方 12 步流程要求：FK 关闭期间完成重建后，恢复前验证无悬空外键引用
      const fkViolations = database.pragma('foreign_key_check') as FkViolation[]
      if (fkViolations.length > 0) {
        throw new Error('迁移 v64: foreign_key_check 发现 ' + fkViolations.length + ' 处悬空引用，中止: ' + JSON.stringify(fkViolations.slice(0, 3)))
      }
    } finally {
      // 事务失败也必须恢复 FK，否则连接留在 OFF 状态（后续 CASCADE 全部失效）
      database.pragma('foreign_keys = ON')
    }
    console.log('📦 迁移 v64: greeting_templates 重建（time_slot 补 latenight + special_day_id），greeting_special_days 已建')
  }
}
