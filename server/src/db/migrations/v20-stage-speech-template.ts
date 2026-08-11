import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 20,
    name: 'stage_speech_template',
    up(database) {
      // plan-node-speech: 节点话术模板
      backupDbBeforeMigration(20)
      const cols = database.prepare('PRAGMA table_info(artist_workflow_stages)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'speech_template')) {
        database.exec("ALTER TABLE artist_workflow_stages ADD COLUMN speech_template TEXT DEFAULT '{客户名}，你的订单已{节点名}。'")
      }
      // 存量回填（ALTER TABLE ADD COLUMN DEFAULT 存量行读出为默认值，但实际存储 NULL；显式回填确保一致）
      database.exec("UPDATE artist_workflow_stages SET speech_template = '{客户名}，你的订单已{节点名}。' WHERE speech_template IS NULL")
    }
  }
