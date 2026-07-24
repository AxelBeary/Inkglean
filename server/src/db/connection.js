import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || './data/commission.db'

// 确保数据目录存在
mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)

// 性能优化
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export default db
