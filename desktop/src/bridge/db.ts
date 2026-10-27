// 本地数据层桥（本地核心环波1）：SQLite 单例连接 + 首启建表。
// 纪律：「仅存本机」数据的唯一持久化通道（F8 计时数据可导出范围同款口径，永不上传）；
// 逃生门同既有桥：纯浏览器环境抛 BridgeUnavailableError。
import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isDesktop } from './env'
import { BridgeUnavailableError } from './errors'
import { fileSizes } from './files'

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
/** 只读投影窗（撕悬浮）专用单例：与读写单例互不污染（U45） */
let readOnlyDbPromise: Promise<LocalDatabase> | null = null

/** 本地数据库绝对路径（波9 导出用；与 openLocalDb 内部同源命令） */
export async function localDbPath(): Promise<string> {
  if (!isDesktop()) throw new BridgeUnavailableError('localDbPath')
  return await invoke<string>('desktop_local_db_path')
}

/** 关闭本地库连接并重置单例（波10 导入替换前必调：防开着旧连接覆写文件）。
 *  读写 + 只读投影两条单例一并关闭重置；纯浏览器/未打开过：静默无事。 */
export async function closeLocalDb(): Promise<void> {
  if (!isDesktop()) return
  const pending = [dbPromise, readOnlyDbPromise].filter(
    (p): p is Promise<LocalDatabase> => p !== null
  )
  dbPromise = null
  readOnlyDbPromise = null
  await Promise.all(pending.map(async (p) => {
    try {
      const db = await p
      await db.close()
    } catch {
      // 关闭失败不阻塞导入（下次 open 重建连接）
    }
  }))
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

/** 打开（单例）同库的只读投影通道：**绝不执行 SCHEMA_STATEMENTS**。
 *  why：只读投影窗（撕悬浮三件）的 capability 只有 sql:default（close/load/select，无 execute），
 *  建表必被 ACL 拒；只读入口若偷偷建表，权限缺口就会被上层误读成「暂无截稿」（U45）。
 *  失败即重置单例，下次调用重试（与 openLocalDb 同款）。 */
export function openLocalDbReadOnly(): Promise<LocalDatabase> {
  if (!isDesktop()) return Promise.reject(new BridgeUnavailableError('openLocalDbReadOnly'))
  if (!readOnlyDbPromise) {
    readOnlyDbPromise = (async () => {
      const path = await invoke<string>('desktop_local_db_path')
      return await loadDatabase(path)
    })().catch((e) => {
      readOnlyDbPromise = null // 同上：失败不缓存，允许重试
      throw e
    })
  }
  return readOnlyDbPromise
}

// ─── 波2 DSK-09 / #22-2：导入整库覆写时的跨窗口连接收口 ───
// 根因：撕悬浮三件是独立 webview，各持自己的 SQLite 连接；主窗 closeLocalDb 只关自己，
// 覆写 local.db 时悬浮窗连接仍持文件句柄（Windows 上可致覆写失败），且 WAL 边车 -wal/-shm
// 若残留会被下次开库套到新库上致脏库。修法＝覆写前跨窗广播关连接 + 逐窗回执 + 显式清边车。
// #22-2 补强：旧版广播后固定等 400ms（纯猜），大包/忙机器上悬浮窗可能还没关完就开始覆写。
// 现在带 requestId 等每个现存悬浮窗的 ack；超时未回执的窗名回给导入侧，导入直接中止。

/** 跨窗口广播事件名：通知所有 webview（主窗 + 撕悬浮独立窗）关闭各自本地库连接 */
export const DB_CLOSE_ALL_EVENT = 'desktop-db-close-all'
/** 关连接回执事件名（悬浮窗关完连接后回发，payload={ requestId, label }） */
export const DB_CLOSE_ACK_EVENT = 'desktop-db-close-ack'

/** 等逐窗回执的上限；正常关一个连接是毫秒级，留足慢盘/忙窗余量 */
const DB_CLOSE_ACK_TIMEOUT_MS = 3000

export interface DbCloseAckReport {
  /** 收到广播却没在超时内回执、且仍然存活的悬浮窗户名（它可能还持有库句柄） */
  missing: string[]
}

/** 未回执清单（纯函数可测）：已消失的窗不算 missing——它不可能再持有句柄 */
export function missingAcks(
  expected: string[],
  acked: Iterable<string>,
  stillOpen: string[]
): string[] {
  const done = new Set(acked)
  const open = new Set(stillOpen)
  return expected.filter((label) => !done.has(label) && open.has(label))
}

/** 现存悬浮窗户名；命令不可用（旧壳/非桌面）返回空清单 */
async function floatingWindowLabels(): Promise<string[]> {
  return await invoke<string[]>('desktop_floating_window_labels')
}

/** 跨窗口广播「关闭所有本地库连接」并等逐窗回执；返回未响应的悬浮窗清单。
 *  纯浏览器环境静默返回空清单（无壳层可握手）。任何握手异常按「未回执」保守上报，
 *  由导入侧中止——原子覆写保证中止不会损坏原库，但也不该在句柄未释放时硬上。 */
export async function broadcastCloseAllDb(): Promise<DbCloseAckReport> {
  if (!isDesktop()) return { missing: [] }
  let expected: string[]
  try {
    expected = await floatingWindowLabels()
  } catch {
    return { missing: [] } // 旧壳无此命令：维持既有 best-effort 口径（导入侧仍会清边车）
  }
  if (expected.length === 0) return { missing: [] }

  const acked = new Set<string>()
  try {
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    // 先挂监听再广播：ack 可能比 listen 的 Promise 解析还快，顺序反了会把回执漏掉
    let finish!: () => void
    const done = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, DB_CLOSE_ACK_TIMEOUT_MS)
      finish = () => {
        clearTimeout(timer)
        resolve()
      }
    })
    const unlisten = await listen<{ requestId?: string; label?: string }>(
      DB_CLOSE_ACK_EVENT,
      (event) => {
        if (event.payload?.requestId !== requestId) return
        const label = event.payload.label
        if (typeof label !== 'string') return
        acked.add(label)
        if (expected.every((l) => acked.has(l))) finish()
      }
    )
    try {
      await emit(DB_CLOSE_ALL_EVENT, { requestId })
      await done
    } finally {
      unlisten()
    }
  } catch {
    return { missing: expected.filter((label) => !acked.has(label)) }
  }

  let stillOpen: string[]
  try {
    stillOpen = await floatingWindowLabels()
  } catch {
    // 复查失败：把未回执的都当仍存活（保守，宁可不导入）
    return { missing: expected.filter((label) => !acked.has(label)) }
  }
  return { missing: missingAcks(expected, acked, stillOpen) }
}

/** 删除本地库 -wal/-shm 边车（DSK-09 覆写前清场）：纯浏览器抛 BridgeUnavailableError。
 *  调用方须容错——连接干净关闭时 SQLite 本会自删边车，本命令兜底崩溃/强杀残留。 */
export async function deleteDbSidecar(): Promise<void> {
  if (!isDesktop()) throw new BridgeUnavailableError('deleteDbSidecar')
  await invoke('desktop_delete_db_sidecar')
}

/** 备份前置：把 WAL 里已提交的页折叠回主库并清空 -wal，返回折叠后边车字节数（审计 #22 条目 1）。
 *
 * why：数据包里只装 `local.db` 本体，**不含 -wal/-shm 边车**（导入侧 DSK-09 还要显式删边车）。
 * sqlx 默认以 WAL 打开 SQLite，未 checkpoint 的提交只存在于边车里——直接读主库文件出的快照
 * 会「导出成功却缺最近几笔」，且缺哪些毫无痕迹。
 *
 * 返回字节数而不是 void：TRUNCATE 在边车被其他连接的空闲读事务挡住时会 busy 并部分失败
 * （撕裂的悬浮三件走 openLocalDbReadOnly，各自持连接），调用方据此拒绝出包，
 * 宁可让用户重试也不产出一份看着完整、实际缺数据的备份。 */
export async function checkpointWalForBackup(): Promise<number> {
  if (!isDesktop()) throw new BridgeUnavailableError('checkpointWalForBackup')
  const db = await openLocalDb()
  await db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
  const path = await localDbPath()
  const [walSize] = await fileSizes([`${path}-wal`])
  return walSize ?? 0
}

// 模块级自注册监听：任何 import 本模块的 webview（主窗 + 撕悬浮三件）在桌面壳下自动挂监听——
// 收到广播即关本窗两条连接（读写 + 只读投影），释放 local.db 句柄，并向主窗回执（#22-2）。
// 为保所有窗都在启动即挂上，main.ts 直接 import 本模块（悬浮窗不经过 localLedger 也照样有）。
// 纯浏览器/无事件能力静默跳过；模块单例只挂一次。
let closeListenerArmed = false
function armCloseListener(): void {
  if (closeListenerArmed || !isDesktop()) return
  closeListenerArmed = true
  void listen<{ requestId?: string } | null>(DB_CLOSE_ALL_EVENT, async (event) => {
    await closeLocalDb()
    const requestId = event.payload?.requestId
    if (typeof requestId !== 'string') return // 旧广播无回执约定：关掉即可
    try {
      await emit(DB_CLOSE_ACK_EVENT, { requestId, label: getCurrentWindow().label })
    } catch {
      // 回执发不出去：主窗按「未响应」处理并取消导入，原库不受影响
    }
  }).catch(() => { /* 无事件能力：静默，靠导入窗自身 closeLocalDb 兜底 */ })
}
armCloseListener()
