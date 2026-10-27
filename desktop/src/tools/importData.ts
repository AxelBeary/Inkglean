// 数据导入（本地核心环波10）：REQ-014「数据迁移与备份」进口件——
// 策略＝替换（不合并、不逐条核对）；有本地数据时先自动备份为「拾绘备份-替换前-日期-时分秒.zip」；
// 工程文件关联恢复复用 F1 既有机制：原路径还在即直接可用，不在了走「重新指路」。
import { closeLocalDb, localDbPath, saveFile, shihuiHome, importReadB64 } from '../bridge'
import type { ImportReadOutcome } from '../bridge'
import { isDesktop } from '../bridge'
import { broadcastCloseAllDb, deleteDbSidecar } from '../bridge/db'
import type { LocalFile } from '../stores/localFiles'
import type { LocalOrder } from '../stores/localLedger'
import { buildBackupBlob, importBackupFileName } from './exportData'

/** base64 → Uint8Array（分块防栈溢出） */
export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** SQLite 主库第一页头 16 字节魔数（合法库必然以它开头） */
const SQLITE_HEADER_MAGIC = 'SQLite format 3\0'

/**
 * 校验 base64 载荷确为 SQLite 主库（审计 #22 条目 2）
 *
 * 导入是「替换」策略：`saveFile(dbPath, ...)` 走 Rust `fs::write`，先 truncate 再写，
 * 一旦包里的 `local.db` 其实不是 SQLite（导出中断/被改后缀/传错文件/截断），
 * 本地账本会被一份打不开的文件原地换掉——而替换前那份自动备份本身也可能不可靠。
 * 所以坏包必须在**动手之前**判出来，这与本文件既有的「入参校验先行」纪律一致。
 *
 * 只解前 24 个 base64 字符（=16 字节），不把整库（上限 100MB）解码进内存。
 * 空文件/短文件按非法处理：0 字节虽被 SQLite 视作「新库」，但作为备份它一定意味着丢数据。
 */
export function hasSqliteHeader(dbB64: string): boolean {
  if (!dbB64) return false
  let bytes: Uint8Array
  try {
    bytes = b64ToBytes(dbB64.slice(0, 24))
  } catch {
    // 非法 base64（atob 抛 InvalidCharacterError）＝载荷不可用，按坏包处理
    return false
  }
  if (bytes.length < 16) return false
  return String.fromCharCode(...bytes.slice(0, 16)) === SQLITE_HEADER_MAGIC
}

export interface BackupPreview {
  ok: boolean
  /** 不合法时的原因（页面展示） */
  reason: string
  /** 包内 local.db 的 base64（替换用） */
  dbB64: string | null
  /** 包内设置快照（可空） */
  prefs: Record<string, string> | null
  /** 包内文件清单条数（可空；用于导入后提示） */
  manifestCount: number | null
}

/** 解包预检（替换前先看包合不合法）：必须含 local.db；坏包给原因 */
export async function parseBackup(zipB64: string): Promise<BackupPreview> {
  const fail = (reason: string): BackupPreview => ({ ok: false, reason, dbB64: null, prefs: null, manifestCount: null })
  try {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(b64ToBytes(zipB64))
    const dbFile = zip.file('local.db')
    if (!dbFile) return fail('不是有效的拾绘备份包（缺少 local.db）')
    const dbB64 = await dbFile.async('base64')
    // 审计 #22 条目 2：包里有 local.db 不等于那是数据库——文件头不符就在预检阶段拒掉，
    // 别让「替换」策略把本地账本原地换成一份打不开的文件
    if (!hasSqliteHeader(dbB64)) return fail('包内 local.db 不是有效的 SQLite 数据库（文件头不符），已拒绝导入')
    let prefs: Record<string, string> | null = null
    const prefsFile = zip.file('prefs.json')
    if (prefsFile) {
      try {
        const parsed: unknown = JSON.parse(await prefsFile.async('string'))
        if (parsed && typeof parsed === 'object') prefs = parsed as Record<string, string>
      } catch { /* 设置坏则跳过，不影响库替换 */ }
    }
    let manifestCount: number | null = null
    const mf = zip.file('manifest.json')
    if (mf) {
      try {
        const parsed: unknown = JSON.parse(await mf.async('string'))
        if (Array.isArray(parsed)) manifestCount = parsed.length
      } catch { /* 清单坏则跳过 */ }
    }
    return { ok: true, reason: '', dbB64, prefs, manifestCount }
  } catch {
    return fail('备份包打不开（文件损坏或不是 zip）')
  }
}

/** 设置恢复（替换口径）：清掉现有 shihui-/huiyue_ 键再回写包内快照 */
export function restorePrefs(prefs: Record<string, string>, storage: Storage): void {
  const doomed: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && (key.startsWith('shihui-') || key.startsWith('huiyue_'))) doomed.push(key)
  }
  for (const key of doomed) storage.removeItem(key)
  for (const [key, value] of Object.entries(prefs)) {
    if (typeof value === 'string') storage.setItem(key, value)
  }
}

/** 「是否有本地数据」判定入参（波2 DSK-08）：不再只看 orders，档案/模板/工时任一有数据即算「有」 */
export interface LocalDataParts {
  orders: number
  files: number
  hasProfile: boolean
  templates: number
  timeLogDays: number
}

/** 是否有本地数据（纯函数可测）：旧口径 `orders.length > 0` 漏判——无账目但有档案/模板/工时者
 *  会被无备份、无二次确认地整库覆写清空。扩展为五类任一有数据即触发强制二次确认 + 自动备份。 */
export function hasLocalData(p: LocalDataParts): boolean {
  return p.orders > 0 || p.files > 0 || p.hasProfile || p.templates > 0 || p.timeLogDays > 0
}

export interface ImportResult {
  ok: boolean
  reason: string
  /** 自动备份落盘路径（无本地数据时为空串） */
  backupPath: string
}

/** 悬浮窗 label → 人话名（中止导入时告诉用户是哪一个没响应） */
function floatingNameOf(label: string): string {
  switch (label) {
    case 'floating-timer': return '计时器'
    case 'floating-today-todo': return '今日待办'
    case 'floating-deadline': return '截稿倒计时'
    default: return label
  }
}

/** 执行导入（替换）：①有本地数据先自动备份 → ②跨窗广播关连接并等逐窗回执 → 清边车 + 覆写库 → ③恢复设置。
 *  hasLocal：调用方按 DSK-08 全量判定（orders/files/profile/templates/time_log）后传入；
 *  缺省回退旧口径（orders/files 任一非空）以兼容既有调用。
 *  调用方在之后须重载各 store（loaded 复位 + loadAll）让界面吃到新数据。 */
export async function runImport(
  files: LocalFile[],
  orders: LocalOrder[],
  preview: BackupPreview,
  hasLocal?: boolean
): Promise<ImportResult> {
  // 入参校验先行（坏包在哪都报坏包，不被环境检查吞原因）
  if (!preview.ok || !preview.dbB64) return { ok: false, reason: preview.reason || '备份包无效', backupPath: '' }
  // 审计 #22 条目 2：runImport 可被直接调用（preview 由调用方构造），覆写前再自证一次文件头——
  // 校验必须在「自动备份 + 关连接 + 清边车 + 覆写」之前，坏包一个字节都不该碰本地库
  if (!hasSqliteHeader(preview.dbB64)) {
    return { ok: false, reason: '包内 local.db 不是有效的 SQLite 数据库（文件头不符），已拒绝导入', backupPath: '' }
  }
  if (!isDesktop()) return { ok: false, reason: '导入仅在桌面壳内可用', backupPath: '' }

  // ① 有本地数据 → 先自动备份（REQ：万一后悔可恢复；静默落「我的文档\拾绘\backups\」）
  //    DSK-08：判定扩展为五类任一有数据；DSK-03：文件名带时分秒防同日二次导入静默覆写。
  const needBackup = hasLocal ?? (orders.length > 0 || files.length > 0)
  let backupPath = ''
  if (needBackup) {
    const blob = await buildBackupBlob(files, orders)
    const home = await shihuiHome()
    const sep = home.includes('\\') ? '\\' : '/'
    backupPath = `${home}${sep}backups${sep}${importBackupFileName()}`
    await saveFile(backupPath, new Uint8Array(await blob.arrayBuffer()))
  }

  // ② 替换库（DSK-09 / #22-2）：先跨窗广播关所有连接并要求逐窗回执；
  //    有任何悬浮窗没在超时内回执就中止——句柄未释放时覆写轻则失败、重则脏库，
  //    宁可让用户稍后重试，也不赌「大概关完了」。此时本地库一个字节都没动。
  const closeReport = await broadcastCloseAllDb()
  if (closeReport.missing.length > 0) {
    const names = closeReport.missing.map(floatingNameOf).join('、')
    return {
      ok: false,
      reason: `悬浮窗（${names}）未响应关闭请求，已取消导入以免损坏本地数据；请稍后重试，或先贴回悬浮窗`,
      backupPath
    }
  }
  await closeLocalDb()
  try {
    await deleteDbSidecar()
  } catch {
    // 边车清理失败不阻塞导入：连接干净关闭时 SQLite 本会自删边车，此处兜底崩溃/强杀残留。
    // 注：新桥命令 desktop_delete_db_sidecar 须在 src-tauri/src/lib.rs invoke_handler 登记后方生效（见 ledger 卡点）。
    // eslint-disable-next-line no-console -- 边车清理降级诊断：桥命令未登记/清理失败时唯一的现场线索，刻意保留
    console.warn('[拾绘] 导入前 -wal/-shm 边车清理未生效（桥命令未登记或清理失败），已依赖关连接自删兜底')
  }
  const dbPath = await localDbPath()
  await saveFile(dbPath, b64ToBytes(preview.dbB64))

  // ③ 恢复设置（替换口径：先清后写）
  if (preview.prefs) restorePrefs(preview.prefs, localStorage)

  return { ok: true, reason: '', backupPath }
}

/** 选备份包并读回字节（S5B 合并件）：壳侧原生「打开文件」对话框选任意位置文件 →
 *  Rust 侧读字节回传（100MB 限额在 Rust 判定），取消返回 null。
 *  旧口径「JS 对话框选路 → readBackupB64(path)」把用户手选的任意路径交回 path-命令，
 *  会被 S5 白名单根拒掉个人目录之外的落点，且路径绕渲染层一圈——两头都是问题，废弃。
 *  返回的 path 仅供展示与预检（parseBackup 不依赖路径；导入校验在 SQLite 头那条属 #33 轨）。 */
export async function pickAndReadBackup(): Promise<ImportReadOutcome | null> {
  if (!isDesktop()) return null
  return await importReadB64([{ name: '拾绘备份包', extensions: ['zip'] }], '选择拾绘备份包')
}
