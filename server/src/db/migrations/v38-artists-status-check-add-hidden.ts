/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, FkViolation, MasterSqlRow, Migration } from './types.js'

export const migration: Migration = {
    version: 38,
    name: 'artists_status_check_add_hidden',
    // ⚠️ 必须事务外执行：PRAGMA foreign_keys 在事务内是 no-op（2026-08-04 事故根因），
    // 重建 artists 表时 DROP 会触发子表 ON DELETE CASCADE——FK 不真正关闭就会清空全部子表数据
    noTransaction: true,
    up(database) {
      // BUG-8 第三项（用户拍板补 admin 设 hidden 能力）：
      // 存量 artists 表 CHECK 约束为 ('open','full','break')——v0.13 加 hidden 状态时
      // 应用层白名单已支持，但存量表 CHECK 焊死在建表语句里（ALTER ADD COLUMN 不更新 CHECK），
      // 导致任何写入 status='hidden' 的操作 500（SQLITE_CONSTRAINT_CHECK）。
      // SQLite 修改 CHECK 只能重建表（官方 12 步 alter 流程，事务外关 FK）。
      const tableSql = database.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='artists'"
      ).get() as MasterSqlRow | undefined
      // 幂等守卫：已含 hidden 则跳过（新库建表即带 hidden，也跳过）；清理上次失败残留的临时表
      if (tableSql && tableSql.sql.includes("'hidden'")) {
        database.exec('DROP TABLE IF EXISTS artists_new')
        return
      }

      backupDbBeforeMigration(38)

      const cols = (database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]).map(c => c.name)
      const colList = cols.join(', ')

      // 用原表 CREATE TABLE 语句重建（只替换 status 的 CHECK 约束）——不手抄列清单，永不漏列
      // 表名可能带引号（ALTER RENAME 后 sqlite_master 存 "artists"），正则两种都匹配
      const srcSql = tableSql!.sql
      const newSql = srcSql
        .replace(/^CREATE TABLE\s+"?artists"?(\s|\()/i, 'CREATE TABLE artists_new$1')
        .replace(/CHECK\s*\(\s*status\s+IN\s*\([^)]*\)\s*\)/i, "CHECK(status IN ('open', 'full', 'break', 'hidden'))")
      if (newSql === srcSql) {
        console.warn('⚠️ 迁移 v38: 未找到 status CHECK 约束，跳过重建')
        return
      }

      database.pragma('foreign_keys = OFF')
      // 事故教训双保险：确认 FK 真的关了（事务内 PRAGMA 是 no-op，此处若仍在事务内会返回 ON → 直接中止，绝不 DROP）
      const fkState = database.pragma('foreign_keys', { simple: true })
      if (fkState !== 0) {
        throw new Error('迁移 v38: foreign_keys 未能关闭（值=' + String(fkState) + '），中止重建以防 CASCADE 清空子表')
      }
      try {
        // 索引定义必须在 DROP 前抓取（DROP TABLE 会连同索引一起删除）；sql IS NULL 的是 UNIQUE 约束自动索引，建表时已包含
        const indexes = database.prepare(
          "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='artists' AND sql IS NOT NULL"
        ).all() as MasterSqlRow[]
        database.transaction(() => {
          database.exec(newSql)
          database.exec(`INSERT INTO artists_new (${colList}) SELECT ${colList} FROM artists`)
          database.exec('DROP TABLE artists')
          database.exec('ALTER TABLE artists_new RENAME TO artists')
          for (const idx of indexes) database.exec(idx.sql)
        })()
        // 官方 12 步流程要求：FK 关闭期间完成重建后，恢复前验证无悬空外键引用
        const fkViolations = database.pragma('foreign_key_check') as FkViolation[]
        if (fkViolations.length > 0) {
          throw new Error('迁移 v38: foreign_key_check 发现 ' + fkViolations.length + ' 处悬空引用，中止: ' + JSON.stringify(fkViolations.slice(0, 3)))
        }
      } finally {
        // 事务失败也必须恢复 FK，否则连接留在 OFF 状态（后续 CASCADE 全部失效）
        database.pragma('foreign_keys = ON')
      }
      console.log('📦 迁移 v38: artists CHECK 约束补 hidden（重建表，' + cols.length + ' 列数据已迁移）')
    }
  }
