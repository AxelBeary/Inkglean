import 'dotenv/config'
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
// Docker Desktop Windows 的 bind mount 不支持 WAL 共享内存（-shm），
// 数据会困在 WAL 文件里，容器停止后丢失。检测 Docker 环境自动降级为 DELETE 模式。
const isDocker = process.env.DOCKER || process.env.KUBERNETES_SERVICE_HOST || existsSync('/.dockerenv')
db.pragma(isDocker ? 'journal_mode = DELETE' : 'journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

export default db
