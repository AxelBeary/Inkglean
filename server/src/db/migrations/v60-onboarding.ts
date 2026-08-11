import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 60,
  name: 'req043_onboarding',
  up(database) {
    // REQ-043 I2: 开张任务卡后端标记——「不再提示」/「自然达成」都落库，
    // 前端不靠 localStorage（换设备/清缓存后依然保持隐藏，用户拍板）
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'onboarded_at')) {
      database.exec('ALTER TABLE artists ADD COLUMN onboarded_at TEXT NULL')
    }
    if (!cols.some(c => c.name === 'onboarding_dismissed_at')) {
      database.exec('ALTER TABLE artists ADD COLUMN onboarding_dismissed_at TEXT NULL')
    }
  }
}
