// 本地数据导出（本地核心环波9）：REQ-014「数据迁移与备份」口径——
// 数据包（zip）＝SQLite 数据库 + 本地设置 + 文件清单 manifest.json；
// 不包含：平台缓存图片（登录重新拉）、工程文件本体（画师自行搬运，只记路径）。
// 触发纯手动，不主动提醒；导入（替换策略）下一波。
import { localDbPath, readFileB64, saveFile, fileSizes } from '../bridge'
import { isDesktop } from '../bridge'
import type { LocalFile } from '../stores/localFiles'
import type { LocalOrder } from '../stores/localLedger'

export const APP_VERSION = '0.1.0'

/** manifest 文件条目（路径/大小/所属委托） */
export interface ManifestFile {
  path: string
  size: number
  client: string
  title: string
  added_at: string
}

/** 组 manifest（纯函数可测）：文件清单带所属委托（client/title 由 order_id 联查） */
export function buildManifest(files: LocalFile[], orders: LocalOrder[], sizes: number[]): ManifestFile[] {
  const byId = new Map<number, LocalOrder>()
  for (const o of orders) byId.set(o.id, o)
  return files.map((f, i) => {
    const o = byId.get(f.order_id)
    return {
      path: f.file_path,
      size: typeof sizes[i] === 'number' ? sizes[i] : 0,
      client: o?.client_name ?? '',
      title: o?.title ?? '',
      added_at: f.added_at
    }
  })
}

/** 导出时的本地设置快照（布局偏好/关闭行为/工具草稿等，shihui- 与 huiyue_ 前缀键） */
export function dumpLocalPrefs(storage: Storage): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key) continue
    if (key.startsWith('shihui-') || key.startsWith('huiyue_')) {
      const v = storage.getItem(key)
      if (v !== null) out[key] = v
    }
  }
  return out
}

export interface ExportResult {
  ok: boolean
  /** 保存成功时为落盘路径；取消为 'cancelled'；失败为 '' */
  path: string
  counts: { orders: number; files: number }
}

/** 打数据包（波10 抽出）：返回 zip Blob，供导出（对话框）与导入前自动备份（静默）共用 */
export async function buildBackupBlob(files: LocalFile[], orders: LocalOrder[]): Promise<Blob> {
  const dbPath = await localDbPath()
  const dbB64 = await readFileB64(dbPath)
  const sizes = await fileSizes(files.map(f => f.file_path))
  const manifest = buildManifest(files, orders, sizes)

  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('local.db', dbB64, { base64: true })
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('prefs.json', JSON.stringify(dumpLocalPrefs(localStorage), null, 2))
  zip.file('export-info.json', JSON.stringify({
    exporter: '拾绘桌面版',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    note: '数据包含本地数据库/设置/文件清单；工程文件本体不在包内（清单内是路径）；平台缓存图片不含（登录重新拉）'
  }, null, 2))
  return await zip.generateAsync({ type: 'blob' })
}

/** 备份包文件名：拾绘备份-YYYYMMDD.zip（导出与导入前自动备份同口径） */
export function backupFileName(now = new Date()): string {
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `拾绘备份-${stamp}.zip`
}

/** 执行导出：打包 zip → 系统保存对话框 → 落盘。失败口径：抛由页面接住落 toast */
export async function runExport(files: LocalFile[], orders: LocalOrder[]): Promise<ExportResult> {
  if (!isDesktop()) return { ok: false, path: '', counts: { orders: 0, files: 0 } }

  const blob = await buildBackupBlob(files, orders)

  // 保存：系统对话框（默认文件名带日期）
  const { save } = await import('@tauri-apps/plugin-dialog')
  const picked = await save({
    defaultPath: backupFileName(),
    filters: [{ name: '拾绘备份包', extensions: ['zip'] }]
  })
  if (!picked) return { ok: false, path: 'cancelled', counts: { orders: orders.length, files: files.length } }
  await saveFile(picked, new Uint8Array(await blob.arrayBuffer()))
  return { ok: true, path: picked, counts: { orders: orders.length, files: files.length } }
}
