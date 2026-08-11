import type { CountRow, DefaultWorkflowTemplateRow, IdRow, Migration } from './types.js'

export const migration: Migration = {
  version: 5,
  name: 'workflow_stages_and_default_template',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS artist_workflow_stages (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id     INTEGER NOT NULL,
        name          TEXT    NOT NULL,
        description   TEXT,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        takes_payment INTEGER NOT NULL DEFAULT 0,
        basis_points  INTEGER,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `)
    database.exec('CREATE INDEX IF NOT EXISTS idx_ws_artist ON artist_workflow_stages(artist_id, sort_order)')
    database.exec(`
      CREATE TABLE IF NOT EXISTS default_workflow_template (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL,
        description   TEXT,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        takes_payment INTEGER NOT NULL DEFAULT 0,
        basis_points  INTEGER
      )
    `)
    database.exec(`
      CREATE TABLE IF NOT EXISTS order_payment_installments (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id      INTEGER NOT NULL,
        label         TEXT    NOT NULL,
        basis_points  INTEGER NOT NULL,
        amount_cents  INTEGER,
        status        TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue')),
        sort_order    INTEGER NOT NULL DEFAULT 0,
        requested_at  DATETIME,
        paid_at       DATETIME,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )
    `)
    // 种子：默认模板（幂等）
    const tplCount = (database.prepare('SELECT COUNT(*) AS c FROM default_workflow_template').get() as CountRow).c
    if (tplCount === 0) {
      const insert = database.prepare(
        'INSERT INTO default_workflow_template (name, description, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?)'
      )
      const seeds: [string, string | null, number, number, number | null][] = [
        ['定稿', '双方确认稿件需求与规格', 1, 0, null],
        ['排期确认', '确认排期，收取定金', 2, 1, 3000],
        ['草稿确认', null, 3, 0, null],
        ['线稿确认', null, 4, 0, null],
        ['上色确认', null, 5, 0, null],
        ['完稿确认', null, 6, 0, null],
        ['交付', '交付成品，收取尾款', 7, 1, 7000],
      ]
      for (const [name, desc, order, pay, bp] of seeds) insert.run(name, desc, order, pay, bp)
    }
    // 存量画师补种子（幂等）
    // 注意：v5 在 v7(deleted_at) 之前执行，不能引用 deleted_at 列
    const artists = database.prepare('SELECT id FROM artists').all() as IdRow[]
    for (const a of artists) {
      const count = (database.prepare(
        'SELECT COUNT(*) AS c FROM artist_workflow_stages WHERE artist_id = ?'
      ).get(a.id) as CountRow).c
      if (count === 0) {
        const tpl = database.prepare('SELECT * FROM default_workflow_template ORDER BY sort_order ASC').all() as DefaultWorkflowTemplateRow[]
        const ins = database.prepare(
          'INSERT INTO artist_workflow_stages (artist_id, name, description, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?, ?)'
        )
        for (const t of tpl) ins.run(a.id, t.name, t.description, t.sort_order, t.takes_payment, t.basis_points)
      }
    }
  }
}
