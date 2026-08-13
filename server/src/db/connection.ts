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

/** pragma 失败语义：数据库被占用/只读/损坏时给可读提示后退出，不再裸抛原始错误 */
function applyPragma(sql: string): void {
  try {
    db.pragma(sql)
  } catch (err) {
    console.error(`数据库初始化失败（${sql}）——数据库可能被其他进程占用、磁盘只读或文件损坏`, err)
    process.exit(1)
  }
}

// 性能优化
// Docker Desktop Windows 的 bind mount 不支持 WAL 共享内存（-shm），
// 数据会困在 WAL 文件里，容器停止后丢失。检测 Docker 环境自动降级为 DELETE 模式。
const isDocker = process.env.DOCKER || process.env.KUBERNETES_SERVICE_HOST || existsSync('/.dockerenv')
if (isDocker) {
  applyPragma('journal_mode = DELETE')
} else {
  // d3 P2: 显式 wal_autocheckpoint/synchronous=NORMAL（WAL 下 NORMAL 不损持久性，减少 fsync 放大）
  applyPragma('journal_mode = WAL')
  applyPragma('wal_autocheckpoint = 1000')
  applyPragma('synchronous = NORMAL')
}
applyPragma('foreign_keys = ON')
applyPragma('busy_timeout = 5000')

export default db
