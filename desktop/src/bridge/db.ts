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

/** 建表（幂等）：local_orders ＝ F2 本地委托记账 / local_files ＝ F1 文件关联（只记路径不搬迁）
 *  / local_profile ＝ F6 画师本地档案（单行，id 恒 1）
 *  / local_templates ＝ F1a 工程文件模板绑定（title='' 为全局默认）
 *  / local_img_cache ＝ F5 图缓存登记（url → 本地文件，首拉后免流量）
 *  / local_time_log ＝ F8 自动识别按日累计（在画/离开/其他，仅存本机永不上传）
 *  / local_order_time ＝ F8 归属匹配（波11）：窗口标题↔委托，工时归单累计 */
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS local_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    deadline TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS local_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    added_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS local_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nickname TEXT NOT NULL DEFAULT '',
    avatar_b64 TEXT NOT NULL DEFAULT '',
    intro TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS local_templates (
    title TEXT PRIMARY KEY,
    template_path TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS local_img_cache (
    url TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS local_time_log (
    date TEXT PRIMARY KEY,
    paint_secs INTEGER NOT NULL DEFAULT 0,
    idle_secs INTEGER NOT NULL DEFAULT 0,
    other_secs INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS local_order_time (
    order_id INTEGER PRIMARY KEY,
    total_secs INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT ''
  );`
]

let dbPromise: Promise<LocalDatabase> | null = null

/** 本地数据库绝对路径（波9 导出用；与 openLocalDb 内部同源命令） */
export async function localDbPath(): Promise<string> {
  if (!isDesktop()) throw new BridgeUnavailableError('localDbPath')
  return await invoke<string>('desktop_local_db_path')
}

/** 关闭本地库连接并重置单例（波10 导入替换前必调：防开着旧连接覆写文件）。
 *  纯浏览器/未打开过：静默无事。 */
export async function closeLocalDb(): Promise<void> {
  if (!isDesktop()) return
  const pending = dbPromise
  dbPromise = null
  if (!pending) return
  try {
    const db = await pending
    await db.close()
  } catch {
    // 关闭失败不阻塞导入（下次 open 重建连接）
  }
}

/** 打开（单例）本地 SQLite；首启自动建表。失败即重置单例，下次调用重试 */
export function openLocalDb(): Promise<LocalDatabase> {
  if (!isDesktop()) return Promise.reject(new BridgeUnavailableError('openLocalDb'))
  if (!dbPromise) {
    dbPromise = (async () => {
      const path = await invoke<string>('desktop_local_db_path')
      const db = await loadDatabase(path)
      for (const stmt of SCHEMA_STATEMENTS) await db.execute(stmt)
      return db
    })().catch((e) => {
      dbPromise = null // 失败不缓存，允许重试（首启目录竞态等自愈）
      throw e
    })
  }
  return dbPromise
}

// ─── 波2 DSK-09：导入整库覆写时的跨窗口连接收口 ───
// 根因：撕悬浮三件是独立 webview，各持自己的 SQLite 连接；主窗 closeLocalDb 只关自己，
// 覆写 local.db 时悬浮窗连接仍持文件句柄（Windows 上可致覆写失败），且 WAL 边车 -wal/-shm
// 若残留会被下次开库套到新库上致脏库。修法＝覆写前跨窗广播关连接 + 显式清边车。
// ⚠️ 是否真造成脏库/文件锁需 WebView2 真机验证（见 ledger 未尽事项）。

/** 跨窗口广播事件名：通知所有 webview（主窗 + 撕悬浮独立窗）关闭各自本地库连接 */
export const DB_CLOSE_ALL_EVENT = 'desktop-db-close-all'

/** 广播后等待其他窗口处理关连接的缓冲毫秒（best-effort，无逐窗 ack 回执） */
const DB_CLOSE_BROADCAST_WAIT_MS = 400

/** 跨窗口广播「关闭所有本地库连接」：导入覆写前调用，让悬浮窗等独立 webview 释放文件句柄。
 *  best-effort：emit 后等固定缓冲再返回（无逐窗 ack，真机验证点）；纯浏览器环境静默无事。 */
export async function broadcastCloseAllDb(): Promise<void> {
  if (!isDesktop()) return
  try {
    const { emit } = await import('@tauri-apps/api/event')
    await emit(DB_CLOSE_ALL_EVENT)
  } catch {
    // 无事件能力（理论不该发生）：不阻塞导入，靠调用方自身 closeLocalDb + 边车清理兜底
  }
  await new Promise((resolve) => setTimeout(resolve, DB_CLOSE_BROADCAST_WAIT_MS))
}

/** 删除本地库 -wal/-shm 边车（DSK-09 覆写前清场）：纯浏览器抛 BridgeUnavailableError。
 *  调用方须容错——连接干净关闭时 SQLite 本会自删边车，本命令兜底崩溃/强杀残留。 */
export async function deleteDbSidecar(): Promise<void> {
  if (!isDesktop()) throw new BridgeUnavailableError('deleteDbSidecar')
  await invoke('desktop_delete_db_sidecar')
}

// 模块级自注册监听：任何 import 本模块的 webview（主窗 + 撕悬浮三件，均经 localLedger 等
// store 间接引入）在桌面壳下自动挂监听——收到广播即关本窗连接，释放 local.db 句柄，
// 让导入窗能安全整库覆写。纯浏览器/无事件能力静默跳过；模块单例只挂一次。
let closeListenerArmed = false
function armCloseListener(): void {
  if (closeListenerArmed || !isDesktop()) return
  closeListenerArmed = true
  void import('@tauri-apps/api/event')
    .then(({ listen }) => {
      void listen(DB_CLOSE_ALL_EVENT, () => { void closeLocalDb() })
    })
    .catch(() => { /* 无事件能力：静默，靠导入窗自身 closeLocalDb 兜底 */ })
}
armCloseListener()
