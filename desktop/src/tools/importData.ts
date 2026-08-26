// 数据导入（本地核心环波10）：REQ-014「数据迁移与备份」进口件——
// 策略＝替换（不合并、不逐条核对）；有本地数据时先自动备份为「拾绘备份-替换前-日期.zip」；
// 工程文件关联恢复复用 F1 既有机制：原路径还在即直接可用，不在了走「重新指路」。
import { closeLocalDb, localDbPath, readBackupB64, saveFile, shihuiHome } from '../bridge'
import { isDesktop } from '../bridge'
import type { LocalFile } from '../stores/localFiles'
import type { LocalOrder } from '../stores/localLedger'
import { buildBackupBlob } from './exportData'

/** base64 → Uint8Array（分块防栈溢出） */
export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
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

export interface ImportResult {
  ok: boolean
  reason: string
  /** 自动备份落盘路径（无本地数据时为空串） */
  backupPath: string
}

/** 执行导入（替换）：①有本地数据先自动备份 → ②关连接覆写库 → ③恢复设置。
 *  调用方在之后须重载各 store（loaded 复位 + loadAll）让界面吃到新数据。 */
export async function runImport(files: LocalFile[], orders: LocalOrder[], preview: BackupPreview): Promise<ImportResult> {
  // 入参校验先行（坏包在哪都报坏包，不被环境检查吞原因）
  if (!preview.ok || !preview.dbB64) return { ok: false, reason: preview.reason || '备份包无效', backupPath: '' }
  if (!isDesktop()) return { ok: false, reason: '导入仅在桌面壳内可用', backupPath: '' }

  // ① 有本地数据 → 先自动备份（REQ：万一后悔可恢复；静默落「我的文档\拾绘\backups\」）
  let backupPath = ''
  if (orders.length > 0) {
    const blob = await buildBackupBlob(files, orders)
    const home = await shihuiHome()
    const sep = home.includes('\\') ? '\\' : '/'
    const now = new Date()
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    backupPath = `${home}${sep}backups${sep}拾绘备份-替换前-${stamp}.zip`
    await saveFile(backupPath, new Uint8Array(await blob.arrayBuffer()))
  }

  // ② 替换库：先关旧连接（防开着连接覆写文件），再整文件覆写
  await closeLocalDb()
  const dbPath = await localDbPath()
  await saveFile(dbPath, b64ToBytes(preview.dbB64))

  // ③ 恢复设置（替换口径：先清后写）
  if (preview.prefs) restorePrefs(preview.prefs, localStorage)

  return { ok: true, reason: '', backupPath }
}

/** 选备份包（系统单选对话框）：返回路径或空（取消） */
export async function pickBackupFile(): Promise<string> {
  if (!isDesktop()) return ''
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({
    multiple: false,
    title: '选择拾绘备份包',
    filters: [{ name: '拾绘备份包', extensions: ['zip'] }]
  })
  return typeof picked === 'string' ? picked : ''
}

/** 读备份包（走 100MB 限额桥） */
export async function readBackup(path: string): Promise<string> {
  return await readBackupB64(path)
}
