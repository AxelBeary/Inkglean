import type { CountRow, MasterSqlRow, Migration } from './types.js'

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
    // 817 问候重构：深夜档种子按现存表 CHECK 形态动态选档——
    //   新装库：基线 schema 已是 v67 形态（含 midnight），直接种 midnight；
    //   v1 基线升级路径：本迁移先建旧形表（只认 night），种 night，由 v67 搬家到 midnight。
    const count = (database.prepare('SELECT COUNT(*) AS c FROM greeting_templates').get() as CountRow).c
    if (count === 0) {
      const tableSql = database.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='greeting_templates'"
      ).get() as MasterSqlRow | undefined
      const nightSlot = tableSql && tableSql.sql.includes("'midnight'") ? 'midnight' : 'night'
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
