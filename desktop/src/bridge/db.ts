// 本地数据层桥（本地核心环波1）：SQLite 单例连接 + 首启建表。
// 纪律：「仅存本机」数据的唯一持久化通道（F8 计时数据可导出范围同款口径，永不上传）；
// 逃生门同既有桥：纯浏览器环境抛 BridgeUnavailableError。
import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './env'
import { BridgeUnavailableError } from './errors'

/** @tauri-apps/plugin-sql 的 Database 类型（动态 import，避免纯浏览器环境解析失败） */
export type LocalDatabase = Awaited<ReturnType<typeof loadDatabase>>

async function loadDatabase(path: string) {
  const { default: Database } = await import('@tauri-apps/plugin-sql')
  return Database.load(`sqlite:${path}`)
}

/** 建表（幂等）：local_orders ＝ F2 本地委托记账（REQ-014 §F2 字段口径） */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS local_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`

let dbPromise: Promise<LocalDatabase> | null = null

/** 打开（单例）本地 SQLite；首启自动建表。失败即重置单例，下次调用重试 */
export function openLocalDb(): Promise<LocalDatabase> {
  if (!isDesktop()) return Promise.reject(new BridgeUnavailableError('openLocalDb'))
  if (!dbPromise) {
    dbPromise = (async () => {
      const path = await invoke<string>('desktop_local_db_path')
      const db = await loadDatabase(path)
      await db.execute(SCHEMA)
      return db
    })().catch((e) => {
      dbPromise = null // 失败不缓存，允许重试（首启目录竞态等自愈）
      throw e
    })
  }
  return dbPromise
}
