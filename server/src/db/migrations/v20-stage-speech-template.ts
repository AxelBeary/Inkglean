import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 20,
    name: 'stage_speech_template',
    up(database) {
      // plan-node-speech: 节点话术模板
      backupDbBeforeMigration(20, database)
      const cols = database.prepare('PRAGMA table_info(artist_workflow_stages)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'speech_template')) {
        database.exec("ALTER TABLE artist_workflow_stages ADD COLUMN speech_template TEXT DEFAULT '{客户名}，你的订单已{节点名}。'")
      }
      // B3-F0076：删除原「存量回填」UPDATE 与错误注释。SQLite 的 ALTER TABLE ADD COLUMN ... DEFAULT
      // 对存量行读出即为默认值（NOT NULL 约束下也无 NULL 行），原 `WHERE speech_template IS NULL`
      // 实际命中 0 行，是死代码；旧注释称「实际存储 NULL」与 SQLite 语义不符，一并删除。
      // 保留列定义上的 DEFAULT，新行/存量行口径一致，无需 UPDATE 归一化。
    }
  }
