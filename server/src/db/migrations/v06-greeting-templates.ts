import type { CountRow, Migration } from './types.js'

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
    const count = (database.prepare('SELECT COUNT(*) AS c FROM greeting_templates').get() as CountRow).c
    if (count === 0) {
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
        ['夜深了，{name}，早点休息', 'night'],
        ['{name}，熬夜伤身，画可以明天再画', 'night'],
      ]
      for (const [text, slot] of seeds) insert.run(text, slot)
    }
  }
}
