import type { ColumnInfo, CountRow, Migration } from './types.js'

export const migration: Migration = {
  version: 6,
  name: 'greeting_templates',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS greeting_templates (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id  INTEGER,
        text       TEXT NOT NULL,
        time_slot  TEXT NOT NULL DEFAULT 'any'
                   CHECK(time_slot IN ('morning','afternoon','evening','night','any')),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `)
    database.exec('CREATE INDEX IF NOT EXISTS idx_greeting_artist ON greeting_templates(artist_id, time_slot)')
    // 种子：通用库（artist_id = NULL）
    // B3-F0073：原守卫用全局 COUNT——任一画师专属模板存在即跳过全部通用种子；
    // 且用 sqlite_master.sql 文本匹配 'midnight' 选时段（DDL 字面量脆弱）。改为：
    //   - 幂等判据按 artist_id IS NULL 的通用模板计数，不受画师专属模板干扰；
    //   - 时段按「列存在性」判定新装/升级路径（新装基线含 special_day_id → midnight，
    //     v1 基线升级路径本迁移刚建旧形表无该列 → night，由 v67 搬家），不碰 DDL 文本。
    const globalCount = (database.prepare('SELECT COUNT(*) AS c FROM greeting_templates WHERE artist_id IS NULL').get() as CountRow).c
    if (globalCount === 0) {
      const cols = database.prepare('PRAGMA table_info(greeting_templates)').all() as ColumnInfo[]
      const nightSlot = cols.some(c => c.name === 'special_day_id') ? 'midnight' : 'night'
      const insert = database.prepare(
        'INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (NULL, ?, ?)'
      )
      const seeds: [string, string][] = [
        ['早上好，{name}，新的一天从一张好画开始', 'morning'],
        ['早呀{name}，今天的灵感准备好了吗', 'morning'],
        ['午安，{name}，别忘了吃午饭', 'afternoon'],
        ['记得多喝水，{name}', 'afternoon'],
        ['{name}，画画别忘了活动手腕', 'any'],
        ['晚上好，{name}，今天辛苦了', 'evening'],
        ['夜深了，{name}，早点休息', nightSlot],
        ['{name}，熬夜伤身，画可以明天再画', nightSlot],
      ]
      for (const [text, slot] of seeds) insert.run(text, slot)
    }
  }
}
