import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'

const DB_PATH = process.env.DB_PATH || './data/commission.db'

// 确保数据目录存在（:memory: 模式跳过）
if (DB_PATH !== ':memory:') {
  const dir = dirname(DB_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

const db = new Database(DB_PATH)

// 性能优化
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export default db
