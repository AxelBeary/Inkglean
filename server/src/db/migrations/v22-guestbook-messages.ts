import { backupDbBeforeMigration } from '../migrate.js'
import type { Migration } from './types.js'

export const migration: Migration = {
    version: 22,
    name: 'guestbook_messages',
    up(database) {
      // F4: 留言板
      backupDbBeforeMigration(22, database)
      database.exec(`
        CREATE TABLE IF NOT EXISTS guestbook_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL,
          nickname TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
          artist_reply TEXT DEFAULT NULL,
          replied_at DATETIME DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          deleted_by_admin INTEGER DEFAULT 0,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_guestbook_artist ON guestbook_messages(artist_id, status)')
    }
  }
