/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
// 门面模块：对外符号与原 db/init.js 完全一致，13 个 import 点零改动
import db from './connection.js'
import { fileURLToPath } from 'url'
import { initDatabase } from './migrate.js'

export { schema, schemaIndexes } from './schema.js'
export { MIGRATIONS } from './migrations/index.js'
export { backupDbBeforeMigration, initDatabase, migrateF5OldModelArtists } from './migrate.js'
export type { Migration } from './migrations/types.js'

// CLI 直接执行时自动建表（import 时不触发副作用）
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initDatabase(db)
  console.log('✅ 数据库初始化完成')
}
